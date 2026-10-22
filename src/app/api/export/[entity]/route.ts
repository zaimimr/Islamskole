import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth";
import { osloLocalToIso, osloToday } from "@/lib/dates";
import { studentDisplayName } from "@/lib/student-name";

type ExportEntity = "students" | "applications" | "teachers";

type Column = { key: string; header: string };

type ExportResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

type ExportQuery = PromiseLike<ExportResult> & {
  eq: (column: string, value: string) => ExportQuery;
  or: (filters: string) => ExportQuery;
  range: (from: number, to: number) => ExportQuery;
};

type ExportTable = "students" | "student_applications" | "guardians";

type EntityConfig = {
  table: ExportTable;
  select: string;
  columns: Column[];
};

const entityConfigs: Record<ExportEntity, EntityConfig> = {
  students: {
    table: "students",
    select:
      "id, child_first_name, child_last_name, child_birth_date, child_gender, child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email, child_level_quran, child_level_arabic, child_level_islam, notes, created_at",
    columns: [
      { key: "child_first_name", header: "Fornavn" },
      { key: "child_last_name", header: "Etternavn" },
      { key: "child_birth_date", header: "Fødselsdato" },
      { key: "child_gender", header: "Kjønn" },
      { key: "child_address", header: "Adresse" },
      { key: "child_postal_code", header: "Postnummer" },
      { key: "child_city", header: "Poststed" },
      { key: "child_email", header: "E-post (kontakt)" },
      { key: "child_phone", header: "Telefon (kontakt)" },
      { key: "mother_first_name", header: "Mor fornavn" },
      { key: "mother_last_name", header: "Mor etternavn" },
      { key: "mother_phone", header: "Mor mobil" },
      { key: "mother_email", header: "Mor e-post" },
      { key: "father_first_name", header: "Far fornavn" },
      { key: "father_last_name", header: "Far etternavn" },
      { key: "father_phone", header: "Far mobil" },
      { key: "father_email", header: "Far e-post" },
      { key: "child_level_quran", header: "Nivå Koran" },
      { key: "child_level_arabic", header: "Nivå Arabisk" },
      { key: "child_level_islam", header: "Nivå Islam" },
      { key: "notes", header: "Notater" },
      { key: "created_at", header: "Registrert" },
    ],
  },
  applications: {
    table: "student_applications",
    select:
      "id, child_first_name, child_last_name, child_birth_date, child_gender, child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email, desired_class, child_level_quran, child_level_arabic, child_level_islam, message, status, created_at",
    columns: [
      { key: "child_first_name", header: "Fornavn" },
      { key: "child_last_name", header: "Etternavn" },
      { key: "child_birth_date", header: "Fødselsdato" },
      { key: "child_gender", header: "Kjønn" },
      { key: "child_address", header: "Adresse" },
      { key: "child_postal_code", header: "Postnummer" },
      { key: "child_city", header: "Poststed" },
      { key: "child_email", header: "E-post (kontakt)" },
      { key: "child_phone", header: "Mobil (kontakt)" },
      { key: "mother_first_name", header: "Mor fornavn" },
      { key: "mother_last_name", header: "Mor etternavn" },
      { key: "mother_phone", header: "Mor mobil" },
      { key: "mother_email", header: "Mor e-post" },
      { key: "father_first_name", header: "Far fornavn" },
      { key: "father_last_name", header: "Far etternavn" },
      { key: "father_phone", header: "Far mobil" },
      { key: "father_email", header: "Far e-post" },
      { key: "desired_class", header: "Ønsket klasse" },
      { key: "child_level_quran", header: "Nivå Koran" },
      { key: "child_level_arabic", header: "Nivå Arabisk" },
      { key: "child_level_islam", header: "Nivå Islam" },
      { key: "message", header: "Melding" },
      { key: "status", header: "Status" },
      { key: "created_at", header: "Dato" },
    ],
  },
  teachers: {
    table: "guardians",
    select: "id, first_name, last_name, email, phone, created_at, teacher:person_roles!inner(note)",
    columns: [
      { key: "first_name", header: "Fornavn" },
      { key: "last_name", header: "Etternavn" },
      { key: "email", header: "E-post" },
      { key: "phone", header: "Telefon" },
      { key: "teacher_note", header: "Notat" },
      { key: "created_at", header: "Registrert" },
    ],
  },
};

const PAGE_SIZE = 1000;

function escapeCsvField(value: unknown): string {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^\+?[\d\s]+$/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => escapeCsvField(c.header)).join(";")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(row[c.key])).join(";"));
  }
  return lines.join("\r\n");
}

function csvResponse(csv: string, filename: string) {
  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return null;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const methodLabels: Record<string, string> = {
  vipps: "Vipps",
  kontant: "Kontant",
  bank: "Bankoverføring",
  annet: "Annet",
  sadaqa: "Sadaqa-støtte",
};

const statusLabels: Record<string, string> = {
  opprettet: "Venter",
  autorisert: "Autorisert",
  fanget: "Betalt",
  avbrutt: "Avbrutt",
  refundert: "Refundert",
  feilet: "Feilet",
};

const accountingColumns: Column[] = [
  { key: "date", header: "Dato" },
  { key: "reference", header: "Referanse" },
  { key: "year", header: "Skoleår" },
  { key: "payer", header: "Betaler" },
  { key: "children", header: "Barn" },
  { key: "method", header: "Betalingsmåte" },
  { key: "gross", header: "Brutto (kr)" },
  { key: "refunded", header: "Refundert (kr)" },
  { key: "net", header: "Netto (kr)" },
  { key: "voided", header: "Annullert" },
  { key: "status", header: "Status" },
  { key: "psp", header: "PSP-referanse" },
  { key: "description", header: "Beskrivelse" },
];

type AccountingPayment = {
  id: string;
  reference: string;
  status: string;
  method: string;
  captured_amount: number;
  refunded_amount: number;
  paid_at: string | null;
  payer_name: string | null;
  psp_reference: string | null;
  description: string | null;
  voided_at: string | null;
  school_years: { label: string } | null;
};

function kroner(ore: number) {
  return (ore / 100).toFixed(2).replace(".", ",");
}

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function nextDay(date: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function exportAccounting(searchParams: URLSearchParams) {
  const from = searchParams.get("fra");
  const to = searchParams.get("til");
  const yearId = searchParams.get("year");
  if ((from && !isDate(from)) || (to && !isDate(to))) {
    return new Response("Ugyldig dato", { status: 400 });
  }

  const supabase = await createClient();
  const payments = await fetchAll<AccountingPayment>((start, end) => {
    let query = supabase
      .from("payments")
      .select(
        "id, reference, status, method, captured_amount, refunded_amount, paid_at, payer_name, psp_reference, description, voided_at, school_years(label)",
      )
      .gt("captured_amount", 0)
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (isDate(from)) query = query.gte("paid_at", osloLocalToIso(`${from}T00:00`));
    if (isDate(to)) query = query.lt("paid_at", osloLocalToIso(`${nextDay(to)}T00:00`));
    if (yearId) query = query.eq("school_year_id", yearId);
    return query as unknown as PromiseLike<{ data: AccountingPayment[] | null; error: unknown }>;
  });
  if (!payments) return new Response("Eksporten feilet", { status: 500 });

  const ids = payments.map((payment) => payment.id);
  const childrenByPayment = new Map<string, string[]>();
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const [allocations, applications] = await Promise.all([
      supabase
        .from("payment_allocations")
        .select("payment_id, students(child_first_name, child_last_name)")
        .in("payment_id", chunk),
      supabase
        .from("student_applications")
        .select("payment_id, child_first_name, child_last_name")
        .in("payment_id", chunk),
    ]);
    if (allocations.error || applications.error) {
      return new Response("Eksporten feilet", { status: 500 });
    }
    for (const row of (allocations.data as unknown as {
      payment_id: string;
      students: { child_first_name: string | null; child_last_name: string | null } | null;
    }[]) ?? []) {
      const name = row.students ? studentDisplayName(row.students) : "";
      if (!name) continue;
      childrenByPayment.set(row.payment_id, [...(childrenByPayment.get(row.payment_id) ?? []), name]);
    }
    for (const row of (applications.data as {
      payment_id: string | null;
      child_first_name: string | null;
      child_last_name: string | null;
    }[]) ?? []) {
      if (!row.payment_id || childrenByPayment.has(row.payment_id)) continue;
      const name = studentDisplayName(row);
      if (name) childrenByPayment.set(row.payment_id, [name]);
    }
  }

  const rows = payments.map((payment) => {
    const voided = Boolean(payment.voided_at);
    return {
      date: payment.paid_at ? osloToday(new Date(payment.paid_at)) : "",
      reference: payment.reference,
      year: payment.school_years?.label ?? "",
      payer: payment.payer_name ?? "",
      children: (childrenByPayment.get(payment.id) ?? []).join(", "),
      method: methodLabels[payment.method] ?? payment.method,
      gross: kroner(payment.captured_amount),
      refunded: kroner(payment.refunded_amount),
      net: kroner(voided ? 0 : payment.captured_amount - payment.refunded_amount),
      voided: voided ? "Ja" : "Nei",
      status: statusLabels[payment.status] ?? payment.status,
      psp: payment.psp_reference ?? "",
      description: payment.description ?? "",
    };
  });

  const period = [from, to].filter(Boolean).join("_til_");
  return csvResponse(
    buildCsv(accountingColumns, rows),
    `regnskapsrapport${period ? `_${period}` : ""}.csv`,
  );
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/export/[entity]">,
) {
  const { entity } = await ctx.params;
  const config = entityConfigs[entity as ExportEntity] as EntityConfig | undefined;
  if (!config && entity !== "payments") {
    return new Response("Ukjent eksport", { status: 404 });
  }

  const isAdmin = await getIsAdmin();
  if (!isAdmin) {
    return new Response("Ikke autorisert", { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  if (entity === "payments") return exportAccounting(searchParams);
  if (!config) return new Response("Ukjent eksport", { status: 404 });

  const supabase = await createClient();
  const status = searchParams.get("status");
  const term = searchParams.get("q") ?? "";

  const data = await fetchAll<Record<string, unknown>>((from, to) => {
    let query = supabase
      .rpc(`admin_search_${config.table}`, { p_query: term })
      .select(config.select)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to) as unknown as ExportQuery;

    if (entity === "teachers") query = query.eq("teacher.role_key", "teacher");
    if (status && status !== "alle" && entity === "applications") {
      query = query.eq("status", status);
    }
    return query;
  });
  if (!data) {
    return new Response("Eksporten feilet", { status: 500 });
  }

  const rows = data.map(({ teacher, ...row }) => ({
    ...row,
    ...(Array.isArray(teacher) ? { teacher_note: (teacher[0] as { note?: string | null })?.note ?? "" } : {}),
    created_at:
      typeof row.created_at === "string" ? osloToday(new Date(row.created_at)) : "",
  }));
  return csvResponse(buildCsv(config.columns, rows), `${entity}.csv`);
}

import { matchesSearch } from "@/lib/search";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  Lock,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { EmptyState } from "@/components/admin/empty-state";
import { LoadError } from "@/components/admin/load-error";
import { formatOsloDateTime, osloLocalToIso } from "@/lib/dates";
import { formatNok } from "@/lib/money";
import { describeParentChange } from "@/lib/parent-change-summary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata: Metadata = { title: "Revisjonshistorikk" };

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string | null;
};

type Meta = Record<string, unknown>;

const entityFilters: { key: string; label: string; types: string[] }[] = [
  { key: "students", label: "Elever", types: ["students", "student"] },
  {
    key: "student_enrollments",
    label: "Plasseringer",
    types: ["student_enrollments", "student_enrollment", "enrollment"],
  },
  {
    key: "student_applications",
    label: "Innmeldinger",
    types: ["student_applications", "student_application", "application"],
  },
  {
    key: "payments",
    label: "Betalinger",
    types: [
      "payments",
      "payment",
      "installments",
      "installment",
      "payment_plans",
      "payment_plan",
      "sadaqa_gifts",
    ],
  },
  {
    key: "student_fees",
    label: "Betalingskrav og rabatter",
    types: ["student_fees", "student_fee"],
  },
  {
    key: "families",
    label: "Familier",
    types: ["families", "family", "family_pickup_person"],
  },
  {
    key: "guardians",
    label: "Foresatte og lærere",
    types: [
      "guardians",
      "guardian",
      "teacher_applications",
      "teacher_application",
      "teacher",
    ],
  },
  {
    key: "classes",
    label: "Klasser",
    types: ["classes", "class", "class_teachers", "class_teacher"],
  },
  {
    key: "school_years",
    label: "Skoleår",
    types: ["school_years", "school_year"],
  },
  { key: "events", label: "Aktiviteter", types: ["events", "event"] },
  {
    key: "settings",
    label: "Innstillinger",
    types: ["settings", "site_settings"],
  },
  { key: "users", label: "Brukere", types: ["users", "user"] },
];

const entityLabelByType = new Map(
  entityFilters.flatMap((filter) =>
    filter.types.map((type) => [type, filter.label] as const),
  ),
);

const actionLabels: Record<string, string> = {
  "user.impersonation_started": "Startet brukerbytte",
  "user.impersonation_ended": "Avsluttet brukerbytte",
  "event.create": "Opprettet aktivitet",
  "event.update": "Oppdaterte aktivitet",
  "event.delete": "Slettet en aktivitet",
  "class.create": "Opprettet klasse",
  "class.update": "Oppdaterte klasse",
  "class.delete": "Slettet en klasse",
  "settings.update": "Oppdaterte kontaktopplysningene på nettsiden",
  "teacher.status": "Endret status på lærersøknad",
  "teacher.delete": "Slettet en lærersøknad",
  "teacher.bulk_status": "Endret status på flere lærersøknader",
  "teacher.registered": "Registrerte en lærer",
  "teacher.removed": "Fjernet lærerrollen",
  "teacher.updated": "Endret opplysninger om en lærer",
  "class_teacher.assign": "Knyttet en lærer til en klasse",
  "class_teacher.remove": "Fjernet en lærer fra en klasse",
  "portal.login_link_sent": "Sendte innloggingslenke",
  "portal.family.address": "Forelder endret adressen",
  "portal.family.preferences": "Forelder endret språk for beskjeder",
  "portal.guardian.update": "Forelder endret en foresatt",
  "portal.guardian.add": "Forelder la til en foresatt",
  "portal.guardian.remove": "Forelder fjernet en foresatt",
  "portal.guardian.email_change_requested": "Forelder ba om ny e-post",
  "portal.guardian.email_changed": "Forelder bekreftet ny e-post",
  "portal.child.update": "Forelder endret barnets opplysninger",
  "portal.child.health": "Forelder endret helse og samtykke",
  "portal.pickup.add": "Forelder la til en henteperson",
  "portal.pickup.update": "Forelder endret en henteperson",
  "portal.pickup.remove": "Forelder fjernet en henteperson",
  "application.status": "Endret opptaksstatus",
  "application.delete": "Slettet en innmelding",
  "application.bulk_status": "Endret status på flere innmeldinger",
  "user.create": "Opprettet bruker",
  "user.reset_password": "Lagde nytt passord for en bruker",
  "user.change_password": "Byttet sitt eget passord",
  "user.delete": "Slettet en bruker",
  "payment.create": "Betalingsforespørsel opprettet",
  "payment.mutate": "Betalingen ble oppdatert",
  "payment.capture_requested": "Ba Vipps om å trekke betalingen",
  "payment.refund_requested": "Ba Vipps om refusjon",
  "payment.cancel_requested": "Avbrøt betalingsforespørselen",
  "payment.delete": "Slettet en betalingsforespørsel",
  "payment.void": "Annullerte en betaling",
  "payment.restore": "Gjenopprettet en annullert betaling",
  "payment.mark_duplicate": "Markerte betalingen som dobbeltføring",
  "payment.keep_separate": "Beholdt to betalinger som separate",
  "payment.reallocate_year": "Fordelte skoleårets betalinger på nytt",
  "payment.allocate": "Endret hvordan betalingen er fordelt på barna",
  "payment.sadaqa_recorded": "Ga sadaqa-støtte",
  "payment.sadaqa_reclassified": "Gjorde overskudd til sadaqa-gave",
  "sadaqa.gift_recorded": "Registrerte sadaqa-gave",
  "sadaqa.gift_voided": "Angret sadaqa-gave",
  "student_fee.update": "Endret betalingskrav",
  "student_fee.adjustment_granted": "Ga rabatt eller fritak",
  "student_fee.adjustment_revoked": "Fjernet rabatt eller fritak",
  "student_fee.sibling_discount_approved": "Godkjente søskenrabatt",
  "family.relationships_updated":
    "Oppdaterte foresatte og relasjoner i familien",
  "guardian.roles_updated": "Oppdaterte rollene til en foresatt",
  "installment.reopened": "Åpnet et avdrag igjen",
  "installment.sent_manually": "Sendte et avdrag manuelt",
  "installment.stopped": "Stoppet et avdrag",
  "payment_plan.assigned": "Satte opp betalingsplan",
  "payment_plan.ended": "Avsluttet betalingsplan",
  "school_year.create": "Opprettet skoleår",
  "school_year.update": "Oppdaterte skoleår",
  "school_year.activate": "Gjorde skoleåret aktivt",
  "school_year.delete": "Slettet et skoleår",
};

const statusWords: Record<string, string> = {
  ny: "Ny",
  kontaktet: "Kontaktet",
  betaling: "Venter på betaling",
  akseptert: "Akseptert",
  avslatt: "Avslått",
  arkivert: "Arkivert",
  opprettet: "opprettet",
  autorisert: "reservert",
  fanget: "betalt",
  avbrutt: "avbrutt",
  refundert: "refundert",
  feilet: "feilet",
  aktiv: "aktiv",
  avsluttet: "avsluttet",
};

const adjustmentWords: Record<string, string> = {
  soskenrabatt: "søskenrabatt",
  laererbarn: "fritak for lærerbarn",
  frivillig: "fritak for frivillige",
  annet: "annet fritak",
};

const methodWords: Record<string, string> = {
  vipps: "Vipps",
  kontant: "kontant",
  bank: "bankoverføring",
  annet: "annen betaling",
  sadaqa: "sadaqa-støtte",
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function status(value: unknown) {
  const raw = text(value);
  return raw ? (statusWords[raw] ?? raw) : null;
}

function kroner(value: unknown) {
  const amount = num(value);
  return amount == null ? null : formatNok(amount * 100);
}

function ore(value: unknown) {
  const amount = num(value);
  return amount == null ? null : formatNok(amount);
}

function describe(row: AuditRow): string {
  const meta: Meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Meta)
      : {};
  const base = actionLabels[row.action] ?? "Ukjent handling";

  switch (row.action) {
    case "application.status":
    case "teacher.status": {
      const value = status(meta.status);
      return value ? `${base} til ${value}` : base;
    }
    case "application.bulk_status":
    case "teacher.bulk_status": {
      const count = num(meta.count);
      const value = status(meta.status);
      const noun =
        row.action === "application.bulk_status"
          ? "innmeldinger"
          : "lærersøknader";
      return count != null && value
        ? `Endret status på ${count} ${noun} til ${value}`
        : base;
    }
    case "class.create":
    case "class.update": {
      const name = text(meta.name_no);
      return name ? `${base} ${name}` : base;
    }
    case "event.create":
    case "event.update": {
      const title = text(meta.title_no);
      return title ? `${base} «${title}»` : base;
    }
    case "user.create": {
      const email = text(meta.email);
      return email ? `Opprettet brukeren ${email}` : base;
    }
    case "school_year.create":
    case "school_year.update":
    case "school_year.activate": {
      const label = text(meta.label);
      return label ? `${base} ${label}` : base;
    }
    case "payment.create": {
      const amount = ore(meta.amount);
      const method = text(meta.method);
      if (!amount) return base;
      return `Betalingsforespørsel på ${amount} opprettet${method ? ` (${methodWords[method] ?? method})` : ""}`;
    }
    case "payment.mutate": {
      const previous = status(meta.previousStatus);
      const next = status(meta.status);
      if (previous && next && previous !== next) {
        return `Betalingen endret status fra ${previous} til ${next}`;
      }
      if (num(meta.capturedAmount) !== num(meta.previousCapturedAmount)) {
        return `Innbetalt beløp endret til ${ore(meta.capturedAmount) ?? "0 kr"}`;
      }
      if (num(meta.refundedAmount) !== num(meta.previousRefundedAmount)) {
        return `Refundert beløp endret til ${ore(meta.refundedAmount) ?? "0 kr"}`;
      }
      if (meta.voided === true) return "Betalingen er annullert";
      if (meta.duplicateOfPaymentId) {
        return "Betalingen er koblet til en annen som dobbeltføring";
      }
      return base;
    }
    case "payment.void": {
      const reason = text(meta.reason);
      return reason ? `${base}: ${reason}` : base;
    }
    case "payment.refund_requested":
    case "payment.sadaqa_recorded":
    case "payment.sadaqa_reclassified":
    case "sadaqa.gift_recorded":
    case "sadaqa.gift_voided": {
      const amount = ore(meta.amount);
      return amount ? `${base} på ${amount}` : base;
    }
    case "student_fee.update": {
      const amount = kroner(meta.amountNok);
      const discount = num(meta.discountNok);
      if (!amount) return base;
      return discount
        ? `Endret betalingskrav til ${amount} med ${kroner(discount)} i rabatt`
        : `Endret betalingskrav til ${amount}`;
    }
    case "student_fee.adjustment_granted":
    case "student_fee.adjustment_revoked": {
      const type = text(meta.type);
      const amount = kroner(meta.amountNok);
      const verb =
        row.action === "student_fee.adjustment_granted" ? "Ga" : "Fjernet";
      if (!type) return base;
      return `${verb} ${adjustmentWords[type] ?? type}${amount ? ` på ${amount}` : ""}`;
    }
    default:
      return base;
  }
}

function extraLine(row: AuditRow): string | null {
  const meta: Meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Meta)
      : {};
  const note = text(meta.note);
  if (note) return `Notat: ${note}`;
  if (meta.source === "parent") {
    return `Gjelder ${describeParentChange(row.action, meta)}`;
  }
  if (row.action === "event.update" || row.action === "event.create") {
    return meta.published === true
      ? "Publisert på nettsiden"
      : meta.published === false
        ? "Lagret som utkast"
        : null;
  }
  if (row.action.startsWith("class.") && typeof meta.published === "boolean") {
    return meta.published ? "Vises på nettsiden" : "Skjult på nettsiden";
  }
  if (row.action.startsWith("school_year.") && meta.is_active === true) {
    return "Aktivt skoleår";
  }
  return null;
}

type Lookups = {
  paymentRefs: Map<string, string>;
  studentNames: Map<string, string>;
  familyNames: Map<string, string>;
};

function entityLink(
  row: AuditRow,
  basePath: string,
  lookups: Lookups,
): { href: string; label: string } | null {
  const id = row.entity_id;
  if (row.action.endsWith(".delete")) return null;
  switch (row.entity_type) {
    case "students":
    case "student":
    case "student_fees":
    case "student_fee":
      if (!id) return null;
      return {
        href: `${basePath}/elever/${id}`,
        label: lookups.studentNames.get(id) ?? "Åpne eleven",
      };
    case "families":
    case "family":
      if (!id) return null;
      return {
        href: `${basePath}/familier/${id}`,
        label: lookups.familyNames.get(id) ?? "Åpne familien",
      };
    case "payments":
    case "payment": {
      const reference = id ? lookups.paymentRefs.get(id) : undefined;
      if (!reference) return null;
      return {
        href: `${basePath}/betaling/logg?q=${encodeURIComponent(reference)}`,
        label: `Betaling ${reference}`,
      };
    }
    case "classes":
    case "class":
      return id
        ? { href: `${basePath}/klasser/${id}`, label: "Åpne klassen" }
        : null;
    case "events":
    case "event":
      return id
        ? { href: `${basePath}/aktiviteter/${id}`, label: "Åpne aktiviteten" }
        : null;
    case "school_years":
    case "school_year":
      return id
        ? { href: `${basePath}/skolear/${id}`, label: "Åpne skoleåret" }
        : null;
    case "student_applications":
    case "application":
      return { href: `${basePath}/register`, label: "Til opptak" };
    case "teacher_applications":
    case "guardians":
    case "guardian":
      return { href: `${basePath}/laerere`, label: "Til lærere" };
    case "users":
    case "user":
      return { href: `${basePath}/brukere`, label: "Til brukere" };
    case "site_settings":
    case "settings":
      return { href: `${basePath}/innstillinger`, label: "Til innstillinger" };
    case "sadaqa_gifts":
      return { href: `${basePath}/betaling/sadaqa`, label: "Til sadaqa" };
    default:
      return null;
  }
}


function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nextDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type Filters = { query: string; area: string; from: string; to: string };

function buildAuditHref(basePath: string, values: Filters & { page?: number }) {
  const params = new URLSearchParams();
  if (values.query) params.set("q", values.query);
  if (values.area) params.set("type", values.area);
  if (values.from) params.set("fra", values.from);
  if (values.to) params.set("til", values.to);
  if ((values.page ?? 1) > 1) params.set("page", String(values.page));
  const suffix = params.toString();
  return `${basePath}/revisjon${suffix ? `?${suffix}` : ""}`;
}

async function getEntries(
  page: number,
  filters: Filters,
): Promise<
  | { ok: true; rows: AuditRow[]; total: number; lookups: Lookups }
  | { ok: false }
> {
  try {
    const supabase = await createClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = filters.query.trim().slice(0, 120);
    const matchingActions = term ? Object.entries(actionLabels)
      .filter(([, label]) => matchesSearch(term, label))
      .map(([action]) => action) : [];
    let request = supabase
      .rpc("admin_search_audit_log", { p_query: term, p_actions: matchingActions }, { count: "exact" })
      .select("id, actor_email, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    const filter = entityFilters.find((item) => item.key === filters.area);
    if (filter) request = request.in("entity_type", filter.types);
    if (filters.from) {
      request = request.gte(
        "created_at",
        osloLocalToIso(`${filters.from}T00:00`),
      );
    }
    if (filters.to) {
      request = request.lt(
        "created_at",
        osloLocalToIso(`${nextDay(filters.to)}T00:00`),
      );
    }

    const result = await request;
    const pastEnd = result.error?.code === "PGRST103";
    if (result.error && !pastEnd) return { ok: false };
    const rows = pastEnd ? [] : ((result.data as AuditRow[] | null) ?? []);

    const idsFor = (types: string[]) =>
      Array.from(
        new Set(
          rows
            .filter((row) => types.includes(row.entity_type) && row.entity_id)
            .map((row) => row.entity_id as string),
        ),
      );
    const paymentIds = idsFor(["payments", "payment"]);
    const studentIds = idsFor([
      "students",
      "student",
      "student_fees",
      "student_fee",
    ]);
    const familyIds = idsFor(["families", "family"]);

    const [payments, students, families] = await Promise.all([
      paymentIds.length
        ? supabase.from("payments").select("id, reference").in("id", paymentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length
        ? supabase
            .from("students")
            .select("id, child_first_name, child_last_name")
            .in("id", studentIds)
        : Promise.resolve({ data: [] }),
      familyIds.length
        ? supabase
            .from("families")
            .select("id, display_name")
            .in("id", familyIds)
        : Promise.resolve({ data: [] }),
    ]);

    return {
      ok: true,
      rows,
      total: result.count ?? 0,
      lookups: {
        paymentRefs: new Map(
          ((payments.data ?? []) as { id: string; reference: string }[]).map(
            (row) => [row.id, row.reference],
          ),
        ),
        studentNames: new Map(
          (
            (students.data ?? []) as {
              id: string;
              child_first_name: string | null;
              child_last_name: string | null;
            }[]
          ).map((row) => [
            row.id,
            [row.child_first_name, row.child_last_name]
              .filter(Boolean)
              .join(" ") || "Åpne eleven",
          ]),
        ),
        familyNames: new Map(
          (
            (families.data ?? []) as {
              id: string;
              display_name: string | null;
            }[]
          ).map((row) => [row.id, row.display_name ?? "Åpne familien"]),
        ),
      },
    };
  } catch {
    return { ok: false };
  }
}

function technicalValue(value: unknown) {
  if (value == null || value === "") return "tom";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function RevisjonPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/revisjon">) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const sp = await searchParams;
  const rawArea = typeof sp.type === "string" ? sp.type : "";
  const legacyArea = entityFilters.find((item) =>
    item.types.includes(rawArea),
  )?.key;
  const filters: Filters = {
    query: typeof sp.q === "string" ? sp.q : "",
    area: legacyArea ?? "",
    from: typeof sp.fra === "string" && isDate(sp.fra) ? sp.fra : "",
    to: typeof sp.til === "string" && isDate(sp.til) ? sp.til : "",
  };
  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const result = await getEntries(page, filters);

  if (!result.ok) {
    return (
      <LoadError
        title="Revisjonshistorikken kunne ikke lastes"
        description="Historikken er ikke tom eller slettet. Prøv igjen før du bruker loggen til kontroll eller avstemming."
        retryHref={buildAuditHref(basePath, { ...filters, page })}
      />
    );
  }

  const filtered = Boolean(
    filters.query || filters.area || filters.from || filters.to,
  );
  const fromRecord = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = Math.min(page * PAGE_SIZE, result.total);
  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < result.total;
  const areaItems = [
    { value: "alle", label: "Alle områder" },
    ...entityFilters.map((item) => ({ value: item.key, label: item.label })),
  ];

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Revisjonshistorikk
        </h1>
        <p className="mt-1 max-w-3xl text-admin-muted">
          Hvem som endret hva, og når. Historikken kan ikke endres eller
          slettes.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-admin-muted">
          <Lock aria-hidden="true" className="size-3.5" />
          Skrivebeskyttet
        </p>
      </header>

      <form
        action={`${basePath}/revisjon`}
        className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_13rem_10rem_10rem_auto] xl:items-end"
      >
        <div className="grid gap-1.5 md:col-span-2 xl:col-span-1">
          <label htmlFor="audit-search" className="text-sm font-bold">
            Søk
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-admin-muted"
            />
            <input
              id="audit-search"
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Navn, e-post, handling eller ID"
              spellCheck={false}
              className="min-h-11 w-full rounded-xl border border-[#DCD7CC] bg-white pr-3 pl-10 text-base sm:text-sm outline-none transition-colors placeholder:text-[#6A716C] focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span id="audit-type-label" className="text-sm font-bold">
            Område
          </span>
          <Select
            name="type"
            defaultValue={filters.area || "alle"}
            items={areaItems}
          >
            <SelectTrigger
              aria-labelledby="audit-type-label"
              className="w-full border-[#DCD7CC] bg-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {areaItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-from" className="text-sm font-bold">
            Fra dato
          </label>
          <input
            id="audit-from"
            type="date"
            name="fra"
            defaultValue={filters.from}
            className="min-h-11 w-full rounded-xl border border-[#DCD7CC] bg-white px-3 text-base sm:text-sm outline-none focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-to" className="text-sm font-bold">
            Til dato
          </label>
          <input
            id="audit-to"
            type="date"
            name="til"
            defaultValue={filters.to}
            className="min-h-11 w-full rounded-xl border border-[#DCD7CC] bg-white px-3 text-base sm:text-sm outline-none focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <div className="flex gap-2 md:col-span-2 xl:col-span-1">
          <button
            type="submit"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50 xl:flex-none"
          >
            Vis hendelser
          </button>
          {filtered ? (
            <Link
              href={`${basePath}/revisjon`}
              aria-label="Nullstill filtre"
              title="Nullstill filtre"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-[#DCD7CC] bg-white outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-labelledby="audit-results-title">
        <div className="mb-3">
          <h2
            id="audit-results-title"
            className="font-heading text-xl font-semibold"
          >
            {filtered ? "Filtrerte hendelser" : "Nyeste hendelser"}
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted" aria-live="polite">
            {result.total === 0
              ? "Ingen hendelser funnet"
              : `Viser ${fromRecord}-${toRecord} av ${result.total}`}
          </p>
        </div>

        {result.rows.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            <EmptyState
              icon={<FileClock aria-hidden="true" />}
              title={
                filtered
                  ? "Ingen hendelser passer filtrene"
                  : "Ingen hendelser ennå"
              }
              description={
                filtered
                  ? "Prøv et annet søk, et annet område eller en lengre periode."
                  : "Administrative endringer vises her når de blir utført."
              }
              headingLevel="h3"
            />
          </div>
        ) : (
          <ol className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            {result.rows.map((row) => {
              const link = entityLink(row, basePath, result.lookups);
              const extra = extraLine(row);
              const metadataEntries =
                row.metadata && typeof row.metadata === "object"
                  ? Object.entries(row.metadata as Meta)
                  : [];
              return (
                <li
                  key={row.id}
                  className="border-b border-[#ECE8DF] px-4 py-4 last:border-b-0 sm:px-5"
                >
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
                    <div className="min-w-0">
                      <p className="font-bold">{describe(row)}</p>
                      {extra ? (
                        <p className="mt-0.5 text-sm text-admin-muted">
                          {extra}
                        </p>
                      ) : null}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-admin-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 aria-hidden="true" className="size-3.5" />
                          {formatOsloDateTime(row.created_at) ||
                            "Tidspunkt mangler"}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <UserRound
                            aria-hidden="true"
                            className="size-3.5 shrink-0"
                          />
                          <span className="break-all">
                            {row.actor_email ?? "Systemet"}
                            {typeof (row.metadata as Meta | null)?.impersonated_email === "string" ? ` som ${(row.metadata as Meta).impersonated_email}` : ""}
                          </span>
                        </span>
                        <span>
                          {entityLabelByType.get(row.entity_type) ?? "Annet"}
                        </span>
                      </p>
                    </div>
                    {link ? (
                      <Link
                        href={link.href}
                        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-[#277A31] underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 lg:-mt-2.5"
                      >
                        {link.label}
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    ) : null}
                  </div>

                  <details className="group mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg text-xs font-bold text-admin-muted outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 transition-transform group-open:rotate-90"
                      />
                      Tekniske detaljer
                    </summary>
                    <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-[#FAF9F5] p-3 text-xs ring-1 ring-[#E8E3D9] sm:grid-cols-2 lg:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="font-bold text-admin-muted">Handling</dt>
                        <dd className="mt-0.5 font-mono break-all">
                          {row.action}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="font-bold text-admin-muted">Område</dt>
                        <dd className="mt-0.5 font-mono break-all">
                          {row.entity_type}
                        </dd>
                      </div>
                      {row.entity_id ? (
                        <div className="min-w-0">
                          <dt className="font-bold text-admin-muted">
                            Post-ID
                          </dt>
                          <dd className="mt-0.5 font-mono break-all">
                            {row.entity_id}
                          </dd>
                        </div>
                      ) : null}
                      {metadataEntries.map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <dt className="font-bold text-admin-muted">{key}</dt>
                          <dd className="mt-0.5 font-mono break-all">
                            {technicalValue(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {result.total > 0 ? (
        <nav
          aria-label="Sider i revisjonshistorikken"
          className="flex items-center justify-between gap-3"
        >
          {hasPrevious ? (
            <Link
              href={buildAuditHref(basePath, { ...filters, page: page - 1 })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Forrige
            </Link>
          ) : (
            <span className="min-h-11" />
          )}
          <span className="text-sm font-semibold text-admin-muted">
            Side {page} av {Math.max(1, Math.ceil(result.total / PAGE_SIZE))}
          </span>
          {hasNext ? (
            <Link
              href={buildAuditHref(basePath, { ...filters, page: page + 1 })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Neste
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className="min-h-11" />
          )}
        </nav>
      ) : null}
    </div>
  );
}

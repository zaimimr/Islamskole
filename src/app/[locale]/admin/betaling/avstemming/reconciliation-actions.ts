"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import {
  decodeText,
  parseDelimited,
  parseDnbSheets,
  parseVippsRows,
} from "@/lib/bank-statement";
import { isZip, readXlsxSheets } from "@/lib/xlsx-rows";
import { importFromVipps, importTransactions, type ImportSummary } from "@/lib/reconciliation";
import { registerFamilyPayment } from "../finance-actions";
import { recordSadaqaGift, voidSadaqaGift } from "../sadaqa/sadaqa-actions";
import { voidPayment } from "../../students-actions";

type Failure = { ok: false; error: string };
type Done = { ok: true } | Failure;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function requireAdmin(): Promise<Failure | null> {
  if (await getIsAdmin()) return null;
  const user = await getUser();
  return {
    ok: false,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt i en ny fane og prøv igjen.",
  };
}

function revalidate() {
  revalidatePath("/[locale]/admin", "layout");
}

type Client = Awaited<ReturnType<typeof createClient>>;

type TransactionRow = {
  id: string;
  source: string;
  account: string;
  amount: number;
  booked_on: string;
  counterparty_name: string | null;
  message: string | null;
  status: string;
  suggested_status: string | null;
  suggestion_reason: string | null;
  matched_payment_id: string | null;
  sadaqa_gift_id: string | null;
};

const TRANSACTION_COLUMNS =
  "id, source, account, amount, booked_on, counterparty_name, message, status, suggested_status, suggestion_reason, matched_payment_id, sadaqa_gift_id";

async function loadTransaction(
  client: Client,
  id: string,
): Promise<{ row: TransactionRow } | Failure> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Mangler transaksjon" };
  }
  const { data, error } = await client
    .from("external_transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: toUserError(error) };
  if (!data) return { ok: false, error: "Fant ikke transaksjonen" };
  return { row: data as TransactionRow };
}

function requireOpenIncoming(row: TransactionRow): Failure | null {
  if (row.status !== "ny") {
    return { ok: false, error: "Transaksjonen er allerede behandlet. Angre først." };
  }
  if (row.amount <= 0) {
    return { ok: false, error: "Bare innbetalinger kan føres som sadaqa eller skolepenger." };
  }
  return null;
}

function sourceLabel(row: Pick<TransactionRow, "source" | "account">) {
  return row.source === "vipps" ? `Vipps ${row.account}` : `DNB ${row.account}`;
}

function mappingNote(row: TransactionRow, extra?: string | null) {
  return [`Avstemt fra ${sourceLabel(row)}`, row.message, extra]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);
}

async function schoolYearFor(client: Client, date: string): Promise<string | undefined> {
  const { data } = await client
    .from("school_years")
    .select("id")
    .lte("starts_on", date)
    .gte("ends_on", date)
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? undefined;
}

export type ImportResult = { ok: true; summary: ImportSummary } | Failure;

export async function importStatementFile(formData: FormData): Promise<ImportResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const file = formData.get("file");
  const source = formData.get("source");
  const account = String(formData.get("account") ?? "").replace(/[\s.]/g, "");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Velg en fil å laste opp." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Filen er for stor. Maks 5 MB." };
  }
  if (source !== "vipps" && source !== "dnb") {
    return { ok: false, error: "Velg om filen er fra Vipps eller DNB." };
  }
  if (source === "dnb" && account && !/^\d{11}$/.test(account)) {
    return { ok: false, error: "Skriv inn DNB-kontonummeret med 11 siffer." };
  }
  if (source === "vipps" && account && !/^\d{4,10}$/.test(account)) {
    return { ok: false, error: "Ugyldig Vippsnummer." };
  }

  let sheets: string[][][];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    sheets = isZip(bytes) ? readXlsxSheets(bytes) : [parseDelimited(decodeText(bytes))];
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Filen kunne ikke leses.",
    };
  }

  const parsed = source === "dnb"
    ? parseDnbSheets(sheets, account)
    : sheets
      .map((rows) => parseVippsRows(rows, account || null))
      .reduce((best, next) => next.transactions.length > best.transactions.length ? next : best);
  if (parsed.transactions.length === 0) {
    return {
      ok: false,
      error: parsed.errors[0] ?? "Fant ingen transaksjoner i filen.",
    };
  }

  const user = await getUser();
  const supabase = await createClient();
  try {
    const summary = await importTransactions(supabase, {
      source,
      kind: "fil",
      account: source === "dnb"
        ? parsed.transactions.every((row) => row.account === parsed.transactions[0].account)
          ? parsed.transactions[0].account
          : null
        : account || null,
      fileName: file.name.slice(0, 200),
      transactions: parsed.transactions,
      skipped: parsed.skipped,
      errors: parsed.errors,
      createdBy: user?.email ?? null,
    });
    await writeAudit({
      action: "reconciliation.imported",
      entityType: "import_batches",
      entityId: summary.batchId,
      metadata: {
        source,
        account: account || null,
        fileName: file.name,
        inserted: summary.inserted,
        duplicates: summary.duplicates,
        matched: summary.matched,
      },
    });
    revalidate();
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Importen feilet." };
  }
}

export type VippsFetchResult =
  | {
      ok: true;
      accounts: {
        msn: string;
        inserted: number;
        matched: number;
        duplicates: number;
        error: string | null;
      }[];
    }
  | Failure;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export async function fetchFromVipps(input: {
  from?: string;
  to?: string;
}): Promise<VippsFetchResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z.object({ from: dateSchema, to: dateSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ugyldig dato" };
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    return { ok: false, error: "Fra-dato må være før til-dato." };
  }

  const user = await getUser();
  const supabase = await createClient();
  const results = await importFromVipps(supabase, {
    from: parsed.data.from ?? null,
    to: parsed.data.to ?? null,
    createdBy: user?.email ?? null,
  });
  await writeAudit({
    action: "reconciliation.vipps_fetched",
    entityType: "import_batches",
    metadata: {
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      accounts: results.map((result) => ({
        msn: result.msn,
        inserted: result.summary?.inserted ?? 0,
        error: result.error,
      })),
    },
  });
  revalidate();
  return {
    ok: true,
    accounts: results.map((result) => ({
      msn: result.msn,
      inserted: result.summary?.inserted ?? 0,
      matched: result.summary?.matched ?? 0,
      duplicates: result.summary?.duplicates ?? 0,
      error: result.error,
    })),
  };
}

async function mapOneToSadaqa(
  client: Client,
  row: TransactionRow,
  values: { donorName?: string | null; familyId?: string | null; note?: string | null },
  actor: string | null,
): Promise<Done> {
  const blocked = requireOpenIncoming(row);
  if (blocked) return blocked;

  const gift = await recordSadaqaGift({
    amountOre: row.amount,
    receivedOn: row.booked_on,
    method: row.source === "vipps" ? "vipps" : "bank",
    donorName: (values.donorName ?? row.counterparty_name ?? "").slice(0, 200) || undefined,
    familyId: values.familyId ?? undefined,
    note: mappingNote(row, values.note),
    schoolYearId: await schoolYearFor(client, row.booked_on),
  });
  if (!gift.ok) return gift;

  const { data: updated, error } = await client
    .from("external_transactions")
    .update({
      status: "sadaqa",
      sadaqa_gift_id: gift.id,
      family_id: values.familyId ?? null,
      mapped_by: actor,
      mapped_at: new Date().toISOString(),
      note: values.note || null,
    })
    .eq("id", row.id)
    .eq("status", "ny")
    .select("id");
  if (error || (updated ?? []).length === 0) {
    await voidSadaqaGift(gift.id, "Avstemming avbrutt");
    return {
      ok: false,
      error: error ? toUserError(error) : "Transaksjonen ble behandlet av noen andre samtidig.",
    };
  }

  await writeAudit({
    action: "reconciliation.mapped_sadaqa",
    entityType: "external_transactions",
    entityId: row.id,
    metadata: { giftId: gift.id, amount: row.amount, familyId: values.familyId ?? null },
  });
  return { ok: true };
}

const sadaqaSchema = z.object({
  id: z.string().uuid(),
  donorName: z.string().trim().max(200).optional(),
  familyId: z.string().uuid().optional(),
  note: z.string().trim().max(300).optional(),
});

export async function mapToSadaqa(input: z.input<typeof sadaqaSchema>): Promise<Done> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = sadaqaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, parsed.data.id);
  if ("ok" in loaded) return loaded;
  const user = await getUser();
  const result = await mapOneToSadaqa(supabase, loaded.row, parsed.data, user?.email ?? null);
  revalidate();
  return result;
}

export type BulkResult = { ok: true; done: number; failed: string[] } | Failure;

const idsSchema = z.array(z.string().uuid()).min(1, "Velg minst én transaksjon").max(200);

export async function bulkMapToSadaqa(ids: string[]): Promise<BulkResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("external_transactions")
    .select(TRANSACTION_COLUMNS)
    .in("id", parsed.data);
  if (error) return { ok: false, error: toUserError(error) };

  let done = 0;
  const failed: string[] = [];
  for (const row of (data as TransactionRow[] | null) ?? []) {
    const result = await mapOneToSadaqa(supabase, row, {}, user?.email ?? null);
    if (result.ok) done++;
    else failed.push(result.error);
  }
  revalidate();
  return { ok: true, done, failed };
}

async function ignoreOne(
  client: Client,
  row: TransactionRow,
  reason: string,
  actor: string | null,
): Promise<Done> {
  if (row.status !== "ny") {
    return { ok: false, error: "Transaksjonen er allerede behandlet. Angre først." };
  }
  const { data, error } = await client
    .from("external_transactions")
    .update({
      status: "ignorert",
      note: reason,
      mapped_by: actor,
      mapped_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "ny")
    .select("id");
  if (error) return { ok: false, error: toUserError(error) };
  if ((data ?? []).length === 0) {
    return { ok: false, error: "Transaksjonen ble behandlet av noen andre samtidig." };
  }
  await writeAudit({
    action: "reconciliation.ignored",
    entityType: "external_transactions",
    entityId: row.id,
    metadata: { reason, amount: row.amount },
  });
  return { ok: true };
}

export async function ignoreTransaction(input: { id: string; reason: string }): Promise<Done> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z
    .object({
      id: z.string().uuid(),
      reason: z.string().trim().min(1, "Skriv hvorfor den ignoreres").max(300),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, parsed.data.id);
  if ("ok" in loaded) return loaded;
  const user = await getUser();
  const result = await ignoreOne(supabase, loaded.row, parsed.data.reason, user?.email ?? null);
  revalidate();
  return result;
}

export async function acceptSuggestions(ids: string[]): Promise<BulkResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const user = await getUser();
  const { data, error } = await supabase
    .from("external_transactions")
    .select(TRANSACTION_COLUMNS)
    .in("id", parsed.data);
  if (error) return { ok: false, error: toUserError(error) };

  let done = 0;
  const failed: string[] = [];
  for (const row of (data as TransactionRow[] | null) ?? []) {
    const result =
      row.suggested_status === "sadaqa"
        ? await mapOneToSadaqa(supabase, row, {}, user?.email ?? null)
        : row.suggested_status === "ignorert"
          ? await ignoreOne(
              supabase,
              row,
              row.suggestion_reason ?? "Forslag godtatt",
              user?.email ?? null,
            )
          : ({ ok: false, error: "Transaksjonen har ikke noe forslag." } as Failure);
    if (result.ok) done++;
    else failed.push(result.error);
  }
  revalidate();
  return { ok: true, done, failed };
}

const familySchema = z.object({
  id: z.string().uuid(),
  schoolYearId: z.string().uuid("Mangler skoleår"),
  familyId: z.string().uuid().nullable(),
  familyName: z.string().trim().max(200),
  split: z
    .array(z.object({ studentId: z.string().uuid(), amount: z.number().int().positive() }))
    .min(1, "Fordel beløpet på minst ett barn")
    .max(20),
});

export async function mapToFamily(input: z.input<typeof familySchema>): Promise<Done> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = familySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const values = parsed.data;

  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, values.id);
  if ("ok" in loaded) return loaded;
  const row = loaded.row;
  const blocked = requireOpenIncoming(row);
  if (blocked) return blocked;
  const total = values.split.reduce((sum, line) => sum + line.amount, 0);
  if (total !== row.amount) {
    return { ok: false, error: "Fordelingen må bli nøyaktig lik beløpet på transaksjonen." };
  }

  const payment = await registerFamilyPayment({
    schoolYearId: values.schoolYearId,
    familyName: values.familyName,
    paidOn: row.booked_on,
    method: row.source === "vipps" ? "vipps" : "bank",
    payerName: row.counterparty_name?.slice(0, 200) || undefined,
    note: mappingNote(row),
    split: values.split,
  });
  if (!payment.ok) return payment;
  if (!payment.id) return { ok: false, error: "Betalingen ble ikke lagret." };

  const user = await getUser();
  const { data: updated, error } = await supabase
    .from("external_transactions")
    .update({
      status: "familie",
      matched_payment_id: payment.id,
      family_id: values.familyId,
      mapped_by: user?.email ?? null,
      mapped_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "ny")
    .select("id");
  if (error || (updated ?? []).length === 0) {
    await voidPayment(payment.id, "Avstemming avbrutt");
    revalidate();
    return {
      ok: false,
      error: error ? toUserError(error) : "Transaksjonen ble behandlet av noen andre samtidig.",
    };
  }

  await writeAudit({
    action: "reconciliation.mapped_family",
    entityType: "external_transactions",
    entityId: row.id,
    metadata: { paymentId: payment.id, familyId: values.familyId, split: values.split },
  });
  revalidate();
  return { ok: true };
}

export type PaymentCandidate = {
  id: string;
  reference: string;
  amount: number;
  paidAt: string | null;
  payerName: string | null;
  method: string;
  description: string | null;
};

export async function findPaymentCandidates(input: {
  id: string;
  query?: string;
}): Promise<{ ok: true; candidates: PaymentCandidate[] } | Failure> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, input.id);
  if ("ok" in loaded) return loaded;
  const row = loaded.row;

  const term = (input.query ?? "").replace(/[%,()"]/g, " ").trim().slice(0, 100);
  let query = supabase
    .from("payments")
    .select("id, reference, captured_amount, paid_at, payer_name, method, description")
    .gt("captured_amount", 0)
    .is("voided_at", null)
    .order("paid_at", { ascending: false })
    .limit(12);
  if (term) {
    query = query.or(
      `reference.ilike.%${term}%,payer_name.ilike.%${term}%,description.ilike.%${term}%,psp_reference.ilike.%${term}%`,
    );
  } else {
    const day = new Date(`${row.booked_on}T12:00:00Z`).getTime();
    query = query
      .eq("captured_amount", row.amount)
      .gte("paid_at", new Date(day - 10 * 86400000).toISOString())
      .lte("paid_at", new Date(day + 10 * 86400000).toISOString());
  }
  const [{ data, error }, { data: linked }] = await Promise.all([
    query,
    supabase
      .from("external_transactions")
      .select("matched_payment_id")
      .not("matched_payment_id", "is", null),
  ]);
  if (error) return { ok: false, error: toUserError(error) };
  const taken = new Set((linked ?? []).map((item) => item.matched_payment_id));
  return {
    ok: true,
    candidates: (data ?? [])
      .filter((payment) => !taken.has(payment.id))
      .map((payment) => ({
        id: payment.id,
        reference: payment.reference,
        amount: payment.captured_amount,
        paidAt: payment.paid_at,
        payerName: payment.payer_name,
        method: payment.method,
        description: payment.description,
      })),
  };
}

export async function linkToPayment(input: { id: string; paymentId: string }): Promise<Done> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!z.string().uuid().safeParse(input.paymentId).success) {
    return { ok: false, error: "Velg en betaling" };
  }
  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, input.id);
  if ("ok" in loaded) return loaded;
  const row = loaded.row;
  if (row.status !== "ny") {
    return { ok: false, error: "Transaksjonen er allerede behandlet. Angre først." };
  }
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, voided_at, captured_amount")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (paymentError) return { ok: false, error: toUserError(paymentError) };
  if (!payment || payment.voided_at || payment.captured_amount <= 0) {
    return { ok: false, error: "Betalingen finnes ikke eller er annullert." };
  }

  const user = await getUser();
  const { data: updated, error } = await supabase
    .from("external_transactions")
    .update({
      status: "matchet",
      matched_payment_id: payment.id,
      mapped_by: user?.email ?? null,
      mapped_at: new Date().toISOString(),
      note: "Koblet manuelt",
    })
    .eq("id", row.id)
    .eq("status", "ny")
    .select("id");
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Betalingen er allerede koblet til en annen transaksjon."
          : toUserError(error),
    };
  }
  if ((updated ?? []).length === 0) {
    return { ok: false, error: "Transaksjonen ble behandlet av noen andre samtidig." };
  }
  await writeAudit({
    action: "reconciliation.linked",
    entityType: "external_transactions",
    entityId: row.id,
    metadata: { paymentId: payment.id },
  });
  revalidate();
  return { ok: true };
}

export async function undoMapping(id: string): Promise<Done> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const loaded = await loadTransaction(supabase, id);
  if ("ok" in loaded) return loaded;
  const row = loaded.row;
  if (row.status === "ny") return { ok: false, error: "Transaksjonen er ikke behandlet." };

  if (row.status === "sadaqa" && row.sadaqa_gift_id) {
    const { data: gift } = await supabase
      .from("sadaqa_gifts")
      .select("voided_at")
      .eq("id", row.sadaqa_gift_id)
      .maybeSingle();
    if (gift && !gift.voided_at) {
      const voided = await voidSadaqaGift(row.sadaqa_gift_id, "Angret i avstemming");
      if (!voided.ok) return voided;
    }
  }
  if (row.status === "familie" && row.matched_payment_id) {
    const { data: payment } = await supabase
      .from("payments")
      .select("voided_at")
      .eq("id", row.matched_payment_id)
      .maybeSingle();
    if (payment && !payment.voided_at) {
      const voided = await voidPayment(row.matched_payment_id, "Angret i avstemming");
      if (!voided.ok) return voided;
    }
  }

  const { error } = await supabase
    .from("external_transactions")
    .update({
      status: "ny",
      matched_payment_id: null,
      sadaqa_gift_id: null,
      family_id: null,
      mapped_by: null,
      mapped_at: null,
      note: "Behandling angret",
    })
    .eq("id", row.id)
    .eq("status", row.status);
  if (error) return { ok: false, error: toUserError(error) };

  const user = await getUser();
  await writeAudit({
    action: "reconciliation.undone",
    entityType: "external_transactions",
    entityId: row.id,
    metadata: {
      previousStatus: row.status,
      paymentId: row.matched_payment_id,
      giftId: row.sadaqa_gift_id,
      by: user?.email ?? null,
    },
  });
  revalidate();
  return { ok: true };
}

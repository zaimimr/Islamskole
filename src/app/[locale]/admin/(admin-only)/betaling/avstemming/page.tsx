import type { Metadata } from "next";
import Link from "next/link";
import { Download, SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFamilyNames } from "@/lib/families/names";
import { adminBasePath } from "@/components/admin/paths";
import { Pagination } from "@/components/admin/pagination";
import { SelectField } from "@/components/ui/select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatNok } from "@/lib/money";
import { formatOsloDate, formatOsloDateTime } from "@/lib/dates";
import { studentDisplayName } from "@/lib/student-name";
import { vippsAccountLabels } from "@/lib/reconciliation-match";
import { vippsReportMsns } from "@/lib/vipps-report";
import { cn } from "@/lib/utils";
import { FinanceLoadError } from "../load-error";
import {
  TransactionInbox,
  type InboxTransaction,
  type PickerFamily,
} from "./reconciliation-client";

import { ImportPanel } from "./statement-import-panel";

export const metadata: Metadata = { title: "Avstemming" };

const PAGE_SIZE = 25;

const statusTabs = [
  { value: "ny", label: "Til behandling" },
  { value: "matchet", label: "Koblet" },
  { value: "sadaqa", label: "Sadaqa" },
  { value: "familie", label: "Skolepenger" },
  { value: "ignorert", label: "Ignorert" },
  { value: "alle", label: "Alle" },
];

type TransactionRow = {
  id: string;
  source: string;
  account: string;
  external_id: string;
  booked_on: string;
  amount: number;
  counterparty_name: string | null;
  counterparty_phone: string | null;
  message: string | null;
  reference: string | null;
  psp_reference: string | null;
  status: string;
  suggested_status: string | null;
  suggestion_reason: string | null;
  matched_payment_id: string | null;
  sadaqa_gift_id: string | null;
  family_id: string | null;
  mapped_by: string | null;
  mapped_at: string | null;
  note: string | null;
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function accountLabel(source: string, account: string) {
  if (source === "vipps") {
    return vippsAccountLabels[account] ? `${vippsAccountLabels[account]} #${account}` : `Vipps #${account}`;
  }
  return `DNB ${account.replace(/^(\d{4})(\d{2})(\d{5})$/, "$1.$2.$3")}`;
}

export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const basePath = adminBasePath(locale);
  const pageHref = `${basePath}/betaling/avstemming`;
  const supabase = await createClient();

  const status = statusTabs.some((tab) => tab.value === one(sp.status)) ? one(sp.status) : "ny";
  const source = one(sp.kilde) === "vipps" || one(sp.kilde) === "dnb" ? one(sp.kilde) : "";
  const account = one(sp.konto).replace(/\D/g, "");
  const from = isDate(one(sp.fra)) ? one(sp.fra) : "";
  const to = isDate(one(sp.til)) ? one(sp.til) : "";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  let listQuery = supabase
    .from("external_transactions")
    .select(
      "id, source, account, external_id, booked_on, amount, counterparty_name, counterparty_phone, message, reference, psp_reference, status, suggested_status, suggestion_reason, matched_payment_id, sadaqa_gift_id, family_id, mapped_by, mapped_at, note",
      { count: "exact" },
    )
    .order("booked_on", { ascending: false })
    .order("imported_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status !== "alle") listQuery = listQuery.eq("status", status);
  if (source) listQuery = listQuery.eq("source", source);
  if (account) listQuery = listQuery.eq("account", account);
  if (from) listQuery = listQuery.gte("booked_on", from);
  if (to) listQuery = listQuery.lte("booked_on", to);

  const [listResult, openResult, accountResult, batchResult, yearResult] = await Promise.all([
    listQuery,
    supabase.from("external_transactions").select("status, amount, source, account").limit(10000),
    supabase.from("import_batches").select("source, account").not("account", "is", null).limit(500),
    supabase
      .from("import_batches")
      .select(
        "id, source, kind, account, file_name, inserted_count, duplicate_count, matched_count, errors, created_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("school_years").select("id, label, is_active").eq("is_active", true).maybeSingle(),
  ]);
  if (listResult.error || openResult.error || batchResult.error) {
    return <FinanceLoadError title="Avstemmingen kunne ikke lastes" retryHref={pageHref} />;
  }

  const activeYear = yearResult.data ?? null;
  const [balanceResult, studentResult, familyNames, guardianResult] = await Promise.all([
    activeYear
      ? supabase.from("student_balances").select("student_id, remaining").eq("school_year_id", activeYear.id)
      : Promise.resolve({
          data: [] as {
            student_id: string | null;
            remaining: number | null;
          }[],
        }),
    supabase.from("students").select("id, family_id, child_first_name, child_last_name"),
    loadFamilyNames(supabase),
    supabase.from("family_guardians").select("family_id, guardian:guardians(first_name, last_name)"),
  ]);

  const rows = (listResult.data as TransactionRow[] | null) ?? [];
  const guardiansByFamily = new Map<string, string[]>();
  for (const row of guardianResult.data ?? []) {
    const guardian = row.guardian as {
      first_name: string | null;
      last_name: string | null;
    } | null;
    const name = [guardian?.first_name, guardian?.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    guardiansByFamily.set(row.family_id, [...(guardiansByFamily.get(row.family_id) ?? []), name]);
  }
  const students = new Map((studentResult.data ?? []).map((student) => [student.id, student]));

  const paymentIds = rows.flatMap((row) => (row.matched_payment_id ? [row.matched_payment_id] : []));
  const [{ data: paymentData }, { data: applicationData }] = paymentIds.length
    ? await Promise.all([
        supabase
          .from("payments")
          .select("id, reference, student_id, payer_name, description")
          .in("id", paymentIds),
        supabase.from("student_applications").select("payment_id, family_id").in("payment_id", paymentIds),
      ])
    : [{ data: [] }, { data: [] }];
  const payments = new Map((paymentData ?? []).map((payment) => [payment.id, payment]));
  const applicationFamilies = new Map(
    (applicationData ?? []).flatMap((application) =>
      application.payment_id && application.family_id ? [[application.payment_id, application.family_id]] : [],
    ),
  );

  const transactions: InboxTransaction[] = rows.map((row) => {
    let linkLabel: string | null = null;
    let linkHref: string | null = null;
    let outcome: string | null = row.status === "ignorert" ? "Ignorert" : null;
    if (row.status === "sadaqa") {
      const familyName = row.family_id ? familyNames.get(row.family_id) : null;
      outcome = familyName ? `Sadaqa · ${familyName}` : "Sadaqa";
      linkLabel = `Sadaqa-gave${familyName ? ` fra ${familyName}` : ""}`;
      linkHref = `${basePath}/betaling/sadaqa`;
    } else if (row.matched_payment_id) {
      const payment = payments.get(row.matched_payment_id);
      const student = payment?.student_id ? students.get(payment.student_id) : null;
      const familyId =
        row.family_id ?? student?.family_id ?? applicationFamilies.get(row.matched_payment_id) ?? null;
      linkLabel =
        row.status === "familie" && familyId
          ? `Skolepenger for ${familyNames.get(familyId) ?? "familien"}`
          : `Betaling ${payment?.reference ?? ""}${student ? ` for ${studentDisplayName(student)}` : ""}`;
      const familyName = familyId ? familyNames.get(familyId) : null;
      outcome =
        row.status === "familie"
          ? `Skolepenger · ${familyName ?? "familie"}`
          : `Koblet · ${(student ? studentDisplayName(student) : "") || payment?.payer_name || familyName || "betaling"}`;
      linkHref = familyId
        ? `${basePath}/familier/${familyId}`
        : `${basePath}/betaling/logg?q=${encodeURIComponent(payment?.reference ?? "")}`;
    }
    return {
      id: row.id,
      source: row.source === "dnb" ? "dnb" : "vipps",
      account: row.account,
      accountLabel: accountLabel(row.source, row.account),
      bookedOn: row.booked_on,
      amount: row.amount,
      counterpartyName: row.counterparty_name,
      counterpartyPhone: row.counterparty_phone,
      message: row.message,
      reference: row.reference,
      pspReference: row.psp_reference,
      externalId: row.external_id,
      status: row.status,
      suggestedStatus: row.suggested_status,
      suggestionReason: row.suggestion_reason,
      note: row.note,
      mappedBy: row.mapped_by,
      mappedAt: row.mapped_at,
      linkLabel,
      linkHref,
      outcome,
    };
  });

  const familyGroups = new Map<string, PickerFamily>();
  for (const balance of balanceResult.data ?? []) {
    const student = balance.student_id ? students.get(balance.student_id) : null;
    if (!student) continue;
    const key = student.family_id ?? student.id;
    const group = familyGroups.get(key) ?? {
      key,
      familyId: student.family_id,
      guardians: student.family_id ? (guardiansByFamily.get(student.family_id) ?? []) : [],
      name: student.family_id
        ? (familyNames.get(student.family_id) ?? `Familien ${student.child_last_name ?? ""}`.trim())
        : studentDisplayName(student) || "Ukjent barn",
      children: [],
    };
    group.children.push({
      id: student.id,
      name: studentDisplayName(student) || "Ukjent barn",
      remainingOre: balance.remaining ?? 0,
    });
    familyGroups.set(key, group);
  }
  const pickerFamilies = [...familyGroups.values()]
    .map((family) => ({
      ...family,
      children: family.children.sort((a, b) => a.name.localeCompare(b.name, "nb-NO")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  const giftFamilies = [...familyNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));

  const msns = vippsReportMsns();
  const vippsAccounts = msns.map((msn) => ({
    value: msn,
    label: accountLabel("vipps", msn),
  }));
  const knownAccounts = new Map<string, { source: string; account: string }>();
  for (const msn of msns) knownAccounts.set(`vipps:${msn}`, { source: "vipps", account: msn });
  for (const row of [...(accountResult.data ?? []), ...(openResult.data ?? [])]) {
    if (row.account)
      knownAccounts.set(`${row.source}:${row.account}`, {
        source: row.source,
        account: row.account,
      });
  }
  const accountOptions = [...knownAccounts.values()]
    .map((entry) => ({
      value: entry.account,
      label: accountLabel(entry.source, entry.account),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "nb-NO"));

  const allRows = openResult.data ?? [];
  const openRows = allRows.filter((row) => row.status === "ny");
  const openIncoming = openRows.filter((row) => row.amount > 0);
  const openTotal = openIncoming.reduce((sum, row) => sum + row.amount, 0);
  const openOutgoing = openRows.length - openIncoming.length;
  const total = listResult.count ?? 0;

  const filterParams = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    const merged = {
      status,
      kilde: source,
      konto: account,
      fra: from,
      til: to,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "status" && value === "ny")) query.set(key, value);
    }
    const text = query.toString();
    return text ? `${pageHref}?${text}` : pageHref;
  };
  const exportQuery = new URLSearchParams(
    Object.entries({
      status: status === "alle" ? "" : status,
      kilde: source,
      konto: account,
      fra: from,
      til: to,
    }).filter(([, value]) => value),
  ).toString();

  const activeFilters = [
    source ? { key: "kilde", label: source === "dnb" ? "DNB" : "Vipps" } : null,
    account
      ? {
          key: "konto",
          label: accountOptions.find((option) => option.value === account)?.label ?? account,
        }
      : null,
    from ? { key: "fra", label: `Fra ${formatOsloDate(from)}` } : null,
    to ? { key: "til", label: `Til ${formatOsloDate(to)}` } : null,
  ].filter((entry): entry is { key: string; label: string } => entry !== null);

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Avstemming
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export/avstemming${exportQuery ? `?${exportQuery}` : ""}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold ring-1 ring-[#DCD7CC] outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Download aria-hidden="true" className="size-4" />
            Eksporter
          </a>
          <ImportPanel
            vippsAccounts={vippsAccounts}
            history={
              (batchResult.data ?? []).length === 0 ? (
                <p className="text-sm text-admin-muted">Ingenting importert ennå.</p>
              ) : (
                <ol className="grid text-sm">
                  {(batchResult.data ?? []).map((batch) => {
                    const errors = Array.isArray(batch.errors) ? batch.errors.length : 0;
                    return (
                      <li
                        key={batch.id}
                        className="relative grid gap-0.5 border-l border-[#E3DED3] pb-3 pl-4 last:pb-0"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-1.5 -left-[4.5px] size-2 rounded-full",
                            errors > 0 ? "bg-[#C0841A]" : "bg-[#3C8F44]",
                          )}
                        />
                        <span className="font-bold break-words">
                          {batch.kind === "api" ? "Hentet fra Vipps" : (batch.file_name ?? "Fil")}
                        </span>
                        <span className="text-admin-muted">
                          {batch.account ? `${accountLabel(batch.source, batch.account)} · ` : ""}
                          {formatOsloDateTime(batch.created_at)}
                        </span>
                        <span className="tabular-nums">
                          {batch.inserted_count} nye · {batch.matched_count} koblet
                          {batch.duplicate_count > 0 ? ` · ${batch.duplicate_count} fantes fra før` : ""}
                          {errors > 0 ? (
                            <span className="font-bold text-[#775108]"> · {errors} feil</span>
                          ) : null}
                        </span>
                        {batch.created_by ? (
                          <span className="truncate text-xs text-admin-muted">{batch.created_by}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )
            }
          />
        </div>
      </header>

      <section aria-labelledby="inbox-heading" className="grid min-w-0 grid-cols-1 gap-3">
        <h2 id="inbox-heading" className="sr-only">
          Transaksjoner
        </h2>
        <p
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-2xl px-4 py-3 sm:px-5",
            openRows.length > 0
              ? "bg-[#FFF8E9] text-[#5C4410] ring-1 ring-[#EFDDB4]"
              : "bg-[#F2F8F2] text-[#216A2B] ring-1 ring-[#C9E0CB]",
          )}
        >
          {openRows.length > 0 ? (
            <>
              <span className="font-heading text-xl font-bold tabular-nums">{formatNok(openTotal)}</span>
              <span>
                venter · {openIncoming.length} {openIncoming.length === 1 ? "innbetaling" : "innbetalinger"}
                {openOutgoing > 0
                  ? `, ${openOutgoing} ${openOutgoing === 1 ? "utbetaling" : "utbetalinger"}`
                  : ""}
              </span>
            </>
          ) : (
            <span className="font-bold">Alt er avstemt</span>
          )}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Status"
            className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:max-w-full sm:px-0"
          >
            <ul className="flex w-max gap-1 rounded-2xl bg-[#F2F1EB] p-1">
              {statusTabs.map((tab) => {
                const current = tab.value === status;
                return (
                  <li key={tab.value}>
                    <Link
                      href={filterParams({ status: tab.value, page: "" })}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        current
                          ? "bg-white text-foreground shadow-[0_1px_2px_rgb(9_13_19/0.08)] ring-1 ring-[#E3DED3]"
                          : "text-admin-muted hover:text-foreground",
                      )}
                    >
                      {tab.label}
                      {tab.value === "ny" && openRows.length > 0 ? (
                        <span className="rounded-full bg-[#FEEDCA] px-1.5 text-xs leading-5 tabular-nums text-[#775108]">
                          {openRows.length}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <details className="ml-auto open:w-full">
            <summary className="ml-auto flex min-h-11 w-max cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-bold ring-1 ring-[#DCD7CC] outline-none transition-colors select-none hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filter
              {activeFilters.length > 0 ? (
                <span className="rounded-full bg-[#DCEDDD] px-1.5 text-xs leading-5 text-[#216A2B] tabular-nums">
                  {activeFilters.length}
                </span>
              ) : null}
            </summary>
            <form
              method="get"
              action={pageHref}
              className="mt-2 grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1fr_1fr]"
            >
              {status !== "ny" ? <input type="hidden" name="status" value={status} /> : null}
              <div className="grid gap-1.5">
                <Label htmlFor="filter-source">Kilde</Label>
                <SelectField
                  id="filter-source"
                  name="kilde"
                  defaultValue={source}
                  options={[
                    { value: "", label: "Vipps og DNB" },
                    { value: "vipps", label: "Vipps" },
                    { value: "dnb", label: "DNB" },
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-account">Konto</Label>
                <SelectField
                  id="filter-account"
                  name="konto"
                  defaultValue={account}
                  options={[{ value: "", label: "Alle kontoer" }, ...accountOptions]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-from">Fra dato</Label>
                <Input
                  id="filter-from"
                  type="date"
                  name="fra"
                  defaultValue={from}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-to">Til dato</Label>
                <Input id="filter-to" type="date" name="til" defaultValue={to} className="h-11 rounded-xl" />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2 xl:col-span-4">
                {activeFilters.length > 0 ? (
                  <Link
                    href={filterParams({
                      kilde: "",
                      konto: "",
                      fra: "",
                      til: "",
                      page: "",
                    })}
                    className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-admin-muted outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Nullstill
                  </Link>
                ) : null}
                <Button type="submit" className="min-h-11 rounded-xl px-4 font-bold">
                  Bruk filter
                </Button>
              </div>
            </form>
          </details>
        </div>

        {activeFilters.length > 0 ? (
          <ul aria-label="Aktive filter" className="flex flex-wrap gap-1.5">
            {activeFilters.map((filter) => (
              <li key={filter.key}>
                <Link
                  href={filterParams({ [filter.key]: "", page: "" })}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white py-1 pr-2 pl-3 text-sm font-semibold ring-1 ring-[#E3DED3] outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {filter.label}
                  <X aria-hidden="true" className="size-3.5 text-admin-muted" />
                  <span className="sr-only">Fjern filter</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <TransactionInbox
          transactions={transactions}
          families={pickerFamilies}
          giftFamilies={giftFamilies}
          schoolYearId={activeYear?.id ?? null}
          schoolYearLabel={activeYear?.label ?? null}
          emptyKind={status === "ny" && activeFilters.length === 0 ? "done" : "filtered"}
        />

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath={pageHref} searchParams={sp} />
      </section>
    </div>
  );
}

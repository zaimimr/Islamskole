import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Download,
  Percent,
  ReceiptText,
  UserRoundX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { studentDisplayName } from "@/lib/student-name";
import { adminBasePath } from "@/components/admin/paths";
import { BatchSendButton } from "@/components/admin/batch-send-button";
import { ReallocateYearButton } from "@/components/admin/reallocate-year-button";
import {
  getActiveYear,
  getOverdueSummary,
  getPayState,
  getYearBalances,
  payStateLabels,
  payStateOrder,
  summarizeBalances,
  type BalanceSummary,
  type OverdueSummary,
  type PayState,
  type YearBalanceRow,
} from "@/lib/balances";
import { formatNok } from "@/lib/money";
import { formatOsloDate, osloLocalToIso, osloToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { familyDisplayName } from "@/lib/families/naming";
import { FamilyPaymentDialog } from "./family-payment-dialog";
import { SelectField } from "@/components/ui/select-field";

export const metadata: Metadata = { title: "Økonomi" };

type YearRow = { id: string; label: string; is_active: boolean };

type FamilyGroup = {
  key: string;
  familyId: string | null;
  name: string;
  children: YearBalanceRow[];
  owedOre: number;
  appliedOre: number;
  remainingOre: number;
  overpaidOre: number;
  missingFee: boolean;
  state: PayState;
};

type YearData = {
  year: YearRow;
  rows: YearBalanceRow[];
  summary: BalanceSummary;
};

type RecentPayments = { amountOre: number; count: number; since: string };

const stateClasses: Record<PayState, string> = {
  betalt: "bg-[#DCEDDD] text-[#216A2B]",
  delvis: "bg-[#FEEDCA] text-[#775108]",
  venter: "bg-[#DDEEF9] text-[#245D84]",
  ubetalt: "bg-[#F9DEDB] text-[#8B2F2B]",
  fritatt: "bg-[#F0F0ED] text-[#4E5550]",
};

function eleverHref(basePath: string, filter: string) {
  return `${basePath}/elever?pay=${filter}&betaling=${filter}`;
}

function childName(row: YearBalanceRow) {
  return (
    studentDisplayName({
      child_first_name: row.firstName,
      child_last_name: row.lastName,
    }) || "Navn mangler"
  );
}

function groupFamilies(
  rows: YearBalanceRow[],
  familyNames: Map<string, string | null>,
): FamilyGroup[] {
  const groups = new Map<string, YearBalanceRow[]>();
  for (const row of rows) {
    const key = row.familyId ?? `student:${row.studentId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, children]) => {
      const familyId = children[0].familyId;
      const priced = children.filter((child) => !child.missingFee);
      const owedOre = priced.reduce((sum, child) => sum + child.owedOre, 0);
      const appliedOre = priced.reduce((sum, child) => sum + child.appliedOre, 0);
      const remainingOre = priced.reduce((sum, child) => sum + child.remainingOre, 0);
      const overpaidOre = priced.reduce((sum, child) => sum + child.overpaidOre, 0);
      const missingFee = children.length !== priced.length;
      const hasOpenLink = children.some((child) => child.hasOpenLink);
      const state: PayState =
        priced.length === 0
          ? hasOpenLink
            ? "venter"
            : "ubetalt"
          : getPayState({
              owed: owedOre,
              paid: appliedOre,
              remaining: remainingOre,
              hasOpenLink,
            });
      const fallbackName =
        familyId && children.some((child) => child.lastName)
          ? familyDisplayName({
              familyId,
              displayName: null,
              guardians: [],
              students: children,
            })
          : children[0].lastName
            ? `Familien ${children[0].lastName}`
            : childName(children[0]);
      return {
        key,
        familyId,
        name: (familyId ? familyNames.get(familyId) : null) || fallbackName,
        children: [...children].sort((a, b) =>
          childName(a).localeCompare(childName(b), "nb"),
        ),
        owedOre,
        appliedOre,
        remainingOre,
        overpaidOre,
        missingFee,
        state: missingFee && state === "fritatt" ? "ubetalt" : state,
      };
    })
    .sort((a, b) => {
      const difference = payStateOrder[a.state] - payStateOrder[b.state];
      if (difference !== 0) return difference;
      return a.name.localeCompare(b.name, "nb");
    });
}

function isUnfinished(state: PayState) {
  return state === "delvis" || state === "venter" || state === "ubetalt";
}

async function getData() {
  const supabase = await createClient();
  const activeYear = await getActiveYear(supabase);
  const [yearsResult, duplicateResult] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, label, is_active")
      .order("label", { ascending: false }),
    supabase
      .from("duplicate_payment_candidates")
      .select("payment_id", { count: "exact", head: true }),
  ]);
  if (yearsResult.error || duplicateResult.error) {
    throw new Error("Kunne ikke hente økonomien");
  }

  const years = [...((yearsResult.data as YearRow[] | null) ?? [])].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  );
  const yearData: YearData[] = await Promise.all(
    years.map(async (year) => {
      const rows = await getYearBalances(supabase, year.id);
      return { year, rows, summary: summarizeBalances(rows, year) };
    }),
  );

  const familyIds = [
    ...new Set(
      yearData.flatMap((entry) =>
        entry.rows
          .map((row) => row.familyId)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  const since = osloToday(new Date(Date.now() - 6 * 86_400_000));

  const [familiesResult, recentResult, siblingResult, dismissalResult] =
    await Promise.all([
      familyIds.length > 0
        ? supabase.from("families").select("id, display_name").in("id", familyIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("payments")
        .select("captured_amount, refunded_amount")
        .eq("status", "fanget")
        .is("voided_at", null)
        .neq("method", "sadaqa")
        .gte("paid_at", osloLocalToIso(`${since}T00:00`)),
      activeYear
        ? supabase
            .from("student_fee_adjustments")
            .select("student_id")
            .eq("school_year_id", activeYear.id)
            .eq("type", "soskenrabatt")
            .is("revoked_at", null)
        : Promise.resolve({ data: [], error: null }),
      activeYear
        ? supabase
            .from("sibling_discount_dismissals")
            .select("family_id")
            .eq("school_year_id", activeYear.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    familiesResult.error ||
    recentResult.error ||
    siblingResult.error ||
    dismissalResult.error
  ) {
    throw new Error("Kunne ikke hente økonomien");
  }

  const recentRows =
    (recentResult.data as
      | { captured_amount: number; refunded_amount: number }[]
      | null) ?? [];
  const recent: RecentPayments = {
    since,
    count: recentRows.length,
    amountOre: recentRows.reduce(
      (sum, row) => sum + row.captured_amount - row.refunded_amount,
      0,
    ),
  };

  const activeData = activeYear
    ? (yearData.find((entry) => entry.year.id === activeYear.id) ?? null)
    : null;
  const overdue: OverdueSummary | null =
    activeYear && activeData
      ? await getOverdueSummary(supabase, activeYear, activeData.rows)
      : null;

  let siblingEligibleCount = 0;
  if (activeData) {
    const familyByStudent = new Map(
      activeData.rows.map((row) => [row.studentId, row.familyId]),
    );
    const placedByFamily = new Map<string, number>();
    for (const row of activeData.rows) {
      if (!row.placed || !row.familyId) continue;
      placedByFamily.set(row.familyId, (placedByFamily.get(row.familyId) ?? 0) + 1);
    }
    const withDiscount = new Set(
      ((siblingResult.data as { student_id: string }[] | null) ?? []).map((row) =>
        familyByStudent.get(row.student_id),
      ),
    );
    const dismissed = new Set(
      ((dismissalResult.data as { family_id: string }[] | null) ?? []).map(
        (row) => row.family_id,
      ),
    );
    for (const [familyId, count] of placedByFamily) {
      if (count >= 3 && !withDiscount.has(familyId) && !dismissed.has(familyId)) {
        siblingEligibleCount += 1;
      }
    }
  }

  const overpaidCount = yearData.reduce(
    (sum, entry) => sum + entry.rows.filter((row) => row.overpaidOre > 0).length,
    0,
  );

  return {
    years: yearData,
    activeYearId: activeYear?.id ?? null,
    familyNames: new Map(
      (
        (familiesResult.data as { id: string; display_name: string | null }[] | null) ??
        []
      ).map((family) => [family.id, family.display_name]),
    ),
    reviewCount: (duplicateResult.count ?? 0) + overpaidCount,
    siblingEligibleCount,
    recent,
    overdue,
  };
}

export default async function BetalingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const showAllFamilies = sp.familier === "alle";
  const basePath = adminBasePath(locale);

  let data: Awaited<ReturnType<typeof getData>>;
  try {
    data = await getData();
  } catch {
    return (
      <section
        aria-labelledby="payment-load-error"
        className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1
          id="payment-load-error"
          className="mt-4 font-heading text-3xl font-bold tracking-[-0.02em]"
        >
          Økonomien kunne ikke lastes
        </h1>
        <p className="mt-2 max-w-prose text-admin-muted">
          Ingen beløp er erstattet med null. Prøv å laste siden på nytt før du
          fortsetter betalingsarbeidet.
        </p>
        <Link
          href={`${basePath}/betaling`}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Prøv igjen
        </Link>
      </section>
    );
  }

  const primary =
    data.years.find((entry) => entry.year.id === data.activeYearId) ??
    data.years[0] ??
    null;
  const olderYears = data.years.filter((entry) => entry !== primary);
  const activeSummary = primary?.year.is_active ? primary.summary : null;

  return (
    <div className="grid gap-7 lg:gap-8">
      <header>
        <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Økonomi
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Hva som må følges opp, hva som har kommet inn og hva familiene har
          igjen å betale.
        </p>
      </header>

      <AttentionList
        basePath={basePath}
        reviewCount={data.reviewCount}
        siblingEligibleCount={data.siblingEligibleCount}
        summary={activeSummary}
      />

      {activeSummary ? (
        <TodayStrip
          basePath={basePath}
          recent={data.recent}
          overdue={data.overdue}
          summary={activeSummary}
        />
      ) : null}

      {!primary ? (
        <section className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#E3DED3]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F0F0ED] text-admin-muted">
            <ReceiptText aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 font-heading text-xl font-semibold">
            Ingen skoleår ennå
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
            Opprett og aktiver et skoleår før betalingskrav kan følges her.
          </p>
          <Link
            href={`${basePath}/skolear`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Gå til skoleår
          </Link>
        </section>
      ) : (
        <YearWorkspace
          entry={primary}
          basePath={basePath}
          familyNames={data.familyNames}
          showAllFamilies={showAllFamilies}
        />
      )}

      {olderYears.length > 0 ? (
        <section aria-labelledby="older-years" className="grid gap-3">
          <h2 id="older-years" className="font-heading text-xl font-semibold">
            Tidligere skoleår
          </h2>
          {olderYears.map((entry) => (
            <details
              key={entry.year.id}
              className="group overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="font-heading text-lg font-semibold">
                    {entry.year.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-admin-muted">
                    {entry.summary.owedOre > 0
                      ? `${formatNok(entry.summary.paidOre)} av ${formatNok(entry.summary.owedOre)} innbetalt`
                      : "Ingen krav registrert"}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-admin-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="grid gap-5 border-t border-[#ECE8DF] p-4 sm:p-5">
                <BalanceEquation summary={entry.summary} />
                <FamilyList
                  groups={groupFamilies(
                    entry.rows.filter((row) => row.placed),
                    data.familyNames,
                  )}
                  basePath={basePath}
                  schoolYearId={entry.year.id}
                  showAll
                  allowPayments={false}
                />
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {data.years.length > 0 ? (
        <AccountingExport
          years={data.years.map((entry) => entry.year)}
          defaultYearId={primary?.year.id ?? ""}
        />
      ) : null}
    </div>
  );
}

function AttentionList({
  basePath,
  reviewCount,
  siblingEligibleCount,
  summary,
}: {
  basePath: string;
  reviewCount: number;
  siblingEligibleCount: number;
  summary: BalanceSummary | null;
}) {
  const items = [
    reviewCount > 0
      ? {
          href: `${basePath}/betaling/dobbeltforinger`,
          icon: ReceiptText,
          tone: "warning" as const,
          title: `${reviewCount} ${reviewCount === 1 ? "sak" : "saker"} til kontroll`,
          detail:
            "Mulige dobbeltføringer eller barn som har betalt mer enn kravet.",
          action: "Kontroller",
        }
      : null,
    summary && summary.unplacedCount > 0
      ? {
          href: eleverHref(basePath, "ikke_betalt"),
          icon: UserRoundX,
          tone: "warning" as const,
          title: `${summary.unplacedCount} ${summary.unplacedCount === 1 ? "barn" : "barn"} har krav uten klasseplass`,
          detail: `${formatNok(summary.unplacedRemainingOre)} er ikke med i tallene under før barna er plassert eller kravet er fjernet.`,
          action: "Se elevene",
        }
      : null,
    summary && summary.missingFeeCount > 0
      ? {
          href: eleverHref(basePath, "ubetalt"),
          icon: AlertTriangle,
          tone: "warning" as const,
          title: `${summary.missingFeeCount} plasserte ${summary.missingFeeCount === 1 ? "barn" : "barn"} mangler krav`,
          detail: "Barna har klasseplass, men ingen skolepenger er beregnet.",
          action: "Se elevene",
        }
      : null,
    siblingEligibleCount > 0
      ? {
          href: `${basePath}/familier`,
          icon: Percent,
          tone: "info" as const,
          title: `${siblingEligibleCount} ${siblingEligibleCount === 1 ? "familie" : "familier"} kvalifiserer til søskenrabatt`,
          detail:
            "Familier med 3 eller flere barn kan få 1 500 kr i rabatt. Godkjenn fra familiesiden.",
          action: "Gå gjennom",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) return null;

  return (
    <section aria-label="Må følges opp" className="grid gap-2">
      {items.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          className={cn(
            "group grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-4 py-3 outline-none ring-1 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5",
            item.tone === "warning"
              ? "bg-[#FFF8E9] ring-[#E8D6AA] hover:bg-[#FFF3D8]"
              : "bg-[#F2F7F2] ring-[#C9DEC9] hover:bg-[#E9F2E9]",
          )}
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              item.tone === "warning"
                ? "bg-[#FEEDCA] text-[#775108]"
                : "bg-[#DCEDDD] text-[#216A2B]",
            )}
          >
            <item.icon aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block font-bold">{item.title}</span>
            <span className="mt-0.5 block text-sm text-[#5C5340]">
              {item.detail}
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-[#277A31]">
            <span className="hidden sm:inline">{item.action}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      ))}
    </section>
  );
}

function TodayStrip({
  basePath,
  recent,
  overdue,
  summary,
}: {
  basePath: string;
  recent: RecentPayments;
  overdue: OverdueSummary | null;
  summary: BalanceSummary;
}) {
  const overdueDetail = !overdue
    ? "Kunne ikke beregnes"
    : overdue.amountOre > 0
      ? `${overdue.familyCount} ${overdue.familyCount === 1 ? "familie" : "familier"} over frist`
      : overdue.nextDueDate
        ? `Neste frist ${formatOsloDate(overdue.nextDueDate, { day: "numeric", month: "long" })}`
        : "Ingen passerte frister";

  return (
    <section aria-labelledby="finance-today">
      <h2 id="finance-today" className="mb-3 font-heading text-xl font-semibold">
        Økonomi i dag
      </h2>
      <dl className="grid overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:grid-cols-3">
        <TodayFact
          href={`${basePath}/betaling/logg?status=betalt&fra=${recent.since}`}
          label="Innbetalt siste 7 dager"
          value={formatNok(recent.amountOre)}
          detail={
            recent.count > 0
              ? `${recent.count} ${recent.count === 1 ? "betaling" : "betalinger"}`
              : "Ingen nye betalinger"
          }
          tone={recent.amountOre > 0 ? "green" : "neutral"}
        />
        <TodayFact
          href={eleverHref(basePath, "ikke_betalt")}
          label="Forfalt"
          value={overdue ? formatNok(overdue.amountOre) : "-"}
          detail={overdueDetail}
          tone={overdue && overdue.amountOre > 0 ? "red" : "neutral"}
        />
        <TodayFact
          href={eleverHref(basePath, "ikke_betalt")}
          label="Gjenstår i år"
          value={formatNok(summary.remainingOre)}
          detail={
            summary.owedOre > 0
              ? `av ${formatNok(summary.owedOre)} i krav`
              : "Ingen krav registrert"
          }
          tone={summary.remainingOre > 0 ? "yellow" : "green"}
        />
      </dl>
    </section>
  );
}

function TodayFact({
  href,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "green" | "yellow" | "red";
}) {
  return (
    <div className="border-b border-[#ECE8DF] last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <Link
        href={href}
        className="group grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:block sm:px-5 sm:py-4"
      >
        <dt className="text-sm font-bold text-admin-muted">{label}</dt>
        <dd
          className={cn(
            "font-heading text-xl font-bold tabular-nums sm:mt-1 sm:text-2xl",
            tone === "green" && "text-[#216A2B]",
            tone === "yellow" && "text-[#775108]",
            tone === "red" && "text-[#8B2F2B]",
          )}
        >
          {value}
        </dd>
        <dd className="col-span-2 text-xs text-admin-muted sm:mt-0.5">
          {detail}
        </dd>
      </Link>
    </div>
  );
}

function BalanceEquation({ summary }: { summary: BalanceSummary }) {
  if (summary.owedOre === 0 && summary.grossOre === 0) {
    return (
      <p className="rounded-xl bg-[#F7F6F1] px-4 py-3 text-sm text-admin-muted">
        Ingen krav er registrert for plasserte elever i {summary.schoolYearLabel}.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <dl className="grid gap-1 rounded-xl bg-[#FAF9F5] px-4 py-3 ring-1 ring-[#E8E3D9] sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1">
        <EquationTerm label="Krav etter rabatt" value={formatNok(summary.owedOre)} />
        <span aria-hidden="true" className="hidden text-lg font-bold text-admin-muted sm:inline">
          −
        </span>
        <EquationTerm
          label="Innbetalt"
          value={formatNok(summary.paidOre)}
          className="text-[#216A2B]"
        />
        <span aria-hidden="true" className="hidden text-lg font-bold text-admin-muted sm:inline">
          =
        </span>
        <EquationTerm
          label="Gjenstår"
          value={formatNok(summary.remainingOre)}
          className={summary.remainingOre > 0 ? "text-[#775108]" : "text-[#216A2B]"}
        />
      </dl>
      <details className="group rounded-xl">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          Detaljer
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <dl className="mt-2 grid gap-x-6 gap-y-2 rounded-xl bg-[#FAF9F5] px-4 py-3 text-sm ring-1 ring-[#E8E3D9] sm:grid-cols-2">
          <DetailLine label="Krav før rabatt" value={formatNok(summary.grossOre)} />
          <DetailLine
            label="Rabatter og fritak (effekt)"
            value={`− ${formatNok(summary.discountOre)}`}
          />
          <DetailLine
            label="Elever med klasseplass"
            value={String(summary.studentCount)}
          />
          <DetailLine label="Fritatt" value={`${summary.exemptCount} elever`} />
          {summary.overpaidOre > 0 ? (
            <DetailLine
              label="Betalt utover krav (til kontroll)"
              value={formatNok(summary.overpaidOre)}
            />
          ) : null}
          {summary.unplacedCount > 0 ? (
            <DetailLine
              label="Krav uten klasseplass (ikke med over)"
              value={formatNok(summary.unplacedRemainingOre)}
            />
          ) : null}
        </dl>
      </details>
    </div>
  );
}

function EquationTerm({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-0">
      <dt className="text-xs font-bold text-admin-muted">{label}</dt>
      <dd className={cn("font-heading text-xl font-bold tabular-nums", className)}>
        {value}
      </dd>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-admin-muted">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function YearWorkspace({
  entry,
  basePath,
  familyNames,
  showAllFamilies,
}: {
  entry: YearData;
  basePath: string;
  familyNames: Map<string, string | null>;
  showAllFamilies: boolean;
}) {
  const { year, summary } = entry;
  const groups = groupFamilies(
    entry.rows.filter((row) => row.placed),
    familyNames,
  );
  const unfinished = groups.filter((group) => isUnfinished(group.state));

  return (
    <section
      aria-labelledby={`year-${year.id}`}
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECE8DF] px-4 py-5 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id={`year-${year.id}`}
              className="font-heading text-2xl font-bold tracking-[-0.01em]"
            >
              {year.label}
            </h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                year.is_active
                  ? "bg-[#DCEDDD] text-[#216A2B]"
                  : "bg-[#F0F0ED] text-[#4E5550]",
              )}
            >
              <span className="size-2 rounded-full bg-current" />
              {year.is_active ? "Aktivt skoleår" : "Siste registrerte skoleår"}
            </span>
          </div>
          <p className="mt-1 text-sm text-admin-muted">
            {unfinished.length > 0
              ? `${unfinished.length} av ${groups.length} familier er ikke ferdig betalt.`
              : groups.length > 0
                ? "Alle familier er ferdig betalt eller fritatt."
                : "Ingen elever har klasseplass dette skoleåret."}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto [&_[data-slot=button]]:min-h-11">
          <ReallocateYearButton schoolYearId={year.id} yearLabel={year.label} />
          <BatchSendButton schoolYearId={year.id} yearLabel={year.label} />
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-6">
        <BalanceEquation summary={summary} />

        <section aria-labelledby={`families-${year.id}`} className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3
                id={`families-${year.id}`}
                className="font-heading text-xl font-semibold"
              >
                {showAllFamilies ? "Alle familier" : "Familier som ikke er ferdig"}
              </h3>
              <p className="mt-0.5 text-sm text-admin-muted">
                Åpne en familie for å se barna eller registrere en samlet
                betaling.
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Link
                href={
                  showAllFamilies
                    ? `${basePath}/betaling`
                    : `${basePath}/betaling?familier=alle`
                }
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {showAllFamilies
                  ? `Vis bare ikke ferdige (${unfinished.length})`
                  : `Vis alle familier (${groups.length})`}
              </Link>
              <Link
                href={eleverHref(basePath, "ikke_betalt")}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Se i elevlisten
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
          <FamilyList
            groups={showAllFamilies ? groups : unfinished}
            basePath={basePath}
            schoolYearId={year.id}
            showAll={showAllFamilies}
            allowPayments
          />
        </section>
      </div>
    </section>
  );
}

function FamilyList({
  groups,
  basePath,
  schoolYearId,
  showAll,
  allowPayments,
}: {
  groups: FamilyGroup[];
  basePath: string;
  schoolYearId: string;
  showAll: boolean;
  allowPayments: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl bg-[#F2F7F2] px-4 py-6 text-sm text-[#3E5B3E] ring-1 ring-[#C9DEC9]">
        {showAll
          ? "Ingen elever har klasseplass dette skoleåret."
          : "Alle familier er ferdig betalt eller fritatt. Bra jobbet."}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-xl ring-1 ring-[#E8E3D9]">
      {groups.map((group) => (
        <li key={group.key}>
          <details className="group/family">
            <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block truncate font-bold">{group.name}</span>
                <span className="block truncate text-sm text-admin-muted">
                  {group.children.map(childName).join(", ")}
                </span>
              </span>
              <span className="hidden text-sm tabular-nums sm:block">
                <span className="font-semibold">{formatNok(group.appliedOre)}</span>
                <span className="text-admin-muted"> av {formatNok(group.owedOre)}</span>
              </span>
              <span className="hidden text-sm font-semibold tabular-nums sm:block">
                {group.remainingOre > 0
                  ? `${formatNok(group.remainingOre)} igjen`
                  : "Ingenting igjen"}
              </span>
              <span className="flex items-center gap-2">
                <span className="flex flex-col items-end gap-1">
                  <StateChip state={group.state} />
                  {group.overpaidOre > 0 ? <OverpaidChip /> : null}
                  {group.missingFee ? <MissingFeeChip /> : null}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-admin-muted transition-transform group-open/family:rotate-180"
                />
              </span>
              <span className="col-span-2 text-sm tabular-nums text-admin-muted sm:hidden">
                {formatNok(group.appliedOre)} av {formatNok(group.owedOre)}
                {group.remainingOre > 0
                  ? ` · ${formatNok(group.remainingOre)} igjen`
                  : ""}
              </span>
            </summary>
            <div className="grid gap-3 border-t border-[#ECE8DF] bg-[#FAF9F5] px-4 py-3">
              <ul className="grid gap-1.5">
                {group.children.map((child) => (
                  <li
                    key={child.studentId}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-[#E8E3D9] sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`${basePath}/elever/${child.studentId}`}
                        className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {childName(child)}
                      </Link>
                      <span className="block text-xs text-admin-muted">
                        {child.className ?? "Ikke plassert"}
                      </span>
                    </span>
                    <span className="hidden tabular-nums sm:block">
                      {formatNok(child.appliedOre)}
                      <span className="text-admin-muted"> av {formatNok(child.owedOre)}</span>
                    </span>
                    <span className="hidden font-semibold tabular-nums sm:block">
                      {child.remainingOre > 0
                        ? `${formatNok(child.remainingOre)} igjen`
                        : ""}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {child.missingFee ? (
                        <MissingFeeChip />
                      ) : (
                        <StateChip state={child.state} note={child.feeNote} />
                      )}
                      {child.overpaidOre > 0 ? <OverpaidChip /> : null}
                    </span>
                    <span className="col-span-2 text-xs tabular-nums text-admin-muted sm:hidden">
                      {formatNok(child.appliedOre)} av {formatNok(child.owedOre)}
                      {child.remainingOre > 0
                        ? ` · ${formatNok(child.remainingOre)} igjen`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                {allowPayments ? (
                  <FamilyPaymentDialog
                    familyName={group.name}
                    schoolYearId={schoolYearId}
                    familyChildren={group.children.map((child) => ({
                      id: child.studentId,
                      name: childName(child),
                      remainingOre: child.remainingOre,
                    }))}
                  />
                ) : null}
                {group.familyId ? (
                  <Link
                    href={`${basePath}/familier/${group.familyId}`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Åpne familien
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function StateChip({ state, note }: { state: PayState; note?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        stateClasses[state],
      )}
      title={state === "fritatt" ? (note ?? "Skal ikke betale") : undefined}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {payStateLabels[state]}
    </span>
  );
}

function OverpaidChip() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#FEEDCA] px-2.5 py-1 text-xs font-bold whitespace-nowrap text-[#775108]">
      <AlertTriangle aria-hidden="true" className="size-3" />
      Overbetalt
    </span>
  );
}

function MissingFeeChip() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F9DEDB] px-2.5 py-1 text-xs font-bold whitespace-nowrap text-[#8B2F2B]">
      <AlertTriangle aria-hidden="true" className="size-3" />
      Krav mangler
    </span>
  );
}

function AccountingExport({
  years,
  defaultYearId,
}: {
  years: YearRow[];
  defaultYearId: string;
}) {
  const fieldClass =
    "min-h-11 w-full rounded-xl border border-[#DCD7CC] bg-white px-3 text-base sm:text-sm outline-none focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-ring/30";

  return (
    <section
      aria-labelledby="accounting-export"
      className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5"
    >
      <h2 id="accounting-export" className="font-heading text-xl font-semibold">
        Regnskapsrapport
      </h2>
      <p className="mt-0.5 max-w-2xl text-sm text-admin-muted">
        Alle innbetalinger i perioden med betaler, barn, betalingsmåte, brutto,
        refundert og netto. Åpnes direkte i Excel.
      </p>
      <form
        action="/api/export/payments"
        method="get"
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <label htmlFor="export-from" className="text-sm font-bold">
            Fra dato
          </label>
          <input id="export-from" name="fra" type="date" className={fieldClass} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="export-to" className="text-sm font-bold">
            Til dato
          </label>
          <input id="export-to" name="til" type="date" className={fieldClass} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="export-year" className="text-sm font-bold">
            Skoleår
          </label>
          <SelectField
            id="export-year"
            name="year"
            defaultValue={defaultYearId}
            options={[
              { value: "", label: "Alle skoleår" },
              ...years.map((year) => ({ value: year.id, label: year.label })),
            ]}
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Download aria-hidden="true" className="size-4" />
          Last ned CSV
        </button>
      </form>
    </section>
  );
}

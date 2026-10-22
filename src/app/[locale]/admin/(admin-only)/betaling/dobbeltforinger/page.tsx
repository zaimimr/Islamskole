import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { studentDisplayName } from "@/lib/student-name";
import { adminBasePath } from "@/components/admin/paths";
import { formatNok } from "@/lib/money";
import { formatOsloDate } from "@/lib/dates";
import {
  DuplicateReview,
  type DuplicateCandidate,
} from "@/components/admin/duplicate-review";
import { OverpaymentToGiftButton } from "@/components/admin/sadaqa";

export const metadata: Metadata = { title: "Til kontroll" };

type CandidateRow = {
  payment_id: string | null;
  matched_payment_id: string | null;
  matched_reference: string | null;
  matched_created_at: string | null;
  cited_reference: string | null;
  evidence: string | null;
  amount: number | null;
  description: string | null;
  paid_at: string | null;
  method: string | null;
  student_id: string | null;
  school_year_id: string | null;
};

type OverpaidChild = {
  studentId: string;
  name: string;
  schoolYearId: string | null;
  schoolYear: string | null;
  owed: number;
  paid: number;
};

type ReconciliationIssue = {
  paymentId: string;
  reference: string | null;
  localAmount: number;
  providerAmount: number;
  flaggedAt: string;
};

async function getReconciliationIssues(): Promise<ReconciliationIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_reconciliation_issues")
    .select("payment_id, local_amount, provider_amount, flagged_at, payments(reference)")
    .is("resolved_at", null)
    .order("flagged_at", { ascending: false });
  if (error) {
    console.error("Reconciliation issues unavailable", error);
    return [];
  }
  return (
    (data as
      | {
          payment_id: string;
          local_amount: number;
          provider_amount: number;
          flagged_at: string;
          payments: { reference: string | null } | null;
        }[]
      | null) ?? []
  ).map((row) => ({
    paymentId: row.payment_id,
    reference: row.payments?.reference ?? null,
    localAmount: row.local_amount,
    providerAmount: row.provider_amount,
    flaggedAt: row.flagged_at,
  }));
}

async function getOverpaid(): Promise<OverpaidChild[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("student_balances")
      .select("student_id, school_year_id, owed, paid");
    if (error) return null;
    const rows = (
      (data as
        | {
            student_id: string | null;
            school_year_id: string | null;
            owed: number | null;
            paid: number | null;
          }[]
        | null) ?? []
    ).filter((row) => row.student_id && (row.paid ?? 0) > (row.owed ?? 0));
    if (rows.length === 0) return [];

    const [studentResult, yearResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, child_first_name, child_last_name")
        .in(
          "id",
          rows.map((row) => row.student_id as string),
        ),
      supabase.from("school_years").select("id, label"),
    ]);
    if (studentResult.error || yearResult.error) return null;
    const names = new Map(
      (
        (studentResult.data as
          | {
              id: string;
              child_first_name: string | null;
              child_last_name: string | null;
            }[]
          | null) ?? []
      ).map((student) => [student.id, studentDisplayName(student) || "Ukjent barn"]),
    );
    const years = new Map(
      ((yearResult.data as { id: string; label: string }[] | null) ?? []).map(
        (year) => [year.id, year.label],
      ),
    );
    return rows
      .map((row) => ({
        studentId: row.student_id as string,
        name: names.get(row.student_id as string) ?? "Ukjent barn",
        schoolYearId: row.school_year_id,
        schoolYear: row.school_year_id ? (years.get(row.school_year_id) ?? null) : null,
        owed: row.owed ?? 0,
        paid: row.paid ?? 0,
      }))
      .sort((a, b) => b.paid - b.owed - (a.paid - a.owed));
  } catch {
    return null;
  }
}

async function getCandidates(): Promise<
  { ok: true; candidates: DuplicateCandidate[] } | { ok: false }
> {
  try {
    const supabase = await createClient();
    const candidateResult = await supabase
      .from("duplicate_payment_candidates")
      .select(
        "payment_id, matched_payment_id, matched_reference, matched_created_at, cited_reference, evidence, amount, description, paid_at, method, student_id, school_year_id",
      );

    if (candidateResult.error) return { ok: false };
    const rows = (candidateResult.data as CandidateRow[] | null) ?? [];
    if (rows.length === 0) return { ok: true, candidates: [] };

    const studentIds = [
      ...new Set(rows.map((row) => row.student_id).filter(Boolean)),
    ] as string[];
    const yearIds = [
      ...new Set(rows.map((row) => row.school_year_id).filter(Boolean)),
    ] as string[];
    const [studentResult, yearResult] = await Promise.all([
      studentIds.length > 0
        ? supabase
            .from("students")
            .select("id, child_first_name, child_last_name")
            .in("id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      yearIds.length > 0
        ? supabase.from("school_years").select("id, label").in("id", yearIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (studentResult.error || yearResult.error) return { ok: false };

    const nameById = new Map(
      (
        (studentResult.data as
          | {
              id: string;
              child_first_name: string | null;
              child_last_name: string | null;
            }[]
          | null) ?? []
      ).map((student) => [
        student.id,
        studentDisplayName(student) || "Ukjent barn",
      ]),
    );
    const yearById = new Map(
      ((yearResult.data as { id: string; label: string }[] | null) ?? []).map(
        (year) => [year.id, year.label],
      ),
    );

    return {
      ok: true,
      candidates: rows
        .filter(
          (
            row,
          ): row is CandidateRow & {
            payment_id: string;
            matched_payment_id: string;
            matched_reference: string;
          } =>
            Boolean(
              row.payment_id && row.matched_payment_id && row.matched_reference,
            ),
        )
        .map((row) => ({
          paymentId: row.payment_id,
          matchedPaymentId: row.matched_payment_id,
          childName: row.student_id
            ? (nameById.get(row.student_id) ?? "Ukjent barn")
            : "Ukjent barn",
          schoolYear: row.school_year_id
            ? (yearById.get(row.school_year_id) ?? null)
            : null,
          amount: row.amount ?? 0,
          manualDescription: row.description,
          manualPaidAt: row.paid_at,
          manualMethod: row.method ?? "annet",
          matchedReference: row.matched_reference,
          matchedCreatedAt: row.matched_created_at,
          citedReference: row.cited_reference,
          evidence: row.evidence ?? "unmatched",
        })),
    };
  } catch {
    return { ok: false };
  }
}

export default async function DuplicatePaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const [result, overpaid, issues] = await Promise.all([
    getCandidates(),
    getOverpaid(),
    getReconciliationIssues(),
  ]);

  if (!result.ok || !overpaid) {
    return (
      <section
        aria-labelledby="duplicate-load-error"
        className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1
          id="duplicate-load-error"
          className="mt-4 font-heading text-3xl font-bold tracking-[-0.02em]"
        >
          Kontrollisten kunne ikke lastes
        </h1>
        <p className="mt-2 max-w-prose text-admin-muted">
          Mulige dobbeltføringer er ikke markert som ferdigbehandlet. Prøv igjen
          før du avstemmer betalingene.
        </p>
        <Link
          href={`${basePath}/betaling/dobbeltforinger`}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Prøv igjen
        </Link>
      </section>
    );
  }

  const candidates = result.candidates;
  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.amount,
    0,
  );

  return (
    <div className="grid gap-7 lg:gap-8">
      <header>
        <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Betalinger til kontroll
        </h1>
        <p className="mt-1 max-w-3xl text-admin-muted">
          Mulige dobbeltføringer og barn som har betalt mer enn kravet. Avgjør
          hva som skal telle i saldoen.
        </p>
      </header>

      {candidates.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-2xl bg-[#FFF8E9] p-5 text-[#6B5524] ring-1 ring-[#E8D6AA] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
              <ReceiptText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold text-[#3F3216]">
                {candidates.length} betaling
                {candidates.length === 1 ? "" : "er"} må avgjøres
              </h2>
              <p className="mt-0.5 max-w-2xl text-sm">
                Det gjelder totalt{" "}
                <span className="font-bold tabular-nums">
                  {formatNok(total)}
                </span>
                . Ingen rader endres før du tar en beslutning i hver sak.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {issues.length > 0 ? (
        <section aria-labelledby="reconciliation-title" className="grid gap-3">
          <div>
            <h2
              id="reconciliation-title"
              className="font-heading text-xl font-semibold"
            >
              Avvik mot Vipps ({issues.length})
            </h2>
            <p className="mt-0.5 max-w-3xl text-sm text-admin-muted">
              Her viser oversikten mer refundert enn Vipps har registrert.
              Sjekk betalingen i Vipps-portalen før du gjør noe mer med den.
            </p>
          </div>
          <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            {issues.map((issue) => (
              <li
                key={issue.paymentId}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-bold break-all">
                    {issue.reference ?? "Ukjent referanse"}
                  </p>
                  <p className="mt-0.5 text-sm text-admin-muted tabular-nums">
                    Refundert her {formatNok(issue.localAmount)} · i Vipps{" "}
                    {formatNok(issue.providerAmount)} · oppdaget{" "}
                    {formatOsloDate(issue.flaggedAt)}
                  </p>
                </div>
                {issue.reference ? (
                  <Link
                    href={`${basePath}/betaling/logg?q=${encodeURIComponent(issue.reference)}`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Se betalingen
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overpaid.length > 0 ? (
        <section aria-labelledby="overpaid-title" className="grid gap-3">
          <div>
            <h2 id="overpaid-title" className="font-heading text-xl font-semibold">
              Overbetalt ({overpaid.length})
            </h2>
            <p className="mt-0.5 max-w-3xl text-sm text-admin-muted">
              Innbetalt er høyere enn kravet. Det skyldes oftest en manuell
              registrering av en betaling som også kom via Vipps. Se betalingene
              og annuller kopien, refunder det familien har betalt for mye,
              eller gjør overskuddet til en sadaqa-gave hvis familien ønsker
              det.
            </p>
          </div>
          <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            {overpaid.map((child) => (
              <li
                key={`${child.studentId}-${child.schoolYear ?? ""}`}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${basePath}/elever/${child.studentId}`}
                      className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {child.name}
                    </Link>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEEDCA] px-2.5 py-1 text-xs font-bold text-[#775108]">
                      <AlertTriangle aria-hidden="true" className="size-3" />
                      Overbetalt
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-admin-muted tabular-nums">
                    {child.schoolYear ?? "Ukjent skoleår"} · {formatNok(child.paid)}{" "}
                    innbetalt av {formatNok(child.owed)}
                  </p>
                </div>
                <p className="font-heading text-lg font-bold text-[#775108] tabular-nums">
                  +{formatNok(child.paid - child.owed)}
                </p>
                <Link
                  href={`${basePath}/betaling/logg?q=${encodeURIComponent(child.name)}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Se betalingene
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
                {child.schoolYearId ? (
                  <OverpaymentToGiftButton
                    studentId={child.studentId}
                    schoolYearId={child.schoolYearId}
                    childName={child.name}
                    excessOre={child.paid - child.owed}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Mulige dobbeltføringer" className="grid gap-3">
        {overpaid.length > 0 ? (
          <h2 className="font-heading text-xl font-semibold">
            Mulige dobbeltføringer ({candidates.length})
          </h2>
        ) : null}
        <DuplicateReview candidates={candidates} overpaidCount={overpaid.length} />
      </section>
    </div>
  );
}

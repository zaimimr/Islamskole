import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CopyPlus,
  Settings2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { DeleteButton } from "@/components/admin/delete-button";
import { BatchSendButton } from "@/components/admin/batch-send-button";
import { YearActions } from "@/components/admin/year-actions";
import {
  SchoolYearForm,
  type SchoolYearRecord,
} from "@/components/admin/school-year-form";
import { deleteSchoolYear } from "@/app/[locale]/admin/school-years-actions";
import { formatNok } from "@/lib/money";
import { schoolYearStart } from "@/lib/age";
import { osloToday } from "@/lib/dates";
import { SchoolDays, type SchoolDayRow } from "./school-days";
import { TimeSlots, type TimeSlotRow } from "./time-slots";
import { countCopyableAssignments } from "../copyable-assignments";

export const metadata: Metadata = { title: "Skoleår" };

type EnrollmentRow = {
  student_id: string;
  class_id: string;
  classes: { name_no: string | null; capacity: number | null; sort_order: number | null } | null;
};

type BalanceRow = {
  student_id: string | null;
  owed: number | null;
  paid: number | null;
  remaining: number | null;
};

type ClassSummary = {
  id: string;
  name: string;
  capacity: number | null;
  sortOrder: number;
  count: number;
  unsettled: number;
};

export default async function SkolearDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const basePath = adminBasePath(locale);
  const listHref = `${basePath}/skolear`;
  const supabase = await createClient();

  const [
    { data: yearData },
    { data: enrollmentData },
    { data: activeData },
    { data: balanceData },
    { data: dayData },
    { data: slotData },
    { data: planData },
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, label, starts_on, ends_on, is_active, fee, enrollment_fee, sem1_due_on, sem2_due_on")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("student_id, class_id, classes(name_no, capacity, sort_order)")
      .eq("school_year_id", id)
      .eq("status", "aktiv"),
    supabase
      .from("school_years")
      .select("id, label, starts_on")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("student_balances")
      .select("student_id, owed, paid, remaining")
      .eq("school_year_id", id),
    supabase
      .from("school_days")
      .select("id, date, cancelled, note")
      .eq("school_year_id", id)
      .order("date", { ascending: true }),
    supabase
      .from("school_time_slots")
      .select("label, starts_at, ends_at")
      .eq("school_year_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("class_slot_plans")
      .select("end_position")
      .eq("school_year_id", id)
      .order("end_position", { ascending: false })
      .limit(1),
  ]);
  const year = yearData as SchoolYearRecord | null;
  if (!year) notFound();

  const enrollments = (enrollmentData as EnrollmentRow[] | null) ?? [];
  const activeYear = activeData as {
    id: string;
    label: string;
    starts_on: string | null;
  } | null;
  const activeYearLabel = activeYear?.label ?? null;
  const copyableAssignments = year.is_active
    ? 0
    : await countCopyableAssignments(activeYear?.id);
  const balances = (balanceData as BalanceRow[] | null) ?? [];

  const balanceByStudent = new Map<string, BalanceRow>();
  for (const balance of balances) {
    if (balance.student_id) balanceByStudent.set(balance.student_id, balance);
  }

  const enrolledIds = [
    ...new Set(enrollments.map((enrollment) => enrollment.student_id)),
  ];
  const enrolledSet = new Set(enrolledIds);
  const placedBalances = balances.filter(
    (row) => row.student_id && enrolledSet.has(row.student_id),
  );
  const totalOwed = placedBalances.reduce((sum, row) => sum + (row.owed ?? 0), 0);
  const totalPaid = placedBalances.reduce(
    (sum, row) => sum + Math.max((row.owed ?? 0) - (row.remaining ?? 0), 0),
    0,
  );
  const totalRemaining = placedBalances.reduce(
    (sum, row) => sum + (row.remaining ?? 0),
    0,
  );
  const unsettledCount = placedBalances.filter(
    (row) => (row.remaining ?? 0) > 0,
  ).length;

  const classMap = new Map<string, ClassSummary>();
  for (const enrollment of enrollments) {
    const summary = classMap.get(enrollment.class_id) ?? {
      id: enrollment.class_id,
      name: enrollment.classes?.name_no ?? "Klasse uten navn",
      capacity: enrollment.classes?.capacity ?? null,
      sortOrder: enrollment.classes?.sort_order ?? 0,
      count: 0,
      unsettled: 0,
    };
    summary.count += 1;
    if ((balanceByStudent.get(enrollment.student_id)?.remaining ?? 0) > 0) {
      summary.unsettled += 1;
    }
    classMap.set(enrollment.class_id, summary);
  }
  const classSummaries = [...classMap.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const registerHref = `${basePath}/elever?year=${year.id}`;
  const canRollover = !year.is_active && Boolean(activeYear);
  const yearKey = (row: { label: string | null; starts_on: string | null }) =>
    row.starts_on ?? `${schoolYearStart(row.label) ?? 0}-08-01`;
  const isUpcoming = Boolean(activeYear && yearKey(year) > yearKey(activeYear));
  const rolloverHref = isUpcoming
    ? `${basePath}/skolear/${year.id}/rollover?fra=${activeYear?.id}`
    : `${basePath}/skolear/${activeYear?.id}/rollover?fra=${year.id}`;

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til skoleår
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            {year.label ?? "Skoleår"}
          </h1>
          {year.is_active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCEDDD] px-2.5 py-1 text-xs font-bold text-[#216A2B]">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-[#3C8F44]"
              />
              Aktivt
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Elever, betalinger og videreføring for dette skoleåret.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <dl className="grid divide-y divide-[#ECE8DF] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center gap-3 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#DDEEF9] text-[#245D84]">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <div>
              <dt className="text-sm text-admin-muted">Elever med plass</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {enrolledIds.length}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
              <Wallet aria-hidden="true" className="size-5" />
            </span>
            <div>
              <dt className="text-sm text-admin-muted">Innbetalt</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {formatNok(totalPaid)}
                <span className="block font-sans text-xs font-normal text-admin-muted">
                  av {formatNok(totalOwed)} i krav
                </span>
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
              <CircleAlert aria-hidden="true" className="size-5" />
            </span>
            <div>
              <dt className="text-sm text-admin-muted">
                Gjenstår fra {unsettledCount}{" "}
                {unsettledCount === 1 ? "elev" : "elever"}
              </dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {formatNok(totalRemaining)}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-heading text-xl font-bold">Klasser dette skoleåret</h2>
            <p className="mt-0.5 text-sm text-admin-muted">
              Elever med aktiv plass. Åpne elevregisteret for navn og betaling.
            </p>
          </div>
          <Link
            href={registerHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Åpne elevregisteret
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {classSummaries.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
            <UsersRound aria-hidden="true" className="size-7 text-admin-muted" />
            <p className="mt-3 font-bold">Ingen elever plassert</p>
            <p className="mt-1 max-w-sm text-sm text-admin-muted">
              Elever vises her når de får en klasse i dette skoleåret.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#ECE8DF]">
            {classSummaries.map((summary) => (
              <li key={summary.id}>
                <Link
                  href={`${registerHref}&class=${summary.id}`}
                  className="group grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{summary.name}</span>
                    {summary.unsettled > 0 ? (
                      <span className="block text-xs text-[#775108]">
                        {summary.unsettled} med utestående beløp
                      </span>
                    ) : (
                      <span className="block text-xs text-admin-muted">
                        Ingen utestående
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {summary.count}
                    {summary.capacity != null ? ` / ${summary.capacity}` : ""}
                    <span className="sr-only"> elever</span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-admin-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SchoolDays
        schoolYearId={year.id}
        days={(dayData as SchoolDayRow[] | null) ?? []}
        hasDates={Boolean(year.starts_on && year.ends_on)}
        today={osloToday()}
      />

      <TimeSlots
        key={JSON.stringify(slotData ?? [])}
        schoolYearId={year.id}
        slots={(slotData as TimeSlotRow[] | null) ?? []}
        usedPositions={planData?.[0]?.end_position ?? 0}
      />

      <section className="rounded-2xl bg-[#FFF8E9] p-5 ring-1 ring-[#ECDCB9] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
            <Settings2 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-bold">
              Felles handlinger
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-[#6D5A2D]">
              Bruk disse når en hel elevgruppe skal følges opp. Hver handling
              bekreftes før den gjennomføres.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {canRollover ? (
            <Link
              href={rolloverHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <CopyPlus aria-hidden="true" className="size-4" />
              {isUpcoming
                ? `Hent elever fra ${activeYearLabel}`
                : `Videreføre elever til ${activeYearLabel}`}
            </Link>
          ) : null}
          <BatchSendButton
            schoolYearId={year.id}
            yearLabel={year.label ?? "skoleåret"}
          />
          <YearActions schoolYearId={year.id} />
        </div>
      </section>

      <details className="group overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 font-heading text-lg font-bold outline-none hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          Innstillinger for skoleåret
          <ChevronDown
            aria-hidden="true"
            className="size-5 text-admin-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid gap-5 border-t border-[#ECE8DF] bg-[#FBFAF6] p-4 sm:p-5">
          <SchoolYearForm
            schoolYear={year}
            listHref={listHref}
            copyableAssignments={copyableAssignments}
          />

          <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold">Slett skoleåret</h2>
              <p className="mt-0.5 max-w-2xl text-sm text-admin-muted">
                {year.is_active
                  ? "Det aktive skoleåret kan ikke slettes."
                  : "Går bare når året ikke har plasseringer, betalinger, oppmøte eller ukenotater."}
              </p>
            </div>
            {year.is_active ? null : (
              <DeleteButton
                id={year.id}
                label="skoleår"
                action={deleteSchoolYear}
                redirectTo={listHref}
              />
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

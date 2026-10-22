import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleUserRound,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { guardianName, studentDisplayName } from "@/lib/student-name";
import { formatAge, schoolYearStart } from "@/lib/age";
import { formatNok } from "@/lib/money";
import { adminBasePath } from "@/components/admin/paths";
import { EleverFilters } from "@/components/admin/elever-filters";
import { Pagination } from "@/components/admin/pagination";
import { ExportButton } from "@/components/admin/export-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Elever" };

type StudentRow = {
  id: string;
  child_first_name: string | null;
  child_last_name: string | null;
  mother_first_name: string | null;
  mother_last_name: string | null;
  father_first_name: string | null;
  father_last_name: string | null;
  child_birth_date: string | null;
  enrollments: {
    school_year_id: string;
    status: string;
    school_years: { label: string } | null;
    classes: { id: string; name_no: string | null } | null;
  }[];
  payments: { status: string; amount: number; school_year_id: string | null }[];
};

type BalanceRow = {
  student_id: string | null;
  school_year_id: string | null;
  owed: number | null;
  paid: number | null;
  remaining: number | null;
};

async function getRegister(q: string) {
  const supabase = await createClient();
  const studentQuery = supabase
    .rpc("admin_search_students", { p_query: q })
    .select(
      "id, created_at, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, child_birth_date, enrollments(school_year_id, status, school_years(label), classes(id, name_no)), payments!payments_student_id_fkey(status, amount, school_year_id)",
    )
    .order("created_at", { ascending: false });

  const [students, classes, years, balances] = await Promise.all([
    studentQuery,
    supabase
      .from("classes")
      .select("id, name_no")
      .order("sort_order", { ascending: true }),
    supabase
      .from("school_years")
      .select("id, label, is_active")
      .order("label", { ascending: false }),
    supabase
      .from("student_balances")
      .select("student_id, school_year_id, owed, paid, remaining"),
  ]);

  return {
    ok: !students.error && !classes.error && !years.error && !balances.error,
    students: (students.data as StudentRow[] | null) ?? [],
    classes: (
      (classes.data as { id: string; name_no: string | null }[] | null) ?? []
    ).map((c) => ({ id: c.id, name: c.name_no ?? "(uten navn)" })),
    schoolYears:
      (years.data as { id: string; label: string; is_active: boolean }[] | null) ??
      [],
    balances: (balances.data as BalanceRow[] | null) ?? [],
  };
}

type Ledger = { owed: number; paid: number; remaining: number; hasFee: boolean };

function emptyLedger(): Ledger {
  return { owed: 0, paid: 0, remaining: 0, hasFee: false };
}

function sumLedger(rows: Ledger[]): Ledger {
  return rows.reduce(
    (acc, row) => ({
      owed: acc.owed + row.owed,
      paid: acc.paid + row.paid,
      remaining: acc.remaining + row.remaining,
      hasFee: acc.hasFee || row.hasFee,
    }),
    emptyLedger(),
  );
}

function hasPendingLink(payments: StudentRow["payments"]) {
  return (payments ?? []).some(
    (p) => p.status === "opprettet" || p.status === "autorisert",
  );
}

type PayState =
  | "betalt"
  | "fritatt"
  | "delvis"
  | "venter"
  | "ubetalt"
  | "ingen_krav";

function payState(ledger: Ledger, payments: StudentRow["payments"]): PayState {
  if (ledger.hasFee && ledger.owed === 0) return "fritatt";
  if (ledger.owed > 0 && ledger.remaining <= 0) return "betalt";
  if (ledger.paid > 0) return "delvis";
  if (hasPendingLink(payments)) return "venter";
  if (!ledger.hasFee) return "ingen_krav";
  return "ubetalt";
}

const payStateLabel: Record<PayState, string> = {
  betalt: "Betalt",
  fritatt: "Fritatt",
  delvis: "Delvis betalt",
  venter: "Lenke sendt",
  ubetalt: "Ikke betalt",
  ingen_krav: "Ingen krav",
};

const PAY_FILTERS = new Set([
  "ikke_betalt",
  "betalt",
  "fritatt",
  "delvis",
  "venter",
  "ubetalt",
  "ingen_krav",
]);

function PayBadge({ state, ledger }: { state: PayState; ledger: Ledger }) {
  if (state === "betalt") return <Badge>Betalt</Badge>;
  if (state === "fritatt") return <Badge variant="outline">Fritatt</Badge>;
  if (state === "delvis") {
    return (
      <Badge variant="secondary">
        Delvis · {formatNok(ledger.remaining)} igjen
      </Badge>
    );
  }
  if (state === "venter") return <Badge variant="secondary">Lenke sendt</Badge>;
  if (state === "ingen_krav") {
    return (
      <Badge variant="outline" className="border-[#E7B8B4] text-[#8B2F2B]">
        Ingen krav
      </Badge>
    );
  }
  return <Badge variant="outline">Ikke betalt</Badge>;
}

const PAGE_SIZE = 25;

export default async function RegistrertePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const classFilter = typeof sp.class === "string" ? sp.class : "";
  const rawPay =
    typeof sp.betaling === "string"
      ? sp.betaling
      : typeof sp.pay === "string"
        ? sp.pay
        : "";
  const payFilter = PAY_FILTERS.has(rawPay) ? rawPay : "";
  const yearParam = typeof sp.year === "string" ? sp.year : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const basePath = adminBasePath(locale);

  const data = await getRegister(q);
  const { students: allStudents, classes, schoolYears } = data;

  if (!data.ok) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
        <h1 className="font-heading text-2xl font-bold">
          Elevregisteret kunne ikke lastes
        </h1>
        <p className="mt-2 text-admin-muted">
          Ingen tall er erstattet med null. Last siden på nytt om litt.
        </p>
      </section>
    );
  }

  const balancesByStudent = new Map<string, Map<string, Ledger>>();
  for (const row of data.balances) {
    if (!row.student_id || !row.school_year_id) continue;
    const byYear = balancesByStudent.get(row.student_id) ?? new Map();
    byYear.set(row.school_year_id, {
      owed: row.owed ?? 0,
      paid: row.paid ?? 0,
      remaining: row.remaining ?? 0,
      hasFee: true,
    });
    balancesByStudent.set(row.student_id, byYear);
  }

  const activeYear = schoolYears.find((y) => y.is_active) ?? null;
  const activeYearId = activeYear?.id ?? null;
  const activeYearLabel = activeYear?.label ?? null;
  const yearLabelOrder = new Map(
    schoolYears.map((year, index) => [year.id, index]),
  );

  const yearFilter = yearParam || activeYearId || "alle";
  const realYear =
    yearFilter !== "alle" &&
    yearFilter !== "needs_rollover" &&
    yearFilter !== "avsluttet"
      ? yearFilter
      : null;
  const filterYearLabel = realYear
    ? (schoolYears.find((y) => y.id === realYear)?.label ?? null)
    : null;
  const ageYear =
    schoolYearStart(filterYearLabel ?? activeYearLabel) ??
    new Date().getFullYear();

  const scoped = (payments: StudentRow["payments"]) =>
    realYear ? payments.filter((p) => p.school_year_id === realYear) : payments;

  const ledgerFor = (studentId: string): Ledger => {
    const byYear = balancesByStudent.get(studentId);
    if (!byYear) return emptyLedger();
    if (realYear) return byYear.get(realYear) ?? emptyLedger();
    return sumLedger([...byYear.values()]);
  };

  const scopedEnrollments = (student: StudentRow) =>
    realYear
      ? (student.enrollments ?? []).filter((e) => e.school_year_id === realYear)
      : (student.enrollments ?? []);

  const needsRollover = (student: StudentRow) => {
    if (activeYearId == null) return false;
    const enrollments = student.enrollments ?? [];
    if (
      enrollments.some(
        (e) => e.school_year_id === activeYearId && e.status === "aktiv",
      )
    ) {
      return false;
    }
    if (enrollments.length === 0) return true;
    if ((balancesByStudent.get(student.id)?.get(activeYearId)?.remaining ?? 0) > 0) {
      return true;
    }
    const latest = [...enrollments].sort(
      (left, right) =>
        (yearLabelOrder.get(left.school_year_id) ?? 999) -
        (yearLabelOrder.get(right.school_year_id) ?? 999),
    )[0];
    return latest?.status === "aktiv";
  };

  const hasLeft = (student: StudentRow) => {
    const enrollments = student.enrollments ?? [];
    return (
      enrollments.length > 0 &&
      enrollments.every((e) => e.status === "avsluttet")
    );
  };

  const students = allStudents.filter((student) => {
    if (yearFilter === "needs_rollover") {
      if (!needsRollover(student)) return false;
    } else if (yearFilter === "avsluttet") {
      if (!hasLeft(student)) return false;
    } else if (realYear) {
      if (scopedEnrollments(student).length === 0) return false;
    }
    if (classFilter) {
      const inClass = scopedEnrollments(student).some(
        (e) => e.classes?.id === classFilter,
      );
      if (!inClass) return false;
    }
    if (payFilter) {
      const state = payState(ledgerFor(student.id), scoped(student.payments));
      if (payFilter === "ikke_betalt") {
        if (["betalt", "fritatt"].includes(state)) return false;
      } else if (state !== payFilter) {
        return false;
      }
    }
    return true;
  });

  const ledgerTotals = sumLedger(students.map((st) => ledgerFor(st.id)));

  const total = students.length;
  const from = (page - 1) * PAGE_SIZE;
  const pageStudents = students.slice(from, from + PAGE_SIZE);

  const filtered = Boolean(q || classFilter || payFilter || yearParam);
  const scopeLabel =
    yearFilter === "needs_rollover"
      ? `mangler plass i ${activeYearLabel ?? "aktivt skoleår"}`
      : yearFilter === "avsluttet"
        ? "elever som har sluttet"
        : filterYearLabel
        ? `skoleår ${filterYearLabel}`
        : "alle skoleår";

  const classLabel = (student: StudentRow) => {
    const rows = scopedEnrollments(student);
    if (rows.length === 0) return "Ikke plassert";
    return rows
      .map((e) =>
        e.status === "aktiv"
          ? (e.classes?.name_no ?? "Klasse uten navn")
          : `${e.classes?.name_no ?? "Klasse"} (avsluttet)`,
      )
      .join(", ");
  };

  const yearLabels = (student: StudentRow) =>
    [
      ...new Set(
        (student.enrollments ?? [])
          .map((e) => e.school_years?.label)
          .filter((l): l is string => Boolean(l)),
      ),
    ]
      .sort()
      .reverse();

  return (
    <div className="grid gap-4 sm:gap-6">
      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Elever
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-admin-muted sm:mt-2 sm:text-base">
            Klasseplassering og betaling for hver elev, samlet i ett register.
          </p>
        </div>
        <Link
          href={`${basePath}/elever/ny`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UserRoundPlus aria-hidden="true" className="size-4" />
          Ny elev
        </Link>
      </header>

      <section
        aria-label="Status for elevregisteret"
        className="grid grid-cols-3 divide-x divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
      >
        {[
          {
            value: String(students.length),
            label: "Elever i utvalget",
            icon: Users,
            tone: "bg-[#EFF8FD] text-[#245D7C]",
          },
          {
            value: formatNok(ledgerTotals.paid),
            label: "Innbetalt",
            icon: CircleCheck,
            tone: "bg-[#DCEDDD] text-[#216A2B]",
          },
          {
            value: formatNok(ledgerTotals.remaining),
            label: "Gjenstår",
            icon: CircleDollarSign,
            tone: "bg-[#FEEDCA] text-[#775108]",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-3 px-3 py-3 sm:min-h-24 sm:px-5 sm:py-4"
            >
              <span
                className={`hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex ${stat.tone}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-lg font-bold tabular-nums sm:text-2xl">
                  {stat.value}
                </p>
                <p className="text-xs text-admin-muted sm:text-sm">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl bg-white px-4 py-2 ring-1 ring-[#E3DED3] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <EleverFilters
              classes={classes}
              schoolYears={schoolYears}
              activeYearId={activeYearId}
            />
          </div>
          <div className="hidden sm:block">
            <ExportButton entity="students" />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="student-register-title"
        className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <div>
            <h2
              id="student-register-title"
              className="font-heading text-xl font-bold"
            >
              Elevregister
            </h2>
            <p className="mt-0.5 text-sm text-admin-muted" aria-live="polite">
              {total} {total === 1 ? "elev" : "elever"}, {scopeLabel}
            </p>
          </div>
          <CircleUserRound
            aria-hidden="true"
            className="size-5 text-admin-muted"
          />
        </div>
        {pageStudents.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
              <Users aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-4 font-heading text-xl font-bold">
              {filtered ? "Ingen elever passer filtrene" : "Ingen elever ennå"}
            </p>
            <p className="mt-1 max-w-md text-sm text-admin-muted">
              {filtered
                ? "Juster søket, skoleåret, klassen eller betalingsstatusen."
                : "Registrerte elever vises her med plassering og betaling."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Navn</TableHead>
                    <TableHead>Alder</TableHead>
                    <TableHead>Foresatt</TableHead>
                    <TableHead>Klasse</TableHead>
                    <TableHead>Skoleår</TableHead>
                    <TableHead>Betalt</TableHead>
                    <TableHead>Betaling</TableHead>
                    <TableHead className="w-8">
                      <span className="sr-only">Åpne</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageStudents.map((student) => {
                    const studentPayments = scoped(student.payments);
                    const ledger = ledgerFor(student.id);
                    const state = payState(ledger, studentPayments);
                    const years = yearLabels(student);
                    const left = hasLeft(student);
                    const missingActive =
                      !left &&
                      activeYearLabel != null &&
                      years.length > 0 &&
                      !years.includes(activeYearLabel);
                    return (
                      <TableRow
                        key={student.id}
                        className="relative focus-within:bg-[#FBFAF6] hover:bg-[#FBFAF6]"
                      >
                        <TableCell className="font-medium">
                          <Link
                            href={`${basePath}/elever/${student.id}`}
                            className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {studentDisplayName(student) || "Navn mangler"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {formatAge(student.child_birth_date, ageYear)}
                        </TableCell>
                        <TableCell>{guardianName(student) ?? "-"}</TableCell>
                        <TableCell>{classLabel(student)}</TableCell>
                        <TableCell>
                          {years.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {years.map((y) => (
                                <Badge key={y} variant="outline">
                                  {y}
                                </Badge>
                              ))}
                              {left ? (
                                <Badge variant="outline">Har sluttet</Badge>
                              ) : null}
                              {missingActive ? (
                                <Badge variant="secondary">
                                  Ikke plassert i {activeYearLabel}
                                </Badge>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatNok(ledger.paid)}
                          {ledger.owed > 0 ? (
                            <span className="text-muted-foreground">
                              {" "}
                              av {formatNok(ledger.owed)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <PayBadge state={state} ledger={ledger} />
                            {state === "delvis" &&
                            hasPendingLink(studentPayments) ? (
                              <Badge variant="outline">Lenke ute</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-admin-muted">
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-[#ECE8DF] lg:hidden">
              {pageStudents.map((student) => {
                const studentPayments = scoped(student.payments);
                const ledger = ledgerFor(student.id);
                const state = payState(ledger, studentPayments);
                return (
                  <li key={student.id}>
                    <Link
                      href={`${basePath}/elever/${student.id}`}
                      className="group flex items-center justify-between gap-3 px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-heading text-lg font-bold">
                          {studentDisplayName(student) || "Navn mangler"}
                        </span>
                        <span className="block truncate text-sm text-admin-muted">
                          {formatAge(student.child_birth_date, ageYear)} år ·{" "}
                          {classLabel(student)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-right text-xs font-bold">
                          {state === "delvis"
                            ? `${formatNok(ledger.remaining)} igjen`
                            : payStateLabel[state]}
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-5 text-admin-muted transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {total > PAGE_SIZE ? (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath={`${basePath}/elever`}
            searchParams={sp}
          />
        ) : null}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  CalendarX2,
  ClipboardCheck,
  Copy,
  GraduationCap,
  Inbox,
  ReceiptText,
  RotateCcw,
  UserCheck,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { studentDisplayName } from "@/lib/student-name";
import { cn } from "@/lib/utils";
import { formatNok } from "@/lib/money";
import { formatOsloDate, osloToday } from "@/lib/dates";
import { getActiveYearBalanceSummary } from "@/lib/balances";
import { getAdminFamilies } from "@/lib/families/service";
import { needsSubstitute } from "@/lib/lessons";
import {
  findDuplicateFamilies,
  findDuplicateStudents,
} from "@/app/[locale]/admin/(admin-only)/familier/duplicates";

export const metadata: Metadata = { title: "Oversikt" };

type SignupRow = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  createdAt: string;
  studentId: string | null;
};

type MissingSubstitutes = { count: number; firstDayId: string | null; firstDate: string | null };

type DashboardData = {
  activeYearLabel: string | null;
  missingSubstitutes: MissingSubstitutes;
  newApplications: number;
  acceptedNotRegistered: number;
  newTeachers: number;
  duplicatePayments: number;
  duplicateFamilies: number;
  duplicateStudents: number;
  openFamilyReviews: number;
  missingPlacement: number;
  missingFee: number;
  unplacedWithCharge: number;
  unplacedRemaining: number;
  enrolledStudents: number;
  outstandingAmount: number;
  overdueInstallments: number;
  overdueInstallmentAmount: number;
  sadaqaUsedThisYear: number;
  recentApplications: SignupRow[];
};

type DashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false };

type EnrollmentRow = {
  student_id: string;
  school_year_id: string;
  status: string;
  school_years: { label: string } | null;
};

async function getMissingSubstitutes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolYearId: string | null,
): Promise<MissingSubstitutes> {
  const none = { count: 0, firstDayId: null, firstDate: null };
  if (!schoolYearId) return none;
  const { data: absences, error } = await supabase
    .from("teacher_absences")
    .select("guardian_id, school_day:school_days!inner(id, date, cancelled, school_year_id)")
    .eq("school_day.school_year_id", schoolYearId)
    .eq("school_day.cancelled", false)
    .gte("school_day.date", osloToday());
  if (error) throw error;
  if (!absences?.length) return none;

  const absentByDay = new Map<string, Set<string>>();
  const dateByDay = new Map<string, string>();
  for (const row of absences) {
    const day = row.school_day as { id: string; date: string };
    absentByDay.set(day.id, (absentByDay.get(day.id) ?? new Set()).add(row.guardian_id));
    dateByDay.set(day.id, day.date);
  }
  const [{ data: lessons, error: lessonError }, { data: classTeachers, error: teacherError }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, class_id, school_day_id, teacher_guardian_id, co_teacher_guardian_id, cancelled")
      .in("school_day_id", [...absentByDay.keys()]),
    supabase.from("class_teachers").select("class_id, guardian_id").eq("school_year_id", schoolYearId),
  ]);
  if (lessonError) throw lessonError;
  if (teacherError) throw teacherError;

  const teachersByClass = new Map<string, string[]>();
  for (const row of classTeachers ?? []) {
    teachersByClass.set(row.class_id, [...(teachersByClass.get(row.class_id) ?? []), row.guardian_id]);
  }
  const uncovered = (lessons ?? []).filter((lesson) =>
    needsSubstitute(lesson, absentByDay.get(lesson.school_day_id) ?? new Set(), teachersByClass.get(lesson.class_id)),
  );
  const first = uncovered
    .map((lesson) => ({ id: lesson.school_day_id, date: dateByDay.get(lesson.school_day_id) ?? "" }))
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  return { count: uncovered.length, firstDayId: first?.id ?? null, firstDate: first?.date ?? null };
}

async function getDashboard(): Promise<DashboardResult> {
  try {
    const supabase = await createClient();
    const [
      activeYear,
      newApplications,
      acceptedApplications,
      newTeachers,
      duplicatePayments,
      students,
      enrollments,
      recentApplications,
      overdueInstallments,
      sadaqaPayments,
      familyReviews,
      balanceSummary,
      families,
    ] = await Promise.all([
      supabase
        .from("school_years")
        .select("id, label")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("student_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny"),
      supabase
        .from("student_applications")
        .select("id")
        .eq("status", "akseptert"),
      supabase
        .from("teacher_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny"),
      supabase
        .from("duplicate_payment_candidates")
        .select("payment_id", { count: "exact", head: true }),
      supabase.from("students").select("id, application_id"),
      supabase
        .from("enrollments")
        .select("student_id, school_year_id, status, school_years(label)"),
      supabase
        .from("student_applications")
        .select(
          "id, child_first_name, child_last_name, child_email, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("installments")
        .select("id, amount, payment_plans!inner(status, paused_at)")
        .in("status", ["planlagt", "sendt"])
        .eq("payment_plans.status", "aktiv")
        .lt("due_date", osloToday()),
      supabase
        .from("payments")
        .select("id, school_year_id, net_paid_amount")
        .eq("method", "sadaqa")
        .eq("status", "fanget")
        .is("voided_at", null),
      supabase
        .from("family_data_reviews")
        .select("family_id")
        .eq("status", "open"),
      getActiveYearBalanceSummary(supabase),
      getAdminFamilies(),
    ]);

    const results = [
      activeYear,
      newApplications,
      acceptedApplications,
      newTeachers,
      duplicatePayments,
      students,
      enrollments,
      recentApplications,
      overdueInstallments,
      sadaqaPayments,
      familyReviews,
    ];

    if (results.some((result) => result.error)) {
      return { ok: false };
    }

    const activeYearRow = activeYear.data as {
      id: string;
      label: string;
    } | null;
    const enrollmentRows = (enrollments.data as EnrollmentRow[] | null) ?? [];
    const studentRows =
      (students.data as { id: string; application_id: string | null }[] | null) ??
      [];
    const studentByApplication = new Map(
      studentRows
        .filter((row) => row.application_id)
        .map((row) => [row.application_id as string, row.id]),
    );

    const enrollmentsByStudent = new Map<string, EnrollmentRow[]>();
    for (const row of enrollmentRows) {
      const list = enrollmentsByStudent.get(row.student_id) ?? [];
      list.push(row);
      enrollmentsByStudent.set(row.student_id, list);
    }
    const activeEnrollmentIds = new Set(
      activeYearRow
        ? enrollmentRows
            .filter(
              (row) =>
                row.school_year_id === activeYearRow.id &&
                row.status === "aktiv",
            )
            .map((row) => row.student_id)
        : [],
    );
    const missingPlacement = activeYearRow
      ? studentRows.filter((student) => {
          if (activeEnrollmentIds.has(student.id)) return false;
          const rows = enrollmentsByStudent.get(student.id) ?? [];
          if (rows.length === 0) return true;
          const latest = [...rows].sort((left, right) =>
            (right.school_years?.label ?? "").localeCompare(
              left.school_years?.label ?? "",
            ),
          )[0];
          return latest.status === "aktiv";
        }).length
      : 0;

    const acceptedNotRegistered = (
      (acceptedApplications.data as { id: string }[] | null) ?? []
    ).filter((row) => !studentByApplication.has(row.id)).length;

    const missingSubstitutes = await getMissingSubstitutes(supabase, activeYearRow?.id ?? null);

    const overdueRows =
      (overdueInstallments.data as { id: string; amount: number }[] | null) ??
      [];

    return {
      ok: true,
      data: {
        activeYearLabel: activeYearRow?.label ?? null,
        missingSubstitutes,
        newApplications: newApplications.count ?? 0,
        acceptedNotRegistered,
        newTeachers: newTeachers.count ?? 0,
        duplicatePayments: duplicatePayments.count ?? 0,
        duplicateFamilies: findDuplicateFamilies(families).size,
        duplicateStudents: findDuplicateStudents(families).length,
        openFamilyReviews: new Set(
          ((familyReviews.data as { family_id: string }[] | null) ?? []).map(
            (row) => row.family_id,
          ),
        ).size,
        missingPlacement,
        missingFee: balanceSummary.missingFeeCount,
        unplacedWithCharge: balanceSummary.unplacedCount,
        unplacedRemaining: balanceSummary.unplacedRemainingOre,
        enrolledStudents: activeEnrollmentIds.size,
        outstandingAmount: balanceSummary.remainingOre,
        overdueInstallments: overdueRows.length,
        overdueInstallmentAmount: overdueRows.reduce(
          (sum, row) => sum + (row.amount ?? 0),
          0,
        ),
        sadaqaUsedThisYear: (
          (sadaqaPayments.data as
            | {
                id: string;
                school_year_id: string | null;
                net_paid_amount: number;
              }[]
            | null) ?? []
        )
          .filter(
            (row) => activeYearRow != null && row.school_year_id === activeYearRow.id,
          )
          .reduce((sum, row) => sum + (row.net_paid_amount ?? 0), 0),
        recentApplications: (
          (recentApplications.data as
            | {
                id: string;
                child_first_name: string | null;
                child_last_name: string | null;
                child_email: string | null;
                status: string;
                created_at: string;
              }[]
            | null) ?? []
        ).map((row) => ({
          id: row.id,
          name: studentDisplayName(row) || "Navn mangler",
          email: row.child_email,
          status: row.status,
          createdAt: row.created_at,
          studentId: studentByApplication.get(row.id) ?? null,
        })),
      },
    };
  } catch {
    return { ok: false };
  }
}

function formatDate(value: string) {
  return formatOsloDate(value) || "Dato mangler";
}

function applicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ny: "Ny",
    kontaktet: "Kontaktet",
    akseptert: "Tatt opp",
    avslatt: "Avslått",
    arkivert: "Arkivert",
  };
  return labels[status] ?? status;
}

type AttentionItem = {
  title: string;
  description: string;
  count?: number;
  href: string;
  action: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "yellow" | "red" | "blue";
};

const toneRank: Record<AttentionItem["tone"], number> = {
  red: 0,
  yellow: 1,
  blue: 2,
};

const toneLabel: Record<AttentionItem["tone"], string> = {
  red: "Stopper arbeid",
  yellow: "Trenger beslutning",
  blue: "Til orientering",
};

const attentionTone = {
  yellow: "bg-[#FEEDCA] text-[#775108]",
  red: "bg-[#F9DEDB] text-[#8B2F2B]",
  blue: "bg-[#DDEEF9] text-[#245D84]",
};

function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
          <CheckCircle2 aria-hidden="true" className="size-6" />
        </span>
        <h3 className="font-heading text-xl font-semibold">
          Ingen åpne oppgaver
        </h3>
        <p className="mt-1 max-w-sm text-sm text-admin-muted">
          Nye saker og avvik vil vises her når de trenger behandling.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#ECE8DF]">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.title}>
            <Link
              href={item.href}
              className="group grid min-h-[5.25rem] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:gap-4 sm:px-5"
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  attentionTone[item.tone],
                )}
              >
                <Icon aria-hidden={true} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-foreground">{item.title}</span>
                  <span className="sr-only">, {toneLabel[item.tone]}</span>
                  {item.count != null ? (
                    <span className="font-heading text-lg font-bold text-foreground">
                      {item.count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-admin-muted">
                  {item.description}
                </span>
              </span>
              <span className="hidden items-center gap-1 text-sm font-bold text-[#277A31] sm:flex">
                {item.action}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-5 text-admin-muted sm:hidden"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AdminDashboardPage({
  params,
}: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const result = await getDashboard();

  if (!result.ok) {
    return (
      <section
        aria-labelledby="dashboard-error-title"
        className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]"
      >
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
        <h1
          id="dashboard-error-title"
          className="font-heading text-2xl font-bold"
        >
          Arbeidsflaten kunne ikke lastes
        </h1>
        <p className="mt-2 max-w-prose text-admin-muted">
          Ingen tall er skjult eller erstattet med null. Prøv å laste siden på
          nytt, eller gå videre til området du skal arbeide i.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={basePath}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Prøv igjen
          </Link>
          <Link
            href={`${basePath}/register`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#DCD7CC] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Gå til opptak
          </Link>
        </div>
      </section>
    );
  }

  const data = result.data;
  const yearLabel = data.activeYearLabel ?? "aktivt skoleår";
  const candidates: (AttentionItem | false)[] = [
    !data.activeYearLabel && {
      title: "Aktivt skoleår mangler",
      description: "Velg skoleår før plassering og innkreving fortsetter.",
      href: `${basePath}/skolear`,
      action: "Velg skoleår",
      icon: CalendarRange,
      tone: "red",
    },
    data.missingSubstitutes.count > 0 && {
      title: "Mangler vikar",
      description: `Lærer borte. Neste: ${formatOsloDate(data.missingSubstitutes.firstDate ?? "", { weekday: "long", day: "numeric", month: "long" })}.`,
      count: data.missingSubstitutes.count,
      href: `${basePath}/dagsplan?dag=${data.missingSubstitutes.firstDayId}`,
      action: "Finn vikar",
      icon: CalendarX2,
      tone: "red",
    },
    data.duplicatePayments > 0 && {
      title: "Betalinger til kontroll",
      description: "Mulige dobbeltføringer må avstemmes.",
      count: data.duplicatePayments,
      href: `${basePath}/betaling/dobbeltforinger`,
      action: "Kontroller",
      icon: ReceiptText,
      tone: "red",
    },
    data.overdueInstallments > 0 && {
      title: "Forfalte avdrag",
      description: `${formatNok(data.overdueInstallmentAmount)} er over frist uten registrert betaling.`,
      count: data.overdueInstallments,
      href: `${basePath}/betaling/avdrag`,
      action: "Følg opp",
      icon: CalendarClock,
      tone: "red",
    },
    data.missingFee > 0 && {
      title: "Plassert uten krav",
      description: `Har plass i ${yearLabel}, men ingen skolepenger er beregnet.`,
      count: data.missingFee,
      href: `${basePath}/elever?betaling=ingen_krav`,
      action: "Se elevene",
      icon: Wallet,
      tone: "red",
    },
    data.unplacedWithCharge > 0 && {
      title: "Krav uten plass",
      description: `${formatNok(data.unplacedRemaining)} står ubetalt på barn uten klasse i ${yearLabel}.`,
      count: data.unplacedWithCharge,
      href: `${basePath}/elever?year=needs_rollover`,
      action: "Avklar",
      icon: UserRoundX,
      tone: "red",
    },
    data.duplicateFamilies + data.duplicateStudents > 0 && {
      title: "Mulige duplikater",
      description:
        "Familier eller barn som ser ut til å være registrert flere ganger.",
      count: data.duplicateFamilies + data.duplicateStudents,
      href: `${basePath}/familier?vis=gjennomga`,
      action: "Sammenlign",
      icon: Copy,
      tone: "red",
    },
    data.acceptedNotRegistered > 0 && {
      title: "Tatt opp, ikke registrert",
      description: "Merket som tatt opp, men barnet er ikke registrert som elev.",
      count: data.acceptedNotRegistered,
      href: `${basePath}/register?status=akseptert`,
      action: "Fullfør opptak",
      icon: UserCheck,
      tone: "yellow",
    },
    data.newApplications > 0 && {
      title: "Nye innmeldinger",
      description: "Venter på gjennomgang og opptak.",
      count: data.newApplications,
      href: `${basePath}/register?status=ny`,
      action: "Gå gjennom",
      icon: ClipboardCheck,
      tone: "yellow",
    },
    data.missingPlacement > 0 && {
      title: "Mangler plass",
      description: `Registrerte elever uten klasse i ${yearLabel}.`,
      count: data.missingPlacement,
      href: `${basePath}/elever?year=needs_rollover`,
      action: "Plasser elever",
      icon: RotateCcw,
      tone: "yellow",
    },
    data.openFamilyReviews > 0 && {
      title: "Familier må gjennomgås",
      description: "Motstridende opplysninger fra tidligere registreringer.",
      count: data.openFamilyReviews,
      href: `${basePath}/familier?vis=gjennomga`,
      action: "Gjennomgå",
      icon: Users,
      tone: "yellow",
    },
    data.outstandingAmount > 0 && {
      title: "Utestående",
      description: `${formatNok(data.outstandingAmount)} gjenstår i ${yearLabel}.`,
      href: `${basePath}/elever?betaling=ikke_betalt`,
      action: "Se hvem",
      icon: Wallet,
      tone: "blue",
    },
  ];
  const attentionItems = candidates
    .filter((item): item is AttentionItem => Boolean(item))
    .sort((left, right) => toneRank[left.tone] - toneRank[right.tone]);

  return (
    <div className="grid gap-7 lg:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Arbeidsflate
          </h1>
          <p className="mt-1 max-w-2xl text-admin-muted">
            Start med sakene som trenger en beslutning eller oppfølging.
          </p>
        </div>
        <Link
          href={`${basePath}/register`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-4 text-sm font-bold outline-none transition-colors hover:border-[#BFD9C2] hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Inbox aria-hidden="true" className="size-4 text-[#3C8F44]" />
          Åpne opptak
        </Link>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,0.78fr)]">
        <section
          aria-labelledby="attention-title"
          className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
            <div>
              <h2 id="attention-title" className="font-heading text-xl font-bold">
                Krever oppmerksomhet
              </h2>
              <p className="mt-0.5 text-sm text-admin-muted">
                Prioritert etter hva som stopper neste steg.
              </p>
            </div>
            {attentionItems.length > 0 ? (
              <span className="flex size-8 items-center justify-center rounded-full bg-[#FEEDCA] font-heading text-sm font-bold text-[#775108]">
                {attentionItems.length}
                <span className="sr-only"> oppgavegrupper</span>
              </span>
            ) : null}
          </div>
          <AttentionList items={attentionItems} />
        </section>

        <aside className="grid gap-5">
          <section
            aria-labelledby="school-year-title"
            className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="school-year-title"
                  className="font-heading text-xl font-bold"
                >
                  Skoleåret
                </h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Aktiv driftskontekst
                </p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
                <GraduationCap aria-hidden="true" className="size-5" />
              </span>
            </div>
            <p className="mt-6 font-heading text-3xl font-bold tabular-nums">
              {data.activeYearLabel ?? "Ikke valgt"}
            </p>
            <dl className="mt-5 grid gap-3 border-t border-[#ECE8DF] pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-admin-muted">Elever med plass</dt>
                <dd className="font-bold tabular-nums">
                  {data.enrolledStudents}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-admin-muted">
                  <Link
                    href={`${basePath}/betaling/sadaqa`}
                    className="rounded outline-none underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Sadaqa-støtte i år
                  </Link>
                </dt>
                <dd className="font-bold tabular-nums">
                  {formatNok(data.sadaqaUsedThisYear)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-admin-muted">Gjenstår</dt>
                <dd className="font-bold tabular-nums">
                  {formatNok(data.outstandingAmount)}
                </dd>
              </div>
            </dl>
            <Link
              href={`${basePath}/skolear`}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Åpne skoleår
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </section>

          <section
            aria-labelledby="other-work-title"
            className="rounded-2xl bg-[#FFF8E9] p-5 ring-1 ring-[#ECDCB9]"
          >
            <h2 id="other-work-title" className="font-heading text-lg font-bold">
              Andre innbokser
            </h2>
            <Link
              href={`${basePath}/laerere?status=ny`}
              className="group mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-white/75 px-3 outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
                <UserCheck aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold">
                Nye lærersøknader
              </span>
              <span className="font-heading text-lg font-bold tabular-nums">
                {data.newTeachers}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-admin-muted transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </section>
        </aside>
      </div>

      <section
        aria-labelledby="recent-title"
        className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <div>
            <h2 id="recent-title" className="font-heading text-xl font-bold">
              Siste innmeldinger
            </h2>
            <p className="mt-0.5 text-sm text-admin-muted">
              Nyeste innmeldinger, uavhengig av status.
            </p>
          </div>
          <Link
            href={`${basePath}/register`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold whitespace-nowrap text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Se alle
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {data.recentApplications.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users
              aria-hidden="true"
              className="mx-auto size-7 text-admin-muted"
            />
            <p className="mt-3 font-bold">Ingen innmeldinger ennå</p>
            <p className="mt-1 text-sm text-admin-muted">
              Nye innmeldinger vises her når de kommer inn.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#ECE8DF]">
            {data.recentApplications.map((application) => (
              <li key={application.id}>
                <Link
                  href={
                    application.studentId
                      ? `${basePath}/elever/${application.studentId}`
                      : `${basePath}/register?status=alle&q=${encodeURIComponent(application.name)}`
                  }
                  className="group grid min-h-[4.75rem] gap-2 px-4 py-3 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">
                      {application.name}
                    </span>
                    <span className="block truncate text-sm text-admin-muted">
                      {application.email ?? "E-post mangler"}
                    </span>
                  </span>
                  <span className="w-fit rounded-full bg-[#F2F1EB] px-2.5 py-1 text-xs font-bold text-admin-muted">
                    {applicationStatusLabel(application.status)}
                  </span>
                  <span className="flex items-center justify-between gap-3 text-xs text-admin-muted sm:min-w-28 sm:justify-end">
                    {formatDate(application.createdAt)}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

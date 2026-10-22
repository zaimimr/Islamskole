import { ClassActivities } from "@/components/school-activities/class-activities";
import { LessonMaterials } from "@/components/portal/lesson-materials";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Mail, Phone, UsersRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath, localePrefix } from "@/components/admin/paths";
import { buttonVariants } from "@/components/ui/button";
import { ClassForm, type ClassRecord } from "@/components/admin/class-form";
import { SectionNavigation } from "@/components/admin/section-navigation";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { formatNok } from "@/lib/money";
import { osloToday } from "@/lib/dates";
import { studentDisplayName } from "@/lib/student-name";
import { cn } from "@/lib/utils";
import { RosterTools, type RosterCsvRow } from "./roster-tools";
import { ClassTeachers, type ClassTeacher } from "./class-teachers";
import { ClassDayOverview, type DayOverview } from "./day-overview";
import { SlotPlanEditor } from "./slot-plan-editor";
import { WeekPlanSection } from "@/components/semester-plan/week-plan-section";
import { collapseDayStatus, lessonTitle, type DayStatus, type SlotPlan, type TimeSlot } from "@/lib/lessons";

export const metadata: Metadata = { title: "Klasse" };

type EnrollmentRow = {
  student_id: string;
  students: {
    id: string;
    family_id: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
    child_birth_date: string | null;
    mother_first_name: string | null;
    mother_last_name: string | null;
    mother_phone: string | null;
    mother_email: string | null;
    father_first_name: string | null;
    father_last_name: string | null;
    father_phone: string | null;
    father_email: string | null;
  } | null;
};

type GuardianRow = {
  family_id: string;
  is_primary_contact: boolean;
  sort_order: number;
  guardian: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

type BalanceRow = {
  student_id: string | null;
  owed: number | null;
  paid: number | null;
  remaining: number | null;
};

type TeacherRow = {
  guardian: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    teacher: { suspended_at: string | null }[];
  } | null;
};

type CandidateRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type SchoolDayRow = { id: string; date: string };

type AttendanceRow = {
  student_id: string;
  school_day_id: string;
  status: string;
  marked_by: string | null;
};

type NoteRow = {
  school_day_id: string;
  homework: string | null;
  summary: string | null;
  author_guardian_id: string | null;
  lessons: { start_position: number; end_position: number; subject: string | null } | null;
};

type AbsenceRow = { student_id: string; school_day_id: string; reason: string | null; source: string };

type PayChip = { label: string; tone: "ok" | "warn" | "danger" | "neutral" };

const chipClasses: Record<PayChip["tone"], string> = {
  ok: "bg-[#DCEDDD] text-[#216A2B]",
  warn: "bg-[#FEEDCA] text-[#775108]",
  danger: "bg-[#F9DEDB] text-[#8B2F2B]",
  neutral: "bg-[#F0F0ED] text-[#4D554F]",
};

function payChip(balance: BalanceRow | undefined): PayChip {
  if (!balance) return { label: "Ingen krav", tone: "danger" };
  const owed = balance.owed ?? 0;
  const remaining = balance.remaining ?? 0;
  if (owed === 0) return { label: "Fritatt", tone: "neutral" };
  if (remaining <= 0) return { label: "Betalt", tone: "ok" };
  if ((balance.paid ?? 0) > 0) {
    return { label: `${formatNok(remaining)} igjen`, tone: "warn" };
  }
  return { label: "Ikke betalt", tone: "danger" };
}

function statusPerDay(rows: AttendanceRow[]) {
  const byDay = new Map<string, DayStatus[]>();
  for (const row of rows) {
    byDay.set(row.school_day_id, [...(byDay.get(row.school_day_id) ?? []), row.status as DayStatus]);
  }
  return new Map([...byDay].map(([day, statuses]) => [day, collapseDayStatus(statuses)]));
}

function attendanceSummary(rows: AttendanceRow[], heldDays: number) {
  if (heldDays === 0) return null;
  if (rows.length === 0) return "Ikke ført";
  const days = [...statusPerDay(rows).values()];
  const absent = days.filter(
    (status) => status === "fravaer" || status === "meldt_fravaer",
  ).length;
  const late = days.filter((status) => status === "sent").length;
  const unreported = days.filter((status) => status === "fravaer").length;
  const parts = [absent ? `${absent} fravær` : "Ingen fravær"];
  if (unreported) parts.push(`${unreported} ugyldig`);
  if (late) parts.push(`${late} forsinket`);
  return parts.join(", ");
}

function joinName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ");
}

const ATTENDANCE_PAGE_SIZE = 1000;

async function fetchAttendance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentIds: string[],
  yearId: string,
) {
  const rows: AttendanceRow[] = [];
  for (let from = 0; ; from += ATTENDANCE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, school_day_id, status, marked_by, school_days!inner(school_year_id)")
      .eq("school_days.school_year_id", yearId)
      .in("student_id", studentIds)
      .order("id", { ascending: true })
      .range(from, from + ATTENDANCE_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as AttendanceRow[]));
    if (!data || data.length < ATTENDANCE_PAGE_SIZE) return { data: rows, error: null };
  }
}

async function getClassPage(id: string) {
  const supabase = await createClient();
  const [classResult, yearResult] = await Promise.all([
    supabase.from("classes").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("school_years")
      .select("id, label")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const classRecord = (classResult.data as ClassRecord | null) ?? null;
  const activeYear = yearResult.data as { id: string; label: string } | null;
  if (!classRecord || !activeYear) {
    return {
      classRecord,
      activeYear,
      enrollments: [] as EnrollmentRow[],
      guardians: [] as GuardianRow[],
      balances: [] as BalanceRow[],
      teachers: [] as TeacherRow[],
      candidates: [] as CandidateRow[],
      inactivePlanTeachers: [] as CandidateRow[],
      schoolDays: [] as SchoolDayRow[],
      attendance: [] as AttendanceRow[],
      notes: [] as NoteRow[],
      absences: [] as AbsenceRow[],
      slots: [] as TimeSlot[],
      plans: [] as SlotPlan[],
      error: Boolean(classResult.error || yearResult.error),
    };
  }

  const enrollmentResult = await supabase
    .from("enrollments")
    .select(
      "student_id, students(id, family_id, child_first_name, child_last_name, child_birth_date, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email)",
    )
    .eq("class_id", id)
    .eq("school_year_id", activeYear.id)
    .eq("status", "aktiv");
  const enrollments = (enrollmentResult.data as EnrollmentRow[] | null) ?? [];
  const studentIds = enrollments.map((row) => row.student_id);
  const familyIds = [
    ...new Set(
      enrollments
        .map((row) => row.students?.family_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [
    guardianResult,
    balanceResult,
    teacherResult,
    candidateResult,
    dayResult,
    attendanceResult,
    noteResult,
    absenceResult,
    slotResult,
    planResult,
  ] = await Promise.all([
    familyIds.length
      ? supabase
          .from("family_guardians")
          .select(
            "family_id, is_primary_contact, sort_order, guardian:guardians(first_name, last_name, phone, email)",
          )
          .in("family_id", familyIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase
          .from("student_balances")
          .select("student_id, owed, paid, remaining")
          .eq("school_year_id", activeYear.id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("class_teachers")
      .select("guardian:guardians!inner(id, first_name, last_name, phone, email, teacher:person_roles!inner(suspended_at))")
      .eq("class_id", id)
      .eq("school_year_id", activeYear.id)
      .eq("guardian.teacher.role_key", "teacher"),
    supabase
      .from("guardians")
      .select("id, first_name, last_name, person_roles!inner(role_key)")
      .eq("person_roles.role_key", "teacher")
      .is("person_roles.suspended_at", null)
      .order("first_name", { ascending: true }),
    supabase
      .from("school_days")
      .select("id, date")
      .eq("school_year_id", activeYear.id)
      .eq("cancelled", false)
      .lte("date", osloToday())
      .order("date", { ascending: false }),
    studentIds.length
      ? fetchAttendance(supabase, studentIds, activeYear.id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("class_notes")
      .select("school_day_id, homework, summary, author_guardian_id, lessons(start_position, end_position, subject), school_days!inner(school_year_id)")
      .eq("class_id", id)
      .eq("school_days.school_year_id", activeYear.id),
    studentIds.length
      ? supabase
          .from("absence_reports")
          .select("student_id, school_day_id, reason, source")
          .in("student_id", studentIds)
          .is("withdrawn_at", null)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("school_time_slots")
      .select("position, label, starts_at, ends_at")
      .eq("school_year_id", activeYear.id)
      .order("position", { ascending: true }),
    supabase
      .from("class_slot_plans")
      .select("start_position, end_position, subject, teacher_guardian_id, co_teacher_guardian_id")
      .eq("class_id", id)
      .eq("school_year_id", activeYear.id)
      .order("start_position", { ascending: true }),
  ]);

  const candidates = (candidateResult.data as CandidateRow[] | null) ?? [];
  const plans = (planResult.data as SlotPlan[] | null) ?? [];
  const candidateIds = new Set(candidates.map((row) => row.id));
  const inactivePlanTeacherIds = [
    ...new Set(
      plans
        .flatMap((plan) => [plan.teacher_guardian_id, plan.co_teacher_guardian_id])
        .filter((value): value is string => Boolean(value) && !candidateIds.has(value as string)),
    ),
  ];
  const inactiveResult = inactivePlanTeacherIds.length
    ? await supabase.from("guardians").select("id, first_name, last_name").in("id", inactivePlanTeacherIds)
    : { data: [], error: null };

  return {
    classRecord,
    activeYear,
    enrollments,
    guardians: (guardianResult.data as GuardianRow[] | null) ?? [],
    balances: (balanceResult.data as BalanceRow[] | null) ?? [],
    teachers: (teacherResult.data as TeacherRow[] | null) ?? [],
    candidates,
    inactivePlanTeachers: (inactiveResult.data as CandidateRow[] | null) ?? [],
    schoolDays: (dayResult.data as SchoolDayRow[] | null) ?? [],
    attendance: (attendanceResult.data as AttendanceRow[] | null) ?? [],
    notes: (noteResult.data as NoteRow[] | null) ?? [],
    absences: (absenceResult.data as AbsenceRow[] | null) ?? [],
    slots: (slotResult.data as TimeSlot[] | null) ?? [],
    plans,
    error: Boolean(
      classResult.error ||
        yearResult.error ||
        enrollmentResult.error ||
        guardianResult.error ||
        balanceResult.error ||
        teacherResult.error ||
        candidateResult.error ||
        dayResult.error ||
        attendanceResult.error ||
        noteResult.error ||
        absenceResult.error ||
        slotResult.error ||
        planResult.error,
    ),
  };
}

async function resolvePeople(markerIds: string[], authorIds: string[]) {
  const admin = createAdminClient();
  const [{ data: profiles }, { data: authors }] = await Promise.all([
    markerIds.length
      ? admin.from("profiles").select("id, full_name").in("id", markerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    authorIds.length
      ? admin.from("guardians").select("id, first_name, last_name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);
  const markers = new Map<string, string>();
  for (const row of profiles ?? []) {
    if (row.full_name?.trim()) markers.set(row.id, row.full_name.trim());
  }
  const missing = markerIds.filter((id) => !markers.has(id));
  const emails = await Promise.all(
    missing.map(async (id) => [id, (await admin.auth.admin.getUserById(id)).data.user?.email ?? null] as const),
  );
  const known = emails.filter((row): row is readonly [string, string] => Boolean(row[1]));
  if (known.length) {
    const { data: guardians } = await admin
      .from("guardians")
      .select("email, first_name, last_name")
      .in("email", known.map(([, email]) => email.toLowerCase()));
    const byEmail = new Map(
      (guardians ?? []).map((row) => [row.email?.toLowerCase(), joinName(row.first_name, row.last_name)]),
    );
    for (const [id, email] of known) markers.set(id, byEmail.get(email.toLowerCase()) || email);
  }
  const authorNames = new Map(
    (authors ?? []).map((row) => [row.id, joinName(row.first_name, row.last_name)]),
  );
  return { markers, authorNames };
}

export default async function KlassePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/klasser/[id]">) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  const basePath = adminBasePath(locale);
  const listHref = `${basePath}/klasser`;
  const classHref = `${listHref}/${id}`;
  const tab = typeof query.fane === "string" && ["undervisning", "semesterplan", "materiell", "aktiviteter", "nettside"].includes(query.fane) ? query.fane : "elever";
  const data = await getClassPage(id);
  const { classRecord, activeYear } = data;

  if (!classRecord) notFound();

  const ageYear = schoolYearStart(activeYear?.label) ?? new Date().getFullYear();
  const primaryByFamily = new Map<string, GuardianRow["guardian"]>();
  for (const row of [...data.guardians].sort(
    (left, right) =>
      Number(right.is_primary_contact) - Number(left.is_primary_contact) ||
      left.sort_order - right.sort_order,
  )) {
    if (!primaryByFamily.has(row.family_id) && row.guardian) {
      primaryByFamily.set(row.family_id, row.guardian);
    }
  }
  const balanceByStudent = new Map(
    data.balances
      .filter((row) => row.student_id)
      .map((row) => [row.student_id as string, row]),
  );

  const heldDayIds = new Set(data.schoolDays.map((day) => day.id));
  const heldAttendance = data.attendance.filter((row) =>
    heldDayIds.has(row.school_day_id),
  );
  const attendanceByStudent = new Map<string, AttendanceRow[]>();
  const attendanceByDay = new Map<string, AttendanceRow[]>();
  for (const row of heldAttendance) {
    attendanceByStudent.set(row.student_id, [
      ...(attendanceByStudent.get(row.student_id) ?? []),
      row,
    ]);
    attendanceByDay.set(row.school_day_id, [
      ...(attendanceByDay.get(row.school_day_id) ?? []),
      row,
    ]);
  }

  const roster = data.enrollments
    .filter((row) => row.students)
    .map((row) => {
      const student = row.students!;
      const guardian = student.family_id
        ? primaryByFamily.get(student.family_id)
        : undefined;
      const guardianName = guardian
        ? joinName(guardian.first_name, guardian.last_name)
        : joinName(student.mother_first_name, student.mother_last_name) ||
          joinName(student.father_first_name, student.father_last_name);
      const phone = guardian
        ? guardian.phone
        : student.mother_phone || student.father_phone;
      const email = guardian
        ? guardian.email
        : student.mother_email || student.father_email;
      const age = ageInYear(student.child_birth_date, ageYear);
      return {
        id: student.id,
        name: studentDisplayName(student) || "Navn mangler",
        age,
        guardianName: guardianName || null,
        phone: phone ?? null,
        email: email ?? null,
        pay: payChip(balanceByStudent.get(student.id)),
        attendance: attendanceSummary(
          attendanceByStudent.get(student.id) ?? [],
          data.schoolDays.length,
        ),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "nb-NO"));

  const capacity = classRecord.capacity ?? null;
  const ratio = capacity ? Math.min(roster.length / capacity, 1) : 0;
  const full = capacity != null && roster.length >= capacity;
  const csvRows: RosterCsvRow[] = roster.map((row) => ({
    name: row.name,
    age: row.age != null ? String(row.age) : "",
    guardian: row.guardianName ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    payment: row.pay.label,
  }));
  const className = classRecord.name_no ?? "Klasse";
  const rosterIds = new Set(roster.map((row) => row.id));
  const recentDays = data.schoolDays.slice(0, 12);
  const recentDayIds = new Set(recentDays.map((day) => day.id));
  const notesByDay = new Map<string, NoteRow[]>();
  for (const row of data.notes) {
    notesByDay.set(row.school_day_id, [...(notesByDay.get(row.school_day_id) ?? []), row]);
  }
  const noteText = (rows: NoteRow[], field: "homework" | "summary") => {
    const parts = rows
      .filter((row) => row[field])
      .sort((left, right) => (left.lessons?.start_position ?? 0) - (right.lessons?.start_position ?? 0))
      .map((row) => {
        const label = row.lessons ? lessonTitle(row.lessons, data.slots, "") : "";
        return label ? `${label}: ${row[field]}` : (row[field] as string);
      });
    return parts.length ? parts.join("\n") : null;
  };
  const reportByKey = new Map(data.absences.map((row) => [`${row.student_id}:${row.school_day_id}`, row]));
  const markerIds = [
    ...new Set(
      heldAttendance
        .filter((row) => recentDayIds.has(row.school_day_id) && row.marked_by)
        .map((row) => row.marked_by as string),
    ),
  ];
  const authorIds = [
    ...new Set(
      data.notes
        .filter((row) => recentDayIds.has(row.school_day_id) && row.author_guardian_id)
        .map((row) => row.author_guardian_id as string),
    ),
  ];
  const people = await resolvePeople(markerIds, authorIds);
  const dayOverview: DayOverview[] = recentDays.map((day) => {
    const rows = (attendanceByDay.get(day.id) ?? []).filter((row) =>
      rosterIds.has(row.student_id),
    );
    const byStudent = new Map<string, DayStatus[]>();
    for (const row of rows) {
      byStudent.set(row.student_id, [...(byStudent.get(row.student_id) ?? []), row.status as DayStatus]);
    }
    const statusOf = new Map(
      [...byStudent].map(([studentId, statuses]) => [studentId, collapseDayStatus(statuses)]),
    );
    const namesWith = (status: string) =>
      roster.filter((student) => statusOf.get(student.id) === status).map((student) => student.name);
    const dayNotes = notesByDay.get(day.id) ?? [];
    const homework = noteText(dayNotes, "homework");
    const summary = noteText(dayNotes, "summary");
    const author = dayNotes.find((row) => row.homework || row.summary)?.author_guardian_id ?? null;
    return {
      id: day.id,
      date: day.date,
      present: namesWith("til_stede"),
      absent: namesWith("fravaer"),
      reported: roster
        .filter((student) => statusOf.get(student.id) === "meldt_fravaer")
        .map((student) => {
          const report = reportByKey.get(`${student.id}:${day.id}`);
          return {
            name: student.name,
            reason: report?.reason ?? null,
            source: report?.source === "laerer" ? ("laerer" as const) : ("app" as const),
          };
        }),
      late: namesWith("sent"),
      unmarked: roster.filter((student) => !statusOf.has(student.id)).map((student) => student.name),
      markedBy: [
        ...new Set(
          rows
            .map((row) => (row.marked_by ? people.markers.get(row.marked_by) : null))
            .filter((name): name is string => Boolean(name)),
        ),
      ],
      note:
        homework || summary
          ? {
              homework,
              summary,
              author: author ? people.authorNames.get(author) || null : "Admin",
            }
          : null,
    };
  });
  const classTeachers: ClassTeacher[] = data.teachers
    .filter((row) => row.guardian)
    .map((row) => ({
      id: row.guardian!.id,
      name: joinName(row.guardian!.first_name, row.guardian!.last_name) || "(uten navn)",
      phone: row.guardian!.phone,
      email: row.guardian!.email,
      suspended: Boolean(row.guardian!.teacher[0]?.suspended_at),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "nb-NO"));
  const teacherCandidates = data.candidates.map((row) => ({
    id: row.id,
    name: joinName(row.first_name, row.last_name) || "(uten navn)",
  }));

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50 print:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til klasser
        </Link>
        <h1 className="mt-3 text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          {className}
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          {activeYear
            ? activeYear.label
            : "Velg et aktivt skoleår for å se elevlisten."}
        </p>
        {activeYear ? (
          <Link
            href={`${localePrefix(locale)}/min-side/klasse/${id}`}
            className={cn(buttonVariants({ variant: "outline" }), "mt-4 print:hidden")}
          >
            <ClipboardCheck aria-hidden="true" />
            Oppmøte og notater
          </Link>
        ) : null}
      </header>

      <SectionNavigation label={locale === "en" ? "Class views" : "Klassevisning"} current={tab} items={[
        { id: "elever", label: locale === "en" ? "Students" : "Elever i år", href: classHref },
        { id: "undervisning", label: locale === "en" ? "Teaching" : "Undervisning", href: `${classHref}?fane=undervisning` },
        { id: "semesterplan", label: locale === "en" ? "Semester plan" : "Semesterplan", href: `${classHref}?fane=semesterplan` },
        { id: "materiell", label: locale === "en" ? "Materials" : "Materiell", href: `${classHref}?fane=materiell` },
        { id: "aktiviteter", label: locale === "en" ? "Activities" : "Aktiviteter", href: `${classHref}?fane=aktiviteter` },
        { id: "nettside", label: locale === "en" ? "Website" : "Nettside", href: `${classHref}?fane=nettside` },
      ]} />

      {tab === "nettside" ? (
        <ClassForm classRecord={classRecord} listHref={listHref} />
      ) : data.error ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
          <h2 className="font-heading text-xl font-bold">
            Elevlisten kunne ikke lastes
          </h2>
          <p className="mt-1 text-sm text-admin-muted">
            Last siden på nytt. Ingen elever er skjult med vilje.
          </p>
        </section>
      ) : (
        <>
          {activeYear && tab === "undervisning" ? (
            <SlotPlanEditor
              key={JSON.stringify(data.plans)}
              classId={classRecord.id}
              schoolYearId={activeYear.id}
              slots={data.slots}
              plans={data.plans}
              candidates={teacherCandidates}
              inactiveTeachers={data.inactivePlanTeachers.map((row) => ({
                id: row.id,
                name: joinName(row.first_name, row.last_name) || "(uten navn)",
              }))}
              dayPlanHref={`${basePath}/dagsplan`}
            />
          ) : null}
          {activeYear && tab === "undervisning" ? (
            <ClassTeachers
              classId={classRecord.id}
              yearLabel={activeYear.label}
              assigned={classTeachers}
              candidates={teacherCandidates}
              teachersHref={`${basePath}/laerere`}
            />
          ) : null}
          {activeYear && tab === "semesterplan" ? (
            <WeekPlanSection
              classId={classRecord.id}
              schoolYearId={activeYear.id}
              slots={data.slots}
              blocks={data.plans}
              locale={locale}
              admin
            />
          ) : null}
          {activeYear && tab === "aktiviteter" ? <ClassActivities classId={classRecord.id} yearId={activeYear.id} locale={locale} /> : null}
          {activeYear && tab === "materiell" ? <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5 print:hidden">
            <LessonMaterials classId={classRecord.id} schoolYearId={activeYear.id} locale={locale} editable />
          </div> : null}
          {tab === "elever" ? <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] print:ring-0">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
              <div className="grid min-w-48 gap-1.5">
                <p className="text-sm tabular-nums">
                  <span className="font-heading text-2xl font-bold">
                    {roster.length}
                  </span>
                  {capacity != null ? ` av ${capacity} plasser` : " elever"}
                  {full ? (
                    <span className="ml-2 rounded-full bg-[#F9DEDB] px-2 py-0.5 text-xs font-bold text-[#8B2F2B]">
                      Full
                    </span>
                  ) : null}
                </p>
                {capacity != null ? (
                  <span
                    aria-hidden="true"
                    className="h-2 w-full max-w-64 overflow-hidden rounded-full bg-[#ECE8DF]"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        full ? "bg-[#C5524C]" : "bg-[#3C8F44]",
                      )}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </span>
                ) : null}
              </div>
              <RosterTools
                rows={csvRows}
                fileName={`${className} ${activeYear?.label ?? ""}`
                  .trim()
                  .replace(/[^\p{L}\p{N}]+/gu, "-")
                  .concat(".csv")}
              />
            </div>

            {roster.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
                <UsersRound aria-hidden="true" className="size-7 text-admin-muted" />
                <p className="mt-3 font-bold">Ingen elever i klassen ennå</p>
                <p className="mt-1 max-w-sm text-sm text-admin-muted">
                  Elever plasseres fra Opptak eller fra elevsiden.
                </p>
              </div>
            ) : (
              <>
                <table className="hidden w-full text-left text-sm md:table">
                  <thead className="border-b border-[#ECE8DF] text-xs text-admin-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-bold">Navn</th>
                      <th scope="col" className="px-3 py-3 font-bold">Alder</th>
                      <th scope="col" className="px-3 py-3 font-bold">Foresatt</th>
                      <th scope="col" className="px-3 py-3 font-bold">Telefon</th>
                      <th scope="col" className="px-3 py-3 font-bold">Oppmøte</th>
                      <th scope="col" className="px-5 py-3 font-bold">Betaling</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECE8DF]">
                    {roster.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-3 font-bold">
                          <Link
                            href={`${basePath}/elever/${row.id}`}
                            className="rounded underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.age != null ? `${row.age} år` : "-"}
                        </td>
                        <td className="px-3 py-3">{row.guardianName ?? "-"}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.phone ? (
                            <a
                              href={`tel:${row.phone.replace(/\s+/g, "")}`}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <Phone aria-hidden="true" className="size-4 print:hidden" />
                              {row.phone}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-admin-muted">
                          {row.attendance ?? "-"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                              chipClasses[row.pay.tone],
                            )}
                          >
                            {row.pay.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="divide-y divide-[#ECE8DF] md:hidden">
                  {roster.map((row) => (
                    <li key={row.id} className="grid gap-2 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`${basePath}/elever/${row.id}`}
                          className="min-w-0 rounded font-heading text-lg font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {row.name}
                          <span className="block font-sans text-sm font-normal text-admin-muted">
                            {row.age != null ? `${row.age} år` : "Alder mangler"}
                            {row.guardianName ? `, ${row.guardianName}` : ""}
                          </span>
                          {row.attendance ? (
                            <span className="block font-sans text-sm font-normal text-admin-muted">
                              Oppmøte: {row.attendance}
                            </span>
                          ) : null}
                        </Link>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                            chipClasses[row.pay.tone],
                          )}
                        >
                          {row.pay.label}
                        </span>
                      </div>
                      {row.phone || row.email ? (
                        <div className="flex flex-wrap gap-2">
                          {row.phone ? (
                            <a
                              href={`tel:${row.phone.replace(/\s+/g, "")}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] px-3 text-sm font-bold text-[#277A31] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <Phone aria-hidden="true" className="size-4" />
                              Ring {row.phone}
                            </a>
                          ) : null}
                          {row.email ? (
                            <a
                              href={`mailto:${row.email}`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] px-3 text-sm font-bold text-[#277A31] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <Mail aria-hidden="true" className="size-4" />
                              E-post
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section> : null}
          {tab === "elever" && dayOverview.length ? (
            <ClassDayOverview
              days={dayOverview}
              studentCount={roster.length}
              portalHref={`${localePrefix(locale)}/min-side/klasse/${id}`}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

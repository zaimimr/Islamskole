import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { formatOsloDate, osloToday } from "@/lib/dates";
import { findDoubleBookings, joinTeacherNames, lessonTeacherIds, needsSubstitute, type TimeSlot } from "@/lib/lessons";
import { createClient } from "@/lib/supabase/server";
import { DayPicker } from "./day-picker";
import { DayPlanGrid, type DayPlanClass, type DayPlanTeacher } from "./day-plan-grid";
import { EnsureLessonsButton } from "./ensure-lessons-button";
import { TeacherAbsences, type TeacherAbsenceRow } from "./teacher-absences";
import { DayAttendance } from "./day-attendance";

export const metadata: Metadata = { title: "Dagsplan" };

type LessonRow = {
  id: string;
  class_id: string;
  school_day_id: string;
  start_position: number;
  end_position: number;
  subject: string | null;
  teacher_guardian_id: string | null;
  co_teacher_guardian_id: string | null;
  is_substitute: boolean;
  is_override: boolean;
  cancelled: boolean;
  note: string | null;
  plan: { teacher_guardian_id: string | null } | null;
  class: { name_no: string | null; sort_order: number | null } | null;
};

type PersonRow = { id: string; first_name: string | null; last_name: string | null };

function joinName(row: { first_name: string | null; last_name: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "(uten navn)";
}

const linkClass =
  "font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function DagsplanPage({ params, searchParams }: PageProps<"/[locale]/admin/dagsplan">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const basePath = adminBasePath(locale);
  const attendanceView = query.visning === "oppmote";
  const supabase = await createClient();
  const { data: year } = await supabase
    .from("school_years")
    .select("id, label")
    .eq("is_active", true)
    .maybeSingle();

  const header = (
    <header>
      <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
        Dagsplan
      </h1>
      {attendanceView ? null : <p className="mt-1 max-w-2xl text-admin-muted">
        Hvem underviser hvilken klasse i hver time. Bytt inn vikar, slå sammen eller avlys timer for én dag.
        Fast oppsett endres under hver klasse.
      </p>}
    </header>
  );

  if (!year) {
    return (
      <div className="grid gap-6">
        {header}
        <p className="rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">Velg et aktivt skoleår først.</p>
      </div>
    );
  }

  const [{ data: dayData }, { data: slotData }, { data: teacherData }, { data: classTeacherData }] =
    await Promise.all([
      supabase
        .from("school_days")
        .select("id, date, cancelled, note")
        .eq("school_year_id", year.id)
        .order("date", { ascending: true }),
      supabase
        .from("school_time_slots")
        .select("position, label, starts_at, ends_at")
        .eq("school_year_id", year.id)
        .order("position", { ascending: true }),
      supabase
        .from("guardians")
        .select("id, first_name, last_name, teacher_suspended_at")
        .eq("is_teacher", true)
        .order("first_name", { ascending: true }),
      supabase
        .from("class_teachers")
        .select("class_id, guardian_id, guardian:guardians!inner(first_name, last_name, is_teacher)")
        .eq("school_year_id", year.id)
        .eq("guardian.is_teacher", true),
    ]);

  const days = dayData ?? [];
  const slots = (slotData as TimeSlot[] | null) ?? [];
  const today = osloToday();
  const requested = typeof query.dag === "string" ? days.find((day) => day.id === query.dag) : undefined;
  const day =
    requested ??
    days.find((item) => item.date >= today && !item.cancelled) ??
    days.find((item) => item.date >= today) ??
    days.at(-1);

  if (!day) {
    return (
      <div className="grid gap-6">
        {header}
        <p className="rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
          Skoleåret har ingen skoledager ennå.{" "}
          <Link href={`${basePath}/skolear/${year.id}`} className={linkClass}>
            Legg dem inn under skoleåret
          </Link>
          .
        </p>
      </div>
    );
  }

  const [{ data: lessonData }, { data: attendanceData }, { data: noteData }, { data: absenceData }, enrollmentResult] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, class_id, school_day_id, start_position, end_position, subject, teacher_guardian_id, co_teacher_guardian_id, is_substitute, is_override, cancelled, note, plan:class_slot_plans!lessons_plan_id_fkey(teacher_guardian_id), class:classes!lessons_class_id_fkey(name_no, sort_order)",
      )
      .eq("school_day_id", day.id)
      .order("start_position", { ascending: true }),
    supabase.from("attendance").select("lesson_id").eq("school_day_id", day.id).neq("status", "meldt_fravaer"),
    supabase.from("class_notes").select("lesson_id").eq("school_day_id", day.id),
    supabase
      .from("teacher_absences")
      .select("id, guardian_id, notified, source, reason, created_at")
      .eq("school_day_id", day.id)
      .order("created_at", { ascending: true }),
    supabase.from("enrollments").select("class_id").eq("school_year_id", year.id).eq("status", "aktiv"),
  ]);

  if (enrollmentResult.error) throw new Error("Kunne ikke hente elever til dagsplanen.");
  const occupiedClasses = new Set((enrollmentResult.data ?? []).map((row) => row.class_id));
  const lessons = ((lessonData as LessonRow[] | null) ?? []).filter((row) => occupiedClasses.has(row.class_id));
  const knownIds = new Set((teacherData ?? []).map((row) => row.id));
  const missingIds = [
    ...new Set(
      lessons
        .flatMap((row) => [...lessonTeacherIds(row), row.plan?.teacher_guardian_id ?? null])
        .concat((absenceData ?? []).map((row) => row.guardian_id))
        .filter((id): id is string => Boolean(id) && !knownIds.has(id as string)),
    ),
  ];
  const { data: missingPeople } = missingIds.length
    ? await supabase.from("guardians").select("id, first_name, last_name").in("id", missingIds)
    : { data: [] as PersonRow[] };
  const names = new Map<string, string>(
    [...(teacherData ?? []), ...(missingPeople ?? [])].map((row) => [row.id, joinName(row)]),
  );
  const classTeachers = new Map<string, string[]>();
  const classTeacherIds = new Map<string, string[]>();
  for (const row of classTeacherData ?? []) {
    if (!row.guardian) continue;
    classTeachers.set(row.class_id, [...(classTeachers.get(row.class_id) ?? []), joinName(row.guardian)]);
    classTeacherIds.set(row.class_id, [...(classTeacherIds.get(row.class_id) ?? []), row.guardian_id]);
  }
  const absentIds = new Set((absenceData ?? []).map((row) => row.guardian_id));
  const uncovered = new Set(
    day.cancelled
      ? []
      : lessons
          .filter((row) => needsSubstitute(row, absentIds, classTeacherIds.get(row.class_id)))
          .map((row) => row.id),
  );
  const withData = new Set(
    [...(attendanceData ?? []), ...(noteData ?? [])]
      .map((row) => row.lesson_id)
      .filter((id): id is string => Boolean(id)),
  );
  const clashes = findDoubleBookings(
    lessons.map((row) => ({
      id: row.id,
      school_day_id: row.school_day_id,
      start_position: row.start_position,
      end_position: row.end_position,
      teacher_guardian_id: row.teacher_guardian_id,
      co_teacher_guardian_id: row.co_teacher_guardian_id,
      cancelled: row.cancelled,
    })),
  );

  const nameOf = (id: string) => names.get(id) ?? "(ukjent lærer)";
  const classMap = new Map<string, DayPlanClass & { sortOrder: number }>();
  for (const row of lessons) {
    const entry = classMap.get(row.class_id) ?? {
      id: row.class_id,
      name: row.class?.name_no ?? "Klasse uten navn",
      classTeachers: classTeachers.get(row.class_id)?.sort((a, b) => a.localeCompare(b, "nb-NO")).join(", ") ?? null,
      lessons: [],
      sortOrder: row.class?.sort_order ?? 0,
    };
    entry.lessons.push({
      id: row.id,
      classId: row.class_id,
      start_position: row.start_position,
      end_position: row.end_position,
      subject: row.subject,
      teacherId: row.teacher_guardian_id,
      coTeacherId: row.co_teacher_guardian_id,
      teacherName: joinTeacherNames(lessonTeacherIds(row).map(nameOf)),
      defaultTeacherName: row.plan?.teacher_guardian_id ? names.get(row.plan.teacher_guardian_id) ?? null : null,
      isSubstitute: row.is_substitute,
      isOverride: row.is_override,
      cancelled: row.cancelled,
      note: row.note,
      hasData: withData.has(row.id),
      doubleBooked: clashes.has(row.id),
      needsSubstitute: uncovered.has(row.id),
    });
    classMap.set(row.class_id, entry);
  }
  const classes = [...classMap.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "nb-NO"),
  );
  const teachers: DayPlanTeacher[] = (teacherData ?? []).map((row) => ({
    id: row.id,
    name: joinName(row),
    suspended: Boolean(row.teacher_suspended_at),
  }));
  const substitutes = lessons.filter((row) => row.is_substitute && !row.cancelled).length;
  const cancelled = lessons.filter((row) => row.cancelled).length;
  const absences: TeacherAbsenceRow[] = (absenceData ?? []).map((row) => ({
    id: row.id,
    guardianId: row.guardian_id,
    name: nameOf(row.guardian_id),
    notified: row.notified,
    reason: row.reason,
    byTeacher: row.source === "laerer",
    missingLessons: lessons.filter(
      (lesson) =>
        uncovered.has(lesson.id) &&
        (lessonTeacherIds(lesson).length
          ? lessonTeacherIds(lesson)
          : classTeacherIds.get(lesson.class_id) ?? []
        ).includes(row.guardian_id),
    ).length,
  }));
  const dayLabel = formatOsloDate(day.date, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid gap-6 lg:gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {header}
        <DayPicker
          basePath={`${basePath}/dagsplan`}
          selectedId={day.id}
          days={days.map((item) => ({
            id: item.id,
            label: `${formatOsloDate(item.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${
              item.cancelled ? " (avlyst)" : item.date === today ? " (i dag)" : ""
            }`,
          }))}
        />
      </div>

      <nav aria-label="Dagsplanvisning" className="flex gap-1 border-b border-[#E3DED3]">
        {[
          { label: "Timeplan", attendance: false },
          { label: "Oppmøte", attendance: true },
        ].map((view) => (
          <Link
            key={view.label}
            href={`${basePath}/dagsplan?dag=${day.id}${view.attendance ? "&visning=oppmote" : ""}`}
            aria-current={attendanceView === view.attendance ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${attendanceView === view.attendance ? "border-[#2F7938] text-[#1D4E24]" : "border-transparent text-admin-muted hover:text-foreground"}`}
          >
            {view.label}
          </Link>
        ))}
      </nav>

      {day.cancelled ? (
        <p role="status" className="flex gap-2 rounded-2xl bg-[#FFF8E9] p-4 text-sm ring-1 ring-[#ECDCB9]">
          <CalendarX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-bold">Hele skoledagen er avlyst.</span>
            {day.note ? ` ${day.note}` : null}
          </span>
        </p>
      ) : null}

      {day.cancelled || attendanceView ? null : (
        <TeacherAbsences
          dayId={day.id}
          dayLabel={dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
          absences={absences}
          teachers={teachers.filter((teacher) => !teacher.suspended || absentIds.has(teacher.id))}
        />
      )}

      {classes.length ? (
        attendanceView ? (
          <DayAttendance
            basePath={basePath}
            day={day}
            yearLabel={year.label}
            slots={slots}
            classes={classes}
            query={query}
          />
        ) : <>
          <p className="text-sm text-admin-muted tabular-nums">
            {lessons.length} timer i {classes.length} {classes.length === 1 ? "klasse" : "klasser"}
            {uncovered.size ? ` · ${uncovered.size} mangler vikar` : ""}
            {substitutes ? ` · ${substitutes} med vikar` : ""}
            {clashes.size ? ` · ${clashes.size} dobbeltbooket` : ""}
            {cancelled ? ` · ${cancelled} avlyst` : ""}
          </p>
          <DayPlanGrid dayId={day.id} slots={slots} classes={classes} teachers={teachers} />
        </>
      ) : (
        <section className="grid justify-items-start gap-3 rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
          <p className="font-bold">Ingen timer denne dagen</p>
          <p className="max-w-xl text-sm text-admin-muted">
            Timer lages fra timeplanen til hver klasse som har elever. Sett opp timeplanen under{" "}
            <Link href={`${basePath}/klasser`} className={linkClass}>
              Klasser
            </Link>
            , eller lag timene for dagen nå.
          </p>
          <EnsureLessonsButton schoolDayId={day.id} />
        </section>
      )}
    </div>
  );
}

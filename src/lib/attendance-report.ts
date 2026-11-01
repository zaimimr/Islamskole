import "server-only";
import { osloToday } from "@/lib/dates";
import {
  addAttendanceCounts,
  attendancePercent,
  countStudentDays,
  emptyAttendanceCounts,
  registeredDays,
  type AttendanceCounts,
  type DayStatus,
} from "@/lib/lessons";
import { studentDisplayName } from "@/lib/student-name";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1000;

export type AttendanceTally = { counts: AttendanceCounts; registered: number; percent: number | null };

export type ReportStudent = AttendanceTally & { id: string; name: string };

export type ReportClass = AttendanceTally & { id: string; name: string; students: ReportStudent[] };

export type DayClass = { id: string; name: string; counts: AttendanceCounts; unmarked: number };

function tally(counts: AttendanceCounts): AttendanceTally {
  return { counts, registered: registeredDays(counts), percent: attendancePercent(counts) };
}

async function activeEnrollments(supabase: Client, yearId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select(
      "student_id, class_id, class:classes!inner(name_no, sort_order), student:students!inner(child_first_name, child_last_name)",
    )
    .eq("school_year_id", yearId)
    .eq("status", "aktiv");
  if (error) throw new Error("Kunne ikke hente oppmøte.");
  return data ?? [];
}

type Enrollment = Awaited<ReturnType<typeof activeEnrollments>>[number];

function groupClasses(enrollments: Enrollment[]) {
  return [
    ...new Map(
      enrollments.map((row) => [
        row.class_id,
        { id: row.class_id, name: row.class?.name_no ?? "Klasse uten navn", sortOrder: row.class?.sort_order ?? 0 },
      ]),
    ).values(),
  ].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "nb-NO"));
}

async function attendanceRows(supabase: Client, dayIds: string[], studentIds: Set<string>) {
  const rows: { student_id: string; school_day_id: string; status: DayStatus }[] = [];
  if (!dayIds.length || !studentIds.size) return rows;
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, school_day_id, status")
      .in("school_day_id", dayIds)
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error("Kunne ikke hente oppmøte.");
    rows.push(...((data ?? []) as typeof rows).filter((row) => studentIds.has(row.student_id)));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

export async function loadDayAttendance(supabase: Client, yearId: string, dayId: string) {
  const enrollments = await activeEnrollments(supabase, yearId);
  const perStudent = countStudentDays(
    await attendanceRows(supabase, [dayId], new Set(enrollments.map((row) => row.student_id))),
  );
  const classes: DayClass[] = groupClasses(enrollments).map((row) => {
    const members = enrollments.filter((item) => item.class_id === row.id);
    const counts = emptyAttendanceCounts();
    let unmarked = 0;
    for (const member of members) {
      const studentCounts = perStudent.get(member.student_id);
      if (studentCounts && registeredDays(studentCounts)) addAttendanceCounts(counts, studentCounts);
      else unmarked += 1;
    }
    return { id: row.id, name: row.name, counts, unmarked };
  });
  const total: DayClass = {
    id: "total",
    name: "Totalt",
    counts: classes.reduce((sum, row) => addAttendanceCounts(sum, row.counts), emptyAttendanceCounts()),
    unmarked: classes.reduce((sum, row) => sum + row.unmarked, 0),
  };
  return { classes, total };
}

export async function loadYearAttendance(supabase: Client, yearId: string) {
  const [enrollments, { data: dayData, error: dayError }] = await Promise.all([
    activeEnrollments(supabase, yearId),
    supabase
      .from("school_days")
      .select("id")
      .eq("school_year_id", yearId)
      .eq("cancelled", false)
      .lte("date", osloToday()),
  ]);
  if (dayError) throw new Error("Kunne ikke hente oppmøte.");
  const dayIds = (dayData ?? []).map((row) => row.id);
  const perStudent = countStudentDays(
    await attendanceRows(supabase, dayIds, new Set(enrollments.map((row) => row.student_id))),
  );

  const classes: ReportClass[] = groupClasses(enrollments).map((row) => {
    const students = enrollments
      .filter((item) => item.class_id === row.id)
      .map((item) => ({
        id: item.student_id,
        name: (item.student ? studentDisplayName(item.student) : "") || "(uten navn)",
        ...tally(perStudent.get(item.student_id) ?? emptyAttendanceCounts()),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "nb-NO"));
    const counts = students.reduce((sum, student) => addAttendanceCounts(sum, student.counts), emptyAttendanceCounts());
    return { id: row.id, name: row.name, students, ...tally(counts) };
  });
  const total = tally(classes.reduce((sum, row) => addAttendanceCounts(sum, row.counts), emptyAttendanceCounts()));
  return { classes, total, schoolDays: dayIds.length };
}

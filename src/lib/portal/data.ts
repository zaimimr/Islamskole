import "server-only";
import { cache } from "react";
import { getIsAdmin, getUser } from "@/lib/auth";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { osloToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type {
  AbsenceSource,
  AttendanceStatus,
  PortalAbsenceReport,
  PortalAttendance,
  PortalChild,
  PortalClass,
  PortalClassNote,
  PortalContext,
  PortalGuardianContact,
  PortalLesson,
  PortalPerson,
  PortalPickupPerson,
  PortalRosterRow,
  PortalSchoolDay,
  PortalSchoolDays,
  PortalSelf,
  PortalSelfNote,
  PortalSubstituteOption,
  PortalTimeSlot,
} from "@/lib/portal/types";

function referenceYear(label: string | null | undefined): number {
  return schoolYearStart(label) ?? Number(osloToday().slice(0, 4));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export const getMyChildren = cache(async (): Promise<PortalChild[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_my_children");
  if (error) {
    console.error("portal_my_children failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    birth_date: row.birth_date ?? null,
    age: ageInYear(row.birth_date, referenceYear(row.school_year_label)),
    teachers: asArray<PortalPerson>(row.teachers),
    remaining_ore: row.remaining_ore ?? null,
  }));
});

export const getMyClasses = cache(async (): Promise<PortalClass[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_my_classes");
  if (error) {
    console.error("portal_my_classes failed", error);
    return [];
  }
  return data ?? [];
});

export const getSubstituteOptions = cache(async (): Promise<PortalSubstituteOption[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_substitute_options");
  if (error) {
    console.error("portal_substitute_options failed", error);
    return [];
  }
  return data ?? [];
});

export const getMySelf = cache(async (): Promise<PortalSelf[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_my_self");
  if (error) {
    console.error("portal_my_self failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    birth_date: row.birth_date ?? null,
    age: ageInYear(row.birth_date, referenceYear(row.school_year_label)),
    class_id: row.class_id ?? null,
    class_name_no: row.class_name_no ?? null,
    class_name_en: row.class_name_en ?? null,
    school_year_id: row.school_year_id ?? null,
    school_year_label: row.school_year_label ?? null,
    teachers: asArray<PortalPerson>(row.teachers),
    notes: asArray<PortalSelfNote>(row.notes),
    attendance: asArray<{ date: string; status: AttendanceStatus; lesson_id: string | null }>(row.attendance),
  }));
});

export async function getClassForAdmin(classId: string): Promise<PortalClass | null> {
  const supabase = await createClient();
  const [{ data: row }, year] = await Promise.all([
    supabase.from("classes").select("id, name_no, name_en").eq("id", classId).maybeSingle(),
    getActiveYear(),
  ]);
  if (!row || !year) return null;
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("school_year_id", year.id)
    .eq("status", "aktiv");
  return {
    class_id: row.id,
    name_no: row.name_no,
    name_en: row.name_en ?? row.name_no,
    school_year_id: year.id,
    school_year_label: year.label,
    role: "admin",
    student_count: count ?? 0,
    substitute_until: null,
  };
}

const getGuardianIds = cache(async (): Promise<string[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_guardian_ids");
  if (error) {
    console.error("portal_guardian_ids failed", error);
    return [];
  }
  return (data ?? []) as string[];
});

export const getPortalContext = cache(async (): Promise<PortalContext> => {
  const user = await getUser();
  if (!user) {
    return {
      user: null,
      email: null,
      guardianIds: [],
      isTeacher: false,
      isGuardian: false,
      isStudent: false,
      isAdmin: false,
    };
  }
  const [guardianIds, children, classes, self, isAdmin] = await Promise.all([
    getGuardianIds(),
    getMyChildren(),
    getMyClasses(),
    getMySelf(),
    getIsAdmin(),
  ]);
  return {
    user,
    email: user.email ?? null,
    guardianIds,
    isTeacher: classes.length > 0,
    isGuardian: children.length > 0,
    isStudent: self.length > 0,
    isAdmin,
  };
});

export async function isRegisteredTeacher(): Promise<boolean> {
  const guardianIds = await getGuardianIds();
  if (!guardianIds.length) return false;
  const { count, error } = await createAdminClient()
    .from("guardians")
    .select("id", { count: "exact", head: true })
    .in("id", guardianIds)
    .eq("is_teacher", true)
    .is("teacher_suspended_at", null);
  if (error) console.error("guardians is_teacher failed", error);
  return (count ?? 0) > 0;
}

export const isSuspendedTeacher = cache(async (): Promise<boolean> => {
  const guardianIds = await getGuardianIds();
  if (!guardianIds.length) return false;
  const { data, error } = await createAdminClient()
    .from("guardians")
    .select("teacher_suspended_at")
    .in("id", guardianIds)
    .eq("is_teacher", true);
  if (error) {
    console.error("guardians teacher_suspended_at failed", error);
    return false;
  }
  return (data ?? []).length > 0 && (data ?? []).every((row) => row.teacher_suspended_at);
});

const getActiveYear = cache(
  async (): Promise<{ id: string; label: string } | null> => {
    const [children, classes] = await Promise.all([getMyChildren(), getMyClasses()]);
    const known = children[0] ?? classes[0];
    if (known) return { id: known.school_year_id, label: known.school_year_label };
    const supabase = await createClient();
    const { data } = await supabase.rpc("portal_active_school_year").maybeSingle();
    return data ?? null;
  },
);

type RosterRpcRow = Omit<Database["public"]["Functions"]["portal_lesson_roster"]["Returns"][number], "absence_source"> & {
  absence_source?: string | null;
};

function mapRoster(rows: RosterRpcRow[] | null, year: number): PortalRosterRow[] {
  return (rows ?? []).map((row) => ({
    ...row,
    birth_date: row.birth_date ?? null,
    age: ageInYear(row.birth_date, year),
    guardians: asArray<PortalGuardianContact>(row.guardians),
    attendance_status: (row.attendance_status ?? null) as AttendanceStatus | null,
    attendance_marked_at: row.attendance_marked_at ?? null,
    absence_report_id: row.absence_report_id ?? null,
    absence_reason: row.absence_reason ?? null,
    absence_source: (row.absence_source ?? null) as AbsenceSource | null,
    allergies: row.allergies ?? null,
    medical_notes: row.medical_notes ?? null,
    photo_consent: row.photo_consent ?? null,
    pickup: asArray<PortalPickupPerson>(row.pickup),
  }));
}

export async function getLessonRoster(lessonId: string, yearLabel?: string | null): Promise<PortalRosterRow[]> {
  const supabase = await createClient();
  const [{ data, error }, activeYear] = await Promise.all([
    supabase.rpc("portal_lesson_roster", { p_lesson_id: lessonId }),
    getActiveYear(),
  ]);
  if (error) {
    if (error.code !== "42501") console.error("portal_lesson_roster failed", error);
    return [];
  }
  return mapRoster(data, referenceYear(yearLabel ?? activeYear?.label));
}

export const getTimeSlots = cache(async (schoolYearId: string): Promise<PortalTimeSlot[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_time_slots")
    .select("position, label, starts_at, ends_at")
    .eq("school_year_id", schoolYearId)
    .order("position", { ascending: true });
  if (error) {
    console.error("school_time_slots failed", error);
    return [];
  }
  return data ?? [];
});

export async function getLessons(schoolDayIds: string[]): Promise<PortalLesson[]> {
  if (!schoolDayIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_lessons", { p_school_day_ids: schoolDayIds });
  if (error) {
    console.error("portal_lessons failed", error);
    return [];
  }
  return (data ?? []) as PortalLesson[];
}

export const getMyLessons = cache(async (from: string, to: string): Promise<PortalLesson[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_my_lessons", { p_from: from, p_to: to });
  if (error) {
    console.error("portal_my_lessons failed", error);
    return [];
  }
  return (data ?? []) as PortalLesson[];
});

export async function getClassForLessonTeacher(
  classId: string,
): Promise<{ portalClass: PortalClass; dayIds: Set<string> } | null> {
  const [year, lessons] = await Promise.all([getActiveYear(), getMyLessons("2000-01-01", "2999-12-31")]);
  const mine = lessons.filter((lesson) => lesson.class_id === classId && lesson.is_mine);
  if (!year || !mine.length) return null;
  return {
    portalClass: {
      class_id: classId,
      name_no: mine[0].class_name_no,
      name_en: mine[0].class_name_en,
      school_year_id: year.id,
      school_year_label: year.label,
      role: "vikar",
      student_count: 0,
      substitute_until: null,
    },
    dayIds: new Set(mine.map((lesson) => lesson.school_day_id)),
  };
}

export async function getClassRoster(
  classId: string,
  schoolDayId: string,
): Promise<PortalRosterRow[]> {
  const supabase = await createClient();
  const [{ data, error }, activeYear, classes] = await Promise.all([
    supabase.rpc("portal_class_roster", {
      p_class_id: classId,
      p_school_day_id: schoolDayId,
    }),
    getActiveYear(),
    getMyClasses(),
  ]);
  if (error) {
    if (error.code !== "42501") console.error("portal_class_roster failed", error);
    return [];
  }
  const label =
    classes.find((row) => row.class_id === classId)?.school_year_label ??
    activeYear?.label;
  return mapRoster(data, referenceYear(label));
}

export async function getSchoolDays(schoolYearId?: string): Promise<PortalSchoolDays> {
  const yearId = schoolYearId ?? (await getActiveYear())?.id ?? null;
  if (!yearId) return { schoolYearId: null, upcoming: [], past: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_days")
    .select("id, school_year_id, date, cancelled, note")
    .eq("school_year_id", yearId)
    .order("date", { ascending: true });
  if (error) {
    console.error("school_days failed", error);
    return { schoolYearId: yearId, upcoming: [], past: [] };
  }
  const today = osloToday();
  const days: PortalSchoolDay[] = data ?? [];
  return {
    schoolYearId: yearId,
    upcoming: days.filter((day) => day.date >= today),
    past: days.filter((day) => day.date < today).reverse(),
  };
}

export async function getClassNotes(
  classId: string,
  limit = 10,
  until?: string,
): Promise<PortalClassNote[]> {
  const supabase = await createClient();
  let query = supabase
    .from("class_notes")
    .select(
      "id, class_id, school_day_id, lesson_id, homework, summary, author_guardian_id, created_at, updated_at, school_days!inner(date), lessons(start_position, end_position, subject)",
    )
    .eq("class_id", classId);
  if (until) query = query.lte("school_days.date", until);
  const { data, error } = await query
    .order("school_days(date)", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("class_notes failed", error);
    return [];
  }
  return (data ?? [])
    .map(({ school_days, lessons, ...note }) => ({
      ...note,
      date: school_days?.date ?? null,
      subject: lessons?.subject ?? null,
      start_position: lessons?.start_position ?? null,
      end_position: lessons?.end_position ?? null,
    }))
    .sort(
      (a, b) =>
        (b.date ?? "").localeCompare(a.date ?? "") ||
        (a.start_position ?? 0) - (b.start_position ?? 0),
    );
}

export async function getMyAttendance(schoolYearId?: string): Promise<PortalAttendance[]> {
  const yearId = schoolYearId ?? (await getActiveYear())?.id ?? null;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, school_day_id, lesson_id, status, marked_at, school_days!inner(date, school_year_id)")
    .eq("school_days.school_year_id", yearId);
  if (error) {
    console.error("attendance failed", error);
    return [];
  }
  return (data ?? []).map(({ school_days, ...row }) => ({
    ...row,
    status: row.status as AttendanceStatus,
    date: school_days?.date ?? null,
  }));
}

export async function getMyAbsenceReports(
  options: { includeWithdrawn?: boolean } = {},
): Promise<PortalAbsenceReport[]> {
  const supabase = await createClient();
  let query = supabase
    .from("absence_reports")
    .select("id, student_id, school_day_id, reason, created_at, withdrawn_at, school_days!inner(date)")
    .order("created_at", { ascending: false });
  if (!options.includeWithdrawn) query = query.is("withdrawn_at", null);
  const { data, error } = await query;
  if (error) {
    console.error("absence_reports failed", error);
    return [];
  }
  return (data ?? []).map(({ school_days, ...row }) => ({
    ...row,
    date: school_days?.date ?? null,
  }));
}

export type MyTeacherAbsence = {
  id: string;
  school_day_id: string;
  date: string;
  reason: string | null;
  source: string;
};

export async function getMyTeacherAbsences(): Promise<MyTeacherAbsence[]> {
  const context = await getPortalContext();
  if (!context.guardianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_absences")
    .select("id, school_day_id, reason, source, school_day:school_days!inner(date)")
    .in("guardian_id", context.guardianIds)
    .gte("school_day.date", osloToday());
  if (error) {
    console.error("teacher_absences failed", error);
    return [];
  }
  return ((data ?? []) as unknown as (Omit<MyTeacherAbsence, "date"> & { school_day: { date: string } })[])
    .map(({ school_day, ...row }) => ({ ...row, date: school_day.date }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatOsloDate } from "@/lib/dates";
import { lessonTeacherIds, lessonTitle, needsSubstitute, rangesOverlap, slotRangeTimes, type TimeSlot } from "@/lib/lessons";
import { TeacherAbsences, type TeacherAbsenceRow } from "./teacher-absences";
import { EnsureLessonsButton } from "./ensure-lessons-button";

type PlanningLesson = {
  id: string;
  class_id: string;
  school_day_id: string;
  start_position: number;
  end_position: number;
  subject: string | null;
  teacher_guardian_id: string | null;
  co_teacher_guardian_id: string | null;
  cancelled: boolean;
  note: string | null;
  class: { name_no: string } | null;
};

export async function UpcomingTeacherAbsences({ basePath, yearId, today, days, slots }: {
  basePath: string;
  yearId: string;
  today: string;
  days: { id: string; date: string; cancelled: boolean }[];
  slots: TimeSlot[];
}) {
  const upcoming = days.filter((day) => day.date >= today && !day.cancelled);
  if (!upcoming.length) return <p className="py-4 text-admin-muted">Ingen flere skoledager i skoleåret.</p>;
  const supabase = await createClient();
  const dayIds = upcoming.map((day) => day.id);
  const [absenceResult, lessonResult, assignmentResult, peopleResult, enrollmentResult] = await Promise.all([
    supabase.from("teacher_absences").select("id, guardian_id, school_day_id, notified, source, reason").in("school_day_id", dayIds),
    supabase.from("lessons").select("id, class_id, school_day_id, start_position, end_position, subject, teacher_guardian_id, co_teacher_guardian_id, cancelled, note, class:classes!lessons_class_id_fkey(name_no)").in("school_day_id", dayIds).order("start_position").limit(5000),
    supabase.from("class_teachers").select("class_id, guardian_id, class:classes(name_no)").eq("school_year_id", yearId),
    supabase.from("guardians").select("id, first_name, last_name, phone, teacher:person_roles!inner(suspended_at)").eq("teacher.role_key", "teacher"),
    supabase.from("enrollments").select("class_id").eq("school_year_id", yearId).eq("status", "aktiv"),
  ]);
  if (absenceResult.error || lessonResult.error || assignmentResult.error || peopleResult.error || enrollmentResult.error) {
    console.error("teacher planning failed", absenceResult.error ?? lessonResult.error ?? assignmentResult.error ?? peopleResult.error ?? enrollmentResult.error);
    throw new Error("Kunne ikke hente lærerplanlegging. Prøv igjen.");
  }
  const occupied = new Set((enrollmentResult.data ?? []).map((row) => row.class_id));
  const lessons = ((lessonResult.data ?? []) as PlanningLesson[]).filter((row) => occupied.has(row.class_id));
  const assignments = (assignmentResult.data ?? []).filter((row) => occupied.has(row.class_id));
  const names = new Map((peopleResult.data ?? []).map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(" ")]));
  const teachers = (peopleResult.data ?? []).filter((row) => !row.teacher[0]?.suspended_at).map((row) => ({ id: row.id, name: names.get(row.id) ?? "Uten navn" }));
  const classTeachers = new Map<string, string[]>();
  for (const row of assignments) classTeachers.set(row.class_id, [...(classTeachers.get(row.class_id) ?? []), row.guardian_id]);
  const nameOf = (id: string) => names.get(id) ?? "Ukjent lærer";

  return (
    <section aria-label="Kommende lærerfravær" className="grid gap-3">
      <h2 className="font-heading text-xl font-bold">Kommende skoledager</h2>
      <div className="divide-y divide-foreground/10 rounded-xl bg-white ring-1 ring-[#E3DED3]">
        {upcoming.map((day) => {
          const absences = (absenceResult.data ?? []).filter((row) => row.school_day_id === day.id);
          const absentIds = new Set(absences.map((row) => row.guardian_id));
          const dayLessons = lessons.filter((row) => row.school_day_id === day.id);
          const uncovered = dayLessons.filter((row) => needsSubstitute(row, absentIds, classTeachers.get(row.class_id)));
          const missingClassIds = [...new Set(assignments.filter((row) => absentIds.has(row.guardian_id) && !dayLessons.some((lesson) => lesson.class_id === row.class_id)).map((row) => row.class_id))];
          const dayLabel = formatOsloDate(day.date, { weekday: "long", day: "numeric", month: "long" });
          const absenceRows: TeacherAbsenceRow[] = absences.map((row) => ({
            id: row.id,
            guardianId: row.guardian_id,
            name: nameOf(row.guardian_id),
            notified: row.notified,
            reason: row.reason,
            byTeacher: row.source === "laerer",
            uncovered: uncovered.filter((lesson) => (lessonTeacherIds(lesson).length ? lessonTeacherIds(lesson) : classTeachers.get(lesson.class_id) ?? []).includes(row.guardian_id)).map((lesson) => ({
              id: lesson.id,
              label: `${lesson.class?.name_no ?? "Klasse"} · ${lessonTitle(lesson, slots, "Hele dagen")} · ${slotRangeTimes(slots, lesson)}`,
              subject: lesson.subject,
              teacherId: lesson.teacher_guardian_id,
              coTeacherId: lesson.co_teacher_guardian_id,
              note: lesson.note,
              busy: Object.fromEntries(dayLessons.filter((other) => other.id !== lesson.id && !other.cancelled && rangesOverlap(other, lesson)).flatMap((other) => (lessonTeacherIds(other).length ? lessonTeacherIds(other) : classTeachers.get(other.class_id) ?? []).map((id) => [id, other.class?.name_no ?? "en annen klasse"]))),
            })),
          }));
          const affected = [...new Set([...assignments.filter((row) => absentIds.has(row.guardian_id)).map((row) => row.class?.name_no), ...dayLessons.filter((row) => lessonTeacherIds(row).some((id) => absentIds.has(id))).map((row) => row.class?.name_no)].filter((name): name is string => Boolean(name)))];
          return (
            <details key={day.id} open={uncovered.length > 0 || missingClassIds.length > 0} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="font-bold first-letter:uppercase">{dayLabel}</span>
                  <span className="text-sm text-admin-muted">{absences.length ? `${absences.length} ${absences.length === 1 ? "lærer" : "lærere"} borte: ${absences.map((row) => nameOf(row.guardian_id)).join(", ")}` : "Ingen meldt lærerfravær"}</span>
                  {affected.length ? <span className="text-xs text-admin-muted">{affected.join(", ")}</span> : null}
                  {uncovered.length ? <span className="text-sm font-bold text-destructive">{uncovered.length} {uncovered.length === 1 ? "time" : "timer"} mangler vikar</span> : null}
                  {missingClassIds.length ? <span className="text-sm font-bold text-destructive">Vikarbehov må avklares i {missingClassIds.length} {missingClassIds.length === 1 ? "klasse" : "klasser"}</span> : null}
                </span>
                <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-foreground/10 p-3 sm:p-4">
                <TeacherAbsences dayId={day.id} dayLabel={dayLabel} absences={absenceRows} teachers={teachers} />
                {missingClassIds.length ? <EnsureLessonsButton schoolDayId={day.id} /> : null}
                <Link href={`${basePath}/dagsplan?dag=${day.id}`} className="inline-flex min-h-11 items-center justify-self-start rounded-lg px-2 font-bold text-admin-action underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">Åpne dagsplan</Link>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

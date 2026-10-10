import { createClient } from "@/lib/supabase/server";
import { osloToday } from "@/lib/dates";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { HomeworkAssignmentPicker } from "@/components/portal/teacher/homework-assignment-picker";
import { HomeworkFollowUp } from "@/components/portal/teacher/homework-follow-up";

export async function ClassHomework({ classId, schoolYearId, selectedId, locale }: {
  classId: string; schoolYearId: string; selectedId?: string; locale: string;
}) {
  const { data, error } = await (await createClient()).from("class_notes")
    .select("id, homework, school_days!inner(date, school_year_id, cancelled), lessons(subject, cancelled)")
    .eq("class_id", classId).eq("school_days.school_year_id", schoolYearId).eq("school_days.cancelled", false)
    .lte("school_days.date", osloToday()).not("homework", "is", null)
    .order("school_days(date)", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    console.error("Class homework failed", { code: error.code });
    return <p role="status">{locale === "en" ? "Could not load homework" : "Kunne ikke hente lekser"}</p>;
  }
  const assignments = data.filter((note) => note.homework?.trim() && !note.lessons?.cancelled);
  if (!assignments.length) return null;
  const selected = assignments.find((note) => note.id === selectedId) ?? assignments[0];
  return <div className="grid gap-3">
    <h2 className="font-heading text-xl font-semibold">{locale === "en" ? "Homework follow-up" : "Lekseoppfølging"}</h2>
    <HomeworkAssignmentPicker selectedId={selected.id} assignments={assignments.map((note) => ({
      value: note.id, label: `${formatSchoolDay(note.school_days.date, locale)} · ${note.lessons?.subject || note.homework!.slice(0, 70)}`,
    }))} />
    <HomeworkFollowUp key={selected.id} noteId={selected.id} locale={locale} />
  </div>;
}

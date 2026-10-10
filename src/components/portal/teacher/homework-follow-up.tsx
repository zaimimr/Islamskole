import { createClient } from "@/lib/supabase/server";
import { formatSchoolDay } from "@/lib/portal/teacher-days";

export async function HomeworkFollowUp({ noteId, locale }: {
  noteId: string; locale: string;
}) {
  const supabase = await createClient();
  const [{ data: note }, { data: responses, error }] = await Promise.all([
    supabase.from("class_notes").select("homework, homework_version, school_days(date)").eq("id", noteId).maybeSingle(),
    supabase.rpc("homework_class_responses", { p_note_id: noteId }),
  ]);
  if (!note?.homework) return null;
  const en = locale === "en";
  if (error) return <p role="status">{en ? "Could not load homework responses" : "Kunne ikke hente leksesvar"}</p>;
  if (!responses?.length) return null;
  const labels = { not_started: en ? "Not completed" : "Ikke fullført", completed: en ? "Completed" : "Fullført", needs_help: en ? "Needs help" : "Trenger hjelp" };
  return <section aria-label={en ? "Homework follow-up" : "Lekseoppfølging"} className="grid gap-3">
    {note.school_days?.date ? <p className="text-sm text-muted-foreground">{formatSchoolDay(note.school_days.date, locale)}</p> : null}
    <p className="whitespace-pre-line">{note.homework}</p>
    <ul className="divide-y divide-foreground/8 rounded-2xl bg-card ring-1 ring-foreground/8">
      {(responses ?? []).map((student) => {
        const status = student.status as keyof typeof labels;
        return <li key={student.student_id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 p-3">
          <p className="font-semibold">{student.student_name}</p>
          <p className={status === "needs_help" ? "font-semibold text-secondary-foreground" : "text-sm text-muted-foreground"}>{labels[status]}</p>
        </li>;
      })}
    </ul>
  </section>;
}

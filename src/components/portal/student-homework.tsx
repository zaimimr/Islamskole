import { createClient } from "@/lib/supabase/server";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { HomeworkResponse } from "@/components/portal/homework-response";

export async function StudentHomework({ studentId, locale }: { studentId: string; locale: string }) {
  const { data, error } = await (await createClient()).rpc("student_homework", { p_student_id: studentId });
  if (error) {
    console.error("Student homework failed", { code: error.code });
    return <p role="status">{locale === "en" ? "Could not load homework. Try again." : "Kunne ikke hente lekser. Prøv igjen."}</p>;
  }
  if (!data.length) return null;
  const en = locale === "en";
  const latest = data.filter((assignment) => assignment.date === data[0].date);
  const earlier = data.filter((assignment) => assignment.date !== data[0].date);
  const assignments = (rows: typeof data) => <ul className="divide-y divide-foreground/8 rounded-2xl bg-card ring-1 ring-foreground/8">
    {rows.map((assignment) => <li key={assignment.note_id} className="grid gap-3 p-4 sm:p-5">
      <p className="font-semibold">{formatSchoolDay(assignment.date, locale)}{assignment.subject ? ` · ${assignment.subject}` : ""}</p>
      <p className="whitespace-pre-line">{assignment.homework}</p>
      <HomeworkResponse noteId={assignment.note_id} studentId={studentId} status={assignment.status} homeworkVersion={assignment.homework_version} />
    </li>)}
  </ul>;
  return <section aria-label={en ? "Homework" : "Lekser"} className="grid gap-3">
    <h2 className="font-heading text-2xl font-semibold">{en ? "Homework" : "Lekser"}</h2>
    {assignments(latest)}
    {earlier.length ? <details className="grid gap-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-green-dark outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {en ? `Earlier homework (${earlier.length})` : `Tidligere lekser (${earlier.length})`}
      </summary>
      {assignments(earlier)}
    </details> : null}
  </section>;
}

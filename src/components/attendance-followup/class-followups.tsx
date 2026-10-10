import { createClient } from "@/lib/supabase/server";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { FollowUpForm } from "./followup-form";

export async function ClassFollowUps({ classId, yearId, locale }: { classId: string; yearId: string; locale: string }) {
  const client = await createClient();
  const en = locale === "en";
  const [{ data: streaks, error }, { data: history, error: historyError }] = await Promise.all([
    client.rpc("class_absence_streaks", { p_class_id: classId, p_year: yearId }),
    client.from("attendance_followups").select("id, student_id, student_name, action, note, message, recorded_by_name, created_at")
      .eq("class_id", classId).eq("school_year_id", yearId).order("created_at", { ascending: false }),
  ]);
  if (error || historyError) return <p role="status">{en ? "Could not load attendance follow-up" : "Kunne ikke hente fraværsoppfølging"}</p>;
  if (!streaks?.length && !history?.length) return null;
  const labels: Record<string, string> = { contacted: en ? "Contact recorded" : "Kontakt registrert", monitor: en ? "Continue monitoring" : "Følg videre", resolved: en ? "Resolved" : "Avklart", email: en ? "Email to guardians" : "E-post til foresatte" };
  return <section aria-label={en ? "Attendance follow-up" : "Fraværsoppfølging"} className="grid gap-4">
    <h2 className="font-heading text-2xl font-semibold">{en ? "Attendance follow-up" : "Fraværsoppfølging"}</h2>
    {streaks?.map((row) => <article key={row.student_id} className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
      <h3 className="font-heading text-xl font-semibold wrap-anywhere">{row.student_name}</h3><p>{en ? `${row.missed} consecutive missed school Sundays` : `${row.missed} skolesøndager med sammenhengende fravær`}</p>
      <p className="text-sm text-muted-foreground">{row.dates.map((date) => formatSchoolDay(date, locale)).join(" · ")}</p>
      <FollowUpForm studentId={row.student_id} studentName={row.student_name} classId={classId} yearId={yearId} endedOn={row.ended_on} />
      {history?.some((item) => item.student_id === row.student_id) ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{en ? "Follow-up history" : "Oppfølgingshistorikk"}</summary><ul className="grid gap-3 pt-2">{history.filter((item) => item.student_id === row.student_id).map((item) => <li key={item.id} className="grid gap-1 border-t pt-3"><p className="font-semibold">{labels[item.action]} · {formatSchoolDay(item.created_at.slice(0, 10), locale)}</p><p className="text-sm text-muted-foreground">{item.recorded_by_name}</p>{item.note ? <p className="whitespace-pre-line wrap-anywhere">{item.note}</p> : null}{item.message ? <p className="whitespace-pre-line wrap-anywhere">{item.message}</p> : null}</li>)}</ul></details> : null}
    </article>)}
    {history?.length ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{en ? "All follow-up history" : "All oppfølgingshistorikk"}</summary><ul className="grid gap-3 pt-2">{history.map((item) => <li key={item.id} className="grid gap-1 border-t pt-3"><a className="font-semibold text-brand-green-dark" href={`/${locale}/min-side/klasse/${classId}/elev/${item.student_id}`}>{item.student_name}</a><p>{labels[item.action]} · {formatSchoolDay(item.created_at.slice(0, 10), locale)} · {item.recorded_by_name}</p>{item.note ? <p className="whitespace-pre-line wrap-anywhere">{item.note}</p> : null}{item.message ? <p className="whitespace-pre-line wrap-anywhere">{item.message}</p> : null}</li>)}</ul></details> : null}
  </section>;
}

import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { ActivityEditor } from "./activity-editor";
import { ActivityStaffActions } from "./staff-actions";

export async function ClassActivities({ classId, yearId, locale }: { classId: string; yearId: string; locale: string }) {
  const en = locale === "en";
  const { data, error } = await (await createClient()).from("school_activities").select("*").eq("class_id", classId).eq("school_year_id", yearId).order("event_date", { ascending: false });
  if (error) return <p role="status">{en ? "Could not load activities" : "Kunne ikke hente aktiviteter"}</p>;
  return <section aria-label={en ? "Class activities" : "Klasseaktiviteter"} className="grid gap-4 print:hidden">
    <h2 className="font-heading text-2xl font-semibold">{en ? "Activities" : "Aktiviteter"}</h2>
    <details><summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-green-dark">{en ? "New activity" : "Ny aktivitet"}</summary><ActivityEditor classId={classId} yearId={yearId} /></details>
    {data?.map((activity) => activity.status === "draft" ? <details key={activity.id}><summary className="min-h-11 cursor-pointer py-2 font-semibold wrap-anywhere">{activity.title} · {en ? "Draft" : "Utkast"}</summary><ActivityEditor classId={classId} yearId={yearId} initial={activity} /></details> : <article key={activity.id} className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8"><h3 className="font-heading text-xl font-semibold wrap-anywhere">{activity.title}</h3><p>{formatSchoolDay(activity.event_date, locale)}{activity.status === "cancelled" ? ` · ${en ? "Cancelled" : "Avlyst"}` : ""}</p><Link className="inline-flex min-h-11 w-fit items-center rounded-lg px-2 font-semibold text-brand-green-dark hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" href={`/min-side/aktiviteter/${activity.id}`}>{en ? "Consent and participation roster" : "Samtykke og deltakerliste"}</Link>{activity.status === "published" ? <ActivityStaffActions activityId={activity.id} expected={activity.updated_at} /> : null}</article>)}
  </section>;
}

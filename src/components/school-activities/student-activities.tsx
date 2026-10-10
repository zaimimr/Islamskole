import { createClient } from "@/lib/supabase/server";
import { osloToday } from "@/lib/dates";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { ActivityResponse } from "./activity-response";

export async function StudentActivities({ studentId, locale, guardian = false }: { studentId: string; locale: string; guardian?: boolean }) {
  const en = locale === "en";
  const client = await createClient();
  const [{ data, error }, { data: responses, error: responseError }, { data: history, error: historyError }] = await Promise.all([
    client.from("activity_students").select("activity_id, participation, school_activities!inner(id, title, description, consent_text, event_date, respond_by, status, updated_at)").eq("student_id", studentId),
    client.from("activity_responses").select("activity_id, consent, going, guardian_name, responded_at").eq("student_id", studentId),
    client.from("activity_response_history").select("id, activity_id, consent, going, guardian_name, responded_at").eq("student_id", studentId).order("responded_at", { ascending: false }),
  ]);
  if (error || responseError || historyError) return <p role="status">{en ? "Could not load activities" : "Kunne ikke hente aktiviteter"}</p>;
  if (!data?.length) return null;
  const today = osloToday();
  return <section id="activities" aria-label={en ? "Activities and consent" : "Aktiviteter og samtykke"} className="grid gap-4">
    <h2 className="font-heading text-2xl font-semibold">{en ? "Activities and consent" : "Aktiviteter og samtykke"}</h2>
    {data.sort((a, b) => b.school_activities.event_date.localeCompare(a.school_activities.event_date)).map((row) => {
      const activity = row.school_activities;
      const response = responses?.find((item) => item.activity_id === activity.id);
      const earlier = history?.filter((item) => item.activity_id === activity.id) ?? [];
      const open = activity.status === "published" && activity.respond_by >= today && activity.event_date >= today && row.participation === "unrecorded";
      return <article key={activity.id} className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-6">
        <h3 className="font-heading text-xl font-semibold wrap-anywhere">{activity.title}</h3><p>{formatSchoolDay(activity.event_date, locale)}</p>
        {activity.status === "cancelled" ? <p className="font-semibold">{en ? "Cancelled" : "Avlyst"}</p> : null}
        <p className="whitespace-pre-line wrap-anywhere">{activity.description}</p><p className="font-semibold">{en ? "Consent statement" : "Samtykketekst"}</p><p className="whitespace-pre-line wrap-anywhere">{activity.consent_text}</p>
        <p className="text-sm text-muted-foreground">{en ? "Response deadline" : "Svarfrist"}: {formatSchoolDay(activity.respond_by, locale)}</p>
        <p className="font-semibold">{response ? (response.consent === "declined" ? (en ? "Consent declined" : "Samtykke avslått") : response.going ? (en ? "Consented, attending" : "Samtykket, deltar") : (en ? "Consented, not attending" : "Samtykket, deltar ikke")) : (en ? "Awaiting guardian response" : "Venter på svar fra foresatt")}</p>
        {response ? <p className="text-sm text-muted-foreground">{response.guardian_name} · {formatSchoolDay(response.responded_at.slice(0, 10), locale)}</p> : null}
        {guardian && open ? <ActivityResponse activityId={activity.id} studentId={studentId} expected={activity.updated_at} consent={response?.consent} going={response?.going} locale={locale} /> : null}
        {activity.status === "published" && !open ? <p className="text-sm text-muted-foreground">{en ? "Responses closed" : "Svarfristen er utløpt"}</p> : null}
        {row.participation !== "unrecorded" ? <p>{row.participation === "participated" ? (en ? "Participated" : "Deltok") : (en ? "Absent" : "Fravær")}</p> : null}
        {earlier.length ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{en ? "Response history" : "Svarhistorikk"}</summary><ul className="grid gap-2">{earlier.map((item) => <li key={item.id} className="border-t pt-2"><p>{item.guardian_name} · {formatSchoolDay(item.responded_at.slice(0, 10), locale)}</p><p>{item.consent === "declined" ? (en ? "Consent declined" : "Samtykke avslått") : item.going ? (en ? "Consented, attending" : "Samtykket, deltar") : (en ? "Consented, not attending" : "Samtykket, deltar ikke")}</p></li>)}</ul></details> : null}
      </article>;
    })}
  </section>;
}

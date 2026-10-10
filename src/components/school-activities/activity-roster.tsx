import { createClient } from "@/lib/supabase/server";
import { osloToday } from "@/lib/dates";
import { formatSchoolDay } from "@/lib/portal/teacher-days";
import { ParticipationButtons } from "./participation-buttons";

export async function ActivityRoster({ activityId, eventDate, status, locale }: { activityId: string; eventDate: string; status: string; locale: string }) {
  const en = locale === "en";
  const client = await createClient();
  const [{ data: students, error }, { data: responses, error: responseError }] = await Promise.all([
    client.from("activity_students").select("student_id, student_name, participation, participation_at").eq("activity_id", activityId).order("student_name"),
    client.from("activity_responses").select("student_id, consent, going, guardian_name, responded_at").eq("activity_id", activityId),
  ]);
  if (error || responseError) throw new Error("Activity roster unavailable");
  const missing = students.filter((student) => !responses.some((response) => response.student_id === student.student_id)).length;
  const going = responses.filter((response) => response.consent === "granted" && response.going).length;
  return <section aria-label={en ? "Participation roster" : "Deltakerliste"} className="grid gap-4"><p className="font-semibold">{en ? `Attending: ${going} · Missing responses: ${missing}` : `Deltar: ${going} · Mangler svar: ${missing}`}</p>
    <ul className="grid gap-3">{students.map((student) => {
      const response = responses.find((item) => item.student_id === student.student_id);
      return <li key={student.student_id} className="grid gap-2 rounded-xl border p-4"><h2 className="font-heading text-xl font-semibold wrap-anywhere">{student.student_name}</h2>
        <p>{!response ? (en ? "Missing guardian response" : "Mangler svar fra foresatt") : response.consent === "declined" ? (en ? "Consent declined" : "Samtykke avslått") : response.going ? (en ? "Consented, attending" : "Samtykket, deltar") : (en ? "Consented, not attending" : "Samtykket, deltar ikke")}</p>
        {response ? <p className="text-sm text-muted-foreground">{response.guardian_name} · {formatSchoolDay(response.responded_at.slice(0, 10), locale)}</p> : null}
        <p>{student.participation === "participated" ? (en ? "Participated" : "Deltok") : student.participation === "absent" ? (en ? "Absent" : "Fravær") : (en ? "Participation not recorded" : "Deltakelse ikke registrert")}</p>
        {status === "published" && eventDate <= osloToday() && response?.consent === "granted" && response.going ? <ParticipationButtons activityId={activityId} studentId={student.student_id} participation={student.participation} locale={locale} /> : null}
      </li>;
    })}</ul>
  </section>;
}

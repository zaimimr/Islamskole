"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveActivity, changeActivity } from "@/lib/school-activities/actions";
import type { Database } from "@/lib/supabase/types";

type Activity = Database["public"]["Tables"]["school_activities"]["Row"];

export function ActivityEditor({ classId, yearId, initial }: { classId: string; yearId: string; initial?: Activity }) {
  const en = useLocale() === "en";
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const draftId = useRef<string | null>(initial?.id ?? null);
  const [activity, setActivity] = useState<Activity | null>(initial ?? null);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const suffix = initial?.id ?? classId;
  function save(review: boolean) {
    if (!form.current?.reportValidity()) return;
    const data = new FormData(form.current);
    draftId.current ??= crypto.randomUUID();
    start(async () => {
      const result = await saveActivity({ id: activity?.id ?? draftId.current!, classId, yearId, expected: activity?.updated_at ?? null,
        title: String(data.get("title")), description: String(data.get("description")), consent: String(data.get("consent")), date: String(data.get("date")), respondBy: String(data.get("respondBy")) });
      if (!result.ok) { setMessage(result.code === "22023" ? (en ? "Choose a future school Sunday and response deadline" : "Velg en kommende skolesøndag og svarfrist") : (en ? "Could not save. Reopen the draft." : "Kunne ikke lagre. Åpne utkastet på nytt.")); return; }
      setActivity(result.activity); setReviewing(review); setMessage(review ? "" : (en ? "Draft saved" : "Utkast lagret"));
    });
  }
  return <section aria-label={initial ? (en ? `Edit activity ${initial.title}` : `Rediger aktivitet ${initial.title}`) : (en ? "New activity" : "Ny aktivitet")} className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-6">
    <h3 className="font-heading text-xl font-semibold">{en ? "Activity draft" : "Aktivitetsutkast"}</h3>
    <form ref={form} className={reviewing ? "hidden" : "grid gap-3"} onSubmit={(event) => { event.preventDefault(); save(false); }}>
      <div className="grid gap-2"><Label htmlFor={`activity-title-${suffix}`}>{en ? "Title" : "Tittel"}</Label><Input id={`activity-title-${suffix}`} name="title" defaultValue={initial?.title} required maxLength={200} disabled={pending} /></div>
      <div className="grid gap-2"><Label htmlFor={`activity-description-${suffix}`}>{en ? "Activity details" : "Om aktiviteten"}</Label><Textarea id={`activity-description-${suffix}`} name="description" defaultValue={initial?.description} maxLength={4000} disabled={pending} /></div>
      <div className="grid gap-2"><Label htmlFor={`activity-consent-${suffix}`}>{en ? "Consent statement" : "Samtykketekst"}</Label><Textarea id={`activity-consent-${suffix}`} name="consent" defaultValue={initial?.consent_text} required maxLength={4000} disabled={pending} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor={`activity-date-${suffix}`}>{en ? "School Sunday" : "Skolesøndag"}</Label><Input id={`activity-date-${suffix}`} name="date" type="date" defaultValue={initial?.event_date} required disabled={pending} /></div><div className="grid gap-2"><Label htmlFor={`activity-deadline-${suffix}`}>{en ? "Response deadline" : "Svarfrist"}</Label><Input id={`activity-deadline-${suffix}`} name="respondBy" type="date" defaultValue={initial?.respond_by} required disabled={pending} /></div></div>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{en ? "Save draft" : "Lagre utkast"}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => save(true)}>{en ? "Review invitation" : "Se gjennom invitasjon"}</Button></div>
    </form>
    {reviewing && activity ? <div className="grid gap-3"><h4 className="font-heading text-xl font-semibold wrap-anywhere">{activity.title}</h4><p>{activity.event_date} · {en ? "Response deadline" : "Svarfrist"}: {activity.respond_by}</p><p className="whitespace-pre-line wrap-anywhere">{activity.description}</p><p className="font-semibold">{en ? "Consent statement" : "Samtykketekst"}</p><p className="whitespace-pre-line wrap-anywhere">{activity.consent_text}</p><p>{en ? "Publishing invites each child in this class and emails guardians." : "Publisering inviterer hvert barn i klassen og sender e-post til foresatte."}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => start(async () => { const result = await changeActivity({ id: activity.id, expected: activity.updated_at, action: "publish" }); if (!result.ok) { setMessage(en ? "Could not publish activity" : "Kunne ikke publisere aktiviteten"); return; } setReviewing(false); setActivity(null); draftId.current = null; form.current?.reset(); setMessage(en ? "Activity published" : "Aktivitet publisert"); router.refresh(); })}>{en ? "Publish invitation" : "Publiser invitasjon"}</Button><Button variant="outline" disabled={pending} onClick={() => setReviewing(false)}>{en ? "Back to draft" : "Tilbake til utkast"}</Button></div>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

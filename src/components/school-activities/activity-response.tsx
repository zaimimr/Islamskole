"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { respondActivity } from "@/lib/school-activities/actions";

type Health = { allergies: string | null; medicalNotes: string | null; editHref: string };

export function ActivityResponse({ activityId, studentId, expected, consent, going, locale, needsConsent = true, full = false, health = null }: {
  activityId: string; studentId: string; expected: string; consent?: string; going?: boolean; locale: string; needsConsent?: boolean; full?: boolean; health?: Health | null;
}) {
  const en = locale === "en";
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const choices = needsConsent ? [
    { consent: "granted", going: true, label: en ? "I consent, attending" : "Samtykker, deltar" },
    { consent: "granted", going: false, label: en ? "I consent, not attending" : "Samtykker, deltar ikke" },
    { consent: "declined", going: false, label: en ? "I do not consent" : "Samtykker ikke" },
  ] : [
    { consent: "granted", going: true, label: en ? "Attending" : "Deltar" },
    { consent: "granted", going: false, label: en ? "Not attending" : "Deltar ikke" },
  ];
  function send(choice: { consent: string; going: boolean }, healthConfirmed = false) {
    start(async () => {
      setMessage("");
      const result = await respondActivity({ requestId: crypto.randomUUID(), activityId, studentId, expected, consent: choice.consent, going: choice.going, healthConfirmed });
      if (!result.ok && result.code === "PT428") { setConfirming(true); return; }
      setMessage(result.ok ? (en ? "Response saved" : "Svar lagret") : result.code === "PT422" ? (en ? "The activity is full" : "Aktiviteten er full")
        : (en ? "Could not save. The response deadline may have passed." : "Kunne ikke lagre. Svarfristen kan ha gått ut."));
      if (result.ok) { setConfirming(false); router.refresh(); }
    });
  }
  const attend = choices[0];
  return <div className="grid gap-2">
    {full ? <p className="font-semibold">{en ? "Full" : "Fullt"}</p> : null}
    <div className="flex flex-wrap gap-2">{choices.map((choice) => <Button key={`${choice.consent}-${choice.going}`} variant={consent === choice.consent && going === choice.going ? "default" : "outline"}
      aria-pressed={consent === choice.consent && going === choice.going} disabled={pending || (full && choice.going)}
      onClick={() => choice.going && health ? setConfirming(true) : send(choice)}>{choice.label}</Button>)}</div>
    {confirming && health ? <div className="grid gap-2 rounded-xl border p-4">
      <p className="font-semibold">{en ? "Is this correct?" : "Stemmer dette?"}</p>
      <p>{en ? "Allergies" : "Allergier"}: {health.allergies || (en ? "None" : "Ingen")}</p>
      <p>{en ? "Medical notes" : "Medisinsk"}: {health.medicalNotes || (en ? "None" : "Ingen")}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => send(attend, true)}>{en ? "Yes, attending" : "Ja, deltar"}</Button>
        <Link href={health.editHref} className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold underline">{en ? "Edit" : "Endre"}</Link></div>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

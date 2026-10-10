"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondActivity } from "@/lib/school-activities/actions";

export function ActivityResponse({ activityId, studentId, expected, consent, going, locale }: {
  activityId: string; studentId: string; expected: string; consent?: string; going?: boolean; locale: string;
}) {
  const en = locale === "en";
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <div className="grid gap-2"><div className="flex flex-wrap gap-2">{[
    { consent: "granted", going: true, label: en ? "I consent, attending" : "Samtykker, deltar" },
    { consent: "granted", going: false, label: en ? "I consent, not attending" : "Samtykker, deltar ikke" },
    { consent: "declined", going: false, label: en ? "I do not consent" : "Samtykker ikke" },
  ].map((choice) => <Button key={`${choice.consent}-${choice.going}`} variant={consent === choice.consent && going === choice.going ? "default" : "outline"}
    aria-pressed={consent === choice.consent && going === choice.going} disabled={pending} onClick={() => start(async () => {
      setMessage("");
      const result = await respondActivity({ requestId: crypto.randomUUID(), activityId, studentId, expected, consent: choice.consent, going: choice.going });
      setMessage(result.ok ? (en ? "Response saved" : "Svar lagret") : (en ? "Could not save. The response deadline may have passed." : "Kunne ikke lagre. Svarfristen kan ha gått ut."));
      if (result.ok) router.refresh();
    })}>{choice.label}</Button>)}</div>{message ? <p role="status">{message}</p> : null}</div>;
}

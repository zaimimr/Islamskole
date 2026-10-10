"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markActivityParticipation } from "@/lib/school-activities/actions";

export function ParticipationButtons({ activityId, studentId, participation, locale }: { activityId: string; studentId: string; participation: string; locale: string }) {
  const en = locale === "en";
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <div className="grid gap-2 print:hidden"><div className="flex flex-wrap gap-2">{[
    ["participated", en ? "Participated" : "Deltok"], ["absent", en ? "Absent" : "Fravær"], ["unrecorded", en ? "Reset" : "Nullstill"],
  ].map(([value, label]) => <Button key={value} variant={participation === value ? "default" : "outline"} aria-pressed={participation === value} disabled={pending} onClick={() => start(async () => { const result = await markActivityParticipation({ activityId, studentId, participation: value }); setMessage(result.ok ? "" : (en ? "Could not record participation" : "Kunne ikke registrere deltakelse")); if (result.ok) router.refresh(); })}>{label}</Button>)}</div>{message ? <p role="status">{message}</p> : null}</div>;
}

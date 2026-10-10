"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { changeActivity } from "@/lib/school-activities/actions";

export function ActivityStaffActions({ activityId, expected }: { activityId: string; expected: string }) {
  const en = useLocale() === "en";
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  function change(action: "cancel" | "add_students") { start(async () => { const result = await changeActivity({ id: activityId, expected, action }); setMessage(result.ok ? (en ? "Activity updated" : "Aktivitet oppdatert") : (en ? "Could not update activity" : "Kunne ikke oppdatere aktiviteten")); if (result.ok) { setConfirming(false); router.refresh(); } }); }
  return <div className="grid gap-2 print:hidden"><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={pending} onClick={() => change("add_students")}>{en ? "Add current class students" : "Legg til nye elever i klassen"}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirming(true)}>{en ? "Cancel activity" : "Avlys aktivitet"}</Button></div>
    {confirming ? <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => change("cancel")}>{en ? "Cancel and email guardians" : "Avlys og send e-post til foresatte"}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>{en ? "Keep activity" : "Behold aktivitet"}</Button></div> : null}
    {message ? <p role="status">{message}</p> : null}</div>;
}

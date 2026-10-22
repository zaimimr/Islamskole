"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startActivityPayment } from "@/lib/sfo/actions";

export function ActivityPayButton({ activityId, studentId, amount, locale }: { activityId: string; studentId: string; amount: string; locale: string }) {
  const en = locale === "en";
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <div className="grid gap-2"><Button className="w-fit" disabled={pending} onClick={() => start(async () => {
    setMessage("");
    const result = await startActivityPayment({ activityId, studentIds: [studentId], locale: en ? "en" : "no" });
    if (result.ok) { window.location.assign(result.url); return; }
    setMessage(en ? "Could not start Vipps. Try again later." : "Kunne ikke starte Vipps. Prøv igjen senere.");
  })}>{en ? `Pay ${amount} with Vipps` : `Betal ${amount} med Vipps`}</Button>{message ? <p role="status">{message}</p> : null}</div>;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerActivityCash } from "@/lib/sfo/actions";

export function SfoCashForm({ activityId, students, defaultKroner, today }: { activityId: string; students: { id: string; name: string }[]; defaultKroner: string; today: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <form className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const target = event.currentTarget;
    start(async () => {
      const result = await registerActivityCash({ activityId, studentId: String(data.get("student")), amountOre: Math.round(Number(String(data.get("amount")).replace(",", ".")) * 100), date: String(data.get("date")) });
      setMessage(result.ok ? "Kontant registrert" : "Kunne ikke registrere");
      if (result.ok) { target.reset(); router.refresh(); }
    });
  }}>
    <div className="grid gap-2"><Label htmlFor="sfo-cash-student">Barn</Label>
      <select id="sfo-cash-student" name="student" required className="min-h-11 rounded-xl border border-input bg-white px-3 text-sm">{students.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></div>
    <div className="grid gap-2"><Label htmlFor="sfo-cash-amount">Beløp (kr)</Label><Input id="sfo-cash-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={defaultKroner} required /></div>
    <div className="grid gap-2"><Label htmlFor="sfo-cash-date">Dato</Label><Input id="sfo-cash-date" name="date" type="date" max={today} defaultValue={today} required /></div>
    <Button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-admin-action font-bold text-white hover:bg-[#245E2B]">Registrer kontant</Button>
    {message ? <p role="status" className="text-sm font-semibold sm:col-span-4">{message}</p> : null}
  </form>;
}

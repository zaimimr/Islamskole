"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSfoActivity } from "@/lib/sfo/actions";

type Refund = "full" | "amount" | "none";

export function SfoCancel({ activityId, expected, priced }: { activityId: string; expected: string; priced: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState<Refund>("full");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const refundOre = Math.round(Number(amount.replace(",", ".")) * 100);
  const invalid = priced && refund === "amount" && !(refundOre > 0);
  if (!open) return <Button variant="outline" className="min-h-11 w-fit rounded-xl" onClick={() => setOpen(true)}>Avlys aktivitet</Button>;
  return <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]">
    {priced ? <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold">Tilbakebetaling</legend>
      {([["full", "Full"], ["amount", "Beløp per barn"], ["none", "Ingen"]] as const).map(([value, label]) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="radio" name="refund" value={value} checked={refund === value} onChange={() => setRefund(value)} className="size-4 accent-[#3C8F44]" />{label}</label>)}
      {refund === "amount" ? <div className="grid max-w-xs gap-2"><Label htmlFor="sfo-refund-amount">Beløp (kr)</Label><Input id="sfo-refund-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div> : null}
    </fieldset> : null}
    <div className="flex flex-wrap gap-3">
      <Button className="min-h-11 rounded-xl bg-[#C2413B] font-bold text-white hover:bg-[#8B2F2B]" disabled={pending || invalid} onClick={() => start(async () => {
        const result = await cancelSfoActivity({ id: activityId, expected, refund: priced ? refund : null, refundOre: refund === "amount" ? refundOre : null });
        setMessage(result.ok ? "" : result.code === "PT409" ? "Aktiviteten er endret. Last siden på nytt." : "Kunne ikke avlyse.");
        if (result.ok) { setOpen(false); router.refresh(); }
      })}>Avlys og varsle påmeldte</Button>
      <Button variant="outline" className="min-h-11 rounded-xl" disabled={pending} onClick={() => setOpen(false)}>Behold</Button>
    </div>
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </div>;
}

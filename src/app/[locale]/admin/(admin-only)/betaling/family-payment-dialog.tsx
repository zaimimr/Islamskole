"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Split, Wallet } from "lucide-react";
import { registerFamilyPayment } from "./finance-actions";
import { formatNok, kronerToOre } from "@/lib/money";
import { osloToday } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type FamilyPaymentChild = {
  id: string;
  name: string;
  remainingOre: number;
};

function prefill(children: FamilyPaymentChild[], totalOre: number) {
  let left = totalOre;
  const shares = children.map((child) => {
    const share = Math.min(Math.max(child.remainingOre, 0), left);
    left -= share;
    return share;
  });
  if (left > 0 && shares.length > 0) shares[0] += left;
  return shares.map((share) => (share > 0 ? String(share / 100) : ""));
}

export function FamilyPaymentDialog({
  familyName,
  schoolYearId,
  familyChildren,
  triggerLabel = "Registrer betaling for familien",
}: {
  familyName: string;
  schoolYearId: string;
  familyChildren: FamilyPaymentChild[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const remainingTotal = familyChildren.reduce(
    (sum, child) => sum + Math.max(child.remainingOre, 0),
    0,
  );
  const [totalNok, setTotalNok] = useState(String(remainingTotal / 100));
  const [shares, setShares] = useState(() =>
    prefill(familyChildren, remainingTotal),
  );
  const [paidOn, setPaidOn] = useState(osloToday());
  const [method, setMethod] = useState("kontant");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setTotalNok(String(remainingTotal / 100));
    setShares(prefill(familyChildren, remainingTotal));
    setPaidOn(osloToday());
    setMethod("kontant");
    setPayerName("");
    setNote("");
  }

  const totalOre = kronerToOre(Number(totalNok) || 0);
  const allocatedOre = shares.reduce(
    (sum, value) => sum + kronerToOre(Number(value) || 0),
    0,
  );
  const restOre = totalOre - allocatedOre;
  const overpaidOre = familyChildren.reduce((sum, child, index) => {
    const share = kronerToOre(Number(shares[index]) || 0);
    return sum + Math.max(share - Math.max(child.remainingOre, 0), 0);
  }, 0);

  function changeTotal(value: string) {
    setTotalNok(value);
    setShares(prefill(familyChildren, kronerToOre(Number(value) || 0)));
  }

  function save() {
    const split = familyChildren
      .map((child, index) => ({
        studentId: child.id,
        amount: kronerToOre(Number(shares[index]) || 0),
      }))
      .filter((row) => row.amount > 0);

    startTransition(async () => {
      const result = await registerFamilyPayment({
        schoolYearId,
        familyName,
        paidOn,
        method: method as "kontant" | "bank" | "vipps" | "annet",
        payerName: payerName.trim() || undefined,
        note: note.trim() || undefined,
        split,
      });
      if (result.ok) {
        toast.success(`Betaling på ${formatNok(totalOre)} er registrert`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const canSave =
    !pending && totalOre > 0 && restOre === 0 && paidOn <= osloToday();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="min-h-11 rounded-xl px-3 font-bold"
          >
            <Wallet className="size-4" />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrer betaling for {familyName}</DialogTitle>
          <DialogDescription>
            Én betaling for hele familien, fordelt på barna. Beløpet er
            forhåndsutfylt med det familien har igjen å betale.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="family-payment-total">Beløp totalt (kr)</Label>
              <Input
                id="family-payment-total"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={totalNok}
                onChange={(event) => changeTotal(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="family-payment-date">Betalt dato</Label>
              <Input
                id="family-payment-date"
                type="date"
                max={osloToday()}
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="family-payment-method">Betalingsmåte</Label>
              <SelectField
                id="family-payment-method"
                value={method}
                onValueChange={setMethod}
                options={[
                  { value: "kontant", label: "Kontant" },
                  { value: "bank", label: "Bankoverføring" },
                  { value: "vipps", label: "Vipps (utenfor systemet)" },
                  { value: "annet", label: "Annet" },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="family-payment-payer">Betalt av (valgfritt)</Label>
              <Input
                id="family-payment-payer"
                value={payerName}
                onChange={(event) => setPayerName(event.target.value)}
                placeholder="Navn på den som betalte"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-bold">Fordeling på barn</legend>
            {familyChildren.map((child, index) => (
              <div
                key={child.id}
                className="grid grid-cols-[1fr_7.5rem] items-center gap-3 rounded-xl bg-[#FAF9F5] px-3 py-2 ring-1 ring-[#E8E3D9]"
              >
                <Label htmlFor={`family-share-${child.id}`} className="grid gap-0.5">
                  <span className="font-bold">{child.name}</span>
                  <span className="text-xs font-normal text-admin-muted">
                    {child.remainingOre > 0
                      ? `Gjenstår ${formatNok(child.remainingOre)}`
                      : "Ingenting igjen å betale"}
                  </span>
                </Label>
                <Input
                  id={`family-share-${child.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  aria-label={`Beløp for ${child.name} i kroner`}
                  value={shares[index] ?? ""}
                  onChange={(event) =>
                    setShares((current) =>
                      current.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                  className="h-11 rounded-xl text-right tabular-nums"
                />
              </div>
            ))}
          </fieldset>

          <div
            aria-live="polite"
            className={`flex gap-3 rounded-xl px-3 py-3 text-sm ring-1 ${
              restOre !== 0
                ? "bg-[#F9DEDB] text-[#8B2F2B] ring-[#E8B9B5]"
                : overpaidOre > 0
                  ? "bg-[#FFF8E9] text-[#6B5524] ring-[#E8D6AA]"
                  : "bg-[#F2F8F2] text-[#216A2B] ring-[#C9E0CB]"
            }`}
          >
            {restOre === 0 && overpaidOre === 0 ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Split aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            <p>
              <span className="block font-bold">
                Fordelt {formatNok(allocatedOre)} av {formatNok(totalOre)}
              </span>
              {restOre > 0 ? (
                <span className="mt-0.5 block">
                  Fordel {formatNok(restOre)} til før du lagrer.
                </span>
              ) : null}
              {restOre < 0 ? (
                <span className="mt-0.5 block">
                  Fordelingen er {formatNok(Math.abs(restOre))} for høy.
                </span>
              ) : null}
              {restOre === 0 && overpaidOre > 0 ? (
                <span className="mt-0.5 block">
                  {formatNok(overpaidOre)} er mer enn det som gjenstår og blir
                  registrert som overbetalt.
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="family-payment-note">Notat (valgfritt)</Label>
            <Input
              id="family-payment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For eksempel kvitteringsnummer"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Avbryt
          </Button>
          <Button type="button" onClick={save} disabled={!canSave}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Registrer {totalOre > 0 ? formatNok(totalOre) : "betaling"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

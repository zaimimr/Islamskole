"use client";

import { matchesSearch } from "@/lib/search";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Gift,
  HandHeart,
  Loader2,
  MoreHorizontal,
  Search,
  Undo2,
} from "lucide-react";
import {
  convertOverpaymentToGift,
  coverWithSadaqa,
  recordSadaqaGift,
  voidSadaqaGift,
} from "@/app/[locale]/admin/betaling/sadaqa/sadaqa-actions";
import { voidPayment } from "@/app/[locale]/admin/students-actions";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SadaqaChild = { id: string; name: string; remainingOre: number };
export type SadaqaFamily = { id: string; name: string; children: SadaqaChild[] };

const footerClass =
  "[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4";

function ReceiptCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#3C8F44]"
      />
      Send kvittering på e-post til foresatte
    </label>
  );
}

type Line = { checked: boolean; amount: string };

function initialLines(family: SadaqaFamily | null): Line[] {
  return (family?.children ?? []).map((child) => ({
    checked: child.remainingOre > 0,
    amount: child.remainingOre > 0 ? String(child.remainingOre / 100) : "",
  }));
}

export function SadaqaCoverDialog({
  schoolYearId,
  families,
  triggerLabel = "Dekk med sadaqa",
  triggerVariant = "outline",
}: {
  schoolYearId: string;
  families: SadaqaFamily[];
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const router = useRouter();
  const single = families.length === 1 ? families[0] : null;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<SadaqaFamily | null>(single);
  const [lines, setLines] = useState<Line[]>(() => initialLines(single));
  const [note, setNote] = useState("");
  const [sendReceipt, setSendReceipt] = useState(true);
  const [done, setDone] = useState<{
    totalOre: number;
    remainingOre: number;
  } | null>(null);

  function choose(next: SadaqaFamily | null) {
    setFamily(next);
    setLines(initialLines(next));
  }

  function reset() {
    setQuery("");
    choose(single);
    setNote("");
    setSendReceipt(true);
    setDone(null);
  }

  const children = family?.children ?? [];
  const selected = children
    .map((child, index) => ({
      child,
      checked: lines[index]?.checked ?? false,
      amountOre: kronerToOre(Number(lines[index]?.amount) || 0),
    }))
    .filter((line) => line.checked);
  const totalOre = selected.reduce((sum, line) => sum + line.amountOre, 0);
  const overLimit = selected.find(
    (line) => line.amountOre - line.child.remainingOre >= 100,
  );
  const remainingAfter = children.reduce((sum, child, index) => {
    const line = lines[index];
    const covered = line?.checked
      ? Math.min(kronerToOre(Number(line.amount) || 0), child.remainingOre)
      : 0;
    return sum + Math.max(child.remainingOre - covered, 0);
  }, 0);
  const canSave =
    !pending &&
    family != null &&
    selected.length > 0 &&
    selected.every((line) => line.amountOre > 0) &&
    !overLimit;

  const term = query.trim().toLocaleLowerCase("nb-NO");
  const matches = term
    ? families
        .filter((option) =>
          matchesSearch(query, [option.name, ...option.children.map((child) => child.name)].join(" ")),
        )
        .slice(0, 8)
    : families
        .filter((option) =>
          option.children.some((child) => child.remainingOre > 0),
        )
        .slice(0, 8);

  function save() {
    startTransition(async () => {
      const result = await coverWithSadaqa({
        schoolYearId,
        lines: selected.map((line) => ({
          studentId: line.child.id,
          amountOre: Math.min(line.amountOre, line.child.remainingOre),
        })),
        note: note.trim() || undefined,
        sendReceipt,
      });
      if (result.ok) {
        toast.success(`${formatNok(result.totalOre)} dekket med sadaqa`, {
          description: result.note,
        });
        setDone({
          totalOre: result.totalOre,
          remainingOre: remainingAfter,
        });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

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
            variant={triggerVariant}
            className="min-h-11 rounded-xl px-3 font-bold"
          >
            <HandHeart className="size-4" />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {family ? `Dekk med sadaqa for ${family.name}` : "Dekk med sadaqa"}
          </DialogTitle>
          <DialogDescription>
            Beløpet føres som betalt fra sadaqa-kontoen. Det er ikke en rabatt,
            og det vises i sadaqa-oversikten.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="grid gap-4 py-1">
            <div className="flex gap-3 rounded-xl bg-[#F2F8F2] px-3 py-3 text-sm text-[#216A2B] ring-1 ring-[#C9E0CB]">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>
                <span className="block font-bold">
                  {formatNok(done.totalOre)} er dekket med sadaqa
                </span>
                <span className="mt-0.5 block">
                  {done.remainingOre > 0
                    ? `Nå gjenstår ${formatNok(done.remainingOre)} å betale.`
                    : "Nå gjenstår ingenting å betale."}
                </span>
              </p>
            </div>
            <DialogFooter className={footerClass}>
              <Button type="button" onClick={() => setOpen(false)}>
                Lukk
              </Button>
            </DialogFooter>
          </div>
        ) : !family ? (
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sadaqa-family-search">Finn familie eller barn</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#3C8F44]"
                />
                <Input
                  id="sadaqa-family-search"
                  autoFocus
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Skriv navn"
                  className="h-11 rounded-xl pl-9"
                />
              </div>
            </div>
            <p className="text-xs font-bold text-admin-muted">
              {term ? "Treff" : "Familier med noe igjen å betale"}
            </p>
            {matches.length === 0 ? (
              <p className="rounded-xl bg-[#FAF9F5] px-3 py-3 text-sm text-admin-muted ring-1 ring-[#E8E3D9]">
                {term
                  ? "Ingen familie eller barn passer søket."
                  : "Ingen familier har noe igjen å betale."}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {matches.map((option) => {
                  const remaining = option.children.reduce(
                    (sum, child) => sum + Math.max(child.remainingOre, 0),
                    0,
                  );
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => choose(option)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-[#FAF9F5] px-3 py-2 text-left text-sm ring-1 ring-[#E8E3D9] outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold">
                            {option.name}
                          </span>
                          <span className="block truncate text-xs text-admin-muted">
                            {option.children.map((child) => child.name).join(", ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-admin-muted">
                          {remaining > 0
                            ? `Gjenstår ${formatNok(remaining)}`
                            : "Ferdig betalt"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid gap-4 py-1">
            {!single ? (
              <button
                type="button"
                onClick={() => choose(null)}
                className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-lg px-1 text-sm font-bold text-[#277A31] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Velg en annen familie
              </button>
            ) : null}

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">
                Hvem skal få støtte?
              </legend>
              {children.length === 0 ? (
                <p className="text-sm text-admin-muted">
                  Familien har ingen barn med krav dette skoleåret.
                </p>
              ) : null}
              {children.map((child, index) => {
                const line = lines[index];
                const amountOre = kronerToOre(Number(line?.amount) || 0);
                const tooMuch =
                  line?.checked && amountOre - child.remainingOre >= 100;
                return (
                  <div
                    key={child.id}
                    className="grid grid-cols-[auto_1fr_7.5rem] items-center gap-3 rounded-xl bg-[#FAF9F5] px-3 py-2 ring-1 ring-[#E8E3D9]"
                  >
                    <input
                      id={`sadaqa-child-${child.id}`}
                      type="checkbox"
                      checked={line?.checked ?? false}
                      disabled={child.remainingOre <= 0}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((value, i) =>
                            i === index
                              ? { ...value, checked: event.target.checked }
                              : value,
                          ),
                        )
                      }
                      className="size-4 accent-[#3C8F44]"
                    />
                    <Label
                      htmlFor={`sadaqa-child-${child.id}`}
                      className="grid gap-0.5"
                    >
                      <span className="font-bold">{child.name}</span>
                      <span
                        className={`text-xs font-normal ${tooMuch ? "text-[#8B2F2B]" : "text-admin-muted"}`}
                      >
                        {child.remainingOre > 0
                          ? tooMuch
                            ? `Maks ${formatNok(child.remainingOre)}`
                            : `Gjenstår ${formatNok(child.remainingOre)}`
                          : "Ingenting igjen å betale"}
                      </span>
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={child.remainingOre / 100}
                      step="1"
                      aria-label={`Sadaqa-støtte for ${child.name} i kroner`}
                      aria-invalid={tooMuch || undefined}
                      disabled={!line?.checked}
                      value={line?.amount ?? ""}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((value, i) =>
                            i === index
                              ? { ...value, amount: event.target.value }
                              : value,
                          ),
                        )
                      }
                      className="h-11 rounded-xl text-right tabular-nums"
                    />
                  </div>
                );
              })}
            </fieldset>

            <div className="grid gap-1.5">
              <Label htmlFor="sadaqa-cover-note">Notat (valgfritt)</Label>
              <Input
                id="sadaqa-cover-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For eksempel hvem som godkjente"
                className="h-11 rounded-xl"
              />
            </div>

            <ReceiptCheckbox
              id="sadaqa-cover-receipt"
              checked={sendReceipt}
              onChange={setSendReceipt}
            />

            <p aria-live="polite" className="text-sm text-admin-muted">
              {overLimit
                ? `Beløpet for ${overLimit.child.name} er høyere enn det som gjenstår.`
                : `Etterpå gjenstår ${formatNok(remainingAfter)} å betale.`}
            </p>

            <DialogFooter className={footerClass}>
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
                {totalOre > 0
                  ? `Dekk ${formatNok(totalOre)} med sadaqa`
                  : "Dekk med sadaqa"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SadaqaGiftDialog({
  schoolYearId,
  families = [],
  triggerVariant = "outline",
}: {
  schoolYearId?: string;
  families?: { id: string; name: string }[];
  triggerVariant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(osloToday());
  const [method, setMethod] = useState("vipps");
  const [donorName, setDonorName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setAmount("");
    setReceivedOn(osloToday());
    setMethod("vipps");
    setDonorName("");
    setFamilyId("");
    setNote("");
  }

  const amountOre = kronerToOre(Number(amount) || 0);
  const canSave = !pending && amountOre > 0 && receivedOn <= osloToday();

  function save() {
    startTransition(async () => {
      const result = await recordSadaqaGift({
        amountOre,
        receivedOn,
        method: method as "vipps" | "bank" | "kontant" | "annet",
        donorName: donorName.trim() || undefined,
        familyId: familyId || undefined,
        note: note.trim() || undefined,
        schoolYearId,
      });
      if (result.ok) {
        toast.success(`Sadaqa-gave på ${formatNok(amountOre)} er registrert`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

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
            variant={triggerVariant}
            className="min-h-11 rounded-xl px-3 font-bold"
          >
            <Gift className="size-4" />
            Registrer sadaqa-gave
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrer sadaqa-gave</DialogTitle>
          <DialogDescription>
            Penger som er gitt til sadaqa-kontoen. Gaven påvirker ikke noen
            families skolepenger.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="sadaqa-gift-amount" required>
              Beløp (kr)
            </Label>
            <Input
              id="sadaqa-gift-amount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sadaqa-gift-date" required>
              Mottatt dato
            </Label>
            <Input
              id="sadaqa-gift-date"
              type="date"
              max={osloToday()}
              value={receivedOn}
              onChange={(event) => setReceivedOn(event.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sadaqa-gift-method" required>
              Hvordan kom den inn?
            </Label>
            <SelectField
              id="sadaqa-gift-method"
              value={method}
              onValueChange={setMethod}
              options={[
                { value: "vipps", label: "Vipps" },
                { value: "bank", label: "Bank" },
                { value: "kontant", label: "Kontant" },
                { value: "annet", label: "Annet" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sadaqa-gift-donor">Fra (valgfritt)</Label>
            <Input
              id="sadaqa-gift-donor"
              value={donorName}
              onChange={(event) => setDonorName(event.target.value)}
              placeholder="Navn på giveren"
              className="h-11 rounded-xl"
            />
          </div>
          {families.length > 0 ? (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sadaqa-gift-family">Familie (valgfritt)</Label>
              <SelectField
                id="sadaqa-gift-family"
                value={familyId}
                onValueChange={setFamilyId}
                options={[
                  { value: "", label: "Ingen familie" },
                  ...families.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ]}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="sadaqa-gift-note">Notat (valgfritt)</Label>
            <Input
              id="sadaqa-gift-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className={footerClass}>
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
            {amountOre > 0
              ? `Registrer gave på ${formatNok(amountOre)}`
              : "Registrer gave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OverpaymentToGiftButton({
  studentId,
  schoolYearId,
  childName,
  excessOre,
  className,
}: {
  studentId: string;
  schoolYearId: string;
  childName: string;
  excessOre: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await convertOverpaymentToGift({
        studentId,
        schoolYearId,
      });
      if (result.ok) {
        toast.success(
          `${formatNok(result.amountOre)} er registrert som sadaqa-gave`,
          {
            description:
              result.leftOre > 0
                ? `${formatNok(result.leftOre)} kunne ikke gjøres om automatisk.`
                : undefined,
          },
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`min-h-11 rounded-xl px-3 font-bold ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        <Gift className="size-4" />
        Gjør overskudd til sadaqa-gave
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">
              Gjøre {formatNok(excessOre)} til sadaqa-gave?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {childName} har betalt {formatNok(excessOre)} mer enn kravet.
              Overskuddet tas ut av barnets innbetalinger og registreres som en
              sadaqa-gave fra familien. Barnet står fortsatt som ferdig betalt.
              Du kan angre på sadaqa-siden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={footerClass}>
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Gjør til sadaqa-gave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SadaqaUndoMenu({
  kind,
  id,
  title,
  description,
}: {
  kind: "support" | "gift";
  id: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result =
        kind === "support"
          ? await voidPayment(id, "Sadaqa-støtte angret")
          : await voidSadaqaGift(id);
      if (result.ok) {
        toast.success(
          kind === "support" ? "Sadaqa-støtten er angret" : "Gaven er angret",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Handlinger"
              className="text-admin-muted hover:text-foreground"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem
            variant="destructive"
            className="min-h-11"
            onClick={() => setOpen(true)}
          >
            <Undo2 aria-hidden="true" />
            Angre
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-2xl">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={footerClass}>
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Angre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

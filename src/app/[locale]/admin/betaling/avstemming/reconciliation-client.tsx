"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCheck,
  ChevronDown,
  HandHeart,
  Link2,
  Loader2,
  MoreHorizontal,
  Search,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
import {
  acceptSuggestions,
  bulkMapToSadaqa,
  findPaymentCandidates,
  ignoreTransaction,
  linkToPayment,
  mapToFamily,
  mapToSadaqa,
  undoMapping,
  type PaymentCandidate,
} from "./reconciliation-actions";
import { formatNok, kronerToOre } from "@/lib/money";
import { formatOsloDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
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

export type InboxTransaction = {
  id: string;
  source: "vipps" | "dnb";
  account: string;
  accountLabel: string;
  bookedOn: string;
  amount: number;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  message: string | null;
  reference: string | null;
  pspReference: string | null;
  externalId: string;
  status: string;
  suggestedStatus: string | null;
  suggestionReason: string | null;
  note: string | null;
  mappedBy: string | null;
  mappedAt: string | null;
  linkLabel: string | null;
  linkHref: string | null;
  outcome: string | null;
};

export type PickerChild = { id: string; name: string; remainingOre: number };
export type PickerFamily = {
  key: string;
  familyId: string | null;
  name: string;
  guardians: string[];
  children: PickerChild[];
};

const footerClass =
  "[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4";

const statusLabels: Record<string, string> = {
  ny: "Til behandling",
  matchet: "Koblet til betaling",
  sadaqa: "Sadaqa",
  familie: "Skolepenger",
  ignorert: "Ignorert",
};

const statusTone: Record<string, string> = {
  ny: "bg-[#FEEDCA] text-[#775108]",
  matchet: "bg-[#DCEDDD] text-[#216A2B]",
  sadaqa: "bg-[#E4EEF9] text-[#24507A]",
  familie: "bg-[#DCEDDD] text-[#216A2B]",
  ignorert: "bg-[#F0F0ED] text-[#4E5550]",
};

function Detail({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-admin-muted">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

const outcomeIcon: Record<string, typeof Link2> = {
  matchet: Link2,
  sadaqa: HandHeart,
  familie: Users,
  ignorert: Ban,
};

type DialogState =
  | { kind: "sadaqa"; transaction: InboxTransaction }
  | { kind: "family"; transaction: InboxTransaction }
  | { kind: "link"; transaction: InboxTransaction }
  | { kind: "ignore"; transaction: InboxTransaction }
  | { kind: "undo"; transaction: InboxTransaction }
  | null;

function payerLabel(row: InboxTransaction) {
  return row.counterpartyName || (row.source === "dnb" ? "Bankoverføring" : "Ukjent betaler");
}

export function TransactionInbox({
  transactions,
  families,
  giftFamilies,
  schoolYearId,
  schoolYearLabel,
  emptyKind,
}: {
  transactions: InboxTransaction[];
  families: PickerFamily[];
  giftFamilies: { id: string; name: string }[];
  schoolYearId: string | null;
  schoolYearLabel: string | null;
  emptyKind: "done" | "filtered";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [bulkPending, startBulk] = useTransition();
  const [quickPending, startQuick] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const open = transactions.filter((row) => row.status === "ny");
  const selectedRows = open.filter((row) => selected.has(row.id));
  const withSuggestion = selectedRows.filter(
    (row) => row.suggestedStatus === "sadaqa" || row.suggestedStatus === "ignorert",
  );
  const incoming = selectedRows.filter((row) => row.amount > 0);
  const allSelected = open.length > 0 && selectedRows.length === open.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(open.map((row) => row.id)));
  }

  function toggleDetails(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(kind: "suggestions" | "sadaqa") {
    const ids = (kind === "suggestions" ? withSuggestion : incoming).map((row) => row.id);
    startBulk(async () => {
      const result =
        kind === "suggestions" ? await acceptSuggestions(ids) : await bulkMapToSadaqa(ids);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.failed.length > 0) {
        toast.warning(`${result.done} behandlet, ${result.failed.length} feilet`, {
          description: result.failed[0],
        });
      } else {
        toast.success(`${result.done} transaksjoner behandlet`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function acceptOne(row: InboxTransaction) {
    startQuick(async () => {
      const result = await acceptSuggestions([row.id]);
      if (!result.ok) toast.error(result.error);
      else if (result.failed.length > 0) toast.error(result.failed[0]);
      else toast.success("Forslaget er godtatt");
      router.refresh();
    });
  }

  if (transactions.length === 0) {
    return emptyKind === "done" ? (
      <div className="grid justify-items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#E3DED3]">
        <span className="grid size-12 place-items-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
          <CheckCheck aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-3 font-heading text-xl font-bold">Alt er avstemt</p>
      </div>
    ) : (
      <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#E3DED3]">
        <p className="font-heading text-lg font-semibold">Ingen transaksjoner her</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {selectedRows.length > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-[#1F2A22] px-4 py-2.5 text-white shadow-[0_10px_30px_-12px_rgb(9_13_19/0.45)]">
          <p className="mr-auto text-sm">
            <span className="font-bold">{selectedRows.length} valgt</span>
            <span className="text-white/75">
              {" "}
              · {formatNok(selectedRows.reduce((sum, row) => sum + row.amount, 0))}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="min-h-10 rounded-xl px-3 font-bold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Fjern valg
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={bulkPending || withSuggestion.length === 0}
            onClick={() => runBulk("suggestions")}
            className="min-h-10 rounded-xl border-white/25 bg-transparent px-3 font-bold text-white hover:bg-white/10 hover:text-white"
          >
            <Sparkles aria-hidden="true" className="size-4" />
            Godta forslag ({withSuggestion.length})
          </Button>
          <Button
            type="button"
            disabled={bulkPending || incoming.length === 0}
            onClick={() => runBulk("sadaqa")}
            className="min-h-10 rounded-xl bg-white px-3 font-bold text-[#1F2A22] hover:bg-white/90"
          >
            {bulkPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <HandHeart aria-hidden="true" className="size-4" />
            )}
            Før som sadaqa ({incoming.length})
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        {open.length > 0 ? (
          <div className="flex min-h-11 items-center gap-3 border-b border-[#ECE8DF] bg-[#FAF9F5] px-4 text-sm sm:px-5">
            <input
              id="select-all"
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 accent-[#3C8F44]"
            />
            <label htmlFor="select-all" className="font-semibold text-admin-muted">
              Velg alle
            </label>
          </div>
        ) : null}
        <ul className="divide-y divide-[#ECE8DF]">
          {transactions.map((row) => {
            const isOpen = row.status === "ny";
            const showDetails = expanded.has(row.id);
            const isSelected = selected.has(row.id);
            const canSuggest =
              isOpen && row.suggestedStatus && (row.suggestedStatus !== "sadaqa" || row.amount > 0);
            const OutcomeIcon = outcomeIcon[row.status];
            const actions = canSuggest ? (
              <Button
                type="button"
                variant="outline"
                disabled={quickPending}
                onClick={() => acceptOne(row)}
                title={row.suggestionReason ?? undefined}
                className="min-h-10 rounded-xl border-[#D9CBEE] bg-[#F7F2FC] px-3 font-bold text-[#4A2F72] hover:bg-[#EFE6F9]"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {row.suggestedStatus === "sadaqa" ? "Før som sadaqa" : "Ignorer"}
              </Button>
            ) : isOpen && row.amount > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!schoolYearId}
                  onClick={() => setDialog({ kind: "family", transaction: row })}
                  className="min-h-10 rounded-xl px-3 font-bold"
                >
                  <Users aria-hidden="true" className="size-4" />
                  Skolepenger
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialog({ kind: "sadaqa", transaction: row })}
                  className="min-h-10 rounded-xl px-3 font-bold"
                >
                  <HandHeart aria-hidden="true" className="size-4" />
                  Sadaqa
                </Button>
              </>
            ) : !isOpen && row.outcome ? (
              <a
                href={row.linkHref ?? undefined}
                title={statusLabels[row.status]}
                className={cn(
                  "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  statusTone[row.status] ?? statusTone.ignorert,
                  row.linkHref && "hover:underline underline-offset-2",
                )}
              >
                {OutcomeIcon ? <OutcomeIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
                <span className="truncate">{row.outcome}</span>
              </a>
            ) : null;
            return (
              <li key={row.id} className={cn("transition-colors", isSelected && "bg-[#F2F8F2]")}>
                <div className="flex items-start gap-3 px-4 py-3 sm:px-5 lg:items-center">
                  {isOpen ? (
                    <input
                      type="checkbox"
                      aria-label={`Velg ${formatNok(row.amount)} fra ${payerLabel(row)}`}
                      checked={isSelected}
                      onChange={() => toggle(row.id)}
                      className="mt-1 size-4 shrink-0 accent-[#3C8F44] lg:mt-0"
                    />
                  ) : open.length > 0 ? (
                    <span aria-hidden="true" className="size-4 shrink-0" />
                  ) : null}
                  <span className="hidden w-16 shrink-0 text-sm font-semibold whitespace-nowrap text-admin-muted tabular-nums lg:block">
                    {formatOsloDate(row.bookedOn, { day: "numeric", month: "short" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleDetails(row.id)}
                    aria-expanded={showDetails}
                    className="group/row min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold group-hover/row:underline group-hover/row:underline-offset-2">
                        {payerLabel(row)}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0 text-admin-muted transition-transform",
                          showDetails && "rotate-180",
                        )}
                      />
                    </span>
                    {row.message && row.message !== row.counterpartyName ? (
                      <span className="block text-sm break-words lg:truncate">{row.message}</span>
                    ) : null}
                    <span className="block truncate text-xs text-admin-muted">
                      <span className="lg:hidden">
                        {formatOsloDate(row.bookedOn, { day: "numeric", month: "short" })} ·{" "}
                      </span>
                      {row.accountLabel}
                    </span>
                  </button>
                  <div className="hidden w-[17.5rem] shrink-0 items-center justify-end gap-1.5 lg:flex">
                    {actions}
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-right font-heading text-lg font-bold whitespace-nowrap tabular-nums lg:w-28",
                      row.amount < 0 && "text-[#8B2F2B]",
                    )}
                  >
                    {formatNok(row.amount)}
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Flere valg for ${formatNok(row.amount)} fra ${payerLabel(row)}`}
                          className="-my-1 size-10 shrink-0 rounded-xl text-admin-muted hover:text-foreground"
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" className="size-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto min-w-56">
                      {isOpen && row.amount > 0 && canSuggest ? (
                        <>
                          <DropdownMenuItem
                            disabled={!schoolYearId}
                            onClick={() => setDialog({ kind: "family", transaction: row })}
                          >
                            <Users className="size-4" />
                            Før som skolepenger
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDialog({ kind: "sadaqa", transaction: row })}>
                            <HandHeart className="size-4" />
                            Før som sadaqa
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {isOpen ? (
                        <>
                          <DropdownMenuItem onClick={() => setDialog({ kind: "link", transaction: row })}>
                            <Link2 className="size-4" />
                            Koble til eksisterende betaling
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDialog({ kind: "ignore", transaction: row })}>
                            <Ban className="size-4" />
                            Ignorer
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDialog({ kind: "undo", transaction: row })}
                        >
                          <Undo2 className="size-4" />
                          Angre behandling
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {actions ? (
                  <div className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-3 pl-11 sm:px-5 sm:pl-12 lg:hidden">
                    {actions}
                  </div>
                ) : null}
                {showDetails ? (
                  <dl className="mx-4 mb-4 grid gap-x-6 gap-y-3 rounded-xl bg-[#FAF9F5] p-4 ring-1 ring-[#E8E3D9] sm:mx-5 sm:grid-cols-2 lg:ml-[7.75rem] lg:grid-cols-3">
                    <Detail label="Dato" value={formatOsloDate(row.bookedOn)} />
                    <Detail label="Beløp" value={formatNok(row.amount)} />
                    <Detail label="Betaler" value={row.counterpartyName} />
                    <Detail label="Telefon" value={row.counterpartyPhone} />
                    <Detail label="Melding" value={row.message} />
                    <Detail label="Konto" value={row.accountLabel} />
                    <Detail label="Status" value={statusLabels[row.status] ?? row.status} />
                    <Detail
                      label="Ført som"
                      value={
                        row.linkLabel ? (
                          row.linkHref ? (
                            <a
                              href={row.linkHref}
                              className="font-semibold text-[#277A31] underline-offset-2 hover:underline"
                            >
                              {row.linkLabel}
                            </a>
                          ) : (
                            row.linkLabel
                          )
                        ) : null
                      }
                    />
                    <Detail label="Notat" value={row.note} />
                    <Detail label="Forslag" value={row.suggestionReason} />
                    <Detail label="Behandlet av" value={row.mappedBy} />
                    <Detail label="Behandlet" value={row.mappedAt ? formatOsloDate(row.mappedAt) : null} />
                    <Detail label="Ordre-ID" value={row.reference ? <span className="break-all">{row.reference}</span> : null} />
                    <Detail label="Transaksjons-ID" value={row.pspReference ? <span className="break-all">{row.pspReference}</span> : null} />
                    <Detail label="Ekstern ID" value={<span className="break-all">{row.externalId}</span>} />
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {dialog?.kind === "sadaqa" ? (
        <SadaqaMapDialog
          transaction={dialog.transaction}
          families={giftFamilies}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "family" && schoolYearId ? (
        <FamilyMapDialog
          transaction={dialog.transaction}
          families={families}
          schoolYearId={schoolYearId}
          schoolYearLabel={schoolYearLabel}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "link" ? (
        <LinkPaymentDialog transaction={dialog.transaction} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "ignore" ? (
        <IgnoreDialog transaction={dialog.transaction} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "undo" ? (
        <UndoDialog transaction={dialog.transaction} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function useAction(onClose: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(message);
        onClose();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }
  return { pending, run };
}

function TransactionSummary({ transaction }: { transaction: InboxTransaction }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-[#FAF9F5] px-4 py-3 ring-1 ring-[#E8E3D9]">
      <div className="min-w-0">
        <p className="font-bold break-words">{transaction.counterpartyName ?? "Ukjent betaler"}</p>
        {transaction.message && transaction.message !== transaction.counterpartyName ? (
          <p className="text-sm break-words">{transaction.message}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-admin-muted">
          {formatOsloDate(transaction.bookedOn)} · {transaction.accountLabel}
        </p>
      </div>
      <p className="shrink-0 font-heading text-xl font-bold tabular-nums">
        {formatNok(transaction.amount)}
      </p>
    </div>
  );
}

const dialogShell = "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0";
const dialogHead = "border-b border-[#ECE8DF] px-5 pt-5 pb-4 pr-12 sm:px-6";
const dialogBody = "grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-4 sm:px-6";
const dialogFoot = cn(footerClass, "mx-0 mb-0 shrink-0 px-5 sm:px-6");

function SadaqaMapDialog({
  transaction,
  families,
  onClose,
}: {
  transaction: InboxTransaction;
  families: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { pending, run } = useAction(onClose);
  const [donorName, setDonorName] = useState(transaction.counterpartyName ?? "");
  const [familyId, setFamilyId] = useState("");
  const [note, setNote] = useState("");

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className={cn(dialogShell, "sm:max-w-lg")}>
        <DialogHeader className={dialogHead}>
          <DialogTitle className="text-xl font-bold">Før som sadaqa-gave</DialogTitle>
          <DialogDescription>
            Beløpet registreres som en gave i sadaqa-oversikten.
          </DialogDescription>
        </DialogHeader>
        <div className={dialogBody}>
          <TransactionSummary transaction={transaction} />
          <div className="grid gap-1.5">
            <Label htmlFor="map-sadaqa-donor">Fra</Label>
            <Input
              id="map-sadaqa-donor"
              value={donorName}
              onChange={(event) => setDonorName(event.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          {families.length > 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="map-sadaqa-family">Familie (valgfritt)</Label>
              <SelectField
                id="map-sadaqa-family"
                value={familyId}
                onValueChange={setFamilyId}
                options={[
                  { value: "", label: "Ingen familie" },
                  ...families.map((option) => ({ value: option.id, label: option.name })),
                ]}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="map-sadaqa-note">Notat (valgfritt)</Label>
            <Input
              id="map-sadaqa-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className={dialogFoot}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  mapToSadaqa({
                    id: transaction.id,
                    donorName: donorName.trim() || undefined,
                    familyId: familyId || undefined,
                    note: note.trim() || undefined,
                  }),
                `${formatNok(transaction.amount)} er ført som sadaqa`,
              )
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Før som sadaqa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function prefillShares(children: PickerChild[], totalOre: number): string[] {
  let left = totalOre;
  const shares = children.map((child) => {
    const share = Math.min(Math.max(child.remainingOre, 0), left);
    left -= share;
    return share;
  });
  if (left > 0 && shares.length > 0) shares[0] += left;
  return shares.map((share) => (share > 0 ? String(share / 100) : ""));
}

function words(value: string | null | undefined): string[] {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("nb-NO")
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 2);
}

type ScoredFamily = { family: PickerFamily; score: number; reasons: string[]; remaining: number };

function scoreFamily(family: PickerFamily, transaction: InboxTransaction): ScoredFamily {
  const payer = new Set(words(transaction.counterpartyName));
  const message = new Set(words(transaction.message));
  const reasons: string[] = [];
  let score = 0;

  const guardian = family.guardians.find(
    (name) => words(name).filter((word) => payer.has(word)).length >= 2,
  );
  if (guardian) {
    score += 10;
    reasons.push(`${guardian} er foresatt`);
  } else if (
    [...family.guardians, ...family.children.map((child) => child.name)].some((name) =>
      words(name).slice(1).some((word) => payer.has(word)),
    )
  ) {
    score += 3;
    reasons.push("Samme etternavn som betaleren");
  }

  const mentioned = family.children.filter((child) => {
    const [first] = words(child.name);
    return first ? message.has(first) : false;
  });
  if (mentioned.length > 0) {
    score += 4 * mentioned.length;
    reasons.push(`Meldingen nevner ${mentioned.map((child) => child.name.split(" ")[0]).join(", ")}`);
  }

  const remaining = family.children.reduce((sum, child) => sum + Math.max(child.remainingOre, 0), 0);
  if (score > 0 && remaining === transaction.amount) {
    score += 2;
    reasons.push("Beløpet er nøyaktig det som gjenstår");
  }
  return { family, score, reasons, remaining };
}

function FamilyOption({
entry,
highlight,
onChoose,
}: {
entry: ScoredFamily;
highlight?: boolean;
onChoose: (family: PickerFamily) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(entry.family)}
        className={cn(
          "grid w-full gap-1 rounded-xl px-4 py-3 text-left text-sm ring-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4",
          highlight
            ? "bg-[#F2F8F2] ring-[#C9E0CB] hover:bg-[#E7F2E8]"
            : "bg-white ring-[#E8E3D9] hover:bg-[#FAF9F5]",
        )}
      >
        <span className="min-w-0">
          <span className="block font-bold">{entry.family.name}</span>
          <span className="block text-admin-muted">
            {entry.family.children.map((child) => child.name).join(", ")}
          </span>
          {entry.family.guardians.length > 0 ? (
            <span className="block text-xs text-admin-muted">
              Foresatte: {entry.family.guardians.join(", ")}
            </span>
          ) : null}
          {highlight && entry.reasons.length > 0 ? (
            <span className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-[#216A2B]">
              <Sparkles aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {entry.reasons.join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-bold whitespace-nowrap tabular-nums sm:text-right">
          {entry.remaining > 0 ? (
            <>
              <span className="font-normal text-admin-muted">Gjenstår </span>
              {formatNok(entry.remaining)}
            </>
          ) : (
            <span className="text-[#216A2B]">Ferdig betalt</span>
          )}
        </span>
      </button>
    </li>
  );
}

function FamilyMapDialog({
  transaction,
  families,
  schoolYearId,
  schoolYearLabel,
  onClose,
}: {
  transaction: InboxTransaction;
  families: PickerFamily[];
  schoolYearId: string;
  schoolYearLabel: string | null;
  onClose: () => void;
}) {
  const { pending, run } = useAction(onClose);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<PickerFamily | null>(null);
  const [shares, setShares] = useState<string[]>([]);
  const [showOthers, setShowOthers] = useState(false);

  function choose(next: PickerFamily | null) {
    setFamily(next);
    setShares(next ? prefillShares(next.children, transaction.amount) : []);
  }

  const scored = families
    .map((option) => scoreFamily(option, transaction))
    .sort((a, b) => b.score - a.score || b.remaining - a.remaining);
  const suggested = scored.filter((entry) => entry.score >= 4).slice(0, 3);
  const term = words(query);
  const matches = term.length
    ? scored
        .filter((entry) => {
          const haystack = words(
            [entry.family.name, ...entry.family.guardians, ...entry.family.children.map((child) => child.name)].join(" "),
          );
          return term.every((part) => haystack.some((word) => word.startsWith(part)));
        })
        .slice(0, 30)
    : scored.filter((entry) => entry.remaining > 0 && !suggested.includes(entry));

  const children = family?.children ?? [];
  const allocated = shares.reduce((sum, value) => sum + kronerToOre(Number(value) || 0), 0);
  const rest = transaction.amount - allocated;

  function save() {
    if (!family) return;
    const split = children
      .map((child, index) => ({ studentId: child.id, amount: kronerToOre(Number(shares[index]) || 0) }))
      .filter((line) => line.amount > 0);
    run(
      () =>
        mapToFamily({
          id: transaction.id,
          schoolYearId,
          familyId: family.familyId,
          familyName: family.name.replace(/^Familien\s+/, ""),
          split,
        }),
      `${formatNok(transaction.amount)} er ført som skolepenger for ${family.name}`,
    );
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className={cn(dialogShell, "sm:max-w-2xl")}>
        <DialogHeader className={dialogHead}>
          <DialogTitle className="text-xl font-bold">
            {family ? `Skolepenger for ${family.name}` : "Hvilken familie har betalt?"}
          </DialogTitle>
          {schoolYearLabel ? <DialogDescription>Skoleår {schoolYearLabel}</DialogDescription> : null}
        </DialogHeader>
        <div className={dialogBody}>
          <TransactionSummary transaction={transaction} />
          {!family ? (
            <>
              <div className="relative">
                <Label htmlFor="map-family-search" className="sr-only">
                  Søk etter familie, barn eller foresatt
                </Label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#3C8F44]"
                />
                <Input
                  id="map-family-search"
                  autoFocus
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Søk etter familie, barn eller foresatt"
                  className="h-12 rounded-xl pl-10 text-base"
                />
              </div>
              {!term.length && suggested.length > 0 ? (
                <section aria-labelledby="family-suggested" className="grid gap-2">
                  <h3 id="family-suggested" className="text-xs font-bold text-admin-muted">
                    Mest sannsynlig
                  </h3>
                  <ul className="grid gap-2">
                    {suggested.map((entry) => (
                      <FamilyOption key={entry.family.key} entry={entry} highlight onChoose={choose} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {!term.length && suggested.length > 0 && !showOthers ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowOthers(true)}
                  className="min-h-11 justify-self-start rounded-xl px-2 font-bold text-[#277A31]"
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                  Andre familier med utestående ({matches.length})
                </Button>
              ) : (
              <section aria-labelledby="family-all" className="grid gap-2">
                <h3 id="family-all" className="text-xs font-bold text-admin-muted">
                  {term.length
                    ? `${matches.length} treff`
                    : suggested.length > 0
                      ? "Andre familier med utestående"
                      : "Familier med utestående"}
                </h3>
                {matches.length === 0 ? (
                  <p className="rounded-xl bg-[#FAF9F5] px-4 py-3 text-sm text-admin-muted ring-1 ring-[#E8E3D9]">
                    Ingen familie, barn eller foresatt passer «{query.trim()}».
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {matches.map((entry) => (
                      <FamilyOption
                        key={entry.family.key}
                        entry={entry}
                        highlight={term.length > 0 && entry.score >= 4}
                        onChoose={choose}
                      />
                    ))}
                  </ul>
                )}
              </section>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => choose(null)}
                className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-lg px-1 text-sm font-bold text-[#277A31] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Velg en annen familie
              </button>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-bold">Fordeling på barn</legend>
                {children.map((child, index) => (
                  <div
                    key={child.id}
                    className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-xl bg-white px-4 py-2.5 ring-1 ring-[#E8E3D9]"
                  >
                    <Label htmlFor={`map-share-${child.id}`} className="grid gap-0.5">
                      <span className="font-bold">{child.name}</span>
                      <span className="text-xs font-normal text-admin-muted">
                        {child.remainingOre > 0
                          ? `Gjenstår ${formatNok(child.remainingOre)}`
                          : "Ingenting igjen å betale"}
                      </span>
                    </Label>
                    <div className="relative">
                      <Input
                        id={`map-share-${child.id}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={shares[index] ?? ""}
                        onChange={(event) =>
                          setShares((current) =>
                            current.map((value, i) => (i === index ? event.target.value : value)),
                          )
                        }
                        className="h-11 rounded-xl pr-9 text-right tabular-nums"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-admin-muted"
                      >
                        kr
                      </span>
                    </div>
                  </div>
                ))}
              </fieldset>
              <p
                aria-live="polite"
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-semibold ring-1",
                  rest === 0
                    ? "bg-[#F2F8F2] text-[#216A2B] ring-[#C9E0CB]"
                    : "bg-[#FFF8E9] text-[#775108] ring-[#EFDDB4]",
                )}
              >
                {rest === 0
                  ? `Hele ${formatNok(transaction.amount)} er fordelt.`
                  : rest > 0
                    ? `Fordel ${formatNok(rest)} til før du kan registrere.`
                    : `${formatNok(Math.abs(rest))} for mye er fordelt.`}
              </p>
            </>
          )}
        </div>
        <DialogFooter className={dialogFoot}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Avbryt
          </Button>
          <Button type="button" onClick={save} disabled={pending || !family || rest !== 0}>
            {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {family ? `Registrer ${formatNok(transaction.amount)}` : "Velg en familie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkPaymentDialog({
  transaction,
  onClose,
}: {
  transaction: InboxTransaction;
  onClose: () => void;
}) {
  const { pending, run } = useAction(onClose);
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PaymentCandidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    findPaymentCandidates({ id: transaction.id }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCandidates(result.candidates);
      } else {
        setCandidates([]);
        toast.error(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [transaction.id]);

  function search(term: string) {
    startSearch(async () => {
      const result = await findPaymentCandidates({ id: transaction.id, query: term || undefined });
      if (result.ok) setCandidates(result.candidates);
      else toast.error(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className={cn(dialogShell, "sm:max-w-xl")}>
        <DialogHeader className={dialogHead}>
          <DialogTitle className="text-xl font-bold">Koble til eksisterende betaling</DialogTitle>
          <DialogDescription>
            Bruk dette når betalingen allerede er registrert i systemet. Ingenting
            nytt blir ført.
          </DialogDescription>
        </DialogHeader>
        <div className={dialogBody}>
          <TransactionSummary transaction={transaction} />
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              search(query.trim());
            }}
          >
            <Input
              aria-label="Søk på navn eller referanse"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk på navn eller referanse"
              className="h-11 rounded-xl"
            />
            <Button type="submit" variant="outline" disabled={searching} className="min-h-11 rounded-xl">
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Søk
            </Button>
          </form>
          <p className="text-xs font-bold text-admin-muted">
            {query.trim() ? "Treff" : "Samme beløp innen ti dager"}
          </p>
          {candidates === null ? (
            <p className="text-sm text-admin-muted">Leter …</p>
          ) : candidates.length === 0 ? (
            <p className="rounded-xl bg-[#FAF9F5] px-3 py-3 text-sm text-admin-muted ring-1 ring-[#E8E3D9]">
              Fant ingen ledige betalinger.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => linkToPayment({ id: transaction.id, paymentId: candidate.id }),
                        "Transaksjonen er koblet til betalingen",
                      )
                    }
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-[#FAF9F5] px-3 py-2 text-left text-sm ring-1 ring-[#E8E3D9] outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">
                        {candidate.payerName || candidate.description || candidate.reference}
                      </span>
                      <span className="block truncate text-xs text-admin-muted">
                        {candidate.paidAt ? formatOsloDate(candidate.paidAt) : "Uten dato"} ·{" "}
                        {candidate.reference}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatNok(candidate.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className={dialogFoot}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IgnoreDialog({
  transaction,
  onClose,
}: {
  transaction: InboxTransaction;
  onClose: () => void;
}) {
  const { pending, run } = useAction(onClose);
  const [reason, setReason] = useState(transaction.suggestionReason ?? "");

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className={cn(dialogShell, "sm:max-w-lg")}>
        <DialogHeader className={dialogHead}>
          <DialogTitle className="text-xl font-bold">Ignorer transaksjonen</DialogTitle>
          <DialogDescription>
            Den teller ikke som sadaqa eller skolepenger. Du kan angre senere.
          </DialogDescription>
        </DialogHeader>
        <div className={dialogBody}>
          <TransactionSummary transaction={transaction} />
          <div className="grid gap-1.5">
            <Label htmlFor="ignore-reason" required>
              Hvorfor?
            </Label>
            <Input
              id="ignore-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For eksempel utbetaling fra Vipps"
              className="h-11 rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className={dialogFoot}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(
                () => ignoreTransaction({ id: transaction.id, reason: reason.trim() }),
                "Transaksjonen er ignorert",
              )
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Ignorer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UndoDialog({
  transaction,
  onClose,
}: {
  transaction: InboxTransaction;
  onClose: () => void;
}) {
  const { pending, run } = useAction(onClose);
  const description =
    transaction.status === "sadaqa"
      ? "Sadaqa-gaven annulleres og transaksjonen legges tilbake til behandling."
      : transaction.status === "familie"
        ? "Betalingen som ble registrert annulleres, så familien står med det samme utestående som før."
        : "Transaksjonen legges tilbake til behandling. Ingen betalinger endres.";

  return (
    <AlertDialog open onOpenChange={(next) => (next ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-2xl">
            Angre behandlingen av {formatNok(transaction.amount)}?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={footerClass}>
          <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => run(() => undoMapping(transaction.id), "Behandlingen er angret")}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Angre
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

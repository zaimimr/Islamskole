"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Copy, Loader2, MoreHorizontal, Send } from "lucide-react";
import {
  loadRequestRecipients,
  previewPaymentRequests,
  resendRequest,
  sendPaymentRequest,
  sendPaymentRequests,
  setFamilyRequestsPaused,
  type BulkItem,
  type BulkMode,
  type RequestActionResult,
} from "@/app/[locale]/admin/payment-request-actions";
import { sendInstallmentNow } from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import {
  FamilyPaymentDialog,
  type FamilyPaymentChild,
} from "@/app/[locale]/admin/(admin-only)/betaling/family-payment-dialog";
import { SadaqaCoverDialog, type SadaqaFamily } from "@/components/admin/sadaqa";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/admin/status-pill";
import {
  defaultRequestDueDate,
  describeRequest,
  shortDate,
  type BalanceLike,
  type OpenRequest,
} from "@/lib/payment-request-state";
import { formatNok } from "@/lib/money";
import { cn } from "@/lib/utils";

export function sentToast(result: RequestActionResult, success: string) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.emailedTo > 0) {
    toast.success(
      `${success} til ${result.emailedTo} foresatt${result.emailedTo === 1 ? "" : "e"}`,
    );
    return;
  }
  toast.warning("Vipps-krav opprettet, men e-post ble ikke sendt", {
    action: result.url
      ? {
          label: "Kopier lenke",
          onClick: () => void navigator.clipboard?.writeText(result.url),
        }
      : undefined,
  });
}

export function RequestStatus({
  balance,
  request,
  today,
  className,
}: {
  balance: BalanceLike | null;
  request: OpenRequest | null;
  today: string;
  className?: string;
}) {
  const view = describeRequest(balance, request, today);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <StatusPill tone={view.tone}>{view.label}</StatusPill>
      {view.detail ? (
        <span className="text-xs text-admin-muted">{view.detail}</span>
      ) : null}
    </span>
  );
}

export type NextInstallment = {
  installmentId: string;
  amount: number;
  dueDate: string;
};

export type AutoRequestOption = {
  familyId: string;
  paused: boolean;
  globalEnabled: boolean;
};

function kr(ore: number): string {
  return `${Math.max(Math.round(ore / 100), 0).toLocaleString("nb-NO")} kr`;
}

function copyLink(paymentId: string) {
  void navigator.clipboard?.writeText(`${window.location.origin}/api/vipps/pay/${paymentId}`);
  toast.success("Lenke kopiert");
}

export function VippsRequestDialog({
  open,
  onOpenChange,
  schoolYearId,
  studentIds,
  title,
  today,
  remaining,
  amount,
  dueDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolYearId: string;
  studentIds: string[];
  title?: string;
  today: string;
  remaining: number;
  amount?: number | null;
  dueDate?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState<{ key: string; list: string[] } | null>(null);
  const remainingNok = Math.max(Math.round(remaining / 100), 0);
  const defaultNok = amount ? Math.min(Math.round(amount / 100), remainingNok) : remainingNok;
  const idKey = studentIds.join(",");
  const recipients = loaded?.key === idKey ? loaded.list : null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadRequestRecipients(idKey.split(",")).then((list) => {
      if (alive) setLoaded({ key: idKey, list });
    });
    return () => {
      alive = false;
    };
  }, [open, idKey]);

  function submit(formData: FormData) {
    const amountNok = Number(formData.get("amount_nok"));
    const due = String(formData.get("due_date") ?? "");
    startTransition(async () => {
      const result = await sendPaymentRequest({
        studentIds,
        schoolYearId,
        amountNok: Number.isFinite(amountNok) && amountNok > 0 ? amountNok : null,
        dueDate: due || null,
      });
      sentToast(result, "Vipps-krav sendt");
      if (result.ok) {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {title ? `Send Vipps-krav, ${title}` : "Send Vipps-krav"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          className="grid gap-4 [&_[data-slot=input]]:min-h-11"
        >
          <div className="grid gap-2">
            <Label htmlFor="request_amount" required>
              Beløp (kr)
            </Label>
            <Input
              id="request_amount"
              name="amount_nok"
              type="number"
              inputMode="numeric"
              min="1"
              max={remainingNok || undefined}
              step="1"
              required
              defaultValue={defaultNok || ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="request_due">Frist</Label>
            <Input
              id="request_due"
              name="due_date"
              type="date"
              min={today}
              required
              defaultValue={dueDate && dueDate >= today ? dueDate : defaultRequestDueDate(today)}
            />
          </div>
          <p className="text-sm text-admin-muted break-words">
            {recipients === null
              ? "Til: …"
              : recipients.length > 0
                ? `Til: ${recipients.join(", ")}`
                : "Til: ingen e-post"}
          </p>
          <DialogFooter>
            <Button type="submit" disabled={pending} className="min-h-11 rounded-xl px-4 font-bold">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send Vipps-krav
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VippsRequestBlock({
  schoolYearId,
  studentIds,
  balance,
  request,
  today,
  title,
  nextInstallment = null,
  manualChildren,
  onManual,
  sadaqa,
  auto,
  showStatus = true,
  showMenu = true,
  className,
}: {
  schoolYearId: string;
  studentIds: string[];
  balance: BalanceLike | null;
  request: OpenRequest | null;
  today: string;
  title?: string;
  nextInstallment?: NextInstallment | null;
  manualChildren?: FamilyPaymentChild[];
  onManual?: () => void;
  sadaqa?: SadaqaFamily | null;
  auto?: AutoRequestOption | null;
  showStatus?: boolean;
  showMenu?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"krav" | "endre" | "hele" | null>(null);
  const [confirm, setConfirm] = useState<"paminnelse" | "nytt" | "forste" | "avdrag" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [sadaqaOpen, setSadaqaOpen] = useState(false);
  const [renewDue, setRenewDue] = useState(() => defaultRequestDueDate(today));
  const owes = balance !== null && balance.remaining > 0;
  const remaining = balance?.remaining ?? 0;
  const waiting = request?.status === "autorisert";
  const expired = request?.status === "avbrutt";
  const canAct = owes && !waiting;
  const planStep = canAct && !request && nextInstallment ? nextInstallment : null;
  const hasManual = Boolean(onManual || (manualChildren && manualChildren.length > 0));

  function run(job: () => Promise<RequestActionResult>, success: string) {
    startTransition(async () => {
      const result = await job();
      sentToast(result, success);
      setConfirm(null);
      if (result.ok) router.refresh();
    });
  }

  function sendInstallment(step: NextInstallment) {
    startTransition(async () => {
      const result = await sendInstallmentNow(step.installmentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Avdrag sendt");
      setConfirm(null);
      router.refresh();
    });
  }

  function toggleAuto(on: boolean) {
    if (!auto) return;
    startTransition(async () => {
      const result = await setFamilyRequestsPaused(auto.familyId, !on);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(on ? "Automatiske krav på" : "Automatiske krav av");
      router.refresh();
    });
  }

  const confirmTitle =
    confirm === "paminnelse"
      ? "Send påminnelse?"
      : confirm === "nytt"
        ? "Send nytt Vipps-krav?"
        : confirm === "avdrag" && planStep
          ? `Send avdrag, ${kr(planStep.amount)}?`
          : "Send Vipps-krav?";
  const confirmAmount =
    confirm === "avdrag" && planStep ? planStep.amount : Math.min(request?.amount ?? remaining, remaining);

  const primary = "min-h-11 rounded-xl px-3 font-bold";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {showStatus ? <RequestStatus balance={balance} request={request} today={today} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {canAct && planStep ? (
          <Button type="button" disabled={pending} onClick={() => setConfirm("avdrag")} className={primary}>
            <Send className="size-4" />
            Send avdrag, {kr(planStep.amount)}
            <span className="font-normal opacity-80">· {shortDate(planStep.dueDate)}</span>
          </Button>
        ) : canAct && !request ? (
          <Button type="button" disabled={pending} onClick={() => setDialog("krav")} className={primary}>
            <Send className="size-4" />
            Send Vipps-krav
          </Button>
        ) : canAct && expired ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setRenewDue(defaultRequestDueDate(today));
              setConfirm("nytt");
            }}
            className={primary}
          >
            <Send className="size-4" />
            Send nytt Vipps-krav
          </Button>
        ) : canAct && request && !request.sent ? (
          <Button type="button" disabled={pending} onClick={() => setConfirm("forste")} className={primary}>
            <Send className="size-4" />
            Send Vipps-krav
          </Button>
        ) : canAct && request ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirm("paminnelse")}
            className={primary}
          >
            <Send className="size-4" />
            Send påminnelse
          </Button>
        ) : null}
        {canAct && request && !expired ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            aria-label="Kopier Vipps-lenke"
            className="min-h-11 min-w-11 rounded-xl px-2.5"
            onClick={() => copyLink(request.paymentId)}
          >
            <Copy className="size-4" />
          </Button>
        ) : null}
        {showMenu && (canAct || hasManual || auto) ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="min-h-11 rounded-xl px-2.5 font-bold text-admin-muted"
                />
              }
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
              Mer
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-56">
              {canAct && request && !expired ? (
                <DropdownMenuItem className="min-h-11" onClick={() => setDialog("endre")}>
                  Endre krav
                </DropdownMenuItem>
              ) : null}
              {planStep ? (
                <DropdownMenuItem className="min-h-11" onClick={() => setDialog("hele")}>
                  Send Vipps-krav for hele beløpet
                </DropdownMenuItem>
              ) : null}
              {hasManual ? (
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => (onManual ? onManual() : setManualOpen(true))}
                >
                  Registrer manuell betaling
                </DropdownMenuItem>
              ) : null}
              {owes && sadaqa ? (
                <DropdownMenuItem className="min-h-11" onClick={() => setSadaqaOpen(true)}>
                  Dekk med sadaqa
                </DropdownMenuItem>
              ) : null}
              {auto ? (
                <DropdownMenuCheckboxItem
                  className="min-h-11"
                  checked={auto.globalEnabled && !auto.paused}
                  disabled={!auto.globalEnabled}
                  onCheckedChange={(checked) => toggleAuto(checked)}
                >
                  {auto.globalEnabled
                    ? "Automatiske krav for familien"
                    : "Automatiske krav er av for skolen"}
                </DropdownMenuCheckboxItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {[title, confirm === "avdrag" ? null : kr(confirmAmount)].filter(Boolean).join(" · ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "nytt" ? (
            <div className="grid gap-2">
              <Label htmlFor="renew_due">Frist</Label>
              <Input
                id="renew_due"
                type="date"
                min={today}
                value={renewDue}
                onChange={(event) => setRenewDue(event.target.value)}
                className="min-h-11"
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (confirm === "avdrag" && planStep) sendInstallment(planStep);
                else if (request && confirm === "nytt") {
                  run(() => resendRequest(request.paymentId, renewDue || null), "Nytt Vipps-krav sendt");
                } else if (request && confirm === "forste") {
                  run(() => resendRequest(request.paymentId), "Vipps-krav sendt");
                } else if (request) {
                  run(() => resendRequest(request.paymentId), "Påminnelse sendt");
                }
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VippsRequestDialog
        open={dialog !== null}
        onOpenChange={(next) => !next && setDialog(null)}
        schoolYearId={schoolYearId}
        studentIds={studentIds}
        title={title}
        today={today}
        remaining={remaining}
        amount={dialog === "endre" ? request?.amount : null}
        dueDate={dialog === "endre" ? request?.dueDate : null}
      />

      {manualOpen && manualChildren ? (
        <FamilyPaymentDialog
          familyName={title ?? ""}
          schoolYearId={schoolYearId}
          familyChildren={manualChildren}
          open
          onOpenChange={setManualOpen}
        />
      ) : null}
      {sadaqaOpen && sadaqa ? (
        <SadaqaCoverDialog
          schoolYearId={schoolYearId}
          families={[sadaqa]}
          open
          onOpenChange={setSadaqaOpen}
        />
      ) : null}
    </div>
  );
}

export function BulkRequestButton({
  schoolYearId,
  studentIds,
  count,
  mode,
  today,
  className,
}: {
  schoolYearId: string;
  studentIds: string[];
  count: number;
  mode: BulkMode;
  today: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState(() => defaultRequestDueDate(today));
  if (count === 0) return null;
  const reminders = mode === "paminnelse";
  const label = reminders ? `Send påminnelse (${count})` : `Send Vipps-krav (${count})`;

  function load() {
    setLoading(true);
    setError(null);
    setDueDate(defaultRequestDueDate(today));
    startTransition(async () => {
      const result = await previewPaymentRequests({ studentIds, schoolYearId, mode });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(result.items);
      setEmailEnabled(result.emailEnabled);
      setSelected(new Set(result.items.map((item) => item.key)));
    });
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function send() {
    startTransition(async () => {
      const result = await sendPaymentRequests({
        studentIds,
        schoolYearId,
        mode,
        keys: [...selected],
        dueDate: reminders ? null : dueDate || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const failed = result.skipped ? ` · ${result.skipped} feilet` : "";
      toast.success(
        `${reminders ? "Påminnelse" : "Vipps-krav"} sendt til ${result.emailedTo} foresatt${result.emailedTo === 1 ? "" : "e"}${failed}`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  const chosen = items.filter((item) => selected.has(item.key));
  const total = chosen.reduce((sum, item) => sum + item.amount, 0);
  const shared = sharedRecipientKeys(items);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={reminders ? "outline" : "default"}
        onClick={() => {
          setOpen(true);
          load();
        }}
        className={cn("min-h-11 rounded-xl px-4 font-bold", className)}
      >
        <Send className="size-4" />
        {label}
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {reminders ? "Send påminnelse" : "Send Vipps-krav"}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-admin-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Henter familier …
          </p>
        ) : error ? (
          <div className="grid gap-3 py-2">
            <p role="alert" className="font-bold text-[#8B2F2B]">
              {error}
            </p>
            <Button type="button" variant="outline" className="min-h-11 justify-self-start rounded-xl px-4" onClick={load}>
              Prøv igjen
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 text-sm">
            {!emailEnabled ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-[#FFF8E9] px-4 py-3 text-[#6B5524] ring-1 ring-[#E8D6AA]"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                E-postvarsler er slått av
              </p>
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-[#FAF9F5] px-4 py-3 ring-1 ring-[#E8E3D9]">
              <div>
                <p className="font-heading text-2xl font-bold tabular-nums">{formatNok(total)}</p>
                <p className="text-admin-muted">
                  {chosen.length} av {items.length} {items.length === 1 ? "familie" : "familier"}
                </p>
              </div>
              {reminders ? null : (
                <div className="grid gap-1.5">
                  <Label htmlFor={`bulk-due-${mode}`}>Frist</Label>
                  <Input
                    id={`bulk-due-${mode}`}
                    type="date"
                    min={today}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="min-h-11 bg-white"
                  />
                </div>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-admin-muted">Ingen å sende til</p>
            ) : (
              <ul className="grid gap-2" aria-label="Familier">
                {items.map((item) => {
                  const checked = selected.has(item.key);
                  const inputId = `bulk-${mode}-${item.key}`;
                  return (
                    <li key={item.key}>
                      <label
                        htmlFor={inputId}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1",
                          checked ? "bg-white ring-[#C9E0CB]" : "bg-[#FAF9F5] text-admin-muted ring-[#E8E3D9]",
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item.key)}
                          className="mt-1 size-4 accent-[#3C8F44]"
                        />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-bold">
                              {item.name}
                              {item.renew ? (
                                <span className="font-normal text-admin-muted"> · utløpt</span>
                              ) : null}
                            </span>
                            <span className="font-bold tabular-nums">{formatNok(item.amount)}</span>
                          </span>
                          {item.children.length > 1 || item.children[0] !== item.name ? (
                            <span className="text-xs text-admin-muted">{item.children.join(", ")}</span>
                          ) : null}
                          <span className="break-words text-xs text-admin-muted">
                            {item.recipients.length > 0 ? `Til: ${item.recipients.join(", ")}` : "Til: ingen e-post"}
                          </span>
                          {shared.has(item.key) ? (
                            <span className="text-xs font-semibold text-[#8A5A00]">
                              Samme e-post som en annen familie
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={send}
            disabled={pending || loading || !emailEnabled || chosen.length === 0}
            className="font-bold"
          >
            {pending && !loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {reminders ? `Send påminnelse (${chosen.length})` : `Send Vipps-krav (${chosen.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sharedRecipientKeys(items: { key: string; recipients: string[] }[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const item of items) {
    for (const email of item.recipients) {
      const key = email.trim().toLowerCase();
      owners.set(key, (owners.get(key) ?? new Set()).add(item.key));
    }
  }
  const shared = new Set<string>();
  for (const keys of owners.values()) {
    if (keys.size > 1) for (const key of keys) shared.add(key);
  }
  return shared;
}

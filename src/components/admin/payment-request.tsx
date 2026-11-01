"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Send } from "lucide-react";
import {
  resendRequest,
  sendPaymentRequest,
  sendPaymentRequests,
  type RequestActionResult,
} from "@/app/[locale]/admin/payment-request-actions";
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
import { StatusPill } from "@/components/admin/status-pill";
import {
  describeRequest,
  type BalanceLike,
  type OpenRequest,
} from "@/lib/payment-request-state";
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
  toast.warning("Krav opprettet, men e-post ble ikke sendt", {
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

export function PaymentRequestActions({
  schoolYearId,
  studentIds,
  balance,
  request,
  today,
  suggestedAmount,
  suggestedDueDate,
  title,
  showStatus = true,
  className,
}: {
  schoolYearId: string;
  studentIds: string[];
  balance: BalanceLike | null;
  request: OpenRequest | null;
  today: string;
  suggestedAmount?: number | null;
  suggestedDueDate?: string | null;
  title?: string;
  showStatus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const view = describeRequest(balance, request, today);
  const owes = balance !== null && balance.remaining > 0;
  const waiting = request?.status === "autorisert";
  const remainingNok = balance ? Math.max(Math.round(balance.remaining / 100), 0) : 0;
  const prefill = request?.amount ?? suggestedAmount;
  const defaultNok = prefill ? Math.min(Math.round(prefill / 100), remainingNok) : remainingNok;
  const resendLabel =
    view.kind === "utlopt" ? "Send nytt krav" : request?.sent ? "Send påminnelse" : "Send krav";

  function resend() {
    if (!request) return;
    startTransition(async () => {
      const result = await resendRequest(request.paymentId);
      sentToast(result, view.kind === "utlopt" ? "Nytt krav sendt" : "Påminnelse sendt");
      setConfirming(false);
      if (result.ok) router.refresh();
    });
  }

  function submit(formData: FormData) {
    const amount = Number(formData.get("amount_nok"));
    const due = String(formData.get("due_date") ?? "");
    startTransition(async () => {
      const result = await sendPaymentRequest({
        studentIds,
        schoolYearId,
        amountNok: Number.isFinite(amount) && amount > 0 ? amount : null,
        dueDate: due || null,
      });
      sentToast(result, "Krav sendt");
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {showStatus ? <RequestStatus balance={balance} request={request} today={today} /> : null}
      {owes && !waiting ? (
        <div className="flex flex-wrap gap-2 has-[>:nth-child(3)]:grid has-[>:nth-child(3)]:grid-cols-[minmax(0,1fr)_auto_auto]">
          {request ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-xl px-3 font-bold"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {resendLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={request ? "outline" : "default"}
            disabled={pending}
            onClick={() => setOpen(true)}
            className="min-h-11 rounded-xl px-3 font-bold"
          >
            {request ? null : <Send className="size-4" />}
            {request ? "Tilpass krav" : "Krev betaling"}
          </Button>
          {request ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              aria-label="Kopier betalingslenke"
              className="min-h-11 min-w-11 rounded-xl px-2.5"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${window.location.origin}/api/vipps/pay/${request.paymentId}`,
                );
                toast.success("Lenke kopiert");
              }}
            >
              <Copy className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resendLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {[title ? `Foresatte til ${title}` : "Foresatte", `${defaultNok.toLocaleString("nb-NO")} kr`].join(" · ")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={resend} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {title ? `Krev betaling, ${title}` : "Krev betaling"}
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
              <p className="text-xs text-admin-muted">
                Gjenstår {remainingNok.toLocaleString("nb-NO")} kr
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="request_due">Frist</Label>
              <Input
                id="request_due"
                name="due_date"
                type="date"
                min={today}
                defaultValue={[suggestedDueDate, request?.dueDate].find(
                  (date) => date && date >= today,
                ) ?? ""}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-xl px-4 font-bold"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send krav
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BulkRequestButton({
  schoolYearId,
  studentIds,
  count,
  mode,
  className,
}: {
  schoolYearId: string;
  studentIds: string[];
  count: number;
  mode: "krav" | "paminnelse";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  const reminders = mode === "paminnelse";
  const label = reminders ? `Send påminnelse (${count})` : `Send krav (${count})`;
  const title = reminders
    ? `Send påminnelse for ${count} krav?`
    : `Send krav til ${count} ${count === 1 ? "familie" : "familier"}?`;

  function confirm() {
    startTransition(async () => {
      const result = await sendPaymentRequests({ studentIds, schoolYearId, mode });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const failed = result.skipped ? ` · ${result.skipped} feilet` : "";
      toast.success(
        `${reminders ? "Påminnelse" : "Krav"} sendt til ${result.emailedTo} foresatt${result.emailedTo === 1 ? "" : "e"}${failed}`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={reminders ? "outline" : "default"}
        onClick={() => setOpen(true)}
        className={cn("min-h-11 rounded-xl px-4 font-bold", className)}
      >
        <Send className="size-4" />
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

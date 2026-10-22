"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import {
  reopenInstallment,
  sendInstallmentNow,
  stopInstallment,
} from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import { formatNok } from "@/lib/money";
import { Button } from "@/components/ui/button";
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

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  success: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
};

export function InstallmentRowActions({
  installmentId,
  status,
  amount,
  familyName,
  dueDateLabel,
}: {
  installmentId: string;
  status: string;
  amount: number;
  familyName: string;
  dueDateLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  function confirmAction() {
    if (!confirmation) return;
    startTransition(async () => {
      const result = await confirmation.action();
      if (result.ok) {
        toast.success(confirmation.success);
        setConfirmation(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Noe gikk galt");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {status === "planlagt" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="h-10 rounded-lg px-2.5 text-xs font-bold sm:h-8 sm:px-2"
              onClick={() =>
                setConfirmation({
                  title: "Sende avdraget nå?",
                  description: `Betalingslenke for ${formatNok(amount)} med frist ${dueDateLabel} sendes til familien ${familyName} på e-post nå. Avdrag med samme frist sendes samlet.`,
                  confirmLabel: "Send nå",
                  success: "Avdraget er sendt",
                  action: () => sendInstallmentNow(installmentId),
                })
              }
            >
              <Send className="size-3.5" />
              Send nå
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="h-10 rounded-lg px-2.5 text-xs font-bold sm:h-8 sm:px-2 text-[#8B2F2B]"
              onClick={() =>
                setConfirmation({
                  title: `Stoppe avdraget på ${formatNok(amount)}?`,
                  description: `Det sendes ingen automatisk betalingslenke for familien ${familyName} med frist ${dueDateLabel}. Beløpet blir stående som utestående til du gjør noe annet.`,
                  confirmLabel: "Stopp avdraget",
                  success: "Avdraget er stoppet",
                  action: () => stopInstallment(installmentId),
                })
              }
            >
              Stopp
            </Button>
          </>
        ) : status === "stoppet" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-10 rounded-lg px-2.5 text-xs font-bold sm:h-8 sm:px-2"
            onClick={() =>
              startTransition(async () => {
                const result = await reopenInstallment(installmentId);
                if (result.ok) {
                  toast.success("Avdraget er gjenåpnet");
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Noe gikk galt");
                }
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Gjenåpne
          </Button>
        ) : null}
      </div>

      <AlertDialog
        open={confirmation != null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <AlertDialogTitle className="font-heading text-2xl">
              {confirmation?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <AlertDialogCancel disabled={pending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

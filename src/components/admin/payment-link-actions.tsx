"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, Mail, MoreHorizontal, RefreshCw } from "lucide-react";
import {
  cancelVippsPayment,
  syncPaymentStatus,
} from "@/app/[locale]/admin/students-actions";
import { resendRequest } from "@/app/[locale]/admin/payment-request-actions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PaymentLinkActions({
  paymentId,
  status,
}: {
  paymentId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      setConfirmCancel(false);
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Noe gikk galt");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl px-3 font-bold"
              disabled={pending}
            />
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
          Vipps
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {status === "opprettet" ? (
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => run(() => resendRequest(paymentId), "Påminnelse sendt")}
            >
              <Mail className="size-4" />
              Send påminnelse
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="min-h-11"
            onClick={() =>
              run(() => syncPaymentStatus(paymentId), "Status oppdatert")
            }
          >
            <RefreshCw className="size-4" />
            Hent status fra Vipps
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 text-[#8B2F2B]"
            onClick={() => setConfirmCancel(true)}
          >
            <Ban className="size-4" />
            Avbryt Vipps-krav
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryt Vipps-kravet?</AlertDialogTitle>
            <AlertDialogDescription>Lenken slutter å virke</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Tilbake</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => cancelVippsPayment(paymentId), "Vipps-krav avbrutt")}
            >
              Avbryt kravet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

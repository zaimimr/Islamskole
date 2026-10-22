"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgePercent, Loader2, LogOut, Trash2 } from "lucide-react";
import {
  archiveStudent,
  deleteStudent,
  grantFeeAdjustment,
} from "@/app/[locale]/admin/students-actions";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function StudentExitPanel({
  studentId,
  studentName,
  hasActivePlacement,
  deleteBlockers,
  listHref,
  outstanding,
}: {
  studentId: string;
  studentName: string;
  hasActivePlacement: boolean;
  deleteBlockers: string[];
  listHref: string;
  outstanding: { schoolYearId: string; remaining: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [waiverOpen, setWaiverOpen] = useState(false);

  function archive() {
    startTransition(async () => {
      const result = await archiveStudent(studentId);
      if (result.ok) {
        toast.success(`${studentName} er registrert som sluttet`, {
          description: result.note,
        });
        setArchiveOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteStudent(studentId);
      if (result.ok) {
        toast.success("Elevoppføringen er slettet");
        setDeleteOpen(false);
        router.replace(listHref);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function waive() {
    if (!outstanding) return;
    const formData = new FormData();
    formData.set("student_id", studentId);
    formData.set("school_year_id", outstanding.schoolYearId);
    formData.set("type", "annet");
    formData.set("amount_nok", String(outstanding.remaining / 100));
    formData.set("note", "Eleven har sluttet");
    startTransition(async () => {
      const result = await grantFeeAdjustment(formData);
      if (result.ok) {
        toast.success(`Fritak for ${formatNok(outstanding.remaining)} er gitt`);
        setWaiverOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const canDelete = deleteBlockers.length === 0;
  const hasPayments =
    deleteBlockers.includes("betalinger") ||
    deleteBlockers.includes("fordelte betalinger");

  return (
    <section className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
      <div>
        <h2 className="font-heading text-xl font-bold">Eleven slutter</h2>
        <p className="mt-1 max-w-prose text-sm text-admin-muted">
          Når en elev slutter, avsluttes plassene. Familie, betalinger og
          historikk blir stående.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={pending || !hasActivePlacement}
                className="font-bold"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Eleven har sluttet
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Registrere at {studentName} har sluttet?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Alle aktive plasser settes til avsluttet og frigjør plass i
                klassen. Årspris og betalinger endres ikke. Gi fritak under
                Betaling hvis familien ikke skal betale resten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={archive} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Eleven har sluttet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {canDelete ? (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  className="font-bold"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Slett elev
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slette {studentName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bruk dette bare når eleven ble registrert ved en feil.
                  Elevoppføringen og plassene slettes permanent, og påmeldingen
                  arkiveres så den ikke dukker opp i Opptak igjen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={remove}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Slett permanent
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {!hasActivePlacement ? (
        <p className="text-sm text-admin-muted">
          Eleven har ingen aktive plasser.
        </p>
      ) : null}
      {outstanding ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FFF8E9] p-4 ring-1 ring-[#EDD49A]">
          <div>
            <p className="text-xs font-bold text-[#775108]">Utestående</p>
            <p className="mt-1 font-heading text-xl font-bold tabular-nums">
              {formatNok(outstanding.remaining)}
            </p>
            <p className="mt-1 text-sm text-[#6D5A2D]">
              Planlagte avdrag sendes ikke lenger. Gi fritak hvis familien
              ikke skal betale resten.
            </p>
          </div>
          <AlertDialog open={waiverOpen} onOpenChange={setWaiverOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="bg-white font-bold"
                >
                  <BadgePercent aria-hidden="true" className="size-4" />
                  Gi fritak
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Gi fritak for {formatNok(outstanding.remaining)}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Resten av årsprisen for {studentName} strykes med
                  begrunnelsen «Eleven har sluttet». Fritaket kan oppheves
                  under Betaling.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={waive} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Gi fritak
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
      {!canDelete ? (
        <p className="text-sm text-admin-muted">
          {hasPayments
            ? "Eleven har betalinger og kan ikke slettes."
            : `Eleven kan ikke slettes fordi det finnes ${deleteBlockers.join(", ")}.`}{" "}
          Bruk «Eleven har sluttet», så beholdes historikken.
        </p>
      ) : null}
    </section>
  );
}

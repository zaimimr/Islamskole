"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitMerge, Loader2, UserX } from "lucide-react";
import {
  mergeFamilies,
  removeGuardianFromFamily,
} from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import { Button } from "@/components/ui/button";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

export type FamilyOption = { id: string; name: string; description?: string };

export function FamilyPickerDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  successMessage,
  options,
  action,
  triggerClassName,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  options: FamilyOption[];
  action: (familyId: string) => Promise<Result>;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [familyId, setFamilyId] = useState("");
  const [pending, startTransition] = useTransition();
  const labelId = useId();

  function confirm() {
    if (!familyId) {
      toast.error("Velg en familie");
      return;
    }
    startTransition(async () => {
      const result = await action(familyId);
      if (result.ok) {
        toast.success(successMessage);
        setOpen(false);
        setFamilyId("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("min-h-11 rounded-xl font-bold", triggerClassName)}
          >
            <GitMerge aria-hidden="true" className="size-4" />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label id={labelId}>Familie</Label>
          <SelectField
            aria-labelledby={labelId}
            placeholder="Velg familie"
            value={familyId}
            onValueChange={setFamilyId}
            options={options.map((option) => ({
              value: option.id,
              label: option.name,
              description: option.description,
            }))}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={confirm}
            disabled={pending || !familyId}
            className="min-h-11 rounded-xl font-bold"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveGuardianButton({
  familyId,
  guardianId,
  name,
  className,
}: {
  familyId: string;
  guardianId: string;
  name: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeGuardianFromFamily(familyId, guardianId);
      if (result.ok) {
        toast.success(
          result.deleted
            ? `${name} er fjernet og slettet`
            : `${name} er fjernet fra familien`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            disabled={pending}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-semibold text-[#8B2F2B] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 xl:min-h-8",
              className,
            )}
          >
            <UserX aria-hidden="true" className="size-3.5 shrink-0" />
            Fjern foresatt
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fjerne {name} fra familien?</AlertDialogTitle>
          <AlertDialogDescription>
            Koblingen til familien og barna fjernes. Er personen ikke knyttet
            til en annen familie og ikke lærer, slettes personen helt.
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
            Fjern foresatt
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function MergeDuplicateButton({
  keepFamilyId,
  mergeFamilyId,
  mergeFamilyName,
}: {
  keepFamilyId: string;
  mergeFamilyId: string;
  mergeFamilyName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function merge() {
    startTransition(async () => {
      const result = await mergeFamilies(keepFamilyId, mergeFamilyId);
      if (result.ok) {
        toast.success(`${mergeFamilyName} er slått sammen med denne familien`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="min-h-11 shrink-0 rounded-lg bg-white font-bold"
          >
            <GitMerge aria-hidden="true" className="size-4" />
            Slå sammen
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slå sammen med {mergeFamilyName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Barn, foresatte, betalingsplaner og innmeldinger flyttes hit.
            Foresatte med samme e-post blir én person. {mergeFamilyName}{" "}
            slettes etterpå.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={merge} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Slå sammen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

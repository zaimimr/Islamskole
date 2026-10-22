"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setTeacherSuspended } from "./teacher-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TeacherSuspendDialog({
  guardianId,
  name,
  suspended,
  open,
  onOpenChange,
}: {
  guardianId: string;
  name: string;
  suspended: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const reasonId = `teacher-${guardianId}-suspend-reason`;

  function submit(reason: string) {
    startTransition(async () => {
      const result = await setTeacherSuspended(guardianId, !suspended, reason);
      if (result.ok) {
        toast.success(
          suspended
            ? `${name} har tilgang til Min klasse igjen`
            : `${name} er suspendert som lærer`,
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {suspended ? `Oppheve suspensjonen av ${name}?` : `Suspendere ${name}?`}
          </DialogTitle>
          <DialogDescription>
            {suspended
              ? "Læreren får tilgang til Min klasse, oppmøte og klassenotater igjen, og kan velges som lærer og vikar."
              : "Læreren mister tilgang til Min klasse, oppmøte og klassenotater, og kan ikke velges som lærer eller vikar. Tilgangen som forelder til egne barn og familie beholdes."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("reason");
            submit(typeof value === "string" ? value : "");
          }}
          className="grid gap-3 py-2"
        >
          {suspended ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor={reasonId}>Grunn</Label>
              <Textarea
                id={reasonId}
                name="reason"
                required
                maxLength={500}
                placeholder="Kort forklaring som andre administratorer kan se"
                className="min-h-24 rounded-xl"
              />
            </div>
          )}
          <DialogFooter className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Avbryt
            </Button>
            <Button
              type="submit"
              variant={suspended ? "default" : "destructive"}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {suspended ? "Opphev suspensjon" : "Suspender lærer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck } from "lucide-react";
import { createStudentFromApplication } from "@/app/[locale]/admin/students-actions";
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
import { classOptionLabel, type PlacementClass } from "./placement";

export function AdmitDialog({
  applicationId,
  childName,
  childAge,
  desiredClass,
  classes,
  suggestedClassId,
  schoolYear,
  basePath,
}: {
  applicationId: string;
  childName: string;
  childAge: number | null;
  desiredClass: string | null;
  classes: PlacementClass[];
  suggestedClassId: string | null;
  schoolYear: { id: string; label: string } | null;
  basePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState(suggestedClassId ?? "");

  function handleAdmit() {
    startTransition(async () => {
      const result = await createStudentFromApplication(applicationId, {
        classId: classId || null,
        schoolYearId: classId ? (schoolYear?.id ?? null) : null,
      });
      if (result.ok && result.id) {
        const studentId = result.id;
        setOpen(false);
        toast.success(
          classId ? `${childName} er tatt opp og plassert` : `${childName} er tatt opp`,
          {
            description: result.note,
            action: {
              label: "Åpne elev",
              onClick: () => router.push(`${basePath}/elever/${studentId}`),
            },
          },
        );
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  const hint = [
    childAge != null ? `${childAge} år` : null,
    desiredClass ? `ønsker ${desiredClass}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="min-h-11 rounded-xl px-4 font-bold">
            <UserCheck aria-hidden="true" className="size-4" />
            Ta opp og plasser
          </Button>
        }
      />
      <DialogContent className="rounded-2xl border-[#E3DED3] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ta opp {childName}</DialogTitle>
          <DialogDescription>
            Barnet blir registrert som elev. Velg klasse for{" "}
            {schoolYear?.label ?? "aktivt skoleår"} nå, eller plasser senere
            fra elevsiden.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 rounded-xl bg-[#F8F6F0] p-4">
          <Label htmlFor={`admit-class-${applicationId}`}>Klasse</Label>
          <SelectField
            id={`admit-class-${applicationId}`}
            value={classId}
            onValueChange={setClassId}
            disabled={!schoolYear}
            options={[
              { value: "", label: "Ikke plasser ennå" },
              ...classes.map((item) => ({
                value: item.id,
                label: `${classOptionLabel(item)}${item.id === suggestedClassId ? " · foreslått" : ""}`,
                disabled:
                  item.capacity != null && item.enrolled >= item.capacity,
              })),
            ]}
          />
          <p className="text-xs text-admin-muted">
            {!schoolYear
              ? "Velg et aktivt skoleår før plassering."
              : hint
                ? `Forslaget bygger på alder og ønske (${hint}). Fulle klasser kan ikke velges.`
                : "Fulle klasser kan ikke velges."}
          </p>
        </div>
        <DialogFooter className="pt-2">
          <Button
            type="button"
            onClick={handleAdmit}
            disabled={pending}
            className="min-h-11 rounded-xl px-5 font-bold"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {classId ? "Ta opp og plasser" : "Ta opp uten plass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

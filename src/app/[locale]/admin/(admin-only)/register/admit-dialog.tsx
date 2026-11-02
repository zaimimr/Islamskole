"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck } from "lucide-react";
import { createStudentFromApplication, getClassCapacityInfo } from "@/app/[locale]/admin/students-actions";
import { CapacityIncrease } from "@/components/admin/capacity-increase";
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

  const [newCapacity, setNewCapacity] = useState("");
  const [freshCapacity, setFreshCapacity] = useState<{ classId: string; capacity: number | null; enrolled: number }[]>([]);
  const currentClasses = classes.map((item) => {
    const current = freshCapacity.find((row) => row.classId === item.id);
    return current ? { ...item, capacity: current.capacity, enrolled: current.enrolled } : item;
  });
  const selectedClass = currentClasses.find((item) => item.id === classId);
  const needsIncrease = selectedClass?.capacity != null && selectedClass.enrolled >= selectedClass.capacity;

  function handleAdmit() {
    const capacityValue = needsIncrease && selectedClass ? Number(newCapacity || selectedClass.enrolled + 1) : null;
    if (capacityValue != null && selectedClass?.capacity != null && (!Number.isInteger(capacityValue) || capacityValue < Math.max(selectedClass.capacity + 1, selectedClass.enrolled + 1) || capacityValue > 10000)) {
      toast.error(`Ny kapasitet må være mellom ${Math.max(selectedClass.capacity + 1, selectedClass.enrolled + 1)} og 10000.`);
      return;
    }
    startTransition(async () => {
      const result = await createStudentFromApplication(applicationId, {
        newCapacity: capacityValue,
        expectedCapacity: needsIncrease ? selectedClass?.capacity : null,
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
        if (schoolYear) {
          try { setFreshCapacity(await getClassCapacityInfo(schoolYear.id)); }
          catch { toast.error("Kunne ikke oppdatere kapasiteten. Prøv igjen."); }
        }
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
            onValueChange={(value) => { setClassId(value); setNewCapacity(""); }}
            disabled={!schoolYear}
            options={[
              { value: "", label: "Ikke plasser ennå" },
              ...currentClasses.map((item) => ({
                value: item.id,
                label: `${classOptionLabel(item)}${item.id === suggestedClassId ? " · foreslått" : ""}`,
              })),
            ]}
          />
          <p className="text-xs text-admin-muted">
            {!schoolYear
              ? "Velg et aktivt skoleår før plassering."
              : hint
                ? `Forslag: ${hint}.`
                : null}
          </p>
        </div>
        {needsIncrease && selectedClass?.capacity != null ? <CapacityIncrease id={`admit-capacity-${applicationId}`} className={selectedClass.name} capacity={selectedClass.capacity} enrolled={selectedClass.enrolled} value={newCapacity} onChange={setNewCapacity} /> : null}
        <DialogFooter className="pt-2">
          <Button
            type="button"
            onClick={handleAdmit}
            disabled={pending}
            className="min-h-11 rounded-xl px-5 font-bold"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {needsIncrease ? "Øk kapasitet og plasser" : classId ? "Ta opp og plasser" : "Ta opp uten plass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

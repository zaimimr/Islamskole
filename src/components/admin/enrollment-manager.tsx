"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  CircleStop,
  Loader2,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import {
  changeEnrollmentClass,
  endEnrollment,
  getClassCapacityInfo,
  placeStudentInClass,
  removeEnrollment,
  sendWelcomeEmail,
  type ClassCapacityInfo,
} from "@/app/[locale]/admin/students-actions";
import { CapacityIncrease } from "@/components/admin/capacity-increase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
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

export type ClassOption = { id: string; name: string; price: number | null };
export type SchoolYearOption = {
  id: string;
  label: string;
  fee: number | null;
};
export type EnrollmentRow = {
  id: string;
  classId: string;
  className: string;
  schoolYearId: string;
  schoolYear: string;
  status: string;
  price: number | null;
};

function kroner(value: number) {
  return `${value.toLocaleString("nb-NO")} kr`;
}

export function EnrollmentManager({
  studentId,
  classes,
  schoolYears,
  enrollments,
  defaultSchoolYearId,
  activeSchoolYearId,
  suggestedClassId,
}: {
  studentId: string;
  classes: ClassOption[];
  schoolYears: SchoolYearOption[];
  enrollments: EnrollmentRow[];
  defaultSchoolYearId: string | null;
  activeSchoolYearId: string | null;
  suggestedClassId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [selectedYear, setSelectedYear] = useState(defaultSchoolYearId ?? "");
  const [selectedClass, setSelectedClass] = useState(suggestedClassId ?? "");
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchClass, setSwitchClass] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [capacity, setCapacity] = useState<Map<string, ClassCapacityInfo>>(
    new Map(),
  );

  const needsCapacity = showForm || switchingId != null;
  const capacityYear = switchingId
    ? (enrollments.find((e) => e.id === switchingId)?.schoolYearId ?? "")
    : selectedYear;

  useEffect(() => {
    if (!needsCapacity || !capacityYear) return;
    let active = true;
    getClassCapacityInfo(capacityYear).then((info) => {
      if (!active) return;
      setCapacity(new Map(info.map((c) => [c.classId, c])));
    }).catch(() => { if (active) toast.error("Kunne ikke hente kapasiteten. Prøv igjen."); });
    return () => {
      active = false;
    };
  }, [needsCapacity, capacityYear]);

  const yearFee = new Map(schoolYears.map((y) => [y.id, y.fee]));

  async function refreshCapacity() {
    try {
      const info = await getClassCapacityInfo(capacityYear);
      setCapacity(new Map(info.map((row) => [row.classId, row])));
    } catch {
      toast.error("Kunne ikke oppdatere kapasiteten. Prøv igjen.");
    }
  }

  const capacityClass = switchingId ? switchClass : selectedClass;
  const selectedCapacity = capacity.get(capacityClass);
  const needsIncrease = selectedCapacity?.capacity != null && selectedCapacity.enrolled >= selectedCapacity.capacity;
  const selectedName = classes.find((item) => item.id === capacityClass)?.name ?? "Klassen";

  function selectClass(value: string, switching = false) {
    setNewCapacity("");
    if (switching) setSwitchClass(value);
    else setSelectedClass(value);
  }

  const capacityReview = needsIncrease && selectedCapacity?.capacity != null ? <CapacityIncrease
    id={switchingId ? "switch-capacity" : "placement-capacity"}
    className={selectedName} capacity={selectedCapacity.capacity} enrolled={selectedCapacity.enrolled}
    value={newCapacity} onChange={setNewCapacity}
  /> : null;

  function classOptionLabel(option: ClassOption, yearId: string) {
    const info = capacity.get(option.id);
    const fee = yearFee.get(yearId) ?? null;
    const parts: string[] = [option.name];
    if (option.price != null && option.price !== fee) {
      parts.push(`${kroner(option.price)}, overstyrer årspris`);
    }
    if (info && info.capacity != null) {
      parts.push(
        info.enrolled >= info.capacity
          ? `${info.enrolled}/${info.capacity}, full`
          : `${info.enrolled}/${info.capacity} plasser`,
      );
    }
    if (option.id === suggestedClassId) parts.push("foreslått");
    return parts.join(" · ");
  }

  function sendWelcome() {
    startTransition(async () => {
      const result = await sendWelcomeEmail(studentId);
      if (result.ok) toast.success("Velkomst-e-post er sendt til foresatte");
      else toast.error(result.error);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("student_id", studentId);
    const placedInActiveYear = selectedYear === activeSchoolYearId;
    startTransition(async () => {
      const result = await placeStudentInClass(formData);
      if (result.ok) {
        toast.success(
          "Eleven er plassert i klassen",
          placedInActiveYear
            ? { action: { label: "Send velkomst", onClick: sendWelcome } }
            : undefined,
        );
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(result.error);
        await refreshCapacity();
      }
    });
  }

  function handleSwitch(enrollmentId: string, formData: FormData) {
    startTransition(async () => {
      const result = await changeEnrollmentClass(enrollmentId, switchClass, needsIncrease && selectedCapacity?.capacity != null ? { newCapacity: Number(formData.get("new_capacity")), expectedCapacity: selectedCapacity.capacity } : undefined);
      if (result.ok) {
        toast.success("Eleven har byttet klasse");
        if (result.note) toast.warning(result.note);
        setSwitchingId(null);
        router.refresh();
      } else {
        toast.error(result.error);
        await refreshCapacity();
      }
    });
  }

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const canPlace = classes.length > 0 && schoolYears.length > 0;
  const hasActiveInSelectedYear = enrollments.some(
    (e) => e.status === "aktiv" && e.schoolYearId === selectedYear,
  );

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
      <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <h2 className="font-heading text-xl font-bold">Klasseplassering</h2>
      </div>
      <div className="grid gap-4 p-4 sm:p-5">
        {enrollments.length > 0 ? (
          <ul className="grid gap-2">
            {enrollments.map((enrollment) => {
              const active = enrollment.status === "aktiv";
              const fee = yearFee.get(enrollment.schoolYearId) ?? null;
              const overrides =
                enrollment.price != null &&
                fee != null &&
                enrollment.price !== fee;
              return (
                <li
                  key={enrollment.id}
                  className="grid gap-3 rounded-xl border border-[#ECE8DF] px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className="font-bold">{enrollment.className}</span>
                      <span className="text-admin-muted">
                        {" "}
                        · {enrollment.schoolYear}
                      </span>
                      {enrollment.price != null ? (
                        <span className="text-admin-muted">
                          {" "}
                          · {kroner(enrollment.price)} per år
                        </span>
                      ) : null}
                      {overrides ? (
                        <span className="ml-2 rounded-full bg-[#FEEDCA] px-2 py-0.5 text-xs font-bold text-[#775108]">
                          Overstyrer årspris ({kroner(fee)})
                        </span>
                      ) : null}
                      {!active ? (
                        <span className="ml-2 rounded-full bg-[#F2F1EB] px-2 py-0.5 text-xs font-bold text-admin-muted">
                          Avsluttet
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      {active &&
                      enrollment.schoolYearId === activeSchoolYearId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={sendWelcome}
                        >
                          <Mail aria-hidden="true" className="size-4" />
                          Send velkomst
                        </Button>
                      ) : null}
                      {active ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            setSwitchingId(
                              switchingId === enrollment.id
                                ? null
                                : enrollment.id,
                            );
                            setSwitchClass("");
                          }}
                          aria-expanded={switchingId === enrollment.id}
                        >
                          <ArrowLeftRight
                            aria-hidden="true"
                            className="size-4"
                          />
                          Bytt klasse
                        </Button>
                      ) : null}
                      {active ? (
                        <ConfirmButton
                          label="Avslutt plass"
                          icon={
                            <CircleStop aria-hidden="true" className="size-4" />
                          }
                          title={`Avslutte plassen i ${enrollment.className}?`}
                          description="Plassen markeres som avsluttet og teller ikke lenger mot kapasiteten. Årspris og betalinger blir stående, så historikken beholdes."
                          confirmLabel="Avslutt plass"
                          pending={pending}
                          onConfirm={() =>
                            run(
                              () => endEnrollment(enrollment.id),
                              "Plassen er avsluttet",
                            )
                          }
                        />
                      ) : null}
                      <ConfirmButton
                        label="Fjern"
                        iconOnly
                        icon={<Trash2 aria-hidden="true" className="size-4" />}
                        title="Fjerne plasseringen helt?"
                        description={
                          active
                            ? "Bruk dette bare hvis plasseringen ble registrert ved en feil. Vil du beholde historikken, velg «Avslutt plass» i stedet."
                            : "Plasseringen slettes fra historikken. Dette kan ikke angres."
                        }
                        confirmLabel="Fjern plassering"
                        destructive
                        pending={pending}
                        onConfirm={() =>
                          run(
                            () => removeEnrollment(enrollment.id),
                            "Plasseringen er fjernet",
                          )
                        }
                      />
                    </div>
                  </div>
                  {switchingId === enrollment.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); handleSwitch(enrollment.id, new FormData(event.currentTarget)); }} className="grid gap-3 rounded-xl bg-[#F8F6F0] p-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`switch-${enrollment.id}`}>
                          Ny klasse
                        </Label>
                        <SelectField
                          id={`switch-${enrollment.id}`}
                          value={switchClass}
                          onValueChange={(value) => selectClass(value, true)}
                          placeholder="Velg klasse"
                          options={classes
                            .filter(
                              (option) => option.id !== enrollment.classId,
                            )
                            .map((option) => ({
                              value: option.id,
                              label: classOptionLabel(
                                option,
                                enrollment.schoolYearId,
                              ),
                            }))}
                        />
                        <p className="text-xs text-admin-muted">
                          Er ingenting betalt ennå, får eleven prisen til den nye klassen. Ellers beholdes prisen.
                        </p>
                      </div>
                      {capacityReview}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="submit"
                          disabled={pending || !switchClass}
                        >
                          {pending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          {needsIncrease ? "Øk kapasitet og plasser" : "Bytt klasse"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setSwitchingId(null)}
                        >
                          Avbryt
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-admin-muted">
            Eleven er ikke plassert i noen klasse ennå.
          </p>
        )}

        {!canPlace ? (
          <p className="text-sm text-admin-muted">
            Opprett en klasse og et skoleår først for å plassere eleven.
          </p>
        ) : !showForm ? (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(true)}
            >
              <Plus className="size-4" />
              Legg til plassering
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="grid gap-3 rounded-xl bg-[#F8F6F0] p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          >
            <div className="grid gap-2">
              <Label htmlFor="class_id" required>
                Klasse
              </Label>
              <SelectField
                id="class_id"
                name="class_id"
                required
                value={selectedClass}
                onValueChange={(value) => selectClass(value)}
                placeholder="Velg klasse"
                options={classes.map((option) => ({
                  value: option.id,
                  label: classOptionLabel(option, selectedYear),
                }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="school_year_id" required>
                Skoleår
              </Label>
              <SelectField
                id="school_year_id"
                name="school_year_id"
                required
                value={selectedYear}
                onValueChange={(value) => { setSelectedYear(value); setNewCapacity(""); }}
                options={schoolYears.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
              />
            </div>
            {capacityReview ? <div className="sm:col-span-4">{capacityReview}</div> : null}
            <Button
              type="submit"
              disabled={pending || !selectedClass || hasActiveInSelectedYear}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {needsIncrease ? "Øk kapasitet og plasser" : "Plasser"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={pending}
            >
              Avbryt
            </Button>
            {hasActiveInSelectedYear ? (
              <p className="text-sm text-[#775108] sm:col-span-4">
                Eleven har allerede en plass dette skoleåret. Bruk «Bytt klasse»
                for å flytte eleven.
              </p>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}

function ConfirmButton({
  label,
  icon,
  iconOnly,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: {
  label: string;
  icon: React.ReactNode;
  iconOnly?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={iconOnly ? "icon" : "default"}
            disabled={pending}
            aria-label={iconOnly ? `${label} plassering` : undefined}
            title={iconOnly ? `${label} plassering` : undefined}
          >
            {icon}
            {iconOnly ? null : label}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

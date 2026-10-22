"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Combine, Loader2, Plus, Split, Trash2 } from "lucide-react";
import { saveClassSlotPlans } from "@/app/[locale]/admin/lesson-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import {
  mergeWithNext,
  nextAdjacent,
  planCells,
  slotRangeLabel,
  slotRangeTimes,
  sortByStart,
  splitPlan,
  validatePlans,
  type SlotPlan,
  type TimeSlot,
} from "@/lib/lessons";

const NO_TEACHER = "none";

export function SlotPlanEditor({
  classId,
  schoolYearId,
  slots,
  plans,
  candidates,
  inactiveTeachers,
  dayPlanHref,
}: {
  classId: string;
  schoolYearId: string;
  slots: TimeSlot[];
  plans: SlotPlan[];
  candidates: { id: string; name: string }[];
  inactiveTeachers: { id: string; name: string }[];
  dayPlanHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<SlotPlan[]>(sortByStart(plans));
  const dirty = JSON.stringify(rows) !== JSON.stringify(sortByStart(plans));
  const problem = validatePlans(rows, slots.length);
  const teachers = [
    ...candidates.map((teacher) => ({ value: teacher.id, label: teacher.name, disabled: false })),
    ...inactiveTeachers.map((teacher) => ({
      value: teacher.id,
      label: `${teacher.name} (ikke aktiv)`,
      disabled: true,
    })),
  ];
  const teacherOptions = [{ value: NO_TEACHER, label: "Ingen fast lærer" }, ...teachers];
  const coTeacherOptions = (teacherId: string | null) => [
    { value: NO_TEACHER, label: "Ingen medlærer" },
    ...teachers.map((option) => ({ ...option, disabled: option.disabled || option.value === teacherId })),
  ];

  function update(index: number, change: Partial<SlotPlan>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...change } : row)));
  }

  function save() {
    if (problem) {
      toast.error(problem);
      return;
    }
    startTransition(async () => {
      const result = await saveClassSlotPlans(classId, schoolYearId, slots.length, rows);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Timeplanen er lagret");
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="slot-plan-title"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="slot-plan-title" className="font-heading text-xl font-bold">
            Timeplan
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-admin-muted">
            Fast oppsett hver skoledag. Vikarer og endringer for én dag legger du inn i{" "}
            <Link
              href={dayPlanHref}
              className="font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Dagsplan
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="min-h-11 rounded-xl bg-admin-action px-4 font-bold text-white hover:bg-[#245E2B]"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CalendarClock aria-hidden="true" className="size-4" />
          )}
          Lagre timeplan
        </Button>
      </div>

      {slots.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[#775108] sm:px-5">
          Skoleåret har ingen timer ennå. Legg dem inn på siden for skoleåret.
        </p>
      ) : (
        <ol className="divide-y divide-[#ECE8DF]">
          {rows.length === 0 ? (
            <li className="bg-[#FBFAF6] px-4 py-3 text-sm text-admin-muted sm:px-5">
              Uten timeplan har klassen én time for hele dagen.
            </li>
          ) : null}
          {planCells(rows, slots.length).map((cell) => {
            if (cell.kind === "empty") {
              const range = { start_position: cell.position, end_position: cell.position };
              return (
                <li
                  key={`empty-${cell.position}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-5"
                >
                  <span>
                    <span className="block font-bold">{slotRangeLabel(slots, range)}</span>
                    <span className="block text-sm text-admin-muted tabular-nums">
                      {slotRangeTimes(slots, range)}
                      {rows.length ? " · Ingen time" : null}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      setRows((current) =>
                        sortByStart([...current, { ...range, subject: null, teacher_guardian_id: null, co_teacher_guardian_id: null }]),
                      )
                    }
                    className="min-h-11 rounded-xl bg-white px-3 font-bold"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Legg til fag
                  </Button>
                </li>
              );
            }
            const { plan, index } = cell;
            const merged = plan.end_position > plan.start_position;
            const label = slotRangeLabel(slots, plan);
            return (
              <li key={`plan-${plan.start_position}`} className="grid gap-3 px-4 py-3 sm:px-5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold">{label}</span>
                  <span className="text-sm text-admin-muted tabular-nums">{slotRangeTimes(slots, plan)}</span>
                  {merged ? (
                    <span className="rounded-full bg-[#DDEEF9] px-2 py-0.5 text-xs font-bold text-[#245D84]">
                      Sammenslått
                    </span>
                  ) : null}
                </p>
                <div className="grid gap-3 md:grid-cols-3 md:items-end xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="grid gap-1.5 text-sm font-bold">
                    Fag
                    <Input
                      value={plan.subject ?? ""}
                      maxLength={120}
                      placeholder="For eksempel Islam, Koran eller Arabisk"
                      onChange={(event) => update(index, { subject: event.target.value || null })}
                      className="bg-white"
                    />
                  </label>
                  <div className="grid gap-1.5">
                    <span id={`plan-teacher-${plan.start_position}`} className="text-sm font-bold">
                      Lærer
                    </span>
                    <SelectField
                      aria-labelledby={`plan-teacher-${plan.start_position}`}
                      options={teacherOptions}
                      value={plan.teacher_guardian_id ?? NO_TEACHER}
                      onValueChange={(value) => {
                        const teacherId = value === NO_TEACHER ? null : value;
                        update(index, {
                          teacher_guardian_id: teacherId,
                          ...(teacherId && teacherId === plan.co_teacher_guardian_id ? { co_teacher_guardian_id: null } : {}),
                        });
                      }}
                      triggerClassName="min-h-11 rounded-xl border-[#CFC9BD] bg-white shadow-none"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span id={`plan-co-teacher-${plan.start_position}`} className="text-sm font-bold">
                      Medlærer
                    </span>
                    <SelectField
                      aria-labelledby={`plan-co-teacher-${plan.start_position}`}
                      options={coTeacherOptions(plan.teacher_guardian_id)}
                      value={plan.co_teacher_guardian_id ?? NO_TEACHER}
                      onValueChange={(value) =>
                        update(index, { co_teacher_guardian_id: value === NO_TEACHER ? null : value })
                      }
                      triggerClassName="min-h-11 rounded-xl border-[#CFC9BD] bg-white shadow-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {nextAdjacent(rows, index) >= 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setRows((current) => mergeWithNext(current, index) ?? current)}
                        className="min-h-11 rounded-xl bg-white px-3 font-bold"
                      >
                        <Combine aria-hidden="true" className="size-4" />
                        Slå sammen med neste
                      </Button>
                    ) : null}
                    {merged ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setRows((current) => splitPlan(current, index))}
                        className="min-h-11 rounded-xl bg-white px-3 font-bold"
                      >
                        <Split aria-hidden="true" className="size-4" />
                        Del opp
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
                      aria-label={`Fjern ${label}`}
                      className="min-h-11 rounded-xl bg-white px-3 font-bold text-[#8B2F2B]"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {dirty && problem ? (
        <p role="alert" className="border-t border-[#ECE8DF] px-4 py-3 text-sm font-bold text-[#8B2F2B] sm:px-5">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

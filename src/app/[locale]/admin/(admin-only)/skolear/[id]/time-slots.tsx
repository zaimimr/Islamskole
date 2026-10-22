"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { saveTimeSlots } from "@/app/[locale]/admin/lesson-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortTime, validateSlots } from "@/lib/lessons";

export type TimeSlotRow = { label: string; starts_at: string; ends_at: string };

function addHour(value: string) {
  const [hours, minutes] = shortTime(value).split(":").map(Number);
  const next = Math.min((Number.isFinite(hours) ? hours : 9) + 1, 23);
  return `${String(next).padStart(2, "0")}:${String(Number.isFinite(minutes) ? minutes : 0).padStart(2, "0")}`;
}

export function TimeSlots({
  schoolYearId,
  slots,
  usedPositions,
}: {
  schoolYearId: string;
  slots: TimeSlotRow[];
  usedPositions: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = slots.map((slot) => ({
    label: slot.label,
    starts_at: shortTime(slot.starts_at),
    ends_at: shortTime(slot.ends_at),
  }));
  const [rows, setRows] = useState<TimeSlotRow[]>(initial);
  const problem = validateSlots(rows);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function update(index: number, change: Partial<TimeSlotRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...change } : row)));
  }

  function add() {
    setRows((current) => {
      const last = current.at(-1);
      const starts = last ? last.ends_at : "10:00";
      return [...current, { label: `Time ${current.length + 1}`, starts_at: starts, ends_at: addHour(starts) }];
    });
  }

  function save() {
    if (problem) {
      toast.error(problem);
      return;
    }
    startTransition(async () => {
      const result = await saveTimeSlots(schoolYearId, rows);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Timene er lagret");
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="time-slots-title"
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
        <div>
          <h2 id="time-slots-title" className="font-heading text-xl font-bold">
            Timer på skoledagen
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Hver klasse fyller disse timene med fag og lærer. Timer kan slås sammen per klasse.
          </p>
        </div>
        <Button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="min-h-11 rounded-xl bg-admin-action px-4 font-bold text-white hover:bg-[#245E2B]"
        >
          {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Clock aria-hidden="true" className="size-4" />}
          Lagre timer
        </Button>
      </div>

      <ol className="divide-y divide-[#ECE8DF]">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end sm:px-5"
          >
            <label className="grid gap-1.5 text-sm font-bold">
              Navn
              <Input
                value={row.label}
                maxLength={60}
                onChange={(event) => update(index, { label: event.target.value })}
                className="bg-white"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              Fra
              <Input
                type="time"
                value={row.starts_at}
                onChange={(event) => update(index, { starts_at: event.target.value })}
                className="bg-white tabular-nums"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              Til
              <Input
                type="time"
                value={row.ends_at}
                onChange={(event) => update(index, { ends_at: event.target.value })}
                className="bg-white tabular-nums"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending || rows.length === 1 || index < usedPositions}
              onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
              aria-label={`Fjern ${row.label || `time ${index + 1}`}`}
              title={index < usedPositions ? "Timen brukes i en timeplan" : undefined}
              className="min-h-11 rounded-xl bg-white px-3 font-bold"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              <span className="sm:sr-only">Fjern</span>
            </Button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECE8DF] bg-[#FBFAF6] px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="outline"
          disabled={pending || rows.length >= 12}
          onClick={add}
          className="min-h-11 rounded-xl bg-white px-3 font-bold"
        >
          <Plus aria-hidden="true" className="size-4" />
          Legg til time
        </Button>
        {dirty && problem ? (
          <p role="alert" className="text-sm font-bold text-[#8B2F2B]">
            {problem}
          </p>
        ) : null}
      </div>
    </section>
  );
}

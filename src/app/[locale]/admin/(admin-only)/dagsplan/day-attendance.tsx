import { ChevronDown } from "lucide-react";
import { AttendanceRoster } from "@/components/portal/teacher/attendance-roster";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { lessonTitle, slotRangeTimes, type TimeSlot } from "@/lib/lessons";
import { getLessonRoster } from "@/lib/portal/data";
import { osloToday } from "@/lib/dates";
import type { DayPlanClass } from "./day-plan-grid";

export async function DayAttendance({
  basePath,
  day,
  yearLabel,
  slots,
  classes,
  query,
}: {
  basePath: string;
  day: { id: string; date: string; cancelled: boolean };
  yearLabel: string;
  slots: TimeSlot[];
  classes: DayPlanClass[];
  query: Record<string, string | string[] | undefined>;
}) {
  const position = slots.find((slot) => String(slot.position) === query.time)?.position ?? slots[0]?.position ?? 1;
  const selectedClass = classes.some((row) => row.id === query.klasse) ? String(query.klasse) : "alle";
  const visible = selectedClass === "alle" ? classes : classes.filter((row) => row.id === selectedClass);
  const rosters = await Promise.all(visible.map(async (row) => {
    const lesson = row.lessons.find((item) => item.start_position <= position && item.end_position >= position);
    return { row, lesson, students: lesson ? await getLessonRoster(lesson.id, yearLabel) : [] };
  }));

  return (
    <section aria-label="Oppmøte" className="grid gap-4">
      <form action={`${basePath}/dagsplan`} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="dag" value={day.id} />
        <input type="hidden" name="visning" value="oppmote" />
        <div className="grid min-w-48 flex-1 gap-1.5 sm:flex-none">
          <label id="attendance-class-label" className="text-sm font-bold">Klasse</label>
          <SelectField
            key={selectedClass}
            name="klasse"
            aria-labelledby="attendance-class-label"
            defaultValue={selectedClass}
            options={[{ value: "alle", label: "Alle klasser" }, ...classes.map((row) => ({ value: row.id, label: row.name }))]}
          />
        </div>
        <div className="grid min-w-40 flex-1 gap-1.5 sm:flex-none">
          <label id="attendance-time-label" className="text-sm font-bold">Time</label>
          <SelectField
            key={position}
            name="time"
            aria-labelledby="attendance-time-label"
            defaultValue={String(position)}
            options={slots.map((slot) => ({ value: String(slot.position), label: `${slot.label} · ${slotRangeTimes(slots, { start_position: slot.position, end_position: slot.position })}` }))}
          />
        </div>
        <Button type="submit">Vis</Button>
      </form>
      {rosters.map(({ row, lesson, students }) => (
        <details key={`${row.id}:${lesson?.id ?? "empty"}:${day.id}`} open className="group" aria-label={row.name}>
          <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <h2 className="font-heading text-xl font-bold">{row.name}</h2>
            <span className="text-sm text-admin-muted">
              {lesson ? lessonTitle(lesson, slots, "Hele dagen") : "Ingen time"}
            </span>
            <ChevronDown aria-hidden="true" className="ml-auto size-4 transition-transform group-open:rotate-180" />
          </summary>
          {lesson ? (
            <AttendanceRoster
              key={lesson.id}
              rows={students}
              lessonId={lesson.id}
              markable={!day.cancelled && !lesson.cancelled && day.date <= osloToday()}
              reportable={false}
            />
          ) : null}
          {lesson?.cancelled ? <p className="py-2 text-sm text-admin-muted">Timen er avlyst.</p> : null}
        </details>
      ))}
    </section>
  );
}

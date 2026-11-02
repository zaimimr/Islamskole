import Link from "next/link";
import { getLessonRoster } from "@/lib/portal/data";
import { slotRangeTimes, type TimeSlot } from "@/lib/lessons";
import { osloToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AttendanceClasses } from "./attendance-classes";
import type { DayPlanClass } from "./day-plan-grid";

const toggleClass = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export async function DayAttendance({ basePath, day, yearLabel, slots, classes, query }: {
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
    return { id: row.id, name: row.name, classTeachers: row.classTeachers, lesson: lesson ?? null, students: lesson ? await getLessonRoster(lesson.id, yearLabel) : [] };
  }));
  const href = (classId: string, time: number) => `${basePath}/dagsplan?dag=${day.id}&visning=oppmote&klasse=${classId}&time=${time}`;
  const sorted = [...rosters].sort((left, right) => Number(Boolean(right.lesson?.needsSubstitute)) - Number(Boolean(left.lesson?.needsSubstitute)));

  return (
    <section aria-label="Oppmøte" className="grid gap-4">
      <nav aria-label="Klasse" className="grid grid-cols-2 gap-1 rounded-xl bg-[#EFECE4] p-1 sm:grid-cols-3 lg:flex lg:flex-wrap">
        {[{ id: "alle", name: "Alle" }, ...classes].map((row) => (
          <Link key={row.id} href={href(row.id, position)} scroll={false} aria-current={row.id === selectedClass ? "page" : undefined} className={cn(toggleClass, "min-w-0 break-words text-center", row.id === selectedClass ? "bg-white text-admin-action ring-1 ring-foreground/10" : "text-admin-muted hover:bg-white/60")}>{row.name}</Link>
        ))}
      </nav>
      <nav aria-label="Time" className="flex flex-wrap gap-1 border-b border-foreground/10 pb-2">
        {slots.map((slot) => (
          <Link key={slot.position} href={href(selectedClass, slot.position)} scroll={false} aria-current={slot.position === position ? "page" : undefined} className={cn(toggleClass, "flex-col gap-0.5", slot.position === position ? "bg-admin-action text-white" : "text-admin-muted hover:bg-muted")}>
            <span>{slot.position}. time</span><span className="text-xs font-normal tabular-nums">{slotRangeTimes(slots, { start_position: slot.position, end_position: slot.position })}</span>
          </Link>
        ))}
      </nav>
      <AttendanceClasses basePath={basePath} key={day.id} day={day} rows={sorted} selectedClass={selectedClass} future={day.date > osloToday()} />
    </section>
  );
}

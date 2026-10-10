import { WeekEntryContent, entryLabel } from "@/components/semester-plan/week-entry";
import { LessonMaterials } from "@/components/portal/lesson-materials";
import { weekStartOf, type WeekPlanEntry } from "@/lib/semester-plan";
import type { TimeSlot } from "@/lib/lessons";

export function LessonPreparation({ classId, schoolYearId, lessonId, date, startPosition, endPosition, entries, slots, locale }: {
  classId: string; schoolYearId: string; lessonId: string; date: string; startPosition: number; endPosition: number;
  entries: WeekPlanEntry[]; slots: TimeSlot[]; locale: string;
}) {
  const en = locale === "en";
  const plans = entries.filter((entry) => entry.week_start === weekStartOf(date) &&
    (entry.start_position === null || (entry.start_position <= endPosition && (entry.end_position ?? 0) >= startPosition)));
  return <section aria-label={en ? "Lesson preparation" : "Forberedelse til timen"} className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:p-5">
    <h2 className="font-heading text-xl font-semibold">{en ? "Lesson preparation" : "Forberedelse til timen"}</h2>
    {plans.length ? <ul className="grid gap-3">{plans.map((entry) => <li key={entry.id}>
      <WeekEntryContent entry={entry} label={entryLabel(entry, slots, en ? "Whole class" : "Hele klassen")} linkLabel={en ? "Resource" : "Ressurs"} locale={locale} />
    </li>)}</ul> : null}
    <LessonMaterials classId={classId} schoolYearId={schoolYearId} lessonId={lessonId} locale={locale} editable />
  </section>;
}

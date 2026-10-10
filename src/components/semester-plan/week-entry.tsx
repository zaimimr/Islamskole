import { ExternalLink } from "lucide-react";
import { lessonTitle, type TimeSlot } from "@/lib/lessons";
import { isoWeekNumber, isSafeLink, type WeekPlanEntry } from "@/lib/semester-plan";
import { formatSchoolDay } from "@/lib/portal/teacher-days";

export function entryLabel(
  entry: Pick<WeekPlanEntry, "start_position" | "end_position" | "subject">,
  slots: Pick<TimeSlot, "position" | "label">[],
  general: string,
): string {
  if (entry.start_position === null || entry.end_position === null) return entry.subject || general;
  return lessonTitle(
    { start_position: entry.start_position, end_position: entry.end_position, subject: entry.subject },
    slots,
    general,
  );
}

export function weekHeading(weekStart: string, dates: string[], locale: string) {
  return {
    number: isoWeekNumber(weekStart),
    days: dates
      .map((date) => formatSchoolDay(date, locale, { weekday: "short", day: "numeric", month: "short" }))
      .join(", "),
  };
}

export function WeekEntryContent({
  entry,
  label,
  linkLabel,
  locale = "no",
}: {
  entry: Pick<WeekPlanEntry, "title" | "description" | "resource_url" | "goals" | "completed_at">;
  label: string;
  linkLabel: string;
  locale?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-xs font-semibold tracking-wide text-brand-green-dark uppercase">{label}</p>
      <p className="font-semibold text-pretty">{entry.title}</p>
      {entry.completed_at ? <p className="text-sm font-semibold text-brand-green-dark">{locale === "en" ? "Covered" : "Gjennomført"}</p> : null}
      {entry.goals ? <p className="text-sm whitespace-pre-line"><span className="font-semibold">{locale === "en" ? "Goals" : "Læringsmål"}: </span>{entry.goals}</p> : null}
      {entry.description ? (
        <p className="text-sm whitespace-pre-line text-pretty text-foreground/80">{entry.description}</p>
      ) : null}
      {isSafeLink(entry.resource_url) ? (
        <a
          href={entry.resource_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-green-dark underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {linkLabel}
        </a>
      ) : null}
    </div>
  );
}

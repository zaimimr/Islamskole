export type WeekPlanEntry = {
  id: string;
  class_id: string;
  school_year_id: string;
  week_start: string;
  start_position: number | null;
  end_position: number | null;
  subject: string | null;
  title: string;
  description: string | null;
  goals?: string | null;
  completed_at?: string | null;
  resource_url: string | null;
  sort_order: number;
  updated_at: string;
};

export type WeekPlanDraft = Pick<
  WeekPlanEntry,
  "start_position" | "end_position" | "subject" | "title" | "description" | "resource_url" | "goals"
>;

export type PlanWeek = {
  weekStart: string;
  dates: string[];
};

export type WeekPhase = "past" | "current" | "upcoming";

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const weekday = utcDate(date).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function isoWeekNumber(date: string): number {
  const thursday = addDays(weekStartOf(date), 3);
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  const dayOfYear = (utcDate(thursday).getTime() - utcDate(yearStart).getTime()) / 86_400_000;
  return Math.floor(dayOfYear / 7) + 1;
}

export function planWeeks(
  days: { date: string; cancelled?: boolean }[],
  entries: Pick<WeekPlanEntry, "week_start">[] = [],
): PlanWeek[] {
  const weeks = new Map<string, string[]>();
  for (const day of days) {
    if (day.cancelled) continue;
    const start = weekStartOf(day.date);
    weeks.set(start, [...(weeks.get(start) ?? []), day.date]);
  }
  for (const entry of entries) {
    if (!weeks.has(entry.week_start)) weeks.set(entry.week_start, []);
  }
  return [...weeks]
    .map(([weekStart, dates]) => ({ weekStart, dates: [...dates].sort() }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

export function weekPhase(weekStart: string, today: string): WeekPhase {
  const current = weekStartOf(today);
  if (weekStart === current) return "current";
  return weekStart < current ? "past" : "upcoming";
}

export function focusWeek(weeks: PlanWeek[], today: string): string | null {
  const current = weekStartOf(today);
  return weeks.find((week) => week.weekStart >= current)?.weekStart ?? null;
}

export function sortEntries<T extends Pick<WeekPlanEntry, "start_position" | "sort_order" | "title">>(entries: T[]): T[] {
  return [...entries].sort(
    (left, right) =>
      (left.start_position ?? 0) - (right.start_position ?? 0) ||
      left.sort_order - right.sort_order ||
      left.title.localeCompare(right.title, "nb-NO"),
  );
}

export function entriesByWeek<T extends WeekPlanEntry>(entries: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    grouped.set(entry.week_start, [...(grouped.get(entry.week_start) ?? []), entry]);
  }
  for (const [week, rows] of grouped) grouped.set(week, sortEntries(rows));
  return grouped;
}

function sameSlot(left: WeekPlanDraft, right: WeekPlanDraft): boolean {
  return (
    left.start_position === right.start_position &&
    left.end_position === right.end_position &&
    left.title.trim().toLocaleLowerCase("nb-NO") === right.title.trim().toLocaleLowerCase("nb-NO")
  );
}

export function missingInWeek(draft: WeekPlanDraft, existing: WeekPlanDraft[]): boolean {
  return !existing.some((row) => sameSlot(row, draft));
}

export function copyableEntries<T extends WeekPlanDraft>(source: T[], target: WeekPlanDraft[]): WeekPlanDraft[] {
  return source
    .filter((row) => missingInWeek(row, target))
    .map((row) => ({
      start_position: row.start_position,
      end_position: row.end_position,
      subject: row.subject,
      title: row.title,
      description: row.description,
      ...(row.goals !== undefined ? { goals: row.goals } : {}),
      resource_url: row.resource_url,
    }));
}

export function previousWeek(weeks: PlanWeek[], weekStart: string): string | null {
  const earlier = weeks.filter((week) => week.weekStart < weekStart);
  return earlier.length ? earlier[earlier.length - 1].weekStart : null;
}

export function isSafeLink(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

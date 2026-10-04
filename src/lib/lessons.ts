export type TimeSlot = {
  position: number;
  label: string;
  starts_at: string;
  ends_at: string;
};

export type SlotRange = {
  start_position: number;
  end_position: number;
};

export type SlotPlan = SlotRange & {
  subject: string | null;
  teacher_guardian_id: string | null;
  co_teacher_guardian_id: string | null;
};

export type PlanCell<T extends SlotRange> =
  | { kind: "plan"; plan: T; index: number }
  | { kind: "empty"; position: number };

export type DayStatus = "til_stede" | "fravaer" | "sent" | "meldt_fravaer";

const STATUS_WEIGHT: Record<DayStatus, number> = {
  fravaer: 4,
  meldt_fravaer: 3,
  sent: 2,
  til_stede: 1,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function shortTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

export function rangesOverlap(left: SlotRange, right: SlotRange): boolean {
  return left.start_position <= right.end_position && right.start_position <= left.end_position;
}

export function sortByStart<T extends SlotRange>(items: T[]): T[] {
  return [...items].sort((left, right) => left.start_position - right.start_position);
}

export function validateSlots(slots: Pick<TimeSlot, "label" | "starts_at" | "ends_at">[]): string | null {
  if (!slots.length) return "Skoledagen må ha minst én time.";
  for (const [index, slot] of slots.entries()) {
    const name = slot.label.trim() || `Time ${index + 1}`;
    if (!slot.label.trim()) return `Time ${index + 1} mangler navn.`;
    if (slot.label.trim().length > 60) return `Navnet på ${name} er for langt.`;
    if (!TIME.test(slot.starts_at) || !TIME.test(slot.ends_at)) return `${name} mangler gyldig klokkeslett.`;
    if (shortTime(slot.ends_at) <= shortTime(slot.starts_at)) return `${name} må slutte etter at den starter.`;
    const previous = slots[index - 1];
    if (previous && shortTime(slot.starts_at) < shortTime(previous.ends_at)) {
      return `${name} starter før forrige time er ferdig.`;
    }
  }
  return null;
}

export function validatePlans(plans: SlotRange[], slotCount: number): string | null {
  const sorted = sortByStart(plans);
  for (const [index, plan] of sorted.entries()) {
    if (!Number.isInteger(plan.start_position) || !Number.isInteger(plan.end_position)) {
      return "Ugyldig time.";
    }
    if (plan.start_position < 1 || plan.end_position > slotCount) {
      return "Timene må ligge innenfor skoledagens timer.";
    }
    if (plan.end_position < plan.start_position) return "En time kan ikke slutte før den starter.";
    const previous = sorted[index - 1];
    if (previous && rangesOverlap(previous, plan)) return "To timer overlapper hverandre.";
  }
  return null;
}

export function planCells<T extends SlotRange>(plans: T[], slotCount: number): PlanCell<T>[] {
  const cells: PlanCell<T>[] = [];
  const indexed = plans.map((plan, index) => ({ plan, index }));
  let position = 1;
  while (position <= slotCount) {
    const match = indexed.find(({ plan }) => plan.start_position === position);
    if (match) {
      cells.push({ kind: "plan", plan: match.plan, index: match.index });
      position = Math.max(match.plan.end_position, position) + 1;
    } else {
      cells.push({ kind: "empty", position });
      position += 1;
    }
  }
  return cells;
}

export function nextAdjacent<T extends SlotRange>(plans: T[], index: number): number {
  const current = plans[index];
  if (!current) return -1;
  return plans.findIndex((plan) => plan.start_position === current.end_position + 1);
}

export function mergeWithNext<T extends SlotRange>(plans: T[], index: number): T[] | null {
  const nextIndex = nextAdjacent(plans, index);
  if (nextIndex < 0) return null;
  const merged = { ...plans[index], end_position: plans[nextIndex].end_position };
  return sortByStart(plans.filter((_, position) => position !== index && position !== nextIndex).concat(merged));
}

export function splitPlan<T extends SlotRange>(plans: T[], index: number): T[] {
  const current = plans[index];
  if (!current || current.end_position === current.start_position) return plans;
  const parts: T[] = [];
  for (let position = current.start_position; position <= current.end_position; position += 1) {
    parts.push({ ...current, start_position: position, end_position: position });
  }
  return sortByStart(plans.filter((_, position) => position !== index).concat(parts));
}

export function slotRangeLabel(slots: Pick<TimeSlot, "position" | "label">[], range: SlotRange): string {
  const labels: string[] = [];
  for (let position = range.start_position; position <= range.end_position; position += 1) {
    labels.push(slots.find((slot) => slot.position === position)?.label ?? `Time ${position}`);
  }
  return labels.join(" + ");
}

export function slotRangeTimes(slots: Pick<TimeSlot, "position" | "starts_at" | "ends_at">[], range: SlotRange): string {
  const first = slots.find((slot) => slot.position === range.start_position);
  const last = slots.find((slot) => slot.position === range.end_position);
  if (!first || !last) return "";
  return `${shortTime(first.starts_at)}-${shortTime(last.ends_at)}`;
}

export type BookableLesson = SlotRange & {
  id: string;
  school_day_id: string;
  teacher_guardian_id: string | null;
  co_teacher_guardian_id?: string | null;
  cancelled: boolean;
};

export function lessonTeacherIds(lesson: Pick<BookableLesson, "teacher_guardian_id" | "co_teacher_guardian_id">): string[] {
  return [lesson.teacher_guardian_id, lesson.co_teacher_guardian_id ?? null].filter((id): id is string => Boolean(id));
}

export function needsSubstitute(
  lesson: Pick<BookableLesson, "teacher_guardian_id" | "co_teacher_guardian_id" | "cancelled">,
  absent: ReadonlySet<string>,
  classTeacherIds: string[] = [],
): boolean {
  if (lesson.cancelled || absent.size === 0) return false;
  const assigned = lessonTeacherIds(lesson);
  const responsible = assigned.length ? assigned : classTeacherIds;
  return responsible.length > 0 && responsible.every((id) => absent.has(id));
}

export function findDoubleBookings(lessons: BookableLesson[]): Set<string> {
  const clashes = new Set<string>();
  const active = lessons.filter((lesson) => lessonTeacherIds(lesson).length && !lesson.cancelled);
  for (const [index, lesson] of active.entries()) {
    const teachers = lessonTeacherIds(lesson);
    for (const other of active.slice(index + 1)) {
      if (
        lessonTeacherIds(other).some((id) => teachers.includes(id)) &&
        other.school_day_id === lesson.school_day_id &&
        rangesOverlap(lesson, other)
      ) {
        clashes.add(lesson.id);
        clashes.add(other.id);
      }
    }
  }
  return clashes;
}

export function joinTeacherNames(names: (string | null | undefined)[], locale = "nb"): string | null {
  const present = names.filter((name): name is string => Boolean(name));
  if (!present.length) return null;
  return new Intl.ListFormat(locale === "en" ? "en" : "nb", { type: "conjunction" }).format(present);
}

export function collapseDayStatus(statuses: (DayStatus | null | undefined)[]): DayStatus | null {
  let worst: DayStatus | null = null;
  for (const status of statuses) {
    if (!status) continue;
    if (!worst || STATUS_WEIGHT[status] > STATUS_WEIGHT[worst]) worst = status;
  }
  return worst;
}

export function statusByDay<T extends { date: string | null; status: DayStatus }>(rows: T[]): Map<string, DayStatus> {
  const grouped = new Map<string, DayStatus[]>();
  for (const row of rows) {
    if (!row.date) continue;
    grouped.set(row.date, [...(grouped.get(row.date) ?? []), row.status]);
  }
  const result = new Map<string, DayStatus>();
  for (const [date, statuses] of grouped) {
    const status = collapseDayStatus(statuses);
    if (status) result.set(date, status);
  }
  return result;
}

export function isWholeDay(range: SlotRange & { subject: string | null }, slotCount: number): boolean {
  return !range.subject && range.start_position === 1 && range.end_position >= slotCount;
}

export function lessonTitle(
  range: SlotRange & { subject: string | null },
  slots: Pick<TimeSlot, "position" | "label">[],
  wholeDayLabel: string,
): string {
  if (isWholeDay(range, slots.length)) return wholeDayLabel;
  const label = slotRangeLabel(slots, range);
  return range.subject ? `${label} - ${range.subject}` : label;
}

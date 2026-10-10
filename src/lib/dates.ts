export const OSLO = "Europe/Oslo";

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function osloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: OSLO }).format(now);
}

export function osloMonthKey(value: string | Date): string {
  return osloToday(typeof value === "string" ? new Date(value) : value).slice(0, 7);
}

export function formatOsloDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  if (!value) return "";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("nb-NO", { timeZone: OSLO, ...options }).format(date);
}

export function formatOsloDateTime(value: string | Date | null | undefined): string {
  return formatOsloDate(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function osloLocalToIso(local: string): string {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OSLO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asOslo = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asOslo - guess)).toISOString();
}

export function isoToOsloLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: OSLO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

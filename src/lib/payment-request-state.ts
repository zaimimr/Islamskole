export type OpenRequest = {
  paymentId: string;
  amount: number;
  status: string;
  sentAt: string;
  lastSentAt: string;
  dueDate: string | null;
  reminderCount: number;
  studentIds: string[];
  fromPlan: boolean;
  sent: boolean;
};

export type RequestTone = "ok" | "info" | "warn" | "danger" | "neutral";

export type RequestKind =
  | "betalt"
  | "fritatt"
  | "venter"
  | "utlopt"
  | "forfalt"
  | "sendt"
  | "lenke"
  | "delvis"
  | "ubetalt";

export type RequestView = {
  kind: RequestKind;
  tone: RequestTone;
  label: string;
  detail: string | null;
};

export type BalanceLike = { owed: number; paid: number; remaining: number };

const dateFormat = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  day: "numeric",
  month: "short",
});

export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return dateFormat.format(date).replace(/\.$/, "");
}

function kr(ore: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(
    Math.round(ore / 100),
  );
}

export function defaultRequestDueDate(today: string): string {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 5);
  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));
  return date.toISOString().slice(0, 10);
}

export function requestLine(request: OpenRequest, remaining: number): string {
  const amount = request.amount < remaining ? ` ${kr(request.amount)} kr` : "";
  return [
    request.status === "avbrutt"
      ? `Vipps-forespørsel${amount} utløpt`
      : `Vipps-forespørsel${amount} sendt ${shortDate(request.sentAt)}`,
    request.dueDate ? `frist ${shortDate(request.dueDate)}` : null,
    request.status !== "avbrutt" && request.reminderCount > 0
      ? `påminnet ${request.reminderCount}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function newestRequest(
  requests: (OpenRequest | null | undefined)[],
): OpenRequest | null {
  let newest: OpenRequest | null = null;
  for (const request of requests) {
    if (request && (!newest || newest.sentAt < request.sentAt)) newest = request;
  }
  return newest;
}

export function describeRequest(
  balance: BalanceLike | null,
  request: OpenRequest | null,
  today: string,
): RequestView {
  if (!balance || balance.owed <= 0) {
    return { kind: "fritatt", tone: "neutral", label: "Skal ikke betale", detail: null };
  }
  if (balance.remaining <= 0) {
    return { kind: "betalt", tone: "ok", label: "Betalt", detail: null };
  }
  const partial =
    balance.paid > 0 ? `${kr(balance.paid)} av ${kr(balance.owed)} kr` : null;
  if (request) {
    if (request.status === "autorisert") {
      return { kind: "venter", tone: "info", label: "Betaling venter", detail: partial };
    }
    const line = requestLine(request, balance.remaining);
    if (request.status === "avbrutt") {
      return { kind: "utlopt", tone: "danger", label: "Utløpt", detail: line };
    }
    if (!request.sent) {
      return {
        kind: "lenke",
        tone: "info",
        label: "Lenke laget",
        detail: `Vipps-lenke laget ${shortDate(request.sentAt)}`,
      };
    }
    if (request.dueDate && request.dueDate < today) {
      return { kind: "forfalt", tone: "danger", label: "Forfalt", detail: line };
    }
    return { kind: "sendt", tone: "info", label: "Sendt i Vipps", detail: line };
  }
  if (partial) {
    return { kind: "delvis", tone: "warn", label: partial, detail: "Ikke betalt" };
  }
  return { kind: "ubetalt", tone: "warn", label: "Ikke betalt", detail: null };
}

export function latestRequestByStudent(
  requests: OpenRequest[],
): Map<string, OpenRequest> {
  const byStudent = new Map<string, OpenRequest>();
  for (const request of requests) {
    for (const studentId of request.studentIds) {
      const current = byStudent.get(studentId);
      if (!current || current.sentAt < request.sentAt) {
        byStudent.set(studentId, request);
      }
    }
  }
  return byStudent;
}

export function autoRequestDue(
  dueDates: (string | null)[],
  today: string,
  horizon: string,
): { send: boolean; dueDate: string | null } {
  const dates = dueDates.filter((date): date is string => Boolean(date)).sort();
  if (dates.length === 0) return { send: true, dueDate: null };
  if (dates[0] > horizon) return { send: false, dueDate: dates[0] };
  const upcoming = dates.find((date) => date >= today) ?? null;
  return { send: true, dueDate: upcoming };
}

export function splitAcross(
  amount: number,
  remaining: { studentId: string; remaining: number }[],
): { studentId: string; amount: number }[] {
  let left = amount;
  const rows: { studentId: string; amount: number }[] = [];
  for (const row of remaining) {
    if (left <= 0) break;
    const share = Math.min(Math.max(row.remaining, 0), left);
    if (share > 0) rows.push({ studentId: row.studentId, amount: share });
    left -= share;
  }
  return rows;
}

export function reminderDue(
  request: OpenRequest,
  now: Date,
  reminderDays: number,
  maxReminders: number,
): boolean {
  if (request.status === "autorisert") return false;
  if (request.reminderCount >= maxReminders) return false;
  const last = new Date(request.lastSentAt).getTime();
  return now.getTime() - last >= reminderDays * 86_400_000;
}

export function nextAutoStep(
  input: {
    enabled: boolean;
    paused: boolean;
    onPlan: boolean;
    remaining: number;
    request: OpenRequest | null;
    reminderDays: number;
    maxReminders: number;
    firstDueDate: string | null;
    leadDays: number;
  },
  today: string,
): string | null {
  if (input.remaining <= 0) return null;
  if (input.paused) return "Pause";
  if (!input.enabled) return null;
  if (input.onPlan && !input.request) return "Avdragsplan";
  const request = input.request;
  if (request) {
    if (request.status === "autorisert") return null;
    if (request.reminderCount >= input.maxReminders) return "Ingen flere påminnelser";
    const next = new Date(new Date(request.lastSentAt).getTime() + input.reminderDays * 86_400_000);
    const date = next.toISOString().slice(0, 10);
    return `Påminnelse ${date <= today ? "i dag" : shortDate(date)}`;
  }
  if (!input.firstDueDate) return "Sendes i dag";
  const start = new Date(`${input.firstDueDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - input.leadDays);
  const date = start.toISOString().slice(0, 10);
  return `Sendes ${date <= today ? "i dag" : shortDate(date)}`;
}

export type FamilyRequestCandidate = {
  studentId: string;
  familyId: string | null;
  active: boolean;
  paused: boolean;
  onPlan: boolean;
  remaining: number;
  request: OpenRequest | null;
};

export type BulkPlan = {
  create: string[][];
  renew: string[];
  remind: string[];
  skipped: number;
};

export function planBulkRequests(
  statuses: Iterable<FamilyRequestCandidate>,
  options: { now: Date; reminderDays: number },
): BulkPlan {
  const families = new Map<string, FamilyRequestCandidate[]>();
  for (const status of statuses) {
    if (status.remaining <= 0 || !status.active) continue;
    const key = status.familyId ?? status.studentId;
    families.set(key, [...(families.get(key) ?? []), status]);
  }
  const create: string[][] = [];
  const renew = new Set<string>();
  const remind = new Set<string>();
  let skipped = 0;
  for (const members of families.values()) {
    if (members.some((member) => member.paused)) {
      skipped += 1;
      continue;
    }
    const uncovered = members.filter((member) => !member.request && !member.onPlan);
    if (uncovered.length > 0) create.push(uncovered.map((member) => member.studentId));
    for (const member of members) {
      const request = member.request;
      if (!request || request.status === "autorisert") continue;
      if (request.status === "avbrutt") renew.add(request.paymentId);
      else if (reminderDue(request, options.now, options.reminderDays, Infinity)) {
        remind.add(request.paymentId);
      }
    }
    const touched = members.some(
      (member) =>
        member.request &&
        (renew.has(member.request.paymentId) || remind.has(member.request.paymentId)),
    );
    if (uncovered.length === 0 && !touched) skipped += 1;
  }
  return { create, renew: [...renew], remind: [...remind], skipped };
}

export type PlannedInstallment = {
  id: string;
  studentId: string;
  amount: number;
  dueDate: string;
};

export function pickNextInstallment(
  rows: PlannedInstallment[],
  studentIds: string[],
): { installmentId: string; amount: number; dueDate: string } | null {
  const ids = new Set(studentIds);
  const mine = rows
    .filter((row) => ids.has(row.studentId) && row.amount > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const first = mine[0];
  if (!first) return null;
  const amount = mine
    .filter((row) => row.dueDate === first.dueDate)
    .reduce((sum, row) => sum + row.amount, 0);
  return { installmentId: first.id, amount, dueDate: first.dueDate };
}

export function uncoveredRemaining(
  children: { remaining: number; request: OpenRequest | null }[],
): number {
  return children
    .filter((child) => !child.request)
    .reduce((sum, child) => sum + Math.max(child.remaining, 0), 0);
}

export function supersedeAction(
  vipps: { state: string; capturedAmount: number } | null,
): "keep" | "cancel" | "void" {
  if (!vipps) return "keep";
  if (vipps.state === "AUTHORIZED" || vipps.capturedAmount > 0) return "keep";
  return vipps.state === "CREATED" ? "cancel" : "void";
}

import "server-only";
import { splitAcross, type OpenRequest } from "@/lib/payment-request-state";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { osloToday } from "@/lib/dates";

type Client = SupabaseClient<Database>;

export type PayState = "betalt" | "delvis" | "venter" | "ubetalt" | "fritatt";

export type PayStateInput = {
  owed: number | null;
  paid: number | null;
  remaining: number | null;
  hasOpenLink?: boolean;
};

export const payStateOrder: Record<PayState, number> = {
  delvis: 0,
  venter: 1,
  ubetalt: 2,
  betalt: 3,
  fritatt: 4,
};

export function getPayState(row: PayStateInput): PayState {
  const owed = row.owed ?? 0;
  const paid = row.paid ?? 0;
  const remaining = row.remaining ?? Math.max(owed - paid, 0);
  if (owed <= 0) return "fritatt";
  if (remaining <= 0) return "betalt";
  if (paid > 0) return "delvis";
  if (row.hasOpenLink) return "venter";
  return "ubetalt";
}

export type YearBalanceRow = {
  studentId: string;
  familyId: string | null;
  firstName: string | null;
  lastName: string | null;
  className: string | null;
  placed: boolean;
  missingFee: boolean;
  grossOre: number;
  discountOre: number;
  owedOre: number;
  paidOre: number;
  appliedOre: number;
  remainingOre: number;
  overpaidOre: number;
  hasOpenLink: boolean;
  state: PayState;
  feeNote: string | null;
};

export type BalanceSummary = {
  schoolYearId: string | null;
  schoolYearLabel: string | null;
  grossOre: number;
  owedOre: number;
  discountOre: number;
  paidOre: number;
  remainingOre: number;
  overpaidOre: number;
  studentCount: number;
  exemptCount: number;
  missingFeeCount: number;
  unplacedCount: number;
  unplacedRemainingOre: number;
};

export type ActiveYear = {
  id: string;
  label: string;
  sem1_due_on: string | null;
  sem2_due_on: string | null;
  enrollment_fee: number;
};

export async function getActiveYear(supabase: Client): Promise<ActiveYear | null> {
  const { data, error } = await supabase
    .from("school_years")
    .select("id, label, sem1_due_on, sem2_due_on, enrollment_fee")
    .eq("is_active", true)
    .order("label", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Kunne ikke hente aktivt skoleår");
  return (data as ActiveYear | null) ?? null;
}

async function openLinkStudentIds(
  supabase: Client,
  schoolYearId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, student_id")
    .eq("school_year_id", schoolYearId)
    .in("status", ["opprettet", "autorisert"])
    .is("voided_at", null);
  if (error) throw new Error("Kunne ikke hente åpne betalingslenker");
  const rows = (data as { id: string; student_id: string | null }[] | null) ?? [];
  const ids = new Set(
    rows.map((row) => row.student_id).filter((id): id is string => Boolean(id)),
  );
  const groupIds = rows.filter((row) => !row.student_id).map((row) => row.id);
  if (groupIds.length === 0) return ids;

  const [installmentResult, applicationResult] = await Promise.all([
    supabase.from("installments").select("student_id").in("payment_id", groupIds),
    supabase.from("student_applications").select("id").in("payment_id", groupIds),
  ]);
  if (installmentResult.error || applicationResult.error) {
    throw new Error("Kunne ikke hente åpne betalingslenker");
  }
  for (const row of (installmentResult.data as { student_id: string }[] | null) ?? []) {
    ids.add(row.student_id);
  }
  const applicationIds = ((applicationResult.data as { id: string }[] | null) ?? []).map(
    (row) => row.id,
  );
  if (applicationIds.length > 0) {
    const { data: studentData, error: studentError } = await supabase
      .from("students")
      .select("id")
      .in("application_id", applicationIds);
    if (studentError) throw new Error("Kunne ikke hente åpne betalingslenker");
    for (const row of (studentData as { id: string }[] | null) ?? []) ids.add(row.id);
  }
  return ids;
}

export async function getYearBalances(
  supabase: Client,
  schoolYearId: string,
): Promise<YearBalanceRow[]> {
  const [balanceResult, feeResult, enrollmentResult, openLinks] = await Promise.all([
    supabase
      .from("student_balances")
      .select("student_id, owed, paid, remaining")
      .eq("school_year_id", schoolYearId),
    supabase
      .from("student_fees")
      .select("student_id, amount, note")
      .eq("school_year_id", schoolYearId),
    supabase
      .from("enrollments")
      .select("student_id, classes(name_no)")
      .eq("school_year_id", schoolYearId)
      .eq("status", "aktiv"),
    openLinkStudentIds(supabase, schoolYearId),
  ]);
  if (balanceResult.error || feeResult.error || enrollmentResult.error) {
    throw new Error("Kunne ikke hente saldoer");
  }

  const balances = new Map(
    ((balanceResult.data as
      | { student_id: string | null; owed: number | null; paid: number | null; remaining: number | null }[]
      | null) ?? [])
      .filter((row) => row.student_id)
      .map((row) => [row.student_id as string, row]),
  );
  const fees = new Map(
    ((feeResult.data as { student_id: string; amount: number; note: string | null }[] | null) ?? []).map(
      (row) => [row.student_id, row],
    ),
  );
  const classByStudent = new Map<string, string | null>();
  for (const row of (enrollmentResult.data as
    | { student_id: string; classes: { name_no: string | null } | null }[]
    | null) ?? []) {
    if (!classByStudent.has(row.student_id)) {
      classByStudent.set(row.student_id, row.classes?.name_no ?? null);
    }
  }

  const studentIds = [...new Set([...balances.keys(), ...classByStudent.keys()])];
  if (studentIds.length === 0) return [];

  const { data: studentData, error: studentError } = await supabase
    .from("students")
    .select("id, family_id, child_first_name, child_last_name")
    .in("id", studentIds);
  if (studentError) throw new Error("Kunne ikke hente elever");
  const students = new Map(
    ((studentData as
      | { id: string; family_id: string | null; child_first_name: string | null; child_last_name: string | null }[]
      | null) ?? []).map((row) => [row.id, row]),
  );

  return studentIds.map((studentId) => {
    const balance = balances.get(studentId);
    const fee = fees.get(studentId);
    const student = students.get(studentId);
    const owedOre = balance?.owed ?? 0;
    const paidOre = balance?.paid ?? 0;
    const remainingOre = balance?.remaining ?? 0;
    const grossOre = fee?.amount ?? 0;
    const hasOpenLink = openLinks.has(studentId);
    return {
      studentId,
      familyId: student?.family_id ?? null,
      firstName: student?.child_first_name ?? null,
      lastName: student?.child_last_name ?? null,
      className: classByStudent.get(studentId) ?? null,
      placed: classByStudent.has(studentId),
      missingFee: !balance,
      grossOre,
      discountOre: Math.max(grossOre - owedOre, 0),
      owedOre,
      paidOre,
      appliedOre: Math.max(owedOre - remainingOre, 0),
      remainingOre,
      overpaidOre: Math.max(paidOre - owedOre, 0),
      hasOpenLink,
      state: balance
        ? getPayState({ owed: owedOre, paid: paidOre, remaining: remainingOre, hasOpenLink })
        : hasOpenLink
          ? "venter"
          : "ubetalt",
      feeNote: fee?.note ?? null,
    };
  });
}

export function summarizeBalances(
  rows: YearBalanceRow[],
  year: { id: string; label: string } | null,
): BalanceSummary {
  const summary: BalanceSummary = {
    schoolYearId: year?.id ?? null,
    schoolYearLabel: year?.label ?? null,
    grossOre: 0,
    owedOre: 0,
    discountOre: 0,
    paidOre: 0,
    remainingOre: 0,
    overpaidOre: 0,
    studentCount: 0,
    exemptCount: 0,
    missingFeeCount: 0,
    unplacedCount: 0,
    unplacedRemainingOre: 0,
  };
  for (const row of rows) {
    if (!row.placed) {
      if (row.remainingOre > 0) {
        summary.unplacedCount += 1;
        summary.unplacedRemainingOre += row.remainingOre;
      }
      continue;
    }
    summary.studentCount += 1;
    if (row.missingFee) {
      summary.missingFeeCount += 1;
      continue;
    }
    if (row.state === "fritatt") summary.exemptCount += 1;
    summary.grossOre += row.grossOre;
    summary.owedOre += row.owedOre;
    summary.discountOre += row.discountOre;
    summary.paidOre += row.appliedOre;
    summary.remainingOre += row.remainingOre;
    summary.overpaidOre += row.overpaidOre;
  }
  return summary;
}

export async function getActiveYearBalanceSummary(
  supabase: Client,
): Promise<BalanceSummary> {
  const year = await getActiveYear(supabase);
  if (!year) return summarizeBalances([], null);
  return summarizeBalances(await getYearBalances(supabase, year.id), year);
}

export type OverdueSummary = {
  amountOre: number;
  studentCount: number;
  familyCount: number;
  nextDueDate: string | null;
};

function expectedByDate(
  owedOre: number,
  year: ActiveYear,
  today: string,
): number {
  if (year.sem2_due_on && today > year.sem2_due_on) return owedOre;
  if (year.sem1_due_on && today > year.sem1_due_on) {
    const upfront = Math.min(year.enrollment_fee * 100, owedOre);
    return owedOre - Math.ceil((owedOre - upfront) / 2);
  }
  return 0;
}

export async function getOverdueSummary(
  supabase: Client,
  year: ActiveYear,
  rows: YearBalanceRow[],
  requests: OpenRequest[] = [],
): Promise<OverdueSummary> {
  const today = osloToday();
  const [planResult, installmentResult] = await Promise.all([
    supabase
      .from("payment_plans")
      .select("family_id")
      .eq("school_year_id", year.id)
      .eq("status", "aktiv"),
    supabase
      .from("installments")
      .select("student_id, due_date, amount, status, payment_id, payment_plans!inner(status)")
      .eq("school_year_id", year.id)
      .eq("payment_plans.status", "aktiv")
      .in("status", ["planlagt", "sendt"]),
  ]);
  if (planResult.error || installmentResult.error) {
    throw new Error("Kunne ikke hente forfalte beløp");
  }
  const planFamilies = new Set(
    ((planResult.data as { family_id: string }[] | null) ?? []).map((row) => row.family_id),
  );
  const installments =
    (installmentResult.data as unknown as
      | { student_id: string; due_date: string; amount: number; status: string; payment_id: string | null }[]
      | null) ?? [];

  const paymentIds = installments
    .map((row) => row.payment_id)
    .filter((id): id is string => Boolean(id));
  const captured = new Set<string>();
  if (paymentIds.length > 0) {
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .in("id", paymentIds)
      .eq("status", "fanget");
    if (error) throw new Error("Kunne ikke hente forfalte beløp");
    for (const row of (data as { id: string }[] | null) ?? []) captured.add(row.id);
  }

  const overdueByStudent = new Map<string, number>();
  let nextDueDate: string | null = null;
  const rowByStudent = new Map(rows.map((row) => [row.studentId, row]));

  for (const row of installments) {
    if (row.payment_id && captured.has(row.payment_id)) continue;
    if (row.due_date < today) {
      const cap = rowByStudent.get(row.student_id)?.remainingOre ?? row.amount;
      const current = overdueByStudent.get(row.student_id) ?? 0;
      overdueByStudent.set(row.student_id, Math.min(current + row.amount, cap));
    } else if (!nextDueDate || row.due_date < nextDueDate) {
      nextDueDate = row.due_date;
    }
  }

  for (const row of rows) {
    if (row.missingFee || row.remainingOre <= 0) continue;
    if (row.familyId && planFamilies.has(row.familyId)) continue;
    const overdue = Math.min(
      Math.max(expectedByDate(row.owedOre, year, today) - row.appliedOre, 0),
      row.remainingOre,
    );
    if (overdue > 0) overdueByStudent.set(row.studentId, overdue);
  }

  for (const request of requests) {
    if (request.status !== "opprettet" || !request.sent || !request.dueDate) continue;
    if (request.dueDate >= today) {
      if (!nextDueDate || request.dueDate < nextDueDate) nextDueDate = request.dueDate;
      continue;
    }
    const shares = splitAcross(
      request.amount,
      request.studentIds.map((studentId) => ({
        studentId,
        remaining: rowByStudent.get(studentId)?.remainingOre ?? 0,
      })),
    );
    for (const share of shares) {
      const current = overdueByStudent.get(share.studentId) ?? 0;
      overdueByStudent.set(share.studentId, Math.max(current, share.amount));
    }
  }

  for (const due of [year.sem1_due_on, year.sem2_due_on]) {
    if (due && due >= today && (!nextDueDate || due < nextDueDate)) nextDueDate = due;
  }

  const families = new Set<string>();
  let amountOre = 0;
  for (const [studentId, amount] of overdueByStudent) {
    amountOre += amount;
    families.add(rowByStudent.get(studentId)?.familyId ?? studentId);
  }
  return {
    amountOre,
    studentCount: overdueByStudent.size,
    familyCount: families.size,
    nextDueDate,
  };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type FeeState = "betalt" | "delvis" | "ubetalt";

export type StudentBalance = {
  studentId: string;
  schoolYearId: string;
  owed: number;
  paid: number;
  remaining: number;
  state: FeeState;
};

export function balanceKey(studentId: string, schoolYearId: string) {
  return `${studentId}:${schoolYearId}`;
}

function toBalance(row: {
  student_id: string | null;
  school_year_id: string | null;
  owed: number | null;
  paid: number | null;
  remaining: number | null;
  state: string | null;
}): StudentBalance | null {
  if (!row.student_id || !row.school_year_id) return null;
  const state: FeeState =
    row.state === "betalt" || row.state === "delvis" ? row.state : "ubetalt";
  return {
    studentId: row.student_id,
    schoolYearId: row.school_year_id,
    owed: row.owed ?? 0,
    paid: row.paid ?? 0,
    remaining: row.remaining ?? 0,
    state,
  };
}

export function emptyBalance(
  studentId: string,
  schoolYearId: string,
): StudentBalance {
  return {
    studentId,
    schoolYearId,
    owed: 0,
    paid: 0,
    remaining: 0,
    state: "ubetalt",
  };
}

export async function fetchBalances(
  client: Client,
  schoolYearId?: string | null,
): Promise<Map<string, StudentBalance>> {
  let query = client
    .from("student_balances")
    .select("student_id, school_year_id, owed, paid, remaining, state");
  if (schoolYearId) query = query.eq("school_year_id", schoolYearId);

  const { data } = await query;
  const balances = new Map<string, StudentBalance>();
  for (const row of data ?? []) {
    const balance = toBalance(row);
    if (balance) {
      balances.set(balanceKey(balance.studentId, balance.schoolYearId), balance);
    }
  }
  return balances;
}

export async function fetchBalance(
  client: Client,
  studentId: string,
  schoolYearId: string,
): Promise<StudentBalance> {
  const { data } = await client
    .from("student_balances")
    .select("student_id, school_year_id, owed, paid, remaining, state")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .maybeSingle();

  return (data ? toBalance(data) : null) ?? emptyBalance(studentId, schoolYearId);
}

async function resolveFeeAmount(
  client: Client,
  studentId: string,
  schoolYearId: string,
): Promise<number> {
  const { data: enrollment } = await client
    .from("enrollments")
    .select("price_snapshot, classes(price)")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv")
    .limit(1)
    .maybeSingle();

  const snapshot = enrollment?.price_snapshot ?? null;
  const classPrice = enrollment?.classes?.price ?? null;

  if (snapshot != null) return snapshot * 100;
  if (classPrice != null) return classPrice * 100;

  const { data: year } = await client
    .from("school_years")
    .select("fee")
    .eq("id", schoolYearId)
    .maybeSingle();

  return (year?.fee ?? 0) * 100;
}

export async function ensureStudentFee(
  client: Client,
  studentId: string,
  schoolYearId: string,
): Promise<void> {
  const { data: existing } = await client
    .from("student_fees")
    .select("id")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .maybeSingle();

  if (existing) return;

  const amount = await resolveFeeAmount(client, studentId, schoolYearId);
  await client
    .from("student_fees")
    .insert({ student_id: studentId, school_year_id: schoolYearId, amount });
}

export async function setStudentFee(
  client: Client,
  studentId: string,
  schoolYearId: string,
  values: { amount?: number; discount?: number; note?: string | null },
): Promise<void> {
  await ensureStudentFee(client, studentId, schoolYearId);
  await client
    .from("student_fees")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId);
}

type AllocationInput = {
  studentId: string;
  amount: number;
};

async function callAllocationRpc(
  client: Client,
  paymentId: string,
  allocations: AllocationInput[] | null,
): Promise<number> {
  const { data, error } = await client.rpc("replace_payment_allocations", {
    p_payment_id: paymentId,
    p_allocations: (allocations?.map((row) => ({
      student_id: row.studentId,
      amount: row.amount,
    })) ?? null) as unknown as Json,
  });

  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function allocatePayment(
  client: Client,
  paymentId: string,
): Promise<number> {
  return callAllocationRpc(client, paymentId, null);
}

export async function replacePaymentAllocations(
  client: Client,
  paymentId: string,
  allocations: AllocationInput[],
): Promise<number> {
  return callAllocationRpc(client, paymentId, allocations);
}

export async function allocatePaymentsForStudent(
  client: Client,
  studentId: string,
  applicationId: string | null,
): Promise<void> {
  if (!applicationId) return;

  const { data: application } = await client
    .from("student_applications")
    .select("payment_id")
    .eq("id", applicationId)
    .maybeSingle();

  const paymentId = application?.payment_id;
  if (!paymentId) return;

  await allocatePayment(client, paymentId);
}

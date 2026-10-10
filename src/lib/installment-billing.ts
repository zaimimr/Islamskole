import "server-only";
import { toUserError } from "@/lib/action-errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { InstallmentBatch } from "@/lib/payment-plans";
import { buildReference } from "@/lib/payment-descriptor";
import type { EmailLang } from "@/lib/email";
import {
  guardianEmails,
  studentDisplayName,
  type NamedRecord,
} from "@/lib/student-name";
import { osloToday } from "@/lib/dates";

type Client = SupabaseClient<Database>;

export async function familyRecipients(
  client: Client,
  familyId: string,
): Promise<string[]> {
  const { data } = await client
    .from("family_guardians")
    .select("receives_communication, guardians(email)")
    .eq("family_id", familyId);

  const emails = (data ?? [])
    .filter((row) => row.receives_communication !== false)
    .map((row) => (row.guardians as unknown as { email: string | null })?.email)
    .filter((email): email is string => Boolean(email && email.includes("@")));

  return [...new Set(emails)];
}

export async function paymentFamilyId(
  admin: Client,
  payment: { id: string; student_id: string | null },
): Promise<string | null> {
  if (payment.student_id) {
    const { data } = await admin
      .from("students")
      .select("family_id")
      .eq("id", payment.student_id)
      .maybeSingle();
    if (data?.family_id) return data.family_id;
  }
  const { data: target } = await admin
    .from("payment_targets")
    .select("students(family_id)")
    .eq("payment_id", payment.id)
    .limit(1)
    .maybeSingle();
  const targetFamily = (target?.students as unknown as { family_id: string | null } | null)
    ?.family_id;
  if (targetFamily) return targetFamily;
  const { data: application } = await admin
    .from("student_applications")
    .select("family_id")
    .eq("payment_id", payment.id)
    .not("family_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (application?.family_id) return application.family_id;
  const { data: installment } = await admin
    .from("installments")
    .select("payment_plans(family_id)")
    .eq("payment_id", payment.id)
    .limit(1)
    .maybeSingle();
  return (
    (installment?.payment_plans as unknown as { family_id: string } | null)
      ?.family_id ?? null
  );
}

export async function familyLanguage(
  client: Client,
  familyId: string | null,
): Promise<EmailLang> {
  if (!familyId) return "no";
  const { data, error } = await client
    .from("families")
    .select("*")
    .eq("id", familyId)
    .maybeSingle();
  if (error || !data) return "no";
  const row = data as unknown as { preferred_language: string | null };
  return row.preferred_language === "en" ? "en" : "no";
}

export type MoneyRecipients = {
  to: string[];
  lang: EmailLang;
  familyId: string | null;
};

function isRealEmail(email: string) {
  return !/^mangler@/i.test(email.trim());
}

export async function recipientsFor(
  client: Client,
  record: NamedRecord & { family_id?: string | null },
): Promise<MoneyRecipients> {
  const familyId = record.family_id ?? null;
  if (familyId) {
    const [to, lang] = await Promise.all([
      familyRecipients(client, familyId),
      familyLanguage(client, familyId),
    ]);
    return { to: to.filter(isRealEmail), lang, familyId };
  }
  return {
    to: guardianEmails(record).filter(isRealEmail),
    lang: "no",
    familyId: null,
  };
}

export async function yearDueDates(
  client: Client,
  schoolYearId: string | null,
): Promise<string[]> {
  if (!schoolYearId) return [];
  const { data } = await client
    .from("school_years")
    .select("sem1_due_on, sem2_due_on")
    .eq("id", schoolYearId)
    .maybeSingle();
  const today = osloToday();
  return [data?.sem1_due_on, data?.sem2_due_on]
    .filter((date): date is string => Boolean(date && date >= today))
    .sort();
}

export async function nextDueDate(
  client: Client,
  studentIds: string[],
  schoolYearId: string | null,
): Promise<string | null> {
  if (!schoolYearId) return null;
  if (studentIds.length > 0) {
    const { data } = await client
      .from("installments")
      .select("due_date")
      .eq("school_year_id", schoolYearId)
      .in("student_id", studentIds)
      .in("status", ["planlagt", "sendt"])
      .gte("due_date", osloToday())
      .order("due_date")
      .limit(1);
    if (data && data.length > 0) return data[0].due_date;
  }
  const dates = await yearDueDates(client, schoolYearId);
  return dates[0] ?? null;
}

export async function remainingFor(
  client: Client,
  studentIds: string[],
  schoolYearId: string | null,
): Promise<number | null> {
  if (!schoolYearId || studentIds.length === 0) return null;
  const { data, error } = await client
    .from("student_balances")
    .select("remaining")
    .eq("school_year_id", schoolYearId)
    .in("student_id", studentIds);
  if (error || !data || data.length === 0) return null;
  return data.reduce((sum, row) => sum + Math.max(row.remaining ?? 0, 0), 0);
}

export async function studentNames(
  client: Client,
  studentIds: string[],
): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const { data } = await client
    .from("students")
    .select("id, child_first_name, child_last_name")
    .in("id", studentIds);

  const names = new Map<string, string>();
  for (const row of data ?? []) {
    names.set(
      row.id,
      studentDisplayName({
        child_first_name: row.child_first_name,
        child_last_name: row.child_last_name,
      }) || "Elev",
    );
  }
  return names;
}

export type BatchSendOutcome = "sent" | "skipped";

async function withdrawnStudents(
  client: Client,
  studentIds: string[],
  schoolYearId: string,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const { data } = await client
    .from("enrollments")
    .select("student_id, status")
    .eq("school_year_id", schoolYearId)
    .in("student_id", studentIds);
  const active = new Set(
    (data ?? [])
      .filter((row) => row.status === "aktiv")
      .map((row) => row.student_id),
  );
  return new Set(
    (data ?? [])
      .filter((row) => row.status === "avsluttet" && !active.has(row.student_id))
      .map((row) => row.student_id),
  );
}

export async function sendInstallmentBatch(
  client: Client,
  batch: InstallmentBatch,
): Promise<BatchSendOutcome> {
  const withdrawn = await withdrawnStudents(
    client,
    batch.installments.map((row) => row.studentId),
    batch.schoolYearId,
  );
  const stoppedIds = batch.installments
    .filter((row) => withdrawn.has(row.studentId))
    .map((row) => row.id);
  if (stoppedIds.length > 0) {
    await client
      .from("installments")
      .update({ status: "stoppet" })
      .in("id", stoppedIds)
      .eq("status", "planlagt");
    batch = {
      ...batch,
      installments: batch.installments.filter(
        (row) => !withdrawn.has(row.studentId),
      ),
    };
    if (batch.installments.length === 0) return "skipped";
  }

  const studentIds = batch.installments.map((row) => row.studentId);
  const { data: balances } = await client
    .from("student_balances")
    .select("student_id, remaining")
    .eq("school_year_id", batch.schoolYearId)
    .in("student_id", studentIds);
  const remainingByStudent = new Map(
    (balances ?? []).map((row) => [row.student_id, row.remaining ?? 0]),
  );

  const collectible = batch.installments
    .filter((row) => (remainingByStudent.get(row.studentId) ?? 0) > 0)
    .map((row) => ({
      ...row,
      amount: Math.min(row.amount, remainingByStudent.get(row.studentId) ?? 0),
    }));

  for (const row of collectible) {
    const original = batch.installments.find((item) => item.id === row.id);
    if (original && original.amount !== row.amount) {
      const { error: capError } = await client
        .from("installments")
        .update({ amount: row.amount })
        .eq("id", row.id);
      if (capError) throw new Error(toUserError(capError), { cause: capError });
    }
  }

  const settledIds = batch.installments
    .filter((row) => (remainingByStudent.get(row.studentId) ?? 0) <= 0)
    .map((row) => row.id);
  if (settledIds.length > 0) {
    await client
      .from("installments")
      .update({ status: "betalt" })
      .in("id", settledIds);
  }

  if (collectible.length === 0) return "skipped";

  const names = await studentNames(
    client,
    collectible.map((row) => row.studentId),
  );

  const { data: family } = await client
    .from("families")
    .select("display_name")
    .eq("id", batch.familyId)
    .maybeSingle();
  const { data: year } = await client
    .from("school_years")
    .select("label")
    .eq("id", batch.schoolYearId)
    .maybeSingle();

  const totalAmount = collectible.reduce((sum, row) => sum + row.amount, 0);
  const childNames = collectible.map(
    (row) => names.get(row.studentId) ?? "Elev",
  );
  const reference = buildReference(
    year?.label ?? null,
    family?.display_name ?? null,
    collectible.length,
  );

  const { data: payment, error: paymentError } = await client
    .from("payments")
    .insert({
      school_year_id: batch.schoolYearId,
      reference,
      amount: totalAmount,
      status: "opprettet",
      method: "vipps",
      due_date: batch.dueDate,
      description: `Avdrag ${batch.dueDate} - Skolepenger${year?.label ? ` ${year.label}` : ""} - ${childNames.join(", ")}`,
    })
    .select("id")
    .single();
  if (paymentError) throw new Error(toUserError(paymentError), { cause: paymentError });

  const { error: linkError } = await client
    .from("installments")
    .update({
      status: "sendt",
      payment_id: payment.id,
      sent_at: new Date().toISOString(),
    })
    .in(
      "id",
      collectible.map((row) => row.id),
    );
  if (linkError) throw new Error(toUserError(linkError), { cause: linkError });

  return "sent";
}

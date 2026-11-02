import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { toUserError } from "@/lib/action-errors";
import { addCalendarDays, osloToday } from "@/lib/dates";
import { buildReference } from "@/lib/payment-descriptor";
import { recipientsFor } from "@/lib/installment-billing";
import { sendPaymentLinkEmail } from "@/lib/email";
import { emailNotifications } from "@/flags";
import { cancelPayment, getPayment } from "@/lib/vipps";
import { syncPaymentByReference } from "@/lib/payments-sync";
import { allocatePayment } from "@/lib/payment-ledger";
import { studentDisplayName } from "@/lib/student-name";
import {
  autoRequestDue,
  defaultRequestDueDate,
  planBulkRequests,
  latestRequestByStudent,
  pickNextInstallment,
  reminderDue,
  splitAcross,
  supersedeAction,
  type OpenRequest,
  type PlannedInstallment,
} from "@/lib/payment-request-state";

type Client = SupabaseClient<Database>;

export type RequestSettings = {
  enabled: boolean;
  leadDays: number;
  reminderDays: number;
  maxReminders: number;
};

export type StudentPayStatus = {
  studentId: string;
  name: string;
  familyId: string | null;
  familyName: string | null;
  paused: boolean;
  active: boolean;
  onPlan: boolean;
  owed: number;
  paid: number;
  remaining: number;
  request: OpenRequest | null;
};

const DEFAULT_SETTINGS: RequestSettings = {
  enabled: false,
  leadDays: 14,
  reminderDays: 7,
  maxReminders: 3,
};

const GUARDIAN_FIELDS =
  "id, family_id, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export function payLink(paymentId: string): string {
  return `${siteUrl()}/api/vipps/pay/${paymentId}`;
}

export async function getRequestSettings(client: Client): Promise<RequestSettings> {
  const { data } = await client
    .from("payment_request_settings")
    .select("enabled, lead_days, reminder_days, max_reminders")
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    enabled: data.enabled,
    leadDays: data.lead_days,
    reminderDays: data.reminder_days,
    maxReminders: data.max_reminders,
  };
}

export async function loadOpenRequests(
  client: Client,
  schoolYearId: string,
): Promise<OpenRequest[]> {
  const { data, error } = await client
    .from("payments")
    .select(
      "id, amount, status, created_at, request_sent_at, last_reminder_at, due_date, reminder_count, student_id, payment_targets(student_id), installments(student_id)",
    )
    .eq("school_year_id", schoolYearId)
    .eq("method", "vipps")
    .is("voided_at", null)
    .or("request_sent_at.not.is.null,status.in.(opprettet,autorisert)")
    .in("status", ["opprettet", "autorisert", "avbrutt"]);
  if (error) throw new Error(toUserError(error), { cause: error });

  return (data ?? []).map((row) => {
    const targets = (row.payment_targets ?? []) as { student_id: string }[];
    const installments = (row.installments ?? []) as { student_id: string }[];
    const studentIds = new Set<string>([
      ...(row.student_id ? [row.student_id] : []),
      ...targets.map((target) => target.student_id),
      ...installments.map((installment) => installment.student_id),
    ]);
    const sentAt = row.request_sent_at ?? row.created_at;
    return {
      paymentId: row.id,
      amount: row.amount,
      status: row.status,
      sentAt,
      lastSentAt: row.last_reminder_at ?? sentAt,
      dueDate: row.due_date,
      reminderCount: row.reminder_count,
      studentIds: [...studentIds],
      fromPlan: installments.length > 0,
      sent: row.request_sent_at !== null,
    };
  });
}

export async function loadPayStatuses(
  client: Client,
  schoolYearId: string,
  onlyStudentIds?: string[],
): Promise<Map<string, StudentPayStatus>> {
  let enrollmentQuery = client
    .from("enrollments")
    .select("student_id")
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv");
  let balanceQuery = client
    .from("student_balances")
    .select("student_id, owed, paid, remaining")
    .eq("school_year_id", schoolYearId);
  if (onlyStudentIds) {
    enrollmentQuery = enrollmentQuery.in("student_id", onlyStudentIds);
    balanceQuery = balanceQuery.in("student_id", onlyStudentIds);
  }

  const [enrollments, balances, requests, plans] = await Promise.all([
    enrollmentQuery,
    balanceQuery,
    loadOpenRequests(client, schoolYearId),
    client
      .from("payment_plans")
      .select("family_id")
      .eq("school_year_id", schoolYearId)
      .eq("status", "aktiv"),
  ]);
  if (enrollments.error) throw new Error(toUserError(enrollments.error));
  if (balances.error) throw new Error(toUserError(balances.error));

  const active = new Set((enrollments.data ?? []).map((row) => row.student_id));
  const balanceById = new Map(
    (balances.data ?? []).map((row) => [row.student_id as string, row]),
  );
  const ids = [...new Set([...active, ...balanceById.keys()])];
  const planFamilies = new Set((plans.data ?? []).map((row) => row.family_id));
  const latest = latestRequestByStudent(requests);

  const statuses = new Map<string, StudentPayStatus>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await client
      .from("students")
      .select(
        "id, child_first_name, child_last_name, family_id, families(display_name, payment_requests_paused_at)",
      )
      .in("id", chunk);
    if (error) throw new Error(toUserError(error), { cause: error });
    for (const student of data ?? []) {
      const family = student.families as unknown as {
        display_name: string | null;
        payment_requests_paused_at: string | null;
      } | null;
      const balance = balanceById.get(student.id);
      statuses.set(student.id, {
        studentId: student.id,
        name: studentDisplayName(student) || "Elev",
        familyId: student.family_id,
        familyName: family?.display_name ?? null,
        paused: Boolean(family?.payment_requests_paused_at),
        active: active.has(student.id),
        onPlan: Boolean(student.family_id && planFamilies.has(student.family_id)),
        owed: balance?.owed ?? 0,
        paid: balance?.paid ?? 0,
        remaining: balance?.remaining ?? 0,
        request: latest.get(student.id) ?? null,
      });
    }
  }
  return statuses;
}

async function supersede(client: Client, paymentIds: string[]): Promise<void> {
  if (paymentIds.length === 0) return;
  const { data, error: loadError } = await client
    .from("payments")
    .select("id, reference, vipps_state, status")
    .in("id", paymentIds);
  if (loadError) throw new Error(toUserError(loadError), { cause: loadError });
  for (const row of data ?? []) {
    if (!row.reference || !row.vipps_state) continue;
    const current = await getPayment(row.reference).catch(() => null);
    if (!current) throw new Error("Kunne ikke sjekke forrige forespørsel i Vipps. Prøv igjen.");
    const action = supersedeAction(current);
    if (action === "keep") {
      await syncPaymentByReference(row.reference).catch(() => null);
      throw new Error("Forrige forespørsel er betalt eller venter i Vipps");
    }
    if (action === "cancel") {
      try {
        await cancelPayment(row.reference);
      } catch (error) {
        console.error("Vipps cancel of replaced request failed", {
          paymentId: row.id,
          message: error instanceof Error ? error.message : String(error),
        });
        throw new Error("Kunne ikke stoppe forrige forespørsel i Vipps. Prøv igjen.");
      }
    }
  }
  const { error: unlinkError } = await client
    .from("installments")
    .update({ status: "planlagt", payment_id: null, sent_at: null })
    .in("payment_id", paymentIds)
    .eq("status", "sendt");
  if (unlinkError) throw new Error(toUserError(unlinkError), { cause: unlinkError });
  const { error } = await client
    .from("payments")
    .update({ voided_at: new Date().toISOString(), void_reason: "Erstattet av ny forespørsel" })
    .in("id", paymentIds)
    .in("status", ["opprettet", "avbrutt"]);
  if (error) throw new Error(toUserError(error), { cause: error });
}

export type RequestResult = {
  paymentId: string;
  amount: number;
  emailedTo: number;
  url: string;
};

export async function createPaymentRequest(
  client: Client,
  input: {
    studentIds: string[];
    schoolYearId: string;
    amount?: number | null;
    dueDate?: string | null;
  },
): Promise<RequestResult> {
  const statuses = await loadPayStatuses(client, input.schoolYearId, input.studentIds);
  const owing = input.studentIds
    .map((id) => statuses.get(id))
    .filter((row): row is StudentPayStatus => Boolean(row && row.remaining > 0));
  if (owing.length === 0) throw new Error("Ingenting å kreve");

  const families = new Set(owing.map((row) => row.familyId ?? row.studentId));
  if (families.size > 1) throw new Error("Velg barn fra én familie");
  if (owing.some((row) => row.request?.status === "autorisert")) {
    throw new Error("En betaling venter allerede i Vipps");
  }

  const total = owing.reduce((sum, row) => sum + row.remaining, 0);
  const amount = Math.min(Math.round(input.amount ?? total), total);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Beløp må være større enn 0");

  const replaced = [
    ...new Set(
      owing
        .map((row) => row.request)
        .filter((request): request is OpenRequest => Boolean(request))
        .map((request) => request.paymentId),
    ),
  ];
  await supersede(client, replaced);

  const { data: year } = await client
    .from("school_years")
    .select("label")
    .eq("id", input.schoolYearId)
    .maybeSingle();
  const today = osloToday();
  const dueDate =
    input.dueDate && input.dueDate >= today ? input.dueDate : defaultRequestDueDate(today);
  const names = owing.map((row) => row.name);
  const familyName =
    owing[0].familyName ?? owing[0].name.split(" ").slice(-1)[0] ?? null;

  const { data: payment, error } = await client
    .from("payments")
    .insert({
      school_year_id: input.schoolYearId,
      reference: buildReference(year?.label ?? null, familyName, owing.length),
      amount,
      status: "opprettet",
      method: "vipps",
      due_date: dueDate,
      student_id: owing.length === 1 ? owing[0].studentId : null,
      description: `Skolepenger${year?.label ? ` ${year.label}` : ""} - ${names.join(", ")}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(toUserError(error), { cause: error });

  if (owing.length > 1) {
    const targets = splitAcross(amount, owing).map((row) => ({
      payment_id: payment.id,
      student_id: row.studentId,
      amount: row.amount,
    }));
    const { error: targetError } = await client.from("payment_targets").insert(targets);
    if (targetError) {
      await discardPayment(client, payment.id);
      throw new Error(toUserError(targetError), { cause: targetError });
    }
  }

  const emailedTo = await sendRequestEmail(client, payment.id, false);
  if (emailedTo > 0) {
    const { error: sentError } = await client
      .from("payments")
      .update({ request_sent_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (sentError) console.error("Marking request sent failed", { paymentId: payment.id });
  }
  return { paymentId: payment.id, amount, emailedTo, url: payLink(payment.id) };
}

async function discardPayment(client: Client, paymentId: string): Promise<void> {
  const { error } = await client.from("payments").delete().eq("id", paymentId);
  if (!error) return;
  await client
    .from("payments")
    .update({ voided_at: new Date().toISOString(), void_reason: "Forespørselen kunne ikke opprettes" })
    .eq("id", paymentId);
}

async function sendRequestEmail(
  client: Client,
  paymentId: string,
  reminder: boolean,
): Promise<number> {
  if (!siteUrl() || !(await emailNotifications())) return 0;
  const { data: payment } = await client
    .from("payments")
    .select(
      "id, amount, due_date, school_year_id, student_id, school_years(label), payment_targets(student_id), installments(student_id)",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment?.school_year_id) return 0;

  const studentIds = [
    ...new Set([
      ...(payment.student_id ? [payment.student_id] : []),
      ...((payment.payment_targets ?? []) as { student_id: string }[]).map((row) => row.student_id),
      ...((payment.installments ?? []) as { student_id: string }[]).map((row) => row.student_id),
    ]),
  ];
  if (studentIds.length === 0) return 0;

  const [{ data: students }, { data: balances }] = await Promise.all([
    client.from("students").select(GUARDIAN_FIELDS).in("id", studentIds),
    client
      .from("student_balances")
      .select("student_id, remaining")
      .eq("school_year_id", payment.school_year_id)
      .in("student_id", studentIds),
  ]);
  const remaining = (balances ?? []).map((row) => ({
    studentId: row.student_id as string,
    remaining: row.remaining ?? 0,
  }));
  const totalRemaining = remaining.reduce((sum, row) => sum + Math.max(row.remaining, 0), 0);
  const amount = Math.min(payment.amount, totalRemaining);
  const first = students?.[0];
  if (!first || amount <= 0) return 0;

  const recipients = await recipientsFor(client, first);
  if (recipients.to.length === 0) return 0;

  const shares = new Map(splitAcross(amount, remaining).map((row) => [row.studentId, row.amount]));
  const sent = await sendPaymentLinkEmail({
    to: recipients.to,
    lang: recipients.lang,
    reminder,
    children: (students ?? [])
      .filter((student) => shares.has(student.id))
      .map((student) => ({
        name: studentDisplayName(student),
        amount: shares.get(student.id) ?? 0,
      })),
    amount,
    schoolYear: (payment.school_years as unknown as { label: string } | null)?.label ?? null,
    dueDate: payment.due_date,
    remaining: totalRemaining,
    url: payLink(payment.id),
  });
  return sent ? recipients.to.length : 0;
}

function renewedReference(reference: string | null): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  if (!reference) return `isk-${suffix}`;
  return /-[0-9a-f]{8}$/.test(reference)
    ? reference.replace(/[0-9a-f]{8}$/, suffix)
    : `${reference.slice(0, 55)}-${suffix}`;
}

export async function requestRecipients(
  client: Client,
  studentIds: string[],
): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const { data: students } = await client
    .from("students")
    .select(GUARDIAN_FIELDS)
    .in("id", studentIds)
    .limit(1);
  const first = students?.[0];
  if (!first) return [];
  return (await recipientsFor(client, first)).to;
}

export async function resendPaymentRequest(
  client: Client,
  paymentId: string,
  dueDate?: string | null,
): Promise<RequestResult> {
  const { data: payment, error } = await client
    .from("payments")
    .select("id, amount, status, voided_at, reminder_count, reference, due_date, request_sent_at")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error(toUserError(error), { cause: error });
  if (!payment || payment.voided_at) throw new Error("Fant ikke forespørselen");
  if (!["opprettet", "avbrutt"].includes(payment.status)) {
    throw new Error("Forespørselen er allerede betalt eller venter i Vipps");
  }
  const today = osloToday();
  const renewed = payment.status === "avbrutt";
  if (renewed) {
    const { error: renewError } = await client
      .from("payments")
      .update({
        status: "opprettet",
        vipps_state: null,
        redirect_url: null,
        reference: renewedReference(payment.reference),
        due_date: dueDate && dueDate >= today ? dueDate : defaultRequestDueDate(today),
        reminder_count: 0,
        last_reminder_at: null,
      })
      .eq("id", paymentId)
      .eq("status", "avbrutt");
    if (renewError) throw new Error(toUserError(renewError), { cause: renewError });
  }

  const reminder = Boolean(payment.request_sent_at) && !renewed;
  const emailedTo = await sendRequestEmail(client, paymentId, reminder);
  if (emailedTo > 0) {
    const { error: updateError } = await client
      .from("payments")
      .update(
        reminder
          ? {
              last_reminder_at: new Date().toISOString(),
              reminder_count: payment.reminder_count + 1,
            }
          : { request_sent_at: new Date().toISOString() },
      )
      .eq("id", paymentId);
    if (updateError) throw new Error(toUserError(updateError), { cause: updateError });
  }
  return { paymentId, amount: payment.amount, emailedTo, url: payLink(paymentId) };
}

export async function healAllocations(client: Client): Promise<number> {
  const { error: stateError } = await client
    .from("payments")
    .update({ vipps_state: "CAPTURED" })
    .eq("status", "fanget")
    .eq("vipps_state", "AUTHORIZED");
  if (stateError) console.error("Vipps state heal failed", { code: stateError.code });

  const { data, error } = await client
    .from("payments")
    .select(
      "id, student_id, captured_amount, payment_allocations(amount), payment_allocation_locks(payment_id), payment_targets(student_id), installments(id), student_applications(status), activity_payment_targets(payment_id)",
    )
    .eq("status", "fanget")
    .is("voided_at", null)
    .gt("captured_amount", 0)
    .not("school_year_id", "is", null)
    .order("captured_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("Allocation heal query failed", { code: error.code });
    return 0;
  }

  let healed = 0;
  for (const row of data ?? []) {
    const empty = (value: unknown) => !Array.isArray(value) || value.length === 0;
    if (!empty(row.payment_allocation_locks) || !empty(row.activity_payment_targets)) continue;
    const allocated = ((row.payment_allocations ?? []) as { amount: number }[]).reduce(
      (sum, allocation) => sum + allocation.amount,
      0,
    );
    if (allocated >= row.captured_amount) continue;
    const linked = ((row.student_applications ?? []) as { status: string }[]).length > 0;
    if (!row.student_id && empty(row.payment_targets) && empty(row.installments) && !linked) {
      continue;
    }
    try {
      await allocatePayment(client, row.id);
      const { data: after } = await client
        .from("payment_allocations")
        .select("amount")
        .eq("payment_id", row.id);
      const total = (after ?? []).reduce((sum, allocation) => sum + allocation.amount, 0);
      if (total > allocated) healed += 1;
    } catch (allocationError) {
      console.error("Allocation heal failed", {
        paymentId: row.id,
        message: allocationError instanceof Error ? allocationError.message : String(allocationError),
      });
    }
  }
  return healed;
}

export type AutomationResult = {
  enabled: boolean;
  created: number;
  reminded: number;
  failed: number;
};

export async function runPaymentRequestAutomation(
  client: Client,
  options: { limit?: number; deadline?: number } = {},
): Promise<AutomationResult> {
  const result: AutomationResult = { enabled: false, created: 0, reminded: 0, failed: 0 };
  const settings = await getRequestSettings(client);
  if (!settings.enabled || !siteUrl() || !(await emailNotifications())) return result;
  result.enabled = true;

  const { data: year } = await client
    .from("school_years")
    .select("id, sem1_due_on")
    .eq("is_active", true)
    .maybeSingle();
  if (!year) return result;

  const limit = options.limit ?? 40;
  const outOfTime = () =>
    result.created + result.reminded + result.failed >= limit ||
    (options.deadline !== undefined && Date.now() > options.deadline);

  const today = osloToday();
  const decision = autoRequestDue(
    [year.sem1_due_on],
    today,
    addCalendarDays(today, settings.leadDays),
  );
  const statuses = await loadPayStatuses(client, year.id);

  if (decision.send) {
    const byFamily = new Map<string, string[]>();
    for (const status of statuses.values()) {
      if (!status.active || status.remaining <= 0 || status.paused) continue;
      if (status.onPlan || status.request) continue;
      const key = status.familyId ?? status.studentId;
      byFamily.set(key, [...(byFamily.get(key) ?? []), status.studentId]);
    }
    for (const studentIds of byFamily.values()) {
      if (outOfTime()) break;
      try {
        await createPaymentRequest(client, {
          studentIds,
          schoolYearId: year.id,
          dueDate: decision.dueDate,
        });
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        console.error("Automatic payment request failed", {
          studentIds,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const reminded = new Set<string>();
  const now = new Date();
  for (const status of statuses.values()) {
    const request = status.request;
    if (!request || reminded.has(request.paymentId) || outOfTime()) continue;
    if (status.paused || !status.active || status.remaining <= 0) continue;
    if (!reminderDue(request, now, settings.reminderDays, settings.maxReminders)) continue;
    reminded.add(request.paymentId);
    try {
      const sent = await resendPaymentRequest(client, request.paymentId);
      if (sent.emailedTo > 0) result.reminded += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Payment reminder failed", {
        paymentId: request.paymentId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

export async function loadPlannedInstallments(
  client: Client,
  schoolYearId: string,
  studentIds?: string[],
): Promise<PlannedInstallment[]> {
  let query = client
    .from("installments")
    .select("id, student_id, amount, due_date, payment_plans!inner(status)")
    .eq("school_year_id", schoolYearId)
    .eq("status", "planlagt")
    .eq("payment_plans.status", "aktiv")
    .gt("amount", 0)
    .order("due_date");
  if (studentIds) query = query.in("student_id", studentIds);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    amount: row.amount,
    dueDate: row.due_date,
  }));
}

export async function nextPlanInstallment(
  client: Client,
  schoolYearId: string,
  studentIds: string[],
): Promise<{ installmentId: string; amount: number; dueDate: string } | null> {
  if (studentIds.length === 0) return null;
  return pickNextInstallment(
    await loadPlannedInstallments(client, schoolYearId, studentIds),
    studentIds,
  );
}

export async function pausedFamilies(client: Client): Promise<Set<string>> {
  const { data } = await client
    .from("families")
    .select("id")
    .not("payment_requests_paused_at", "is", null);
  return new Set((data ?? []).map((row) => row.id));
}

export async function loadBulkCounts(
  client: Client,
  schoolYearId: string,
): Promise<{ studentIds: string[]; krav: number; paminnelse: number }> {
  const [statuses, settings] = await Promise.all([
    loadPayStatuses(client, schoolYearId),
    getRequestSettings(client),
  ]);
  const plan = planBulkRequests(statuses.values(), {
    now: new Date(),
    reminderDays: settings.reminderDays,
  });
  return {
    studentIds: [...statuses.values()]
      .filter((row) => row.remaining > 0 && row.active)
      .map((row) => row.studentId),
    krav: plan.create.length + plan.renew.length,
    paminnelse: plan.remind.length,
  };
}

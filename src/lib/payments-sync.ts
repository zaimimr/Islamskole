import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPayment,
  getPaymentEvents,
  capturePayment,
  type VippsPaymentEvent,
  type VippsPaymentState,
} from "@/lib/vipps";
import { mapVippsPaymentState } from "@/lib/payment-integrity";
import {
  sendPaymentReceiptEmail,
  sendRefundEmail,
  sendStudentApplicationEmail,
} from "@/lib/email";
import { getSiteSettings } from "@/lib/data";
import { allocatePayment } from "@/lib/payment-ledger";
import { rebuildPendingInstallmentsForStudent } from "@/lib/payment-plans";
import {
  nextDueDate,
  recipientsFor,
  remainingFor,
  yearDueDates,
} from "@/lib/installment-billing";
import {
  guardianName,
  studentDisplayName,
  type NamedRecord,
} from "@/lib/student-name";
import { formatNok } from "@/lib/money";
import { emailNotifications } from "@/flags";

type Client = SupabaseClient<Database>;

export function mapVippsState(
  state: VippsPaymentState,
  capturedAmount: number,
  refundedAmount: number,
): string {
  return mapVippsPaymentState(state, capturedAmount, refundedAmount);
}

type PersonRow = NamedRecord & { id: string; family_id: string | null };

const PERSON_COLUMNS =
  "id, family_id, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email";

async function fetchEvents(reference: string): Promise<VippsPaymentEvent[]> {
  try {
    return await getPaymentEvents(reference);
  } catch (error) {
    console.error("Vipps event fetch failed", { reference, error });
    return [];
  }
}

async function recordEvents(
  admin: Client,
  reference: string,
  paymentId: string | null,
  events: VippsPaymentEvent[],
) {
  if (events.length === 0) return;
  const { error } = await admin.from("payment_events").upsert(
    events.map((event) => ({
      payment_id: paymentId,
      reference,
      name: event.name,
      amount: event.amount,
      success: event.success,
      psp_reference: event.pspReference,
      idempotency_key: event.idempotencyKey,
      occurred_at: event.timestamp,
    })),
    { onConflict: "reference,name,occurred_at", ignoreDuplicates: true },
  );
  if (error) {
    console.error("Vipps event log sync failed", { reference, error });
  }
}

function captureTime(events: VippsPaymentEvent[]): string | null {
  const captured = events
    .filter((event) => event.name === "CAPTURED" && event.success !== false)
    .map((event) => event.timestamp)
    .sort();
  return captured[0] ?? null;
}

async function reconcileRefunds(
  admin: Client,
  paymentId: string,
  reference: string,
  vippsRefundedAmount: number,
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("refunds")
      .select("amount")
      .eq("payment_id", paymentId)
      .eq("method", "vipps");
    if (error) throw new Error(error.message);
    const localTotal = (data ?? []).reduce(
      (sum, row) => sum + (row.amount ?? 0),
      0,
    );
    const missing = vippsRefundedAmount - localTotal;

    if (missing < 0) {
      await admin.from("payment_reconciliation_issues").upsert(
        {
          payment_id: paymentId,
          kind: "refund_mismatch",
          local_amount: localTotal,
          provider_amount: vippsRefundedAmount,
          flagged_at: new Date().toISOString(),
          resolved_at: null,
        },
        { onConflict: "payment_id" },
      );
      console.error("Refund mismatch: local refunds exceed Vipps", {
        reference,
        localTotal,
        vippsRefundedAmount,
      });
      return;
    }

    if (missing > 0) {
      const { data: allocations } = await admin
        .from("payment_allocations")
        .select("student_id, school_year_id")
        .eq("payment_id", paymentId);
      const single = (allocations ?? []).length === 1 ? allocations![0] : null;

      const { error: insertError } = await admin.from("refunds").insert({
        payment_id: paymentId,
        student_id: single?.student_id ?? null,
        school_year_id: single?.school_year_id ?? null,
        amount: missing,
        method: "vipps",
        reason: "Synkronisert fra Vipps",
        refunded_by: "vipps-sync",
        idempotency_key: `sync-${reference}-${vippsRefundedAmount}`,
      });
      if (insertError) throw new Error(insertError.message);
    }

    await admin
      .from("payment_reconciliation_issues")
      .update({ resolved_at: new Date().toISOString() })
      .eq("payment_id", paymentId)
      .is("resolved_at", null);
  } catch (error) {
    console.error("Refund reconciliation failed", { reference, error });
  }
}

type SyncedPayment = {
  id: string;
  status: string;
  amount: number;
  captured_amount: number;
  school_year_id: string | null;
  school_years: { label: string } | null;
  student_applications: (NamedRecord & { id: string })[] | null;
};

export async function syncPaymentByReference(
  reference: string,
): Promise<string | null> {
  const result = await getPayment(reference);

  let capturedAmount = result.capturedAmount;
  const autoCapture = process.env.VIPPS_AUTO_CAPTURE !== "false";
  if (
    autoCapture &&
    result.state === "AUTHORIZED" &&
    capturedAmount === 0 &&
    result.authorizedAmount > 0
  ) {
    try {
      await capturePayment(reference, result.authorizedAmount);
      capturedAmount = result.authorizedAmount;
    } catch (error) {
      console.error("Auto-capture failed", { reference, error });
    }
  }

  const status = mapVippsState(
    result.state,
    capturedAmount,
    result.refundedAmount,
  );

  const admin = createAdminClient();
  const events = await fetchEvents(reference);

  const { data: existing } = await admin
    .from("payments")
    .select(
      "id, status, amount, captured_amount, school_year_id, school_years(label), student_applications(id, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email)",
    )
    .eq("reference", reference)
    .maybeSingle();
  const payment = existing as unknown as SyncedPayment | null;
  const previousStatus = payment?.status;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status,
    vipps_state: result.state,
    authorized_amount: result.authorizedAmount,
    captured_amount: capturedAmount,
    last_synced_at: now,
  };
  if (result.payerName) update.payer_name = result.payerName;
  if (result.payerEmail) update.payer_email = result.payerEmail;
  if (result.payerPhone) update.payer_phone = result.payerPhone;
  if (result.paymentMethodType) {
    update.vipps_payment_method = result.paymentMethodType;
  }
  if (result.pspReference) update.psp_reference = result.pspReference;
  if (
    capturedAmount > 0 &&
    previousStatus !== "fanget" &&
    previousStatus !== "refundert"
  ) {
    const capturedAt = captureTime(events) ?? now;
    update.captured_at = capturedAt;
    update.paid_at = capturedAt;
  }

  const { error: updateError } = await admin
    .from("payments")
    .update(update as never)
    .eq("reference", reference);
  if (updateError) throw new Error(updateError.message);

  await recordEvents(admin, reference, payment?.id ?? null, events);

  if (payment?.id && capturedAmount > 0) {
    await reconcileRefunds(admin, payment.id, reference, result.refundedAmount);
  }

  const justCaptured = status === "fanget" && previousStatus !== "fanget";

  if (payment?.id && (await isActivityPayment(admin, payment.id))) {
    if (status === "fanget") {
      const { error } = await admin.rpc("record_activity_payment", { p_payment: payment.id });
      if (error) console.error("Activity payment record failed", { reference, code: error.code });
    }
    return status;
  }

  const moneyChanged =
    payment != null &&
    (payment.captured_amount !== capturedAmount || previousStatus !== status);

  let needsAllocation = moneyChanged;
  if (payment?.id && !moneyChanged && capturedAmount > 0) {
    const { count } = await admin
      .from("payment_allocations")
      .select("payment_id", { count: "exact", head: true })
      .eq("payment_id", payment.id);
    needsAllocation = count === 0;
  }

  if (payment?.id && needsAllocation) {
    try {
      await allocatePayment(admin, payment.id);
    } catch (error) {
      console.error("Payment allocation failed", { reference, error });
    }
  }

  if (payment?.id && justCaptured) {
    await rebuildInstallmentsForPayment(admin, payment.id);
    await sendPaymentReceipt(admin, payment.id);

    const apps = payment.student_applications ?? [];
    if (apps.length > 0 && (await emailNotifications())) {
      const childName = apps
        .map((app) => studentDisplayName(app))
        .filter(Boolean)
        .join(", ");
      const settings = await getSiteSettings();
      await sendStudentApplicationEmail({
        to: settings?.enroll_email ?? "opptak@islamskole.no",
        childName,
        rows: [
          ["Barn", childName],
          ["Foresatt", guardianName(apps[0]) ?? "-"],
          ["Antall barn", String(apps.length)],
          ["Skoleår", payment.school_years?.label ?? "-"],
          ["Beløp betalt", formatNok(capturedAmount || payment.amount)],
        ],
      });
    }
  }

  return status;
}

async function isActivityPayment(admin: Client, paymentId: string) {
  const { count } = await admin
    .from("activity_payment_targets")
    .select("payment_id", { count: "exact", head: true })
    .eq("payment_id", paymentId);
  return (count ?? 0) > 0;
}

export async function rebuildInstallmentsForPayment(
  client: Client,
  paymentId: string,
): Promise<void> {
  const { data } = await client
    .from("payment_allocations")
    .select("student_id, school_year_id")
    .eq("payment_id", paymentId);
  for (const row of data ?? []) {
    try {
      await rebuildPendingInstallmentsForStudent(
        client,
        row.student_id,
        row.school_year_id,
      );
    } catch (error) {
      console.error("Installment rebuild after payment failed", {
        paymentId,
        error,
      });
    }
  }
}

type ReceiptPayment = {
  id: string;
  amount: number;
  captured_amount: number;
  method: string;
  paid_at: string | null;
  reference: string;
  psp_reference: string | null;
  school_year_id: string | null;
  school_years: { label: string } | null;
  enrollments: { classes: { name_no: string | null } | null } | null;
  students: PersonRow | null;
  student_applications: PersonRow[] | null;
};

export type NoticeResult = { sent: boolean; reason?: string };

function groupByFamily(people: PersonRow[]): PersonRow[][] {
  const groups = new Map<string, PersonRow[]>();
  for (const person of people) {
    const key = person.family_id ?? `student:${person.id}`;
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  return [...groups.values()];
}

function combineNotices(results: NoticeResult[]): NoticeResult {
  if (results.some((result) => result.sent)) {
    const failed = results.find((result) => !result.sent);
    return failed ? { sent: true, reason: failed.reason } : { sent: true };
  }
  return results[0] ?? { sent: false, reason: "E-posten kunne ikke sendes" };
}

export async function sendPaymentReceipt(
  client: Client,
  paymentId: string,
): Promise<NoticeResult> {
  if (!(await emailNotifications())) {
    return { sent: false, reason: "E-postvarsler er slått av" };
  }

  const { data } = await client
    .from("payments")
    .select(
      `id, amount, captured_amount, method, paid_at, reference, psp_reference, school_year_id, school_years(label), enrollments(classes(name_no)), students!payments_student_id_fkey(${PERSON_COLUMNS}), student_applications(${PERSON_COLUMNS})`,
    )
    .eq("id", paymentId)
    .maybeSingle();
  const payment = data as unknown as ReceiptPayment | null;
  if (!payment) return { sent: false, reason: "Fant ikke betalingen" };

  const { data: allocationRows } = await client
    .from("payment_allocations")
    .select(`student_id, amount, students(${PERSON_COLUMNS})`)
    .eq("payment_id", paymentId);
  const allocatedAmount = new Map<string, number>();
  for (const row of allocationRows ?? []) {
    allocatedAmount.set(
      row.student_id,
      (allocatedAmount.get(row.student_id) ?? 0) + row.amount,
    );
  }
  const allocated = (allocationRows ?? [])
    .map((row) => row.students as unknown as PersonRow | null)
    .filter((row): row is PersonRow => row != null);

  const apps = payment.student_applications ?? [];
  const enrollmentDeposit = allocated.length === 0 && apps.length > 0;
  const people: PersonRow[] =
    allocated.length > 0
      ? allocated
      : enrollmentDeposit
        ? apps
        : payment.students
          ? [payment.students]
          : [];
  if (people.length === 0) {
    return { sent: false, reason: "Betalingen er ikke knyttet til et barn" };
  }

  const yearId = payment.school_year_id;
  const dueDates = enrollmentDeposit ? await yearDueDates(client, yearId) : null;
  const groups = groupByFamily(people);
  const totalAmount = payment.captured_amount || payment.amount;

  const results: NoticeResult[] = [];
  for (const group of groups) {
    const recipients = await recipientsFor(client, group[0]);
    if (recipients.to.length === 0) {
      results.push({ sent: false, reason: "Ingen foresatte mottar e-post" });
      continue;
    }
    const studentIds = enrollmentDeposit ? [] : group.map((person) => person.id);
    const [remaining, nextDue] = await Promise.all([
      remainingFor(client, studentIds, yearId),
      nextDueDate(client, studentIds, yearId),
    ]);
    const amount =
      groups.length > 1
        ? group.reduce(
            (sum, person) => sum + (allocatedAmount.get(person.id) ?? 0),
            0,
          )
        : totalAmount;

    const sent = await sendPaymentReceiptEmail({
      to: recipients.to,
      lang: recipients.lang,
      childName: group
        .map((person) => studentDisplayName(person))
        .filter(Boolean)
        .join(", "),
      amount,
      schoolYear: payment.school_years?.label ?? null,
      className:
        people.length === 1
          ? (payment.enrollments?.classes?.name_no ?? null)
          : null,
      method: payment.method,
      paidOn: payment.paid_at,
      reference:
        payment.method === "vipps" && !payment.reference.startsWith("manual-")
          ? payment.reference
          : payment.psp_reference,
      remaining,
      nextDueDate: nextDue,
      enrollmentDueDates: dueDates,
    });
    results.push(
      sent ? { sent } : { sent, reason: "E-posten kunne ikke sendes" },
    );
  }
  return combineNotices(results);
}

export async function sendRefundNotice(
  client: Client,
  input: {
    paymentId: string;
    studentIds: string[];
    amount: number;
    amountByStudent?: Record<string, number>;
    method: string;
    refundedOn: string | null;
  },
): Promise<NoticeResult> {
  if (!(await emailNotifications())) {
    return { sent: false, reason: "E-postvarsler er slått av" };
  }

  let studentIds = input.studentIds;
  if (studentIds.length === 0) {
    const { data: allocationRows } = await client
      .from("payment_allocations")
      .select("student_id")
      .eq("payment_id", input.paymentId);
    studentIds = (allocationRows ?? []).map((row) => row.student_id);
  }
  if (studentIds.length === 0) {
    const { data: paymentRow } = await client
      .from("payments")
      .select("student_id")
      .eq("id", input.paymentId)
      .maybeSingle();
    if (paymentRow?.student_id) studentIds = [paymentRow.student_id];
  }
  if (studentIds.length === 0) {
    return { sent: false, reason: "Refusjonen er ikke knyttet til et barn" };
  }

  const { data: peopleRows } = await client
    .from("students")
    .select(PERSON_COLUMNS)
    .in("id", studentIds);
  const people = (peopleRows ?? []) as unknown as PersonRow[];
  if (people.length === 0) {
    return { sent: false, reason: "Fant ikke barnet" };
  }

  const { data: paymentRow } = await client
    .from("payments")
    .select("school_year_id, school_years(label)")
    .eq("id", input.paymentId)
    .maybeSingle();
  const payment = paymentRow as unknown as {
    school_year_id: string | null;
    school_years: { label: string } | null;
  } | null;

  const groups = groupByFamily(people);
  const results: NoticeResult[] = [];
  for (const group of groups) {
    const recipients = await recipientsFor(client, group[0]);
    if (recipients.to.length === 0) {
      results.push({ sent: false, reason: "Ingen foresatte mottar e-post" });
      continue;
    }
    const remaining = await remainingFor(
      client,
      group.map((person) => person.id),
      payment?.school_year_id ?? null,
    );
    const amount =
      groups.length > 1 && input.amountByStudent
        ? group.reduce(
            (sum, person) => sum + (input.amountByStudent?.[person.id] ?? 0),
            0,
          )
        : input.amount;

    const sent = await sendRefundEmail({
      to: recipients.to,
      lang: recipients.lang,
      childName: group
        .map((person) => studentDisplayName(person))
        .filter(Boolean)
        .join(", "),
      amount,
      schoolYear: payment?.school_years?.label ?? null,
      method: input.method,
      refundedOn: input.refundedOn,
      remaining,
    });
    results.push(
      sent ? { sent } : { sent, reason: "E-posten kunne ikke sendes" },
    );
  }
  return combineNotices(results);
}

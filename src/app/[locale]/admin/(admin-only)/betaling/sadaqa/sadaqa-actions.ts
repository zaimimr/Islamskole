"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import { osloToday } from "@/lib/dates";
import { capAtLimit, formatNok } from "@/lib/money";
import {
  allocatePayment,
  ensureStudentFee,
  fetchBalance,
  replacePaymentAllocations,
} from "@/lib/payment-ledger";
import { sendPaymentReceipt } from "@/lib/payments-sync";
import { studentDisplayName } from "@/lib/student-name";
import { createSadaqaCoverage } from "@/lib/sadaqa";

type Denied = { ok: false; error: string };

async function requireAdmin(): Promise<Denied | null> {
  if (await getIsAdmin()) return null;
  const user = await getUser();
  return {
    ok: false,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt i en ny fane og prøv igjen.",
  };
}

function revalidate() {
  revalidatePath("/", "layout");
}

const coverSchema = z.object({
  schoolYearId: z.string().uuid("Mangler skoleår"),
  lines: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        amountOre: z.number().int().positive("Beløpet må være større enn null"),
      }),
    )
    .min(1, "Velg minst ett barn")
    .max(20),
  note: z.string().trim().max(500).optional(),
  sendReceipt: z.boolean().optional(),
});

export type CoverWithSadaqaInput = z.input<typeof coverSchema>;

export async function coverWithSadaqa(
  input: CoverWithSadaqaInput,
): Promise<
  | { ok: true; totalOre: number; remainingOre: number; note?: string }
  | { ok: false; error: string }
> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = coverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { schoolYearId, lines, sendReceipt } = parsed.data;
  const note = parsed.data.note || null;
  const studentIds = lines.map((line) => line.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    return { ok: false, error: "Samme barn er valgt flere ganger." };
  }

  const supabase = await createClient();
  const { data: students, error: studentError } = await supabase
    .from("students")
    .select("id, child_first_name, child_last_name")
    .in("id", studentIds);
  if (studentError) return { ok: false, error: toUserError(studentError) };
  const names = new Map(
    (students ?? []).map((student) => [
      student.id,
      studentDisplayName(student) || "Barnet",
    ]),
  );
  if (names.size !== studentIds.length) {
    return { ok: false, error: "Fant ikke alle barna." };
  }

  for (const line of lines) {
    await ensureStudentFee(supabase, line.studentId, schoolYearId);
    const balance = await fetchBalance(supabase, line.studentId, schoolYearId);
    if (!capAtLimit(line.amountOre, balance.remaining).ok) {
      const name = names.get(line.studentId);
      return {
        ok: false,
        error:
          balance.remaining <= 0
            ? `${name} har ingenting igjen å betale.`
            : `${name} har bare ${formatNok(balance.remaining)} igjen. Sadaqa-støtte kan ikke være mer enn det.`,
      };
    }
  }

  let totalOre = 0;
  let remainingOre = 0;
  const receiptNotes: string[] = [];
  for (const line of lines) {
    const result = await createSadaqaCoverage(supabase, {
      studentId: line.studentId,
      schoolYearId,
      amount: line.amountOre,
      note,
    });
    if (!result.ok) {
      revalidate();
      return {
        ok: false,
        error:
          totalOre > 0
            ? `${formatNok(totalOre)} er registrert, men ${names.get(line.studentId)} feilet: ${result.error}`
            : result.error,
      };
    }
    totalOre += result.amount;
    remainingOre += result.remaining;

    await writeAudit({
      action: "payment.sadaqa_recorded",
      entityType: "payments",
      entityId: result.paymentId,
      metadata: {
        studentId: line.studentId,
        schoolYearId,
        amount: result.amount,
        note,
      },
    });

    if (sendReceipt !== false) {
      const receipt = await sendPaymentReceipt(supabase, result.paymentId);
      if (!receipt.sent) {
        receiptNotes.push(
          `Kvittering for ${names.get(line.studentId)} ikke sendt: ${receipt.reason ?? "ukjent feil"}`,
        );
      }
    }
  }

  revalidate();
  return {
    ok: true,
    totalOre,
    remainingOre,
    note:
      sendReceipt === false
        ? undefined
        : receiptNotes.length > 0
          ? receiptNotes.join(". ")
          : "Kvittering sendt til foresatte",
  };
}

const giftSchema = z.object({
  amountOre: z.number().int().positive("Beløpet må være større enn null"),
  receivedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Velg datoen gaven kom inn"),
  method: z.enum(["vipps", "bank", "kontant", "annet"], {
    message: "Velg hvordan gaven kom inn",
  }),
  donorName: z.string().trim().max(200).optional(),
  familyId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
  schoolYearId: z.string().uuid().optional(),
});

export type SadaqaGiftInput = z.input<typeof giftSchema>;

export async function recordSadaqaGift(
  input: SadaqaGiftInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = giftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const values = parsed.data;
  if (values.receivedOn > osloToday()) {
    return { ok: false, error: "Datoen kan ikke være frem i tid." };
  }

  const supabase = await createClient();
  const user = await getUser();
  let schoolYearId = values.schoolYearId ?? null;
  if (!schoolYearId) {
    const { data: year } = await supabase
      .from("school_years")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();
    schoolYearId = year?.id ?? null;
  }

  const { data: gift, error } = await supabase
    .from("sadaqa_gifts")
    .insert({
      amount: values.amountOre,
      received_on: values.receivedOn,
      method: values.method,
      donor_name: values.donorName || null,
      family_id: values.familyId ?? null,
      note: values.note || null,
      school_year_id: schoolYearId,
      created_by: user?.email ?? null,
    })
    .select("id")
    .single();
  if (error || !gift) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "sadaqa.gift_recorded",
    entityType: "sadaqa_gifts",
    entityId: gift.id,
    metadata: {
      amount: values.amountOre,
      method: values.method,
      receivedOn: values.receivedOn,
      familyId: values.familyId ?? null,
    },
  });

  revalidate();
  return { ok: true, id: gift.id };
}

export async function voidSadaqaGift(
  giftId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!z.string().uuid().safeParse(giftId).success) {
    return { ok: false, error: "Mangler gave" };
  }

  const supabase = await createClient();
  const user = await getUser();
  const { data: gift, error: fetchError } = await supabase
    .from("sadaqa_gifts")
    .select("id, amount, method, source_payment_id, voided_at")
    .eq("id", giftId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: toUserError(fetchError) };
  if (!gift) return { ok: false, error: "Fant ikke gaven" };
  if (gift.voided_at) return { ok: false, error: "Gaven er allerede angret" };

  const voidReason = reason?.trim() || "Angret";
  const { error } = await supabase
    .from("sadaqa_gifts")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user?.email ?? null,
      void_reason: voidReason,
    })
    .eq("id", giftId);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "sadaqa.gift_voided",
    entityType: "sadaqa_gifts",
    entityId: giftId,
    metadata: {
      amount: gift.amount,
      method: gift.method,
      sourcePaymentId: gift.source_payment_id,
      reason: voidReason,
    },
  });

  if (gift.method === "overbetaling" && gift.source_payment_id) {
    const { error: unlockError } = await supabase
      .from("payment_allocation_locks")
      .delete()
      .eq("payment_id", gift.source_payment_id);
    try {
      if (unlockError) throw unlockError;
      await allocatePayment(supabase, gift.source_payment_id);
    } catch (reallocateError) {
      console.error("Reallocation after gift void failed", {
        giftId,
        reallocateError,
      });
      revalidate();
      return {
        ok: false,
        error:
          "Gaven er angret, men betalingen ble ikke fordelt på nytt. Åpne betalingen og velg «Tilbakestill til automatisk fordeling».",
      };
    }
  }

  revalidate();
  return { ok: true };
}

type AllocationRow = {
  payment_id: string;
  amount: number;
  payments: {
    method: string;
    status: string;
    voided_at: string | null;
    refunded_amount: number;
    paid_at: string | null;
    created_at: string;
    payer_name: string | null;
  } | null;
};

export async function convertOverpaymentToGift(input: {
  studentId: string;
  schoolYearId: string;
}): Promise<
  | { ok: true; amountOre: number; leftOre: number }
  | { ok: false; error: string }
> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const ids = z
    .object({ studentId: z.string().uuid(), schoolYearId: z.string().uuid() })
    .safeParse(input);
  if (!ids.success) return { ok: false, error: "Mangler barn eller skoleår" };
  const { studentId, schoolYearId } = ids.data;

  const supabase = await createClient();
  const user = await getUser();
  const balance = await fetchBalance(supabase, studentId, schoolYearId);
  const excess = balance.paid - balance.owed;
  if (excess <= 0) {
    return { ok: false, error: "Barnet har ikke betalt mer enn kravet." };
  }

  const [{ data: student }, { data: allocationData, error: allocationError }] =
    await Promise.all([
      supabase
        .from("students")
        .select("family_id, child_first_name, child_last_name")
        .eq("id", studentId)
        .maybeSingle(),
      supabase
        .from("payment_allocations")
        .select(
          "payment_id, amount, payments!inner(method, status, voided_at, refunded_amount, paid_at, created_at, payer_name)",
        )
        .eq("student_id", studentId)
        .eq("school_year_id", schoolYearId),
    ]);
  if (allocationError) return { ok: false, error: toUserError(allocationError) };
  const childName = student ? studentDisplayName(student) || "barnet" : "barnet";

  const candidates = ((allocationData as unknown as AllocationRow[] | null) ?? [])
    .filter(
      (row) =>
        row.payments &&
        row.payments.method !== "sadaqa" &&
        row.payments.status === "fanget" &&
        !row.payments.voided_at &&
        row.payments.refunded_amount === 0 &&
        row.amount > 0,
    )
    .sort((left, right) =>
      (right.payments!.paid_at ?? right.payments!.created_at).localeCompare(
        left.payments!.paid_at ?? left.payments!.created_at,
      ),
    );

  let left = excess;
  let converted = 0;
  for (const row of candidates) {
    if (left <= 0) break;
    const take = Math.min(left, row.amount);
    const { data: current, error: currentError } = await supabase
      .from("payment_allocations")
      .select("student_id, amount")
      .eq("payment_id", row.payment_id);
    if (currentError) return { ok: false, error: toUserError(currentError) };
    const next = (current ?? [])
      .map((allocation) => ({
        studentId: allocation.student_id,
        amount:
          allocation.student_id === studentId
            ? allocation.amount - take
            : allocation.amount,
      }))
      .filter((allocation) => allocation.amount > 0);

    try {
      await replacePaymentAllocations(supabase, row.payment_id, next);
    } catch (error) {
      console.error("Overpayment reallocation failed", { studentId, error });
      revalidate();
      return {
        ok: false,
        error:
          converted > 0
            ? `${formatNok(converted)} er gjort om til sadaqa-gave, men resten feilet. Prøv igjen.`
            : "Fordelingen av betalingen feilet. Ingenting er endret.",
      };
    }

    const paidAt = row.payments!.paid_at ?? row.payments!.created_at;
    const { data: gift, error: giftError } = await supabase
      .from("sadaqa_gifts")
      .insert({
        amount: take,
        received_on: osloToday(new Date(paidAt)),
        method: "overbetaling",
        donor_name: row.payments!.payer_name,
        family_id: student?.family_id ?? null,
        source_payment_id: row.payment_id,
        school_year_id: schoolYearId,
        note: `Overskudd fra betaling for ${childName}`,
        created_by: user?.email ?? null,
      })
      .select("id")
      .single();
    if (giftError || !gift) {
      revalidate();
      return {
        ok: false,
        error: `Betalingen er fordelt på nytt, men gaven på ${formatNok(take)} ble ikke lagret: ${toUserError(giftError)}. Tilbakestill fordelingen på betalingen og prøv igjen.`,
      };
    }

    await writeAudit({
      action: "payment.sadaqa_reclassified",
      entityType: "payments",
      entityId: row.payment_id,
      metadata: { studentId, schoolYearId, amount: take, giftId: gift.id },
    });

    left -= take;
    converted += take;
  }

  if (converted === 0) {
    return {
      ok: false,
      error:
        "Fant ingen betaling som kan gjøres om automatisk. Betalinger med refusjon må ryddes i betalingsloggen.",
    };
  }

  revalidate();
  return { ok: true, amountOre: converted, leftOre: left };
}

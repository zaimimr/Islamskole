"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import { osloLocalToIso, osloToday } from "@/lib/dates";
import { replacePaymentAllocations } from "@/lib/payment-ledger";
import { rebuildInstallmentsForPayment } from "@/lib/payments-sync";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const methodLabels: Record<string, string> = {
  kontant: "Kontant",
  bank: "Bankoverføring",
  vipps: "Vipps",
  annet: "Annet",
};

const familyPaymentSchema = z.object({
  schoolYearId: z.string().uuid("Mangler skoleår"),
  familyName: z.string().trim().max(200),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Velg dato for betalingen"),
  method: z.enum(["kontant", "bank", "vipps", "annet"], {
    message: "Velg betalingsmåte",
  }),
  payerName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  split: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        amount: z.number().int().positive(),
      }),
    )
    .min(1, "Fordel beløpet på minst ett barn")
    .max(20),
});

export type FamilyPaymentInput = z.input<typeof familyPaymentSchema>;

export async function registerFamilyPayment(
  input: FamilyPaymentInput,
): Promise<ActionResult> {
  if (!(await getIsAdmin())) {
    return { ok: false, error: "Du har ikke tilgang til å gjøre dette." };
  }

  const parsed = familyPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const values = parsed.data;
  if (values.paidOn > osloToday()) {
    return { ok: false, error: "Betalingsdatoen kan ikke være frem i tid." };
  }
  const studentIds = values.split.map((row) => row.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    return { ok: false, error: "Samme barn er lagt til flere ganger." };
  }

  const supabase = await createClient();
  const [{ data: year }, { data: students, error: studentError }] =
    await Promise.all([
      supabase
        .from("school_years")
        .select("label")
        .eq("id", values.schoolYearId)
        .maybeSingle(),
      supabase.from("students").select("id, family_id").in("id", studentIds),
    ]);
  if (studentError) return { ok: false, error: toUserError(studentError) };
  const familyIds = new Set(
    ((students as { id: string; family_id: string | null }[] | null) ?? []).map(
      (row) => row.family_id,
    ),
  );
  if ((students ?? []).length !== studentIds.length) {
    return { ok: false, error: "Fant ikke alle barna." };
  }
  if (familyIds.size !== 1 || (familyIds.has(null) && studentIds.length > 1)) {
    return { ok: false, error: "Barna må tilhøre samme familie." };
  }

  const split = [...values.split].sort((a, b) => b.amount - a.amount);
  const amount = split.reduce((sum, row) => sum + row.amount, 0);
  const paidAt = osloLocalToIso(`${values.paidOn}T12:00`);
  const yearLabel = (year as { label: string } | null)?.label ?? null;
  const description = [
    `Skolepenger${yearLabel ? ` ${yearLabel}` : ""}`,
    values.familyName ? `Familien ${values.familyName}` : null,
    methodLabels[values.method],
    values.note || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: inserted, error } = await supabase
    .from("payments")
    .insert({
      student_id: split[0].studentId,
      school_year_id: values.schoolYearId,
      reference: `manual-${randomUUID()}`,
      amount,
      authorized_amount: amount,
      captured_amount: amount,
      refunded_amount: 0,
      description,
      status: "fanget",
      method: values.method,
      payer_name: values.payerName || null,
      paid_at: paidAt,
      captured_at: paidAt,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: toUserError(error) };

  try {
    await replacePaymentAllocations(supabase, inserted.id, split);
  } catch {
    await writeAudit({
      action: "payment.family_allocation_failed",
      entityType: "payments",
      entityId: inserted.id,
      metadata: { split },
    });
    revalidatePath("/[locale]/admin", "layout");
    return {
      ok: false,
      error:
        "Betalingen er lagret, men fordelingen feilet. Åpne betalingsloggen og fordel den der.",
    };
  }

  try {
    await rebuildInstallmentsForPayment(supabase, inserted.id);
  } catch (rebuildError) {
    console.error("Installment rebuild after family payment failed", {
      paymentId: inserted.id,
      error: rebuildError,
    });
  }

  await writeAudit({
    action: "payment.family_registered",
    entityType: "payments",
    entityId: inserted.id,
    metadata: {
      schoolYearId: values.schoolYearId,
      method: values.method,
      amount,
      paidOn: values.paidOn,
      payerName: values.payerName || null,
      split,
    },
  });

  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, id: inserted.id };
}

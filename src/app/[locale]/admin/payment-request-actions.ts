"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import { planBulkRequests } from "@/lib/payment-request-state";
import {
  createPaymentRequest,
  getRequestSettings,
  loadPayStatuses,
  resendPaymentRequest,
} from "@/lib/payment-requests";

export type RequestActionResult =
  | { ok: true; emailedTo: number; url: string; count?: number; skipped?: number }
  | { ok: false; error: string };

const DENIED = { ok: false as const, error: "Kontoen din har ikke tilgang til å gjøre dette." };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Noe gikk galt. Prøv igjen.";
}

const requestSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Velg minst ett barn"),
  schoolYearId: z.string().uuid("Velg et skoleår"),
  amountNok: z.number().positive("Beløp må være større enn 0").nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function sendPaymentRequest(input: {
  studentIds: string[];
  schoolYearId: string;
  amountNok: number | null;
  dueDate: string | null;
}): Promise<RequestActionResult> {
  if (!(await getIsAdmin())) return DENIED;
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  try {
    const result = await createPaymentRequest(supabase, {
      studentIds: parsed.data.studentIds,
      schoolYearId: parsed.data.schoolYearId,
      amount: parsed.data.amountNok === null ? null : Math.round(parsed.data.amountNok * 100),
      dueDate: parsed.data.dueDate,
    });
    await writeAudit({
      action: "payment.request",
      entityType: "payments",
      entityId: result.paymentId,
      metadata: { amount: result.amount, emailedTo: result.emailedTo },
    });
    revalidatePath("/", "layout");
    return { ok: true, emailedTo: result.emailedTo, url: result.url };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function resendRequest(paymentId: string): Promise<RequestActionResult> {
  if (!(await getIsAdmin())) return DENIED;
  if (!z.string().uuid().safeParse(paymentId).success) {
    return { ok: false, error: "Fant ikke kravet" };
  }
  const supabase = await createClient();
  try {
    const result = await resendPaymentRequest(supabase, paymentId);
    revalidatePath("/", "layout");
    return { ok: true, emailedTo: result.emailedTo, url: result.url };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function sendPaymentRequests(input: {
  studentIds: string[];
  schoolYearId: string;
  mode: "krav" | "paminnelse";
}): Promise<RequestActionResult> {
  if (!(await getIsAdmin())) return DENIED;
  const parsed = requestSchema
    .pick({ studentIds: true, schoolYearId: true })
    .extend({ mode: z.enum(["krav", "paminnelse"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  try {
    const statuses = await loadPayStatuses(
      supabase,
      parsed.data.schoolYearId,
      parsed.data.studentIds,
    );
    const settings = await getRequestSettings(supabase);
    const plan = planBulkRequests(statuses.values(), {
      now: new Date(),
      reminderDays: settings.reminderDays,
    });
    const reminders = parsed.data.mode === "paminnelse";
    let count = 0;
    let emailedTo = 0;
    const errors: string[] = [];
    const jobs = reminders
      ? plan.resend.map((paymentId) => () => resendPaymentRequest(supabase, paymentId))
      : plan.create.map(
        (studentIds) => () =>
          createPaymentRequest(supabase, {
            studentIds,
            schoolYearId: parsed.data.schoolYearId,
          }),
      );
    for (const job of jobs) {
      try {
        const result = await job();
        count += 1;
        emailedTo += result.emailedTo;
      } catch (error) {
        errors.push(message(error));
      }
    }
    await writeAudit({
      action: "payment.request_bulk",
      entityType: "school_years",
      entityId: parsed.data.schoolYearId,
      metadata: { mode: parsed.data.mode, sent: count, emailedTo, failed: errors.length },
    });
    revalidatePath("/", "layout");
    if (count === 0) {
      return { ok: false, error: errors[0] ?? "Ingen å sende til" };
    }
    return { ok: true, emailedTo, url: "", count, skipped: errors.length };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function setFamilyRequestsPaused(
  familyId: string,
  paused: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return DENIED;
  if (!z.string().uuid().safeParse(familyId).success) {
    return { ok: false, error: "Fant ikke familien" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ payment_requests_paused_at: paused ? new Date().toISOString() : null })
    .eq("id", familyId);
  if (error) return { ok: false, error: toUserError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  leadDays: z.number().int().min(0).max(60),
  reminderDays: z.number().int().min(1).max(60),
  maxReminders: z.number().int().min(0).max(10),
});

export async function saveRequestSettings(
  input: z.infer<typeof settingsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return DENIED;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ugyldige innstillinger" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payment_request_settings")
    .update({
      enabled: parsed.data.enabled,
      lead_days: parsed.data.leadDays,
      reminder_days: parsed.data.reminderDays,
      max_reminders: parsed.data.maxReminders,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "payment.request_settings",
    entityType: "payment_request_settings",
    entityId: "true",
    metadata: parsed.data,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

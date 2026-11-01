"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import { emailNotifications } from "@/flags";
import { planBulkRequests } from "@/lib/payment-request-state";
import {
  createPaymentRequest,
  getRequestSettings,
  loadPayStatuses,
  requestRecipients,
  resendPaymentRequest,
  type StudentPayStatus,
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

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export async function resendRequest(
  paymentId: string,
  dueDate?: string | null,
): Promise<RequestActionResult> {
  if (!(await getIsAdmin())) return DENIED;
  if (!z.string().uuid().safeParse(paymentId).success) {
    return { ok: false, error: "Fant ikke kravet" };
  }
  const due = dateSchema.safeParse(dueDate);
  const supabase = await createClient();
  try {
    const result = await resendPaymentRequest(
      supabase,
      paymentId,
      due.success ? due.data : null,
    );
    await writeAudit({
      action: "payment.request_resend",
      entityType: "payments",
      entityId: paymentId,
      metadata: { emailedTo: result.emailedTo },
    });
    revalidatePath("/", "layout");
    return { ok: true, emailedTo: result.emailedTo, url: result.url };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function loadRequestRecipients(studentIds: string[]): Promise<string[]> {
  if (!(await getIsAdmin())) return [];
  const parsed = z.array(z.string().uuid()).safeParse(studentIds);
  if (!parsed.success) return [];
  const supabase = await createClient();
  return requestRecipients(supabase, parsed.data).catch(() => []);
}

export type BulkMode = "krav" | "paminnelse";

export type BulkItem = {
  key: string;
  name: string;
  children: string[];
  amount: number;
  recipients: string[];
  renew: boolean;
};

const bulkSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Velg minst ett barn"),
  schoolYearId: z.string().uuid("Velg et skoleår"),
  mode: z.enum(["krav", "paminnelse"]),
});

type BulkJob = BulkItem & {
  studentIds: string[];
  run: () => Promise<{ emailedTo: number }>;
};

async function planBulkJobs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: z.infer<typeof bulkSchema>,
  dueDate: string | null,
): Promise<BulkJob[]> {
  const statuses = await loadPayStatuses(supabase, input.schoolYearId, input.studentIds);
  const settings = await getRequestSettings(supabase);
  const plan = planBulkRequests(statuses.values(), {
    now: new Date(),
    reminderDays: settings.reminderDays,
  });
  const all = [...statuses.values()];
  const describe = (members: StudentPayStatus[]) => ({
    name: members[0].familyName ?? members[0].name,
    children: members.map((member) => member.name),
  });
  const jobs: BulkJob[] = [];
  if (input.mode === "krav") {
    for (const studentIds of plan.create) {
      const members = studentIds
        .map((id) => statuses.get(id))
        .filter((row): row is StudentPayStatus => Boolean(row));
      if (members.length === 0) continue;
      jobs.push({
        key: studentIds.join(","),
        studentIds,
        ...describe(members),
        amount: members.reduce((sum, member) => sum + member.remaining, 0),
        recipients: [],
        renew: false,
        run: () =>
          createPaymentRequest(supabase, {
            studentIds,
            schoolYearId: input.schoolYearId,
            dueDate,
          }),
      });
    }
  }
  const paymentIds = input.mode === "krav" ? plan.renew : plan.remind;
  for (const paymentId of paymentIds) {
    const members = all.filter((row) => row.request?.paymentId === paymentId);
    if (members.length === 0) continue;
    const remaining = members.reduce((sum, member) => sum + member.remaining, 0);
    jobs.push({
      key: paymentId,
      studentIds: members.map((member) => member.studentId),
      ...describe(members),
      amount: Math.min(members[0].request?.amount ?? remaining, remaining),
      recipients: [],
      renew: input.mode === "krav",
      run: () => resendPaymentRequest(supabase, paymentId, dueDate),
    });
  }
  return jobs;
}

export async function previewPaymentRequests(input: {
  studentIds: string[];
  schoolYearId: string;
  mode: BulkMode;
}): Promise<{ ok: true; items: BulkItem[]; emailEnabled: boolean } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return DENIED;
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  try {
    const jobs = await planBulkJobs(supabase, parsed.data, null);
    const items: BulkItem[] = await Promise.all(
      jobs.map(async (job) => ({
        key: job.key,
        name: job.name,
        children: job.children,
        amount: job.amount,
        renew: job.renew,
        recipients: await requestRecipients(supabase, job.studentIds).catch(() => []),
      })),
    );
    return { ok: true, items, emailEnabled: await emailNotifications() };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function sendPaymentRequests(input: {
  studentIds: string[];
  schoolYearId: string;
  mode: BulkMode;
  keys?: string[];
  dueDate?: string | null;
}): Promise<RequestActionResult> {
  if (!(await getIsAdmin())) return DENIED;
  const parsed = bulkSchema
    .extend({ keys: z.array(z.string()).optional(), dueDate: dateSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  try {
    const keys = parsed.data.keys ? new Set(parsed.data.keys) : null;
    const jobs = (await planBulkJobs(supabase, parsed.data, parsed.data.dueDate ?? null)).filter(
      (job) => !keys || keys.has(job.key),
    );
    let count = 0;
    let emailedTo = 0;
    const errors: string[] = [];
    for (const job of jobs) {
      try {
        const result = await job.run();
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

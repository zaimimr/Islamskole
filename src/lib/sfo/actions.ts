"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayment, isVippsConfigured } from "@/lib/vipps";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";

const id = z.string().uuid();
const version = z.string().datetime({ offset: true });
const date = z.string().date();
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const optionalInt = (max: number) => z.number().int().min(0).max(max).nullable();

const activity = z.object({
  id, expected: version.nullable(), title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000),
  needsConsent: z.boolean(), consent: z.string().trim().max(4000), date, respondBy: date, location: z.string().trim().max(200).nullable(),
  start: time.nullable(), end: time.nullable(), capacity: optionalInt(10000), minAge: optionalInt(30), maxAge: optionalInt(30),
  priceOre: optionalInt(10_000_000), paymentDue: date.nullable(), showOnWebsite: z.boolean(), audience: z.array(id).max(100),
});

type Result = { ok: true } | { ok: false; code?: string };

function failed(label: string, code?: string): { ok: false; code?: string } {
  console.error(label, { code });
  return { ok: false, code };
}

export async function saveSfoActivity(input: z.infer<typeof activity>) {
  const parsed = activity.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const v = parsed.data;
  const { data, error } = await (await createClient()).rpc("save_sfo_activity", {
    p_id: v.id, p_expected: v.expected, p_title: v.title, p_description: v.description, p_needs_consent: v.needsConsent, p_consent: v.consent,
    p_date: v.date, p_respond_by: v.respondBy, p_location: v.location || null, p_start: v.start, p_end: v.end, p_capacity: v.capacity,
    p_min_age: v.minAge, p_max_age: v.maxAge, p_price_ore: v.priceOre || null, p_payment_due: v.priceOre ? v.paymentDue : null,
    p_show_on_website: v.showOnWebsite, p_audience: v.audience,
  });
  if (error) return failed("Save SFO activity failed", error.code);
  scheduleSchoolEmails();
  revalidatePath("/", "layout");
  return { ok: true as const, activity: data };
}

export async function cancelSfoActivity(input: { id: string; expected: string; refund: "full" | "amount" | "none" | null; refundOre: number | null }): Promise<Result> {
  const parsed = z.object({ id, expected: version, refund: z.enum(["full", "amount", "none"]).nullable(), refundOre: z.number().int().positive().nullable() }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false };
  const v = parsed.data;
  const { error } = await (await createClient()).rpc("cancel_school_activity", {
    p_id: v.id, p_expected: v.expected, p_refund: v.refund ?? undefined, p_refund_ore: v.refund === "amount" ? (v.refundOre ?? undefined) : undefined,
  });
  if (error) return failed("Cancel SFO activity failed", error.code);
  scheduleSchoolEmails();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function registerActivityCash(input: { activityId: string; studentId: string; amountOre: number; date: string }): Promise<Result> {
  const parsed = z.object({ activityId: id, studentId: id, amountOre: z.number().int().positive().max(10_000_000), date }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false };
  const v = parsed.data;
  const { error } = await (await createClient()).rpc("register_activity_cash", { p_id: v.activityId, p_student: v.studentId, p_amount: v.amountOre, p_date: v.date });
  if (error) return failed("Register activity cash failed", error.code);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function startActivityPayment(input: { activityId: string; studentIds: string[]; locale: string }): Promise<{ ok: true; url: string } | { ok: false; code?: string }> {
  const parsed = z.object({ activityId: id, studentIds: z.array(id).min(1).max(20), locale: z.enum(["no", "en"]) }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false };
  if (!isVippsConfigured()) return { ok: false, code: "vipps" };
  const v = parsed.data;
  const { data, error } = await (await createClient()).rpc("create_activity_payment", { p_id: v.activityId, p_students: v.studentIds });
  const payment = data?.[0];
  if (error || !payment) return failed("Create activity payment failed", error?.code);
  const head = await headers();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? `${head.get("x-forwarded-proto") ?? "https"}://${head.get("host")}`).replace(/\/$/, "");
  const admin = createAdminClient();
  const { data: row } = await admin.from("payments").select("description").eq("id", payment.payment_id).maybeSingle();
  try {
    const created = await createPayment({
      reference: payment.reference, amount: payment.amount, description: row?.description || "Aktivitet",
      returnUrl: `${site}/api/vipps/return?reference=${payment.reference}&locale=${v.locale}`,
    });
    const { error: updateError } = await admin.from("payments").update({ redirect_url: created.redirectUrl, vipps_state: "CREATED" } as never).eq("id", payment.payment_id);
    if (updateError) return failed("Activity payment link persistence failed", updateError.code);
    return { ok: true, url: created.redirectUrl };
  } catch (createError) {
    console.error("Vipps create failed for activity", { paymentId: payment.payment_id, createError });
    await admin.from("payments").update({ voided_at: new Date().toISOString(), void_reason: "Vipps feilet" } as never).eq("id", payment.payment_id);
    return { ok: false, code: "vipps" };
  }
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { writeAudit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PortalActionResult, PortalErrorCode } from "@/lib/portal/types";

const uuid = z.string().uuid();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const siblingSchema = z.object({
  familyId: uuid,
  firstName: requiredText(80),
  lastName: requiredText(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["gutt", "jente"]),
  desiredClass: optionalText(120),
  message: optionalText(2000),
  address: requiredText(200),
  postalCode: requiredText(20),
  city: requiredText(80),
});

export type SiblingField = keyof z.infer<typeof siblingSchema> | "terms";

export type SiblingResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error?: PortalErrorCode; fields?: SiblingField[] };

function refreshPortal() {
  revalidatePath("/[locale]/min-side", "layout");
}

export async function setContinues(
  studentId: string,
  continues: boolean | null,
): Promise<PortalActionResult> {
  const parsed = uuid.safeParse(studentId);
  if (!parsed.success || (continues !== null && typeof continues !== "boolean")) {
    return { ok: false, error: "invalid" };
  }
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_set_continues", {
    p_student_id: parsed.data,
    p_continues: continues,
  });
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "unknown" };

  await writeAudit({
    action: "portal.continues",
    entityType: "students",
    entityId: parsed.data,
    metadata: { continues },
  });
  refreshPortal();
  return { ok: true };
}

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function enrollSibling(formData: FormData): Promise<SiblingResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!rateLimit(`portal-sibling:${user.id}`, { limit: 5, windowMs: 60_000 }).ok) {
    return { ok: false, error: "rate_limited" };
  }

  const parsed = siblingSchema.safeParse({
    familyId: read(formData, "family_id"),
    firstName: read(formData, "first_name"),
    lastName: read(formData, "last_name"),
    birthDate: read(formData, "birth_date"),
    gender: read(formData, "gender"),
    desiredClass: read(formData, "desired_class"),
    message: read(formData, "message"),
    address: read(formData, "address"),
    postalCode: read(formData, "postal_code"),
    city: read(formData, "city"),
  });
  const fields = new Set<SiblingField>(
    parsed.success ? [] : parsed.error.issues.map((issue) => issue.path[0] as SiblingField),
  );
  if (formData.get("terms_accepted") == null) fields.add("terms");
  if (!parsed.success || fields.size) return { ok: false, error: "invalid", fields: [...fields] };
  const input = parsed.data;

  const supabase = await createClient();
  const [{ data: familyIds, error: familyError }, { data: guardianIds }] = await Promise.all([
    supabase.rpc("portal_my_family_ids"),
    supabase.rpc("portal_guardian_ids"),
  ]);
  if (familyError) return { ok: false, error: "unknown" };
  if (!(familyIds ?? []).includes(input.familyId)) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const { data: year } = await admin
    .from("school_years")
    .select("id, label, fee, enrollment_fee")
    .eq("is_active", true)
    .maybeSingle();
  if (!year?.fee) return { ok: false, error: "closed" };

  const age = ageInYear(input.birthDate, schoolYearStart(year.label) ?? new Date().getFullYear());
  if (age == null) return { ok: false, error: "invalid", fields: ["birthDate"] };

  const depositNok = Math.min(year.enrollment_fee ?? year.fee, year.fee);
  const { data, error } = await admin.rpc("create_portal_sibling_enrollment", {
    p_family_id: input.familyId,
    p_payer_guardian_id: guardianIds?.[0] ?? null,
    p_school_year_id: year.id,
    p_reference: `isk-${randomUUID()}`,
    p_amount: depositNok * 100,
    p_description: `Innmelding ${year.label} - 1 barn`,
    p_address: input.address,
    p_postal_code: input.postalCode,
    p_city: input.city,
    p_child: {
      child_first_name: input.firstName,
      child_last_name: input.lastName,
      child_birth_date: input.birthDate,
      child_gender: input.gender,
      desired_class: input.desiredClass,
      message: input.message,
      terms_accepted: true,
    },
  });
  const result = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const paymentId = typeof result?.payment_id === "string" ? result.payment_id : null;
  if (error || !paymentId) {
    console.error("enrollSibling failed", error);
    return { ok: false, error: "unknown" };
  }

  await writeAudit({
    action: "portal.sibling_enrollment",
    entityType: "student_applications",
    entityId: typeof result?.application_id === "string" ? result.application_id : null,
    metadata: { family_id: input.familyId, payment_id: paymentId },
  });
  refreshPortal();
  const locale = read(formData, "locale") === "en" ? "en" : "no";
  scheduleSchoolEmails(input.familyId);
  return { ok: true, redirectUrl: `/api/vipps/pay/${paymentId}?locale=${locale}` };
}

"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localePrefix } from "@/components/admin/paths";
import { writeAudit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { sendEmailChangeConfirmation } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import { getEmailChangeByToken, hashEmailToken, isEmailChangeOpen } from "@/lib/portal/family-data";
import {
  GENDERS,
  LANGUAGES,
  LEVELS,
  RELATIONSHIP_LABELS,
  isValidPhone,
} from "@/lib/portal/family-types";
import type { PortalActionResult, PortalErrorCode } from "@/lib/portal/types";

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const uuid = z.string().uuid();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const phoneText = optionalText(40).refine((value) => value == null || isValidPhone(value));
const levelSchema = z
  .union([z.literal(""), z.enum(LEVELS)])
  .nullable()
  .transform((value) => value || null);

function dbError(error: { code?: string } | null | undefined): PortalErrorCode {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "22023":
      return "invalid";
    case "23505":
      return "duplicate";
    case "23503":
      return "not_found";
    default:
      return "unknown";
  }
}

function refreshPortal() {
  revalidatePath("/[locale]/min-side", "layout");
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function emailTaken(email: string, guardianId: string) {
  const { data, error } = await createAdminClient()
    .from("guardians")
    .select("id")
    .ilike("email", escapeLike(email))
    .neq("id", guardianId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function allowRequest(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("portal_login_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("email change throttle failed", error);
    return false;
  }
  return data === true;
}

const addressSchema = z.object({
  familyId: uuid,
  address: requiredText(200),
  postalCode: z.string().trim().regex(/^\d{4}$/),
  city: requiredText(100),
});

export async function updateFamilyAddress(
  familyId: string,
  input: { address: string; postalCode: string; city: string },
): Promise<PortalActionResult> {
  const parsed = addressSchema.safeParse({ familyId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_family_address", {
    p_family_id: parsed.data.familyId,
    p_address: parsed.data.address,
    p_postal_code: parsed.data.postalCode,
    p_city: parsed.data.city,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true };
}

const preferencesSchema = z.object({
  familyId: uuid,
  preferredLanguage: z.enum(LANGUAGES),
});

export async function updateFamilyPreferences(
  familyId: string,
  input: { preferredLanguage: string },
): Promise<PortalActionResult> {
  const parsed = preferencesSchema.safeParse({ familyId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_family_preferences", {
    p_family_id: parsed.data.familyId,
    p_preferred_language: parsed.data.preferredLanguage,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true };
}

const guardianSchema = z.object({
  familyId: uuid,
  guardianId: uuid,
  firstName: requiredText(80),
  lastName: requiredText(80),
  phone: phoneText,
  relationship: z.enum(RELATIONSHIP_LABELS),
  receivesCommunication: z.boolean(),
});

export async function updateFamilyGuardian(
  familyId: string,
  guardianId: string,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    relationship: string;
    receivesCommunication: boolean;
  },
): Promise<PortalActionResult> {
  const parsed = guardianSchema.safeParse({ familyId, guardianId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_family_guardian", {
    p_family_id: parsed.data.familyId,
    p_guardian_id: parsed.data.guardianId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone,
    p_relationship_label: parsed.data.relationship,
    p_receives_communication: parsed.data.receivesCommunication,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: parsed.data.guardianId };
}

export async function removeGuardian(familyId: string, guardianId: string): Promise<PortalActionResult> {
  const parsed = z.object({ familyId: uuid, guardianId: uuid }).safeParse({ familyId, guardianId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_remove_guardian", {
    p_family_id: parsed.data.familyId,
    p_guardian_id: parsed.data.guardianId,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true };
}

const addGuardianSchema = z.object({
  familyId: uuid,
  firstName: requiredText(80),
  lastName: requiredText(80),
  phone: phoneText,
  relationship: z.enum(RELATIONSHIP_LABELS),
});

export async function addGuardian(
  familyId: string,
  input: { firstName: string; lastName: string; phone: string; relationship: string },
): Promise<PortalActionResult> {
  const parsed = addGuardianSchema.safeParse({ familyId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_add_guardian", {
    p_family_id: parsed.data.familyId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone ?? "",
    p_relationship_label: parsed.data.relationship,
  });
  if (error || !data) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: data };
}

const healthSchema = z.object({
  studentId: uuid,
  allergies: optionalText(1000),
  medicalNotes: optionalText(2000),
  photoConsent: z.boolean().nullable(),
});

export async function updateChildHealth(
  studentId: string,
  input: { allergies: string; medicalNotes: string; photoConsent: boolean | null },
): Promise<PortalActionResult> {
  const parsed = healthSchema.safeParse({ studentId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_child_health", {
    p_student_id: parsed.data.studentId,
    p_allergies: parsed.data.allergies ?? "",
    p_medical_notes: parsed.data.medicalNotes ?? "",
    p_photo_consent: parsed.data.photoConsent,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: parsed.data.studentId };
}

const childSchema = z.object({
  studentId: uuid,
  firstName: requiredText(80),
  lastName: requiredText(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(GENDERS),
  email: z.union([z.literal(""), emailSchema]).transform((value) => value || null),
  phone: phoneText,
  levelQuran: levelSchema,
  levelArabic: levelSchema,
  levelIslam: levelSchema,
});

export async function updateChild(
  studentId: string,
  input: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    email: string;
    phone: string;
    levelQuran: string;
    levelArabic: string;
    levelIslam: string;
  },
): Promise<PortalActionResult> {
  const parsed = childSchema.safeParse({ studentId, ...input });
  if (!parsed.success || (parsed.data.email && isPlaceholderEmail(parsed.data.email))) {
    return { ok: false, error: "invalid" };
  }
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_child", {
    p_student_id: parsed.data.studentId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_birth_date: parsed.data.birthDate,
    p_gender: parsed.data.gender,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_level_quran: parsed.data.levelQuran,
    p_level_arabic: parsed.data.levelArabic,
    p_level_islam: parsed.data.levelIslam,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: parsed.data.studentId };
}

const pickupFields = {
  name: requiredText(120),
  phone: phoneText,
  relation: optionalText(60),
};
const pickupSchema = z.object({ familyId: uuid, ...pickupFields });

export async function addPickupPerson(
  familyId: string,
  input: { name: string; phone: string; relation: string },
): Promise<PortalActionResult> {
  const parsed = pickupSchema.safeParse({ familyId, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_add_pickup", {
    p_family_id: parsed.data.familyId,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone ?? "",
    p_relation: parsed.data.relation ?? "",
  });
  if (error || !data) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: data };
}

export async function updatePickupPerson(
  id: string,
  input: { name: string; phone: string; relation: string },
): Promise<PortalActionResult> {
  const parsed = z.object({ id: uuid, ...pickupFields }).safeParse({ id, ...input });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_pickup", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_relation: parsed.data.relation,
  });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true, id: parsed.data.id };
}

export async function removePickupPerson(id: string): Promise<PortalActionResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_remove_pickup", { p_id: parsed.data });
  if (error) return { ok: false, error: dbError(error) };

  refreshPortal();
  return { ok: true };
}

const emailChangeSchema = z.object({
  guardianId: uuid,
  email: emailSchema,
  locale: z.enum(["no", "en"]),
});

export async function requestEmailChange(
  guardianId: string,
  newEmail: string,
  locale: string,
): Promise<PortalActionResult> {
  const parsed = emailChangeSchema.safeParse({
    guardianId,
    email: newEmail,
    locale: locale === "en" ? "en" : "no",
  });
  if (!parsed.success || isPlaceholderEmail(parsed.data.email)) {
    return { ok: false, error: "invalid" };
  }
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!site) {
    console.error("email change: NEXT_PUBLIC_SITE_URL mangler");
    return { ok: false, error: "unknown" };
  }

  const supabase = await createClient();
  const { data: canEdit, error: canEditError } = await supabase.rpc("portal_can_edit_guardian", {
    p_guardian_id: parsed.data.guardianId,
  });
  if (canEditError) return { ok: false, error: dbError(canEditError) };
  if (!canEdit) return { ok: false, error: "forbidden" };

  if (!(await allowRequest(`email-change:${user.id}`, 5, 3600))) {
    return { ok: false, error: "rate_limited" };
  }

  const admin = createAdminClient();
  const { data: guardian, error: guardianError } = await admin
    .from("guardians")
    .select("id, first_name, email")
    .eq("id", parsed.data.guardianId)
    .maybeSingle();
  if (guardianError) return { ok: false, error: "unknown" };
  if (!guardian) return { ok: false, error: "not_found" };
  const currentEmail = guardian.email?.trim().toLowerCase() ?? "";
  if (currentEmail && !isPlaceholderEmail(currentEmail) && currentEmail !== user.email?.trim().toLowerCase()) {
    return { ok: false, error: "forbidden" };
  }
  if (currentEmail === parsed.data.email) {
    return { ok: false, error: "invalid" };
  }

  try {
    if (await emailTaken(parsed.data.email, guardian.id)) return { ok: false, error: "duplicate" };
  } catch (error) {
    console.error("email change lookup failed", error);
    return { ok: false, error: "unknown" };
  }

  const token = randomBytes(32).toString("base64url");
  await admin
    .from("guardian_email_changes")
    .delete()
    .eq("guardian_id", guardian.id)
    .is("confirmed_at", null);
  const { data: change, error: insertError } = await admin
    .from("guardian_email_changes")
    .insert({
      guardian_id: guardian.id,
      new_email: parsed.data.email,
      token_hash: hashEmailToken(token),
      requested_by: user.id,
      expires_at: new Date(Date.now() + EMAIL_CHANGE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("email change insert failed", insertError);
    return { ok: false, error: "unknown" };
  }

  const url = new URL(`${site}${localePrefix(parsed.data.locale)}/min-side/bekreft-epost`);
  url.searchParams.set("token", token);
  const sent = await sendEmailChangeConfirmation({
    to: parsed.data.email,
    url: url.toString(),
    lang: parsed.data.locale,
    name: guardian.first_name?.trim() || parsed.data.email,
  });
  if (!sent) {
    await admin.from("guardian_email_changes").delete().eq("id", change.id);
    return { ok: false, error: "unknown" };
  }

  await writeAudit({
    action: "portal.guardian.email_change_requested",
    entityType: "guardian",
    entityId: guardian.id,
    metadata: { new_email: parsed.data.email },
  });
  refreshPortal();
  return { ok: true, id: change.id };
}

export type EmailChangeConfirmResult = { ok: false; error: "expired" | "duplicate" | "unknown" };

export async function confirmEmailChange(token: string, locale: string): Promise<EmailChangeConfirmResult> {
  if (typeof token !== "string") return { ok: false, error: "expired" };
  const change = await getEmailChangeByToken(token);
  if (!change || !isEmailChangeOpen(change)) return { ok: false, error: "expired" };

  const admin = createAdminClient();
  const email = change.new_email.trim().toLowerCase();
  try {
    if (await emailTaken(email, change.guardian_id)) return { ok: false, error: "duplicate" };
  } catch (lookupError) {
    console.error("email change confirm lookup failed", lookupError);
    return { ok: false, error: "unknown" };
  }

  const { data: claimed, error: claimError } = await admin
    .from("guardian_email_changes")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", change.id)
    .is("confirmed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (claimError) return { ok: false, error: "unknown" };
  if (!claimed) return { ok: false, error: "expired" };

  const { data: previous } = await admin
    .from("guardians")
    .select("email")
    .eq("id", change.guardian_id)
    .maybeSingle();
  const { error: updateError } = await admin
    .from("guardians")
    .update({ email, updated_at: new Date().toISOString() })
    .eq("id", change.guardian_id);
  if (updateError) {
    console.error("email change update failed", updateError);
    await admin.from("guardian_email_changes").update({ confirmed_at: null }).eq("id", change.id);
    return { ok: false, error: "unknown" };
  }

  const { data: links } = await admin
    .from("family_guardians")
    .select("family_id")
    .eq("guardian_id", change.guardian_id);
  for (const link of links ?? []) {
    const { error: syncError } = await admin.rpc("portal_sync_family_contacts", { p_family_id: link.family_id });
    if (syncError) console.error("email change contact sync failed", syncError);
  }

  await writeAudit({
    action: "portal.guardian.email_changed",
    entityType: "guardian",
    entityId: change.guardian_id,
    metadata: { from: previous?.email ?? null, to: email, change_id: change.id },
  });
  const user = await getUser();
  const previousEmail = previous?.email?.trim().toLowerCase();
  if (previousEmail && user?.email?.toLowerCase() === previousEmail) {
    await (await createClient()).auth.signOut({ scope: "local" });
  }
  refreshPortal();
  redirect(`${localePrefix(locale === "en" ? "en" : "no")}/min-side/bekreft-epost?ferdig=1`);
}

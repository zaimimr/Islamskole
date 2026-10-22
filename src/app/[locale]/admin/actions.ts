"use server";

import { matchesSearch, normalizeSearch } from "@/lib/search";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIsAdmin, getUser } from "@/lib/auth";
import { toUserError } from "@/lib/action-errors";
import { osloLocalToIso } from "@/lib/dates";
import { formatNok } from "@/lib/money";
import { getSiteSettings } from "@/lib/data";
import { writeAudit } from "@/lib/audit";
import { findAuthUserId, sendLoginLink } from "@/lib/login-link";
import { rateLimit } from "@/lib/rate-limit";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";
import {
  sendTeacherApplicationEmail,
  sendTeacherApplicationConfirmationEmail,
} from "@/lib/email";
import type { Json } from "@/lib/supabase/types";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
type Denied = { ok: false; error: string };

async function requireAdmin(): Promise<Denied | null> {
  if (await getIsAdmin()) return null;
  const user = await getUser();
  return {
    ok: false,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt i en ny fane og prøv igjen, så beholder du det du har skrevet.",
  };
}

function toAuthUserError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
      return "Det finnes allerede en bruker med denne e-postadressen.";
    case "user_not_found":
      return "Fant ikke brukeren. Last siden på nytt.";
    default:
      return toUserError(error);
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value === "" ? null : value;
}

function readNumber(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function readDateTime(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (value === "") return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const iso = osloLocalToIso(value);
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const eventSchema = z.object({
  title_no: z.string().min(1, "Tittel (norsk) er påkrevd"),
  starts_at: z.string().min(1, "Startdato er påkrevd"),
});

const classSchema = z.object({
  name_no: z.string().min(1, "Navn (norsk) er påkrevd"),
});

function revalidateAdminAndSite() {
  revalidatePath("/", "layout");
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const titleNo = readString(formData, "title_no");
  const startsAt = readDateTime(formData, "starts_at");

  const parsed = eventSchema.safeParse({
    title_no: titleNo,
    starts_at: startsAt ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const slugInput = readString(formData, "slug");
  const slug = slugInput === "" ? slugify(titleNo) : slugify(slugInput);

  const payload = {
    slug,
    title_no: titleNo,
    title_en: readOptionalString(formData, "title_en"),
    excerpt_no: readOptionalString(formData, "excerpt_no"),
    excerpt_en: readOptionalString(formData, "excerpt_en"),
    body_no: readOptionalString(formData, "body_no"),
    body_en: readOptionalString(formData, "body_en"),
    location: readOptionalString(formData, "location"),
    starts_at: startsAt,
    ends_at: readDateTime(formData, "ends_at"),
    image_url: readOptionalString(formData, "image_url"),
    published: readBoolean(formData, "published"),
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert(payload as never)
    .select("id")
    .single();

  if (error) return { ok: false, error: toUserError(error) };

  const eventId = (data as unknown as { id: string }).id;
  await writeAudit({
    action: "event.create",
    entityType: "events",
    entityId: eventId,
    metadata: { title_no: titleNo, slug, published: payload.published },
  });

  revalidateAdminAndSite();
  return { ok: true, id: eventId };
}

export async function updateEvent(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const titleNo = readString(formData, "title_no");
  const startsAt = readDateTime(formData, "starts_at");

  const parsed = eventSchema.safeParse({
    title_no: titleNo,
    starts_at: startsAt ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const slugInput = readString(formData, "slug");
  const slug = slugInput === "" ? slugify(titleNo) : slugify(slugInput);

  const payload = {
    slug,
    title_no: titleNo,
    title_en: readOptionalString(formData, "title_en"),
    excerpt_no: readOptionalString(formData, "excerpt_no"),
    excerpt_en: readOptionalString(formData, "excerpt_en"),
    body_no: readOptionalString(formData, "body_no"),
    body_en: readOptionalString(formData, "body_en"),
    location: readOptionalString(formData, "location"),
    starts_at: startsAt,
    ends_at: readDateTime(formData, "ends_at"),
    image_url: readOptionalString(formData, "image_url"),
    published: readBoolean(formData, "published"),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update(payload as never)
    .eq("id", id);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "event.update",
    entityType: "events",
    entityId: id,
    metadata: { title_no: titleNo, slug, published: payload.published },
  });

  revalidateAdminAndSite();
  return { ok: true, id };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "event.delete",
    entityType: "events",
    entityId: id,
  });
  revalidateAdminAndSite();
  return { ok: true, id };
}

export async function createClass(formData: FormData): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const nameNo = readString(formData, "name_no");

  const parsed = classSchema.safeParse({ name_no: nameNo });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const slugInput = readString(formData, "slug");
  const slug = slugInput === "" ? slugify(nameNo) : slugify(slugInput);

  const payload = {
    slug,
    name_no: nameNo,
    name_en: readOptionalString(formData, "name_en"),
    age_min: readNumber(formData, "age_min"),
    age_max: readNumber(formData, "age_max"),
    capacity: readNumber(formData, "capacity"),
    price: readNumber(formData, "price"),
    description_no: readOptionalString(formData, "description_no"),
    description_en: readOptionalString(formData, "description_en"),
    curriculum_no: readOptionalString(formData, "curriculum_no"),
    curriculum_en: readOptionalString(formData, "curriculum_en"),
    image_url: readOptionalString(formData, "image_url"),
    published: readBoolean(formData, "published"),
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .insert(payload as never)
    .select("id")
    .single();

  if (error) return { ok: false, error: toUserError(error) };

  const classId = (data as unknown as { id: string }).id;
  await writeAudit({
    action: "class.create",
    entityType: "classes",
    entityId: classId,
    metadata: { name_no: nameNo, slug, published: payload.published },
  });

  revalidateAdminAndSite();
  return { ok: true, id: classId };
}

export async function updateClass(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const nameNo = readString(formData, "name_no");

  const parsed = classSchema.safeParse({ name_no: nameNo });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const slugInput = readString(formData, "slug");
  const slug = slugInput === "" ? slugify(nameNo) : slugify(slugInput);

  const payload = {
    slug,
    name_no: nameNo,
    name_en: readOptionalString(formData, "name_en"),
    age_min: readNumber(formData, "age_min"),
    age_max: readNumber(formData, "age_max"),
    capacity: readNumber(formData, "capacity"),
    price: readNumber(formData, "price"),
    description_no: readOptionalString(formData, "description_no"),
    description_en: readOptionalString(formData, "description_en"),
    curriculum_no: readOptionalString(formData, "curriculum_no"),
    curriculum_en: readOptionalString(formData, "curriculum_en"),
    image_url: readOptionalString(formData, "image_url"),
    published: readBoolean(formData, "published"),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update(payload as never)
    .eq("id", id);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "class.update",
    entityType: "classes",
    entityId: id,
    metadata: { name_no: nameNo, slug, published: payload.published },
  });

  revalidateAdminAndSite();
  return { ok: true, id };
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "class.delete",
    entityType: "classes",
    entityId: id,
  });
  revalidateAdminAndSite();
  return { ok: true, id };
}

export async function updateSettings(
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const payload = {
    id: true,
    contact_email: readOptionalString(formData, "contact_email"),
    enroll_email: readOptionalString(formData, "enroll_email"),
    address: readOptionalString(formData, "address"),
    hours: readOptionalString(formData, "hours"),
    facebook_url: readOptionalString(formData, "facebook_url"),
    instagram_url: readOptionalString(formData, "instagram_url"),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert(payload as never);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "settings.update",
    entityType: "site_settings",
    metadata: {
      contact_email: payload.contact_email,
      enroll_email: payload.enroll_email,
    },
  });

  revalidateAdminAndSite();
  return { ok: true };
}

const MIN_FILL_MS = 3_000;

function isLikelyBot(formData: FormData, honeypotField = "hp_field_t"): boolean {
  const honeypot = readOptionalString(formData, honeypotField);
  if (honeypot) return true;

  const loadedAt = Number(formData.get("loaded_at"));
  if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < MIN_FILL_MS) {
    return true;
  }

  return false;
}

const teacherApplicationSchema = z.object({
  full_name: z.string().min(1, "Navn er påkrevd"),
  email: z.string().min(1, "E-post er påkrevd").email("Ugyldig e-postadresse"),
});

const teacherStatusSchema = z.enum(["ny", "kontaktet", "arkivert"]);

export async function createTeacherApplication(
  formData: FormData,
): Promise<ActionResult> {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const limit = rateLimit(`apply:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!limit.ok) {
    return { ok: false, error: "For mange forsøk, prøv igjen senere." };
  }

  if (isLikelyBot(formData)) {
    return { ok: true };
  }

  const fullName = readString(formData, "full_name");
  const email = readString(formData, "email");

  const parsed = teacherApplicationSchema.safeParse({
    full_name: fullName,
    email,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const payload = {
    full_name: fullName,
    email,
    phone: readOptionalString(formData, "phone"),
    subjects: readOptionalString(formData, "subjects"),
    message: readOptionalString(formData, "message"),
  };

  const { error } = await createAdminClient()
    .from("teacher_applications")
    .insert(payload as never);

  if (error) return { ok: false, error: toUserError(error) };

  {
    const settings = await getSiteSettings();
    await sendTeacherApplicationEmail({
      to: settings?.contact_email ?? "baerum@islamskole.no",
      fullName,
      replyTo: email,
      rows: [
        ["Navn", fullName],
        ["E-post", email],
        ["Telefon", payload.phone],
        ["Fag / interesse", payload.subjects],
        ["Melding", payload.message],
      ],
    });
    await sendTeacherApplicationConfirmationEmail({
      to: email,
      fullName,
      lang: "no",
    });
  }

  return { ok: true };
}

export async function updateTeacherApplicationStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = teacherStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_applications")
    .update({ status: parsed.data } as never)
    .eq("id", id);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "teacher.status",
    entityType: "teacher_applications",
    entityId: id,
    metadata: { status: parsed.data },
  });

  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function deleteTeacherApplication(
  id: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_applications")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "teacher.delete",
    entityType: "teacher_applications",
    entityId: id,
  });
  revalidatePath("/", "layout");
  return { ok: true, id };
}

const ENROLLMENT_HONEYPOT = "hp_field_e";

type SignupResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const enrollChildSchema = z.object({
  child_first_name: z.string().min(1, "Barnets fornavn er påkrevd"),
  child_last_name: z.string().min(1, "Barnets etternavn er påkrevd"),
  birth_date: z.string().min(1, "Fødselsdato er påkrevd"),
  gender: z.string().min(1, "Kjønn er påkrevd"),
  email: z.union([z.literal(""), z.string().email("Ugyldig e-postadresse")]),
});
const enrollGuardianSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z
    .string()
    .refine((value) => /^\+?\d{8,15}$/.test(value.replace(/[\s-]/g, ""))),
  role: z.enum(["foresatt", "mor", "far", "steforelder", "verge", "annet"]),
});
const studentStatusSchema = z.enum([
  "ny",
  "kontaktet",
  "akseptert",
  "avslatt",
  "arkivert",
]);

export async function createStudentEnrollment(
  formData: FormData,
): Promise<SignupResult> {
  const english = readString(formData, "locale") === "en";
  const copy = english
    ? {
        rateLimit: "Too many attempts. Please try again later.",
        terms: "You must accept the terms of sale",
        required: "This field is required",
        email: "Enter a valid email address",
        phone: "Enter a valid phone number",
        guardians: "Add at least one guardian.",
        parentRequired:
          "Provide at least one parent (mother or father). Opt out only if a parent is not in the picture.",
        children: "Add at least one child.",
        unavailable: "Enrollment is not open yet. Please contact the school.",
        failed:
          "Something went wrong during enrollment. Please try again later.",
      }
    : {
        rateLimit: "For mange forsøk, prøv igjen senere.",
        terms: "Du må godta salgsbetingelsene",
        required: "Dette feltet er påkrevd",
        email: "Skriv inn en gyldig e-postadresse",
        phone: "Skriv inn et gyldig telefonnummer",
        guardians: "Legg til minst én foresatt.",
        parentRequired:
          "Oppgi minst én av foreldrene (mor eller far). Velg bort bare dersom en forelder ikke er i bildet.",
        children: "Legg til minst ett barn.",
        unavailable: "Innmelding er ikke åpen ennå. Ta kontakt med skolen.",
        failed: "Noe gikk galt under registreringen. Prøv igjen senere.",
      };
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const limit = rateLimit(`apply:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!limit.ok) {
    return { ok: false, error: copy.rateLimit };
  }

  if (isLikelyBot(formData, ENROLLMENT_HONEYPOT)) {
    return { ok: false, error: copy.failed };
  }

  const termsAccepted = formData.get("terms_accepted") != null;
  if (!termsAccepted) {
    return {
      ok: false,
      fieldErrors: { terms_accepted: copy.terms },
    };
  }

  const parentErrors: Record<string, string> = {};
  const guardianIndices = Array.from(
    new Set(
      readString(formData, "guardian_indices")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value)),
    ),
  ).slice(0, 6);
  if (guardianIndices.length === 0) {
    return { ok: false, error: copy.guardians };
  }

  const guardians: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: z.infer<typeof enrollGuardianSchema>["role"];
    isPrimary: boolean;
  }[] = [];

  for (const [index, id] of guardianIndices.entries()) {
    const payload = {
      first_name: readString(formData, `guardian_${id}_first_name`),
      last_name: readString(formData, `guardian_${id}_last_name`),
      email: readString(formData, `guardian_${id}_email`),
      phone: readString(formData, `guardian_${id}_phone`),
      role: readString(formData, `guardian_${id}_role`),
    };
    const parsed = enrollGuardianSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        const key = `guardian_${id}_${field}`;
        if (field === "email") parentErrors[key] = copy.email;
        else if (field === "phone") parentErrors[key] = copy.phone;
        else parentErrors[key] = copy.required;
      }
      continue;
    }
    guardians.push({
      firstName: parsed.data.first_name,
      lastName: parsed.data.last_name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone,
      role: parsed.data.role,
      isPrimary: index === 0,
    });
  }

  const address = readString(formData, "address");
  const postalCode = readString(formData, "postal_code");
  const city = readString(formData, "city");
  if (!address) parentErrors.address = copy.required;
  if (!postalCode) parentErrors.postal_code = copy.required;
  if (!city) parentErrors.city = copy.required;

  if (Object.keys(parentErrors).length > 0) {
    return { ok: false, fieldErrors: parentErrors };
  }

  if (
    !guardians.some(
      (guardian) => guardian.role === "mor" || guardian.role === "far",
    )
  ) {
    return { ok: false, error: copy.parentRequired };
  }

  const indices = Array.from(
    new Set(
      readString(formData, "child_indices")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value)),
    ),
  ).slice(0, 10);
  if (indices.length === 0) {
    return { ok: false, error: copy.children };
  }

  const fieldErrors: Record<string, string> = {};
  const childPayloads: Json[] = [];
  const primaryGuardian = guardians[0]!;
  const motherGuardian =
    guardians.find((guardian) => guardian.role === "mor") ?? primaryGuardian;
  const fatherGuardian =
    guardians.find((guardian) => guardian.role === "far") ??
    guardians.find((guardian) => guardian !== motherGuardian) ??
    null;

  for (const i of indices) {
    const childFirstName = readString(formData, `child_${i}_child_first_name`);
    const childLastName = readString(formData, `child_${i}_child_last_name`);
    const birthDate = readString(formData, `child_${i}_birth_date`);
    const gender = readString(formData, `child_${i}_gender`);
    const childEmail = readString(formData, `child_${i}_email`);

    const parsed = enrollChildSchema.safeParse({
      child_first_name: childFirstName,
      child_last_name: childLastName,
      birth_date: birthDate,
      gender,
      email: childEmail,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        const scoped = `child_${i}_${key === "email" ? "email" : key}`;
        if (key && !(scoped in fieldErrors)) {
          fieldErrors[scoped] = issue.message;
        }
      }
      continue;
    }

    childPayloads.push({
      child_first_name: childFirstName,
      child_last_name: childLastName,
      child_birth_date: birthDate || null,
      child_gender: gender || null,
      child_address: address,
      child_postal_code: postalCode,
      child_city: city,
      child_email: childEmail || null,
      child_phone: readOptionalString(formData, `child_${i}_phone`),
      mother_first_name: motherGuardian.firstName,
      mother_last_name: motherGuardian.lastName,
      mother_phone: motherGuardian.phone,
      mother_email: motherGuardian.email,
      father_first_name: fatherGuardian?.firstName ?? null,
      father_last_name: fatherGuardian?.lastName ?? null,
      father_phone: fatherGuardian?.phone ?? null,
      father_email: fatherGuardian?.email ?? null,
      desired_class: readOptionalString(formData, `child_${i}_desired_class`),
      child_level_quran: readOptionalString(formData, `child_${i}_level_quran`),
      child_level_arabic: readOptionalString(
        formData,
        `child_${i}_level_arabic`,
      ),
      child_level_islam: readOptionalString(formData, `child_${i}_level_islam`),
      message: readOptionalString(formData, `child_${i}_message`),
      terms_accepted: termsAccepted,
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const admin = createAdminClient();

  const { data: yearRow } = await admin
    .from("school_years")
    .select("id, label, fee, enrollment_fee")
    .eq("is_active", true)
    .maybeSingle();
  const year = yearRow as unknown as {
    id: string;
    label: string;
    fee: number | null;
    enrollment_fee: number | null;
  } | null;
  if (!year?.fee) {
    return {
      ok: false,
      error: copy.unavailable,
    };
  }

  const reference = `isk-${randomUUID()}`;
  const depositNok = Math.min(year.enrollment_fee ?? year.fee, year.fee);
  const amount = depositNok * 100 * childPayloads.length;
  const description = `Innmelding ${year.label} - ${childPayloads.length} barn`;

  const { data: enrollment, error: enrollmentError } = await admin.rpc(
    "create_public_family_enrollment",
    {
      p_school_year_id: year.id,
      p_reference: reference,
      p_amount: amount,
      p_description: description,
      p_address: address,
      p_postal_code: postalCode,
      p_city: city,
      p_guardians: guardians.map((guardian) => ({
        first_name: guardian.firstName,
        last_name: guardian.lastName,
        email: guardian.email,
        phone: guardian.phone,
        role: guardian.role,
      })),
      p_children: childPayloads,
    },
  );

  const paymentId =
    enrollment &&
    typeof enrollment === "object" &&
    !Array.isArray(enrollment) &&
    typeof enrollment.payment_id === "string"
      ? enrollment.payment_id
      : null;

  if (enrollmentError || !paymentId) {
    console.error("createStudentEnrollment transaction error", enrollmentError);
    return {
      ok: false,
      error: copy.failed,
    };
  }

  const familyId = enrollment && typeof enrollment === "object" && !Array.isArray(enrollment)
    && typeof enrollment.family_id === "string" ? enrollment.family_id : null;
  if (familyId) {
    const { error: languageError } = await admin.from("families")
      .update({ preferred_language: english ? "en" : "no" }).eq("id", familyId);
    if (languageError) console.error("Could not set signup email language", languageError);
    scheduleSchoolEmails(familyId);
  }

  return {
    ok: true,
    redirectUrl: `/api/vipps/pay/${paymentId}?locale=${english ? "en" : "no"}`,
  };
}

export async function updateStudentApplicationStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = studentStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_applications")
    .update({ status: parsed.data } as never)
    .eq("id", id);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "application.status",
    entityType: "student_applications",
    entityId: id,
    metadata: { status: parsed.data },
  });

  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function deleteStudentApplication(
  id: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const { data: application, error: loadError } = await supabase
    .from("student_applications")
    .select("payment_id, payments(status)")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { ok: false, error: toUserError(loadError) };
  const paymentStatus = application?.payments?.status ?? null;
  if (
    application?.payment_id &&
    paymentStatus &&
    !["opprettet", "avbrutt", "feilet"].includes(paymentStatus)
  ) {
    return {
      ok: false,
      error:
        "Innmeldingen har en betaling og kan ikke slettes. Arkiver den i stedet.",
    };
  }
  const { error } = await supabase
    .from("student_applications")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "application.delete",
    entityType: "student_applications",
    entityId: id,
  });
  revalidatePath("/", "layout");
  return { ok: true, id };
}

const addUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "E-post er påkrevd")
    .email("Ugyldig e-postadresse"),
  fullName: z.string().trim().max(200),
  role: z.enum(["admin", "sfo"], { message: "Velg en rolle" }),
});

const roleKeySchema = z.enum(["admin", "sfo", "teacher", "volunteer"]);

function splitFullName(fullName: string, email: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: email.split("@")[0], last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

async function guardianIdForEmail(
  email: string,
  fullName: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: matches, error } = await admin
    .from("guardians")
    .select("id")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .order("created_at")
    .limit(1);
  if (error) return { ok: false, error: toUserError(error) };
  if (matches?.[0]) return { ok: true, id: matches[0].id };
  const name = splitFullName(fullName, email);
  const { data, error: insertError } = await admin
    .from("guardians")
    .insert({ email, first_name: name.first, last_name: name.last })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: toUserError(insertError) };
  return { ok: true, id: data.id };
}

async function grantRole(guardianId: string, role: z.infer<typeof roleKeySchema>) {
  const supabase = await createClient();
  const me = await getUser();
  const { error } = await supabase
    .from("person_roles")
    .upsert(
      { guardian_id: guardianId, role_key: role, granted_by: me?.email ?? null },
      { onConflict: "guardian_id,role_key", ignoreDuplicates: true },
    );
  return error;
}

export async function addUserWithRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = addUserSchema.safeParse({
    email: readString(formData, "email"),
    fullName: readString(formData, "full_name"),
    role: readString(formData, "role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { email, fullName, role } = parsed.data;

  const admin = createAdminClient();
  let existingId;
  try {
    existingId = await findAuthUserId(email);
  } catch (error) {
    return { ok: false, error: toUserError(error as { code?: string; message?: string }) };
  }
  let userId = existingId;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      return { ok: false, error: toAuthUserError(error ?? {}) };
    }
    userId = data.user.id;
  }

  const guardian = await guardianIdForEmail(email, fullName);
  if (!guardian.ok) return guardian;
  const grantError = await grantRole(guardian.id, role);
  if (grantError) return { ok: false, error: toUserError(grantError) };
  revalidatePath("/", "layout");

  const link = await sendLoginLink({ email, locale: "no" });
  if (!link.ok) {
    return {
      ok: false,
      error: `Tilgangen er gitt, men innloggingslenken ble ikke sendt. ${link.error}`,
    };
  }
  return { ok: true, id: userId };
}

export async function setUserRole(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const userId = readString(formData, "user_id");
  const role = roleKeySchema.safeParse(readString(formData, "role"));
  const enabled = readString(formData, "enabled") === "true";
  if (!z.string().uuid().safeParse(userId).success || !role.success) {
    return { ok: false, error: "Ugyldig bruker." };
  }
  if (role.data === "teacher" && !enabled) {
    return { ok: false, error: "Lærere fjernes fra lærersiden." };
  }
  const me = await getUser();
  if (me?.id === userId && role.data === "admin" && !enabled) {
    return { ok: false, error: "Du kan ikke fjerne din egen administratortilgang." };
  }

  const admin = createAdminClient();
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email?.trim().toLowerCase();
  if (userError || !email) {
    return { ok: false, error: "Fant ikke brukeren. Last siden på nytt." };
  }

  if (enabled) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const guardian = await guardianIdForEmail(
      email,
      profile?.full_name || String(authUser.user?.user_metadata?.full_name ?? ""),
    );
    if (!guardian.ok) return guardian;
    const grantError = await grantRole(guardian.id, role.data);
    if (grantError) return { ok: false, error: toUserError(grantError) };
    await writeAudit({
      action: role.data === "teacher" ? "teacher.registered" : "role.granted",
      entityType: "guardian",
      entityId: guardian.id,
      metadata: { email, role: role.data, from_user: userId },
    });
  } else {
    const { data: guardians, error: lookupError } = await admin
      .from("guardians")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"));
    if (lookupError) return { ok: false, error: toUserError(lookupError) };
    const supabase = await createClient();
    const { error } = await supabase
      .from("person_roles")
      .delete()
      .eq("role_key", role.data)
      .in("guardian_id", (guardians ?? []).map((guardian) => guardian.id));
    if (error) {
      return {
        ok: false,
        error: error.message.includes("minst én administrator")
          ? "Det må alltid finnes minst én administrator."
          : toUserError(error),
      };
    }
    await writeAudit({
      action: "role.removed",
      entityType: "user",
      entityId: userId,
      metadata: { email, role: role.data, from_user: userId },
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, id: userId };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Ugyldig bruker." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) {
    return { ok: false, error: "Du kan ikke slette din egen konto" };
  }
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profileError || profile?.role === "developer") return { ok: false, error: "Utviklerkontoen kan ikke slettes her." };
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email?.trim().toLowerCase();
  if (email) {
    const { data: guardians, error: lookupError } = await admin
      .from("guardians")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"));
    if (lookupError) return { ok: false, error: toUserError(lookupError) };
    const { error: roleError } = await supabase
      .from("person_roles")
      .delete()
      .in("role_key", ["admin", "sfo"])
      .in("guardian_id", (guardians ?? []).map((guardian) => guardian.id));
    if (roleError) {
      return {
        ok: false,
        error: roleError.message.includes("minst én administrator")
          ? "Det må alltid finnes minst én administrator."
          : toUserError(roleError),
      };
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: toAuthUserError(error) };
  await writeAudit({
    action: "user.delete",
    entityType: "users",
    entityId: userId,
  });
  revalidatePath("/", "layout");
  return { ok: true, id: userId };
}

export async function reorderClasses(ids: string[]): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Ingen rekkefølge å lagre" };
  }
  const supabase = await createClient();
  const results = await Promise.all(
    ids.map((id, index) =>
      supabase
        .from("classes")
        .update({ sort_order: (index + 1) * 10 } as never)
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: toUserError(failed.error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function bulkUpdateApplicationStatus(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Ingen påmeldinger valgt" };
  }
  const parsed = studentStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_applications")
    .update({ status: parsed.data } as never)
    .in("id", ids);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "application.bulk_status",
    entityType: "student_applications",
    metadata: { count: ids.length, status: parsed.data },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function bulkUpdateTeacherStatus(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Ingen søknader valgt" };
  }
  const parsed = teacherStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_applications")
    .update({ status: parsed.data } as never)
    .in("id", ids);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "teacher.bulk_status",
    entityType: "teacher_applications",
    metadata: { count: ids.length, status: parsed.data },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export type AdminSearchHit = {
  group: "Familier" | "Elever" | "Klasser" | "Betalinger";
  id: string;
  label: string;
  detail: string | null;
  path: string;
};

type AdminSearchResult = { ok: true; hits: AdminSearchHit[] } | Denied;

const MAX_FAMILY_HITS = 8;

function personName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ").trim();
}

export async function searchAdmin(query: string): Promise<AdminSearchResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const term = String(query ?? "").slice(0, 120);
  if (normalizeSearch(term).length < 2) return { ok: true, hits: [] };
  const matchesAll = (text: string) => matchesSearch(term, text);

  const supabase = await createClient();
  const [families, guardians, students, classes, payments] = await Promise.all([
    supabase
      .rpc("admin_search_families", { p_query: term })
      .select("id, display_name, city")
      .limit(20),
    supabase
      .rpc("admin_search_guardians", { p_query: term })
      .select(
        "first_name, last_name, email, phone, family_guardians(family_id, families(display_name, city))",
      )
      .limit(20),
    supabase
      .rpc("admin_search_students", { p_query: term })
      .select("id, child_first_name, child_last_name, child_birth_date")
      .limit(30),
    supabase
      .rpc("admin_search_classes", { p_query: term })
      .select("id, name_no, age_min, age_max, sort_order")
      .order("sort_order", { ascending: true })
      .limit(6),
    supabase
      .rpc("admin_search_payments", { p_query: term })
      .select("id, reference, psp_reference, payer_name, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const failed = [families, guardians, students, classes, payments].find((result) => result.error);
  if (failed?.error) return { ok: false, error: toUserError(failed.error) };
  const hits: AdminSearchHit[] = [];
  const familyIds = new Set<string>();

  for (const family of (families.data ?? []) as {
    id: string;
    display_name: string | null;
    city: string | null;
  }[]) {
    const label = family.display_name ?? "Familie uten navn";
    if (familyIds.has(family.id)) continue;
    familyIds.add(family.id);
    hits.push({
      group: "Familier",
      id: family.id,
      label,
      detail: family.city,
      path: `/familier/${family.id}`,
    });
  }

  const guardianHits: { byName: boolean; hit: AdminSearchHit }[] = [];
  for (const guardian of (guardians.data ?? []) as unknown as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    family_guardians:
      | {
          family_id: string;
          families: { display_name: string | null; city: string | null } | null;
        }[]
      | null;
  }[]) {
    const name = personName(guardian.first_name, guardian.last_name);
    const byName = matchesAll(name);
    for (const link of guardian.family_guardians ?? []) {
      if (familyIds.has(link.family_id)) continue;
      familyIds.add(link.family_id);
      guardianHits.push({
        byName,
        hit: {
          group: "Familier",
          id: link.family_id,
          label: link.families?.display_name
            ? link.families.display_name
            : `Familien til ${name || "foresatt"}`,
          detail: [
            guardian.email ?? guardian.phone,
            link.families?.city ??
              `ID ${link.family_id.slice(0, 8).toUpperCase()}`,
          ]
            .filter(Boolean)
            .join(" · "),
          path: `/familier/${link.family_id}`,
        },
      });
    }
  }
  guardianHits.sort((left, right) => Number(right.byName) - Number(left.byName));
  hits.push(...guardianHits.map((entry) => entry.hit));
  hits.splice(MAX_FAMILY_HITS);

  for (const student of (students.data ?? []) as {
    id: string;
    child_first_name: string | null;
    child_last_name: string | null;
    child_birth_date: string | null;
  }[]) {
    const name = personName(student.child_first_name, student.child_last_name);
    hits.push({
      group: "Elever",
      id: student.id,
      label: name || "Elev uten navn",
      detail: student.child_birth_date
        ? `Født ${student.child_birth_date.slice(0, 4)}`
        : null,
      path: `/elever/${student.id}`,
    });
  }

  for (const row of (classes.data ?? []) as {
    id: string;
    name_no: string | null;
    age_min: number | null;
    age_max: number | null;
  }[]) {
    const label = row.name_no ?? "Klasse uten navn";
    hits.push({
      group: "Klasser",
      id: row.id,
      label,
      detail:
        row.age_min != null && row.age_max != null
          ? `${row.age_min}-${row.age_max} år`
          : null,
      path: `/klasser/${row.id}`,
    });
  }

  for (const payment of (payments.data ?? []) as {
    id: string;
    reference: string;
    psp_reference: string | null;
    payer_name: string | null;
    amount: number;
    status: string;
  }[]) {
    hits.push({
      group: "Betalinger",
      id: payment.id,
      label: payment.reference,
      detail: [payment.payer_name, formatNok(payment.amount)]
        .filter(Boolean)
        .join(" · "),
      path: `/betaling/logg?q=${encodeURIComponent(payment.reference)}`,
    });
  }

  return { ok: true, hits: hits.slice(0, 30) };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
}

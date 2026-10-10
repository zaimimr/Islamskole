"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  capturePayment,
  cancelPayment,
  createPayment,
  getPayment,
  refundPayment,
} from "@/lib/vipps";
import {
  rebuildInstallmentsForPayment,
  sendPaymentReceipt,
  sendRefundNotice,
  syncPaymentByReference,
} from "@/lib/payments-sync";
import {
  allocatePayment,
  allocatePaymentsForStudent,
  balanceKey,
  ensureStudentFee,
  fetchBalance,
  fetchBalances,
  replacePaymentAllocations,
  setStudentFee,
} from "@/lib/payment-ledger";
import { buildReference, describeForStudent } from "@/lib/payment-descriptor";
import { rebuildPendingInstallmentsForStudent } from "@/lib/payment-plans";
import {
  sendPaymentLinkEmail,
  sendWelcomeEmail as sendWelcome,
} from "@/lib/email";
import {
  recipientsFor,
  remainingFor,
  type MoneyRecipients,
} from "@/lib/installment-billing";
import {
  mapInChunks,
  planFamilyBatch,
  vippsIdempotencyKey,
  type BatchCandidate,
  type BatchExcluded,
  type BatchFamily,
} from "@/lib/payment-integrity";
import { guardianName, studentDisplayName } from "@/lib/student-name";
import { familyDisplayName } from "@/lib/families/naming";
import {
  findReturningStudent,
  targetApplicationPayment,
} from "@/lib/families/returning-student";
import { getSiteSettings } from "@/lib/data";
import { toUserError } from "@/lib/action-errors";
import { capAtLimit, formatNok } from "@/lib/money";
import { osloToday } from "@/lib/dates";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { emailNotifications } from "@/flags";

type ActionResult =
  { ok: true; id?: string; note?: string } | { ok: false; error: string };
type PaymentResult =
  | {
      ok: true;
      redirectUrl: string;
      reference: string;
      emailed?: boolean;
      emailedTo?: number;
    }
  | { ok: false; error: string };
type BatchResult =
  | { ok: true; sent: number; skipped: number; failed: number; note?: string }
  | { ok: false; error: string };

const EMAIL_OFF_ERROR =
  "E-postvarsler er slått av. Slå dem på før du sender e-post til foresatte.";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

function vippsError(error: unknown) {
  console.error("Vipps action failed", error);
  if (error instanceof Error && error.message.startsWith("Vipps er ikke")) {
    return error.message;
  }
  return "Vipps svarte med en feil. Prøv igjen om litt.";
}

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

function revalidate() {
  revalidatePath("/", "layout");
}

const required = (message: string) =>
  z.preprocess((v) => v ?? "", z.string().min(1, message));

const childSchema = z.object({
  child_first_name: required("Barnets fornavn er påkrevd"),
  child_last_name: required("Barnets etternavn er påkrevd"),
});

const studentSchema = z
  .object({
    child_first_name: required("Barnets fornavn er påkrevd"),
    child_last_name: required("Barnets etternavn er påkrevd"),
    mother_first_name: z.string().nullable(),
    mother_last_name: z.string().nullable(),
    father_first_name: z.string().nullable(),
    father_last_name: z.string().nullable(),
  })
  .refine(
    (value) =>
      guardianName({
        mother_first_name: value.mother_first_name,
        mother_last_name: value.mother_last_name,
        father_first_name: value.father_first_name,
        father_last_name: value.father_last_name,
      }) != null,
    { message: "Minst én foresatt må fylles ut" },
  );

function readChildPayload(formData: FormData) {
  return {
    child_first_name: readOptionalString(formData, "child_first_name"),
    child_last_name: readOptionalString(formData, "child_last_name"),
    child_birth_date: readOptionalString(formData, "birth_date"),
    child_gender: readOptionalString(formData, "gender"),
    child_address: readOptionalString(formData, "address"),
    child_postal_code: readOptionalString(formData, "postal_code"),
    child_city: readOptionalString(formData, "city"),
    child_email: readOptionalString(formData, "email"),
    child_phone: readOptionalString(formData, "phone"),
    child_level_quran: readOptionalString(formData, "level_quran"),
    child_level_arabic: readOptionalString(formData, "level_arabic"),
    child_level_islam: readOptionalString(formData, "level_islam"),
    notes: readOptionalString(formData, "notes"),
  };
}

function readStudentPayload(formData: FormData) {
  return {
    ...readChildPayload(formData),
    mother_first_name: readOptionalString(formData, "mother_first_name"),
    mother_last_name: readOptionalString(formData, "mother_last_name"),
    mother_phone: readOptionalString(formData, "mother_phone"),
    mother_email: readOptionalString(formData, "mother_email"),
    father_first_name: readOptionalString(formData, "father_first_name"),
    father_last_name: readOptionalString(formData, "father_last_name"),
    father_phone: readOptionalString(formData, "father_phone"),
    father_email: readOptionalString(formData, "father_email"),
  };
}

function readManualGuardians(formData: FormData) {
  return [
    {
      first_name: readOptionalString(formData, "mother_first_name"),
      last_name: readOptionalString(formData, "mother_last_name"),
      phone: readOptionalString(formData, "mother_phone"),
      email: readOptionalString(formData, "mother_email"),
      role: readString(formData, "mother_relationship") || "foresatt",
    },
    {
      first_name: readOptionalString(formData, "father_first_name"),
      last_name: readOptionalString(formData, "father_last_name"),
      phone: readOptionalString(formData, "father_phone"),
      email: readOptionalString(formData, "father_email"),
      role: readString(formData, "father_relationship") || "foresatt",
    },
  ].filter((guardian) => guardian.first_name || guardian.last_name);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function studentName(
  supabase: SupabaseServerClient,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("students")
    .select("child_first_name, child_last_name")
    .eq("id", id)
    .maybeSingle();
  return data ? studentDisplayName(data) || null : null;
}

export async function createStudent(formData: FormData): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const familyId = readString(formData, "family_id");
  const payload = familyId
    ? readChildPayload(formData)
    : readStudentPayload(formData);

  const parsed = (familyId ? childSchema : studentSchema).safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  let data: string;
  if (familyId) {
    const { data: row, error } = await supabase
      .from("students")
      .insert({ ...payload, family_id: familyId } as never)
      .select("id")
      .single();
    if (error) return { ok: false, error: toUserError(error) };
    data = (row as unknown as { id: string }).id;
  } else {
    const { data: id, error } = await supabase.rpc(
      "create_manual_family_student",
      { p_student: { ...payload, guardians: readManualGuardians(formData) } },
    );
    if (error) return { ok: false, error: toUserError(error) };
    data = id;
  }

  await writeAudit({
    action: "student.create",
    entityType: "students",
    entityId: data,
    metadata: {
      source: "manual",
      name: studentDisplayName(payload),
      familyId: familyId || null,
    },
  });
  revalidate();
  return { ok: true, id: data };
}

export async function createStudentFromApplication(
  applicationId: string,
  placement?: { classId?: string | null; schoolYearId?: string | null },
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();

  const { data: application, error: appError } = await supabase
    .from("student_applications")
    .select(
      "id, family_id, merged_into_student_id, child_first_name, child_last_name, child_birth_date, child_gender, child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email, child_level_quran, child_level_arabic, child_level_islam, message",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) return { ok: false, error: toUserError(appError) };
  if (!application) return { ok: false, error: "Fant ikke påmeldingen" };
  if (application.merged_into_student_id) {
    return { ok: false, error: "Denne innmeldingen er allerede slått sammen med en elev." };
  }

  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("application_id", applicationId)
    .limit(1)
    .maybeSingle();
  if (existingStudent) {
    return {
      ok: false,
      error: "Denne påmeldingen er allerede registrert som elev",
    };
  }

  const classId = placement?.classId || null;
  const schoolYearId = placement?.schoolYearId || null;
  if (classId && !schoolYearId) {
    return { ok: false, error: "Velg skoleår for plasseringen" };
  }

  let pricing: EnrollmentPricing | null = null;
  if (classId && schoolYearId) {
    pricing = await resolveEnrollmentPricing(supabase, classId, schoolYearId);
    const full = await capacityError(supabase, classId, schoolYearId, pricing);
    if (full) return { ok: false, error: full };
  }

  const app = application as unknown as {
    family_id: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
    child_birth_date: string | null;
    child_gender: string | null;
    child_address: string | null;
    child_postal_code: string | null;
    child_city: string | null;
    child_email: string | null;
    child_phone: string | null;
    mother_first_name: string | null;
    mother_last_name: string | null;
    mother_phone: string | null;
    mother_email: string | null;
    father_first_name: string | null;
    father_last_name: string | null;
    father_phone: string | null;
    father_email: string | null;
    child_level_quran: string | null;
    child_level_arabic: string | null;
    child_level_islam: string | null;
    message: string | null;
  };

  const payload = {
    application_id: applicationId,
    family_id: app.family_id,
    child_first_name: app.child_first_name,
    child_last_name: app.child_last_name,
    child_birth_date: app.child_birth_date,
    child_gender: app.child_gender,
    child_address: app.child_address,
    child_postal_code: app.child_postal_code,
    child_city: app.child_city,
    child_email: app.child_email,
    child_phone: app.child_phone,
    mother_first_name: app.mother_first_name,
    mother_last_name: app.mother_last_name,
    mother_phone: app.mother_phone,
    mother_email: app.mother_email,
    father_first_name: app.father_first_name,
    father_last_name: app.father_last_name,
    father_phone: app.father_phone,
    father_email: app.father_email,
    child_level_quran: app.child_level_quran,
    child_level_arabic: app.child_level_arabic,
    child_level_islam: app.child_level_islam,
    notes: app.message,
  };

  const { data: applicationGuardians } = app.family_id
    ? await supabase
        .from("family_guardians")
        .select("guardians(email)")
        .eq("family_id", app.family_id)
    : { data: [] };
  const returning = await findReturningStudent(supabase, {
    firstName: app.child_first_name,
    lastName: app.child_last_name,
    birthDate: app.child_birth_date,
    guardianEmails: [
      app.mother_email,
      app.father_email,
      ...(applicationGuardians ?? []).map(
        (link) =>
          (link.guardians as unknown as { email: string | null } | null)?.email,
      ),
    ],
  });

  let studentId: string;
  if (returning) {
    studentId = returning.id;
  } else {
    const { data, error } = await supabase
      .from("students")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) return { ok: false, error: toUserError(error) };
    studentId = (data as unknown as { id: string }).id;
  }
  const name = studentDisplayName(app) || null;

  await writeAudit({
    action: returning ? "student.relinked" : "student.create",
    entityType: "students",
    entityId: studentId,
    metadata: { source: "application", applicationId, name },
  });

  const { count: existingPlacements } =
    returning && schoolYearId
      ? await supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("school_year_id", schoolYearId)
          .eq("status", "aktiv")
      : { count: 0 };

  let placementError: string | null = null;
  if (pricing && classId && schoolYearId && !existingPlacements) {
    const { data: enrollment, error: enrollError } = await supabase
      .from("enrollments")
      .insert({
        student_id: studentId,
        class_id: classId,
        school_year_id: schoolYearId,
        status: "aktiv",
        price_snapshot: pricing.priceSnapshot,
      } as never)
      .select("id")
      .single();
    if (enrollError) {
      placementError = `${name ?? "Eleven"} er registrert, men kunne ikke plasseres i ${pricing.className}. Åpne elevsiden og plasser eleven der.`;
    } else {
      await ensureStudentFee(supabase, studentId, schoolYearId);
      await writeAudit({
        action: "enrollment.create",
        entityType: "student_enrollments",
        entityId: (enrollment as unknown as { id: string }).id,
        metadata: {
          studentId,
          name,
          classId,
          className: pricing.className,
          schoolYearId,
          priceSnapshot: pricing.priceSnapshot,
        },
      });
    }
  }

  await supabase
    .from("student_applications")
    .update({ status: "akseptert" } as never)
    .eq("id", applicationId);

  await targetApplicationPayment(
    supabase,
    studentId,
    applicationId,
    Boolean(returning),
  );
  await allocatePaymentsForStudent(supabase, studentId, applicationId);

  revalidate();
  if (placementError) return { ok: false, error: placementError };
  return {
    ok: true,
    id: studentId,
    note: returning
      ? `${name ?? "Eleven"} var allerede elev og er koblet til den eksisterende elevoppføringen.`
      : undefined,
  };
}

export async function updateStudent(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const payload = readChildPayload(formData);

  const parsed = childSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const fields = Object.keys(payload) as (keyof typeof payload)[];
  const { data: before } = await supabase
    .from("students")
    .select(fields.join(", "))
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("students")
    .update(payload as never)
    .eq("id", id);

  if (error) return { ok: false, error: toUserError(error) };

  const previous = before as unknown as Record<string, string | null> | null;
  const changed = previous
    ? fields.filter((field) => (previous[field] ?? null) !== payload[field])
    : fields;
  if (changed.length > 0) {
    await writeAudit({
      action: "student.update",
      entityType: "students",
      entityId: id,
      metadata: { name: studentDisplayName(payload), fields: changed },
    });
  }
  revalidate();
  return { ok: true, id };
}

export async function getStudentDeleteBlockers(id: string): Promise<string[]> {
  const denied = await requireAdmin();
  if (denied) throw new Error(denied.error);
  const supabase = await createClient();
  const count = async (
    table:
      | "payments"
      | "payment_allocations"
      | "refunds"
      | "student_fee_adjustments"
      | "installments"
      | "payment_targets",
  ) => {
    const { count: rows, error } = await supabase
      .from(table)
      .select("student_id", { count: "exact", head: true })
      .eq("student_id", id);
    if (error) return 1;
    return rows ?? 0;
  };
  const checks = [
    ["payments", "betalinger"],
    ["payment_allocations", "fordelte betalinger"],
    ["refunds", "refusjoner"],
    ["student_fee_adjustments", "fritak eller rabatter"],
    ["installments", "avdrag"],
    ["payment_targets", "familiebetalinger"],
  ] as const;
  const counts = await Promise.all(checks.map(([table]) => count(table)));
  return checks
    .filter((_, index) => counts[index] > 0)
    .map(([, label]) => label);
}

export async function deleteStudent(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const blockers = await getStudentDeleteBlockers(id);
  if (
    blockers.includes("betalinger") ||
    blockers.includes("fordelte betalinger")
  ) {
    return { ok: false, error: "Eleven har betalinger og kan ikke slettes" };
  }
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `Eleven kan ikke slettes fordi det finnes ${blockers.join(", ")}. Bruk «Eleven har sluttet» i stedet, så beholdes historikken.`,
    };
  }

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("child_first_name, child_last_name, application_id, family_id")
    .eq("id", id)
    .maybeSingle();
  if (!student) return { ok: false, error: "Fant ikke eleven" };

  if (student.application_id) {
    await supabase
      .from("student_applications")
      .update({ status: "arkivert" } as never)
      .eq("id", student.application_id);
  }

  const { error: feeError } = await supabase
    .from("student_fees")
    .delete()
    .eq("student_id", id);
  if (feeError) return { ok: false, error: toUserError(feeError) };

  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "student.delete",
    entityType: "students",
    entityId: id,
    metadata: {
      name: studentDisplayName(student) || null,
      applicationId: student.application_id,
      familyId: student.family_id,
    },
  });
  revalidate();
  return { ok: true, id };
}

export async function archiveStudent(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ status: "avsluttet" } as never)
    .eq("student_id", id)
    .eq("status", "aktiv")
    .select("id, class_id, school_year_id");
  if (error) return { ok: false, error: toUserError(error) };

  const ended =
    (data as unknown as
      { id: string; class_id: string; school_year_id: string }[] | null) ?? [];
  if (ended.length > 0) {
    await supabase
      .from("installments")
      .update({ status: "stoppet" })
      .eq("student_id", id)
      .eq("status", "planlagt")
      .in("school_year_id", [...new Set(ended.map((row) => row.school_year_id))]);
  }
  await writeAudit({
    action: "student.archive",
    entityType: "students",
    entityId: id,
    metadata: {
      name: await studentName(supabase, id),
      endedEnrollments: ended,
    },
  });
  revalidate();
  return {
    ok: true,
    id,
    note:
      ended.length > 0
        ? `${ended.length} ${ended.length === 1 ? "plass" : "plasser"} avsluttet`
        : "Eleven hadde ingen aktive plasser",
  };
}

const enrollmentSchema = z.object({
  student_id: z.string().min(1),
  class_id: z.string().min(1, "Velg en klasse"),
  school_year_id: z.string().min(1, "Velg et skoleår"),
});

async function countActiveEnrollments(
  supabase: SupabaseServerClient,
  classId: string,
  schoolYearId: string,
): Promise<number> {
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv");
  return count ?? 0;
}

type EnrollmentPricing = {
  className: string;
  capacity: number | null;
  priceSnapshot: number | null;
};

async function resolveEnrollmentPricing(
  supabase: SupabaseServerClient,
  classId: string,
  schoolYearId: string,
): Promise<EnrollmentPricing> {
  const [{ data: classRow }, { data: yearRow }] = await Promise.all([
    supabase
      .from("classes")
      .select("name_no, capacity, price")
      .eq("id", classId)
      .maybeSingle(),
    supabase
      .from("school_years")
      .select("fee")
      .eq("id", schoolYearId)
      .maybeSingle(),
  ]);
  return {
    className: classRow?.name_no ?? "Klassen",
    capacity: classRow?.capacity ?? null,
    priceSnapshot: classRow?.price ?? yearRow?.fee ?? null,
  };
}

async function capacityError(
  supabase: SupabaseServerClient,
  classId: string,
  schoolYearId: string,
  pricing: EnrollmentPricing,
): Promise<string | null> {
  if (pricing.capacity == null) return null;
  const enrolled = await countActiveEnrollments(
    supabase,
    classId,
    schoolYearId,
  );
  if (enrolled < pricing.capacity) return null;
  return `${pricing.className} er full (${enrolled} av ${pricing.capacity} plasser). Velg en annen klasse, eller øk kapasiteten under Klasser.`;
}

export type ClassCapacityInfo = {
  classId: string;
  capacity: number | null;
  enrolled: number;
};

export async function getClassCapacityInfo(
  schoolYearId: string,
): Promise<ClassCapacityInfo[]> {
  if (await requireAdmin()) return [];
  if (!schoolYearId) return [];
  const supabase = await createClient();

  const { data: classRows } = await supabase
    .from("classes")
    .select("id, capacity");
  const classes =
    (classRows as unknown as
      { id: string; capacity: number | null }[] | null) ?? [];

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("class_id")
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv");
  const enrollments =
    (enrollmentRows as unknown as { class_id: string }[] | null) ?? [];

  const counts = new Map<string, number>();
  for (const e of enrollments) {
    counts.set(e.class_id, (counts.get(e.class_id) ?? 0) + 1);
  }

  return classes.map((c) => ({
    classId: c.id,
    capacity: c.capacity,
    enrolled: counts.get(c.id) ?? 0,
  }));
}

export async function placeStudentInClass(
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const payload = {
    student_id: readString(formData, "student_id"),
    class_id: readString(formData, "class_id"),
    school_year_id: readString(formData, "school_year_id"),
  };

  const parsed = enrollmentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: currentRows } = await supabase
    .from("enrollments")
    .select("id, class_id, status")
    .eq("student_id", payload.student_id)
    .eq("school_year_id", payload.school_year_id);
  const current = currentRows ?? [];
  if (current.some((row) => row.status === "aktiv")) {
    return {
      ok: false,
      error:
        "Eleven har allerede en plass dette skoleåret. Bruk «Bytt klasse» for å flytte eleven.",
    };
  }

  const pricing = await resolveEnrollmentPricing(
    supabase,
    payload.class_id,
    payload.school_year_id,
  );
  const full = await capacityError(
    supabase,
    payload.class_id,
    payload.school_year_id,
    pricing,
  );
  if (full) return { ok: false, error: full };

  const ended = current.find((row) => row.class_id === payload.class_id);
  let enrollmentId: string;
  if (ended) {
    const { error } = await supabase
      .from("enrollments")
      .update({
        status: "aktiv",
        price_snapshot: pricing.priceSnapshot,
      } as never)
      .eq("id", ended.id);
    if (error) return { ok: false, error: toUserError(error) };
    enrollmentId = ended.id;
  } else {
    const { data, error } = await supabase
      .from("enrollments")
      .insert({ ...payload, price_snapshot: pricing.priceSnapshot } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "Eleven har allerede en plass dette skoleåret",
        };
      }
      return { ok: false, error: toUserError(error) };
    }
    enrollmentId = (data as unknown as { id: string }).id;
  }

  await ensureStudentFee(supabase, payload.student_id, payload.school_year_id);
  await writeAudit({
    action: ended ? "enrollment.reactivate" : "enrollment.create",
    entityType: "student_enrollments",
    entityId: enrollmentId,
    metadata: {
      studentId: payload.student_id,
      name: await studentName(supabase, payload.student_id),
      classId: payload.class_id,
      className: pricing.className,
      schoolYearId: payload.school_year_id,
      priceSnapshot: pricing.priceSnapshot,
    },
  });
  revalidate();
  return { ok: true, id: enrollmentId };
}

async function loadEnrollment(supabase: SupabaseServerClient, id: string) {
  const { data } = await supabase
    .from("enrollments")
    .select(
      "id, student_id, class_id, school_year_id, status, price_snapshot, classes(name_no)",
    )
    .eq("id", id)
    .maybeSingle();
  return data as unknown as {
    id: string;
    student_id: string;
    class_id: string;
    school_year_id: string;
    status: string;
    price_snapshot: number | null;
    classes: { name_no: string | null } | null;
  } | null;
}

export async function changeEnrollmentClass(
  enrollmentId: string,
  classId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!classId) return { ok: false, error: "Velg en klasse" };
  const supabase = await createClient();
  const enrollment = await loadEnrollment(supabase, enrollmentId);
  if (!enrollment) return { ok: false, error: "Fant ikke plasseringen" };
  if (enrollment.status !== "aktiv") {
    return { ok: false, error: "Bare aktive plasser kan byttes" };
  }
  if (enrollment.class_id === classId) {
    return { ok: false, error: "Eleven går allerede i denne klassen" };
  }

  const pricing = await resolveEnrollmentPricing(
    supabase,
    classId,
    enrollment.school_year_id,
  );
  const full = await capacityError(
    supabase,
    classId,
    enrollment.school_year_id,
    pricing,
  );
  if (full) return { ok: false, error: full };

  const [allocations, fee, oldPricing, { data: student }, { data: target }, { data: year }] =
    await Promise.all([
      supabase
        .from("payment_allocations")
        .select("id", { count: "exact", head: true })
        .eq("student_id", enrollment.student_id)
        .eq("school_year_id", enrollment.school_year_id),
      supabase
        .from("student_fees")
        .select("amount")
        .eq("student_id", enrollment.student_id)
        .eq("school_year_id", enrollment.school_year_id)
        .maybeSingle(),
      resolveEnrollmentPricing(supabase, enrollment.class_id, enrollment.school_year_id),
      supabase
        .from("students")
        .select("child_birth_date")
        .eq("id", enrollment.student_id)
        .maybeSingle(),
      supabase
        .from("classes")
        .select("age_min, age_max")
        .eq("id", classId)
        .maybeSingle(),
      supabase
        .from("school_years")
        .select("label, starts_on")
        .eq("id", enrollment.school_year_id)
        .maybeSingle(),
    ]);
  const oldPrice = enrollment.price_snapshot ?? oldPricing.priceSnapshot;
  const feeIsClassPrice =
    !fee.error &&
    (!fee.data || (oldPrice != null && fee.data.amount === Math.round(oldPrice * 100)));
  const repriced =
    !allocations.error &&
    allocations.count === 0 &&
    feeIsClassPrice &&
    pricing.priceSnapshot != null;

  const { error } = await supabase
    .from("enrollments")
    .update(
      (repriced
        ? { class_id: classId, price_snapshot: pricing.priceSnapshot }
        : { class_id: classId }) as never,
    )
    .eq("id", enrollmentId);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `Eleven har en avsluttet plass i ${pricing.className} dette skoleåret. Avslutt denne plassen og legg til ${pricing.className} på nytt i stedet.`,
      };
    }
    return { ok: false, error: toUserError(error) };
  }

  await writeAudit({
    action: "enrollment.change_class",
    entityType: "student_enrollments",
    entityId: enrollmentId,
    metadata: {
      studentId: enrollment.student_id,
      name: await studentName(supabase, enrollment.student_id),
      schoolYearId: enrollment.school_year_id,
      fromClassId: enrollment.class_id,
      fromClassName: enrollment.classes?.name_no ?? null,
      toClassId: classId,
      toClassName: pricing.className,
      priceSnapshot: repriced ? pricing.priceSnapshot : enrollment.price_snapshot,
    },
  });
  if (repriced) {
    await setStudentFee(supabase, enrollment.student_id, enrollment.school_year_id, {
      amount: Math.round((pricing.priceSnapshot ?? 0) * 100),
    });
    await rebuildPendingInstallmentsForStudent(
      supabase,
      enrollment.student_id,
      enrollment.school_year_id,
    );
  }
  const referenceYear =
    schoolYearStart(year?.label) ?? Number((year?.starts_on ?? osloToday()).slice(0, 4));
  const age = ageInYear(student?.child_birth_date, referenceYear);
  const outsideRange =
    age != null &&
    ((target?.age_min != null && age < target.age_min) ||
      (target?.age_max != null && age > target.age_max));
  revalidate();
  return {
    ok: true,
    id: enrollmentId,
    note: outsideRange
      ? `Eleven er ${age} år, mens ${pricing.className} er for ${target?.age_min ?? "?"}-${target?.age_max ?? "?"} år.`
      : undefined,
  };
}

export async function endEnrollment(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const enrollment = await loadEnrollment(supabase, id);
  if (!enrollment) return { ok: false, error: "Fant ikke plasseringen" };
  if (enrollment.status !== "aktiv") {
    return { ok: false, error: "Plassen er allerede avsluttet" };
  }

  const { error } = await supabase
    .from("enrollments")
    .update({ status: "avsluttet" } as never)
    .eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "enrollment.end",
    entityType: "student_enrollments",
    entityId: id,
    metadata: {
      studentId: enrollment.student_id,
      name: await studentName(supabase, enrollment.student_id),
      classId: enrollment.class_id,
      className: enrollment.classes?.name_no ?? null,
      schoolYearId: enrollment.school_year_id,
    },
  });
  revalidate();
  return { ok: true, id };
}

export async function removeEnrollment(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const enrollment = await loadEnrollment(supabase, id);
  if (!enrollment) return { ok: false, error: "Fant ikke plasseringen" };

  const [
    { data: allocated },
    { count: otherPlacements },
    { count: targets },
    { count: sentInstallments },
    { count: adjustments },
  ] = await Promise.all([
    supabase
      .from("payment_allocations")
      .select("amount")
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id),
    supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id)
      .neq("id", id),
    supabase
      .from("payment_targets")
      .select("payment_id, payments!inner(school_year_id)", {
        count: "exact",
        head: true,
      })
      .eq("student_id", enrollment.student_id)
      .eq("payments.school_year_id", enrollment.school_year_id),
    supabase
      .from("installments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id)
      .in("status", ["sendt", "betalt"]),
    supabase
      .from("student_fee_adjustments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id)
      .is("revoked_at", null),
  ]);
  const lastPlacement = !otherPlacements;
  if (lastPlacement && (allocated ?? []).some((row) => row.amount > 0)) {
    return {
      ok: false,
      error:
        "Eleven har betalt for dette skoleåret, så plassen kan ikke fjernes. Avslutt plassen i stedet.",
    };
  }
  if (lastPlacement && (targets || sentInstallments || adjustments)) {
    return {
      ok: false,
      error:
        "Eleven har betalingslenker, sendte avdrag eller rabatter dette skoleåret, så plassen kan ikke fjernes. Avslutt plassen i stedet.",
    };
  }

  const { error } = await supabase.from("enrollments").delete().eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };

  if (lastPlacement) {
    await supabase
      .from("installments")
      .update({ status: "stoppet" })
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id)
      .eq("status", "planlagt");
    await supabase
      .from("student_fees")
      .delete()
      .eq("student_id", enrollment.student_id)
      .eq("school_year_id", enrollment.school_year_id);
  }

  await writeAudit({
    action: "enrollment.delete",
    entityType: "student_enrollments",
    entityId: id,
    metadata: {
      studentId: enrollment.student_id,
      name: await studentName(supabase, enrollment.student_id),
      classId: enrollment.class_id,
      className: enrollment.classes?.name_no ?? null,
      schoolYearId: enrollment.school_year_id,
      status: enrollment.status,
      priceSnapshot: enrollment.price_snapshot,
    },
  });
  revalidate();
  return { ok: true, id };
}

const paymentSchema = z.object({
  student_id: z.string().min(1),
  amount_nok: z.number().positive("Beløp må være større enn 0"),
});

export async function createVippsPayment(
  formData: FormData,
): Promise<PaymentResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const studentId = readString(formData, "student_id");
  const schoolYearId = readOptionalString(formData, "school_year_id");
  const amountNok = readNumber(formData, "amount_nok");

  const parsed = paymentSchema.safeParse({
    student_id: studentId,
    amount_nok: amountNok ?? 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!schoolYearId) {
    return { ok: false, error: "Velg et skoleår for betalingen" };
  }

  const supabase = await createClient();

  const { data: enrollmentRow } = await supabase
    .from("enrollments")
    .select("id, price_snapshot, classes(name_no)")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv")
    .limit(1)
    .maybeSingle();
  const enrollment = enrollmentRow as unknown as {
    id: string;
    price_snapshot: number | null;
    classes: { name_no: string | null } | null;
  } | null;
  const className = enrollment?.classes?.name_no ?? null;
  const enrollmentId = enrollment?.id ?? null;

  await ensureStudentFee(supabase, studentId, schoolYearId);

  const amount = Math.round((amountNok as number) * 100);
  const dueDate = readOptionalString(formData, "due_date");

  const { data: student } = await supabase
    .from("students")
    .select(
      "family_id, child_phone, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email",
    )
    .eq("id", studentId)
    .maybeSingle();
  const studentRow = student as unknown as {
    family_id: string | null;
    child_phone: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
    mother_first_name: string | null;
    mother_last_name: string | null;
    father_first_name: string | null;
    father_last_name: string | null;
    mother_email: string | null;
    father_email: string | null;
  } | null;
  const phone = studentRow?.child_phone;
  const recipients: MoneyRecipients = studentRow
    ? await recipientsFor(supabase, studentRow)
    : { to: [], lang: "no", familyId: null };

  const { data: year } = await supabase
    .from("school_years")
    .select("label")
    .eq("id", schoolYearId)
    .maybeSingle();
  const yearLabel =
    (year as unknown as { label: string } | null)?.label ?? null;

  const descriptor = studentRow
    ? describeForStudent(studentRow, yearLabel, amount)
    : null;

  const description =
    readOptionalString(formData, "description") ??
    descriptor?.description ??
    `Skolepenger${yearLabel ? ` ${yearLabel}` : ""}`;

  const reference = buildReference(
    yearLabel,
    descriptor?.familyName ?? null,
    1,
  );
  const returnUrl = `${siteUrl()}/api/vipps/return?reference=${reference}&locale=${recipients.lang}`;

  let redirectUrl: string;
  try {
    const result = await createPayment({
      reference,
      amount,
      description,
      returnUrl,
      phoneNumber: phone,
      metadata: descriptor?.metadata ?? null,
      orderLines: descriptor?.orderLines ?? null,
    });
    redirectUrl = result.redirectUrl;
  } catch (error) {
    return { ok: false, error: vippsError(error) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("payments")
    .insert({
      student_id: studentId,
      enrollment_id: enrollmentId,
      school_year_id: schoolYearId,
      reference,
      amount,
      description,
      due_date: dueDate,
      status: "opprettet",
      vipps_state: "CREATED",
      redirect_url: redirectUrl,
    } as never)
    .select("id")
    .single();

  if (insertError) return { ok: false, error: toUserError(insertError) };

  const paymentId = (inserted as unknown as { id: string }).id;
  const payLink = `${siteUrl()}/api/vipps/pay/${paymentId}`;

  let emailed = false;
  if (recipients.to.length && (await emailNotifications())) {
    emailed = await sendPaymentLinkEmail({
      to: recipients.to,
      lang: recipients.lang,
      children: [
        { name: studentRow ? studentDisplayName(studentRow) : "", amount },
      ],
      amount,
      schoolYear: yearLabel,
      className,
      dueDate,
      remaining: await remainingFor(supabase, [studentId], schoolYearId),
      url: payLink,
    });
  }

  revalidate();
  return {
    ok: true,
    redirectUrl: payLink,
    reference,
    emailed,
    emailedTo: emailed ? recipients.to.length : 0,
  };
}

const manualPaymentSchema = z.object({
  student_id: z.string().min(1),
  school_year_id: z.string().min(1, "Velg et skoleår"),
  amount_nok: z.number().positive("Beløp må være større enn 0"),
  paid_at: z.string().min(1, "Velg dato for betalingen"),
  method: z.enum(["vipps", "kontant", "bank", "annet"], {
    message: "Velg betalingsmåte",
  }),
});

export async function registerManualPayment(
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const payload = {
    student_id: readString(formData, "student_id"),
    school_year_id: readString(formData, "school_year_id"),
    amount_nok: readNumber(formData, "amount_nok") ?? 0,
    paid_at: readString(formData, "paid_at"),
    method: readString(formData, "method"),
  };

  const parsed = manualPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: enrollmentRow } = await supabase
    .from("enrollments")
    .select("id, classes(name_no)")
    .eq("student_id", payload.student_id)
    .eq("school_year_id", payload.school_year_id)
    .eq("status", "aktiv")
    .limit(1)
    .maybeSingle();
  const enrollment = enrollmentRow as unknown as {
    id: string;
    classes: { name_no: string | null } | null;
  } | null;

  const { data: year } = await supabase
    .from("school_years")
    .select("label")
    .eq("id", payload.school_year_id)
    .maybeSingle();
  const yearLabel =
    (year as unknown as { label: string } | null)?.label ?? null;
  const className = enrollment?.classes?.name_no ?? null;

  const methodLabels: Record<string, string> = {
    vipps: "Vipps",
    kontant: "Kontant",
    bank: "Bankoverføring",
    annet: "Annet",
  };
  const note = readOptionalString(formData, "note");
  const orderId = readOptionalString(formData, "order_id");
  const descriptionParts = [
    `Skolepenger${yearLabel ? ` ${yearLabel}` : ""}`,
    className,
    methodLabels[payload.method],
    orderId ? `Ordre-ID ${orderId}` : null,
    note,
  ].filter(Boolean);

  await ensureStudentFee(supabase, payload.student_id, payload.school_year_id);

  const amount = Math.round(payload.amount_nok * 100);
  const { data: inserted, error } = await supabase
    .from("payments")
    .insert({
      student_id: payload.student_id,
      enrollment_id: enrollment?.id ?? null,
      school_year_id: payload.school_year_id,
      reference: `manual-${randomUUID()}`,
      psp_reference: orderId,
      amount,
      authorized_amount: amount,
      captured_amount: amount,
      refunded_amount: 0,
      description: descriptionParts.join(" · "),
      payer_name: readOptionalString(formData, "payer_name"),
      status: "fanget",
      method: payload.method,
      paid_at: payload.paid_at,
      captured_at: payload.paid_at,
    } as never)
    .select("id")
    .single();

  if (error) return { ok: false, error: toUserError(error) };

  const paymentId = (inserted as unknown as { id: string }).id;
  await allocatePayment(supabase, paymentId);
  await rebuildInstallmentsForPayment(supabase, paymentId);

  const receipt = await receiptNote(supabase, paymentId, formData);

  revalidate();
  return { ok: true, id: paymentId, note: receipt };
}

function wantsReceipt(formData: FormData) {
  return readString(formData, "send_receipt") !== "false";
}

async function receiptNote(
  supabase: SupabaseServerClient,
  paymentId: string,
  formData: FormData,
): Promise<string | undefined> {
  if (!wantsReceipt(formData)) return undefined;
  const receipt = await sendPaymentReceipt(supabase, paymentId);
  return receipt.sent
    ? "Kvittering sendt til foresatte"
    : `Kvittering ikke sendt: ${receipt.reason ?? "ukjent feil"}`;
}

type BatchEnrollment = {
  id: string;
  student_id: string;
  price_snapshot: number | null;
  classes: { name_no: string | null; price: number | null } | null;
  students: {
    family_id: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
    mother_first_name: string | null;
    mother_last_name: string | null;
    father_first_name: string | null;
    father_last_name: string | null;
    mother_email: string | null;
    father_email: string | null;
    families: { display_name: string | null } | null;
  } | null;
};

export type BatchPreviewFamily = BatchFamily & {
  recipients: string[];
};

export type BatchPreview =
  | {
      ok: true;
      yearLabel: string | null;
      emailEnabled: boolean;
      families: BatchPreviewFamily[];
      excluded: BatchExcluded[];
      totalAmount: number;
    }
  | { ok: false; error: string };

type BatchPlan = {
  yearLabel: string | null;
  families: (BatchPreviewFamily & {
    lang: MoneyRecipients["lang"];
    enrollmentIds: Map<string, string>;
  })[];
  excluded: BatchExcluded[];
  missingFees: string[];
};

async function buildBatchPlan(
  supabase: SupabaseServerClient,
  schoolYearId: string,
): Promise<BatchPlan> {
  const { data: yr } = await supabase
    .from("school_years")
    .select("label, fee")
    .eq("id", schoolYearId)
    .maybeSingle();
  const yearLabel = yr?.label ?? null;
  const yearFee = yr?.fee ?? null;

  const { data: enr, error: enrollmentError } = await supabase
    .from("enrollments")
    .select(
      "id, student_id, price_snapshot, classes(name_no, price), students(family_id, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email, families(display_name))",
    )
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv")
    .order("created_at");
  if (enrollmentError) throw new Error(toUserError(enrollmentError));
  const enrollments = (enr as unknown as BatchEnrollment[] | null) ?? [];

  const { data: planRows } = await supabase
    .from("payment_plans")
    .select("family_id")
    .eq("school_year_id", schoolYearId)
    .eq("status", "aktiv");
  const planFamilyIds = new Set((planRows ?? []).map((row) => row.family_id));

  const { data: openRows } = await supabase
    .from("payments")
    .select("id, student_id")
    .eq("school_year_id", schoolYearId)
    .in("status", ["opprettet", "autorisert"])
    .is("voided_at", null)
    .eq("captured_amount", 0);
  const openPaymentIds = (openRows ?? []).map((row) => row.id);
  const { data: installmentLinks } = openPaymentIds.length
    ? await supabase
        .from("installments")
        .select("payment_id")
        .in("payment_id", openPaymentIds)
    : { data: [] };
  const installmentPaymentIds = new Set(
    (installmentLinks ?? []).map((row) => row.payment_id as string),
  );
  const openStudentIds = new Set<string>();
  for (const row of openRows ?? []) {
    if (row.student_id && !installmentPaymentIds.has(row.id)) {
      openStudentIds.add(row.student_id);
    }
  }
  if (openPaymentIds.length) {
    const { data: targetRows } = await supabase
      .from("payment_targets")
      .select("student_id")
      .in("payment_id", openPaymentIds);
    for (const row of targetRows ?? []) openStudentIds.add(row.student_id);
  }

  const balances = await fetchBalances(supabase, schoolYearId);

  const recipientsByFamily = new Map<string, MoneyRecipients>();
  const familyKeyOf = (e: BatchEnrollment) =>
    e.students?.family_id ?? `elev:${e.student_id}`;
  const uniqueKeys = [...new Set(enrollments.map(familyKeyOf))];
  await mapInChunks(uniqueKeys, 5, async (key) => {
    const e = enrollments.find((row) => familyKeyOf(row) === key);
    if (!e?.students) {
      recipientsByFamily.set(key, { to: [], lang: "no", familyId: null });
      return;
    }
    recipientsByFamily.set(key, await recipientsFor(supabase, e.students));
  });

  const familyNameByKey = new Map<string, string | null>();
  for (const key of uniqueKeys) {
    const members = enrollments.filter((row) => familyKeyOf(row) === key);
    const first = members[0]?.students;
    familyNameByKey.set(
      key,
      first?.family_id
        ? familyDisplayName({
            familyId: first.family_id,
            displayName: first.families?.display_name,
            guardians: [],
            students: members.map((row) => ({
              lastName: row.students?.child_last_name,
            })),
          })
        : (first?.child_last_name ?? null),
    );
  }

  const candidates: BatchCandidate[] = enrollments.map((e) => {
    const st = e.students;
    const key = familyKeyOf(e);
    const price = e.price_snapshot ?? e.classes?.price ?? yearFee;
    return {
      studentId: e.student_id,
      name: (st ? studentDisplayName(st) : "") || "Elev",
      className: e.classes?.name_no ?? null,
      familyKey: key,
      familyName: familyNameByKey.get(key) ?? null,
      balance: balances.get(balanceKey(e.student_id, schoolYearId)) ?? null,
      fallbackAmount: price != null ? Math.round(price * 100) : null,
      onPlan: Boolean(st?.family_id && planFamilyIds.has(st.family_id)),
      hasOpenLink: openStudentIds.has(e.student_id),
      hasRecipients: (recipientsByFamily.get(key)?.to.length ?? 0) > 0,
    };
  });

  const planned = planFamilyBatch(candidates);
  const enrollmentIdByStudent = new Map(
    enrollments.map((e) => [e.student_id, e.id]),
  );

  return {
    yearLabel,
    excluded: planned.excluded,
    missingFees: candidates
      .filter((candidate) => candidate.balance == null)
      .map((candidate) => candidate.studentId),
    families: planned.families.map((family) => {
      const recipients = recipientsByFamily.get(family.familyKey);
      return {
        ...family,
        recipients: recipients?.to ?? [],
        lang: recipients?.lang ?? "no",
        enrollmentIds: new Map(
          family.children.map((child) => [
            child.studentId,
            enrollmentIdByStudent.get(child.studentId) ?? "",
          ]),
        ),
      };
    }),
  };
}

export async function previewBatchSend(
  schoolYearId: string,
): Promise<BatchPreview> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!schoolYearId) return { ok: false, error: "Mangler skoleår" };
  const supabase = await createClient();
  try {
    const plan = await buildBatchPlan(supabase, schoolYearId);
    return {
      ok: true,
      yearLabel: plan.yearLabel,
      emailEnabled: await emailNotifications(),
      families: plan.families.map((family) => ({
        familyKey: family.familyKey,
        familyName: family.familyName,
        children: family.children,
        amount: family.amount,
        recipients: family.recipients,
      })),
      excluded: plan.excluded,
      totalAmount: plan.families.reduce(
        (sum, family) => sum + family.amount,
        0,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Kunne ikke lage forhåndsvisning",
    };
  }
}

export async function batchSendPaymentLinks(
  schoolYearId: string,
  familyKeys: string[],
): Promise<BatchResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!schoolYearId) return { ok: false, error: "Mangler skoleår" };
  if (familyKeys.length === 0) {
    return { ok: false, error: "Velg minst én familie" };
  }
  if (!(await emailNotifications())) {
    return { ok: false, error: EMAIL_OFF_ERROR };
  }

  const supabase = await createClient();
  const selectedKeys = new Set(familyKeys);

  let plan: BatchPlan;
  try {
    plan = await buildBatchPlan(supabase, schoolYearId);
    if (plan.missingFees.length > 0) {
      await mapInChunks(plan.missingFees, 5, (studentId) =>
        ensureStudentFee(supabase, studentId, schoolYearId),
      );
      plan = await buildBatchPlan(supabase, schoolYearId);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Kunne ikke hente elever",
    };
  }

  const selected = plan.families.filter((family) =>
    selectedKeys.has(family.familyKey),
  );
  const base = siteUrl();

  const outcomes = await mapInChunks(selected, 4, async (family) => {
    const single = family.children.length === 1 ? family.children[0] : null;
    const names = family.children.map((child) => child.name);
    const { data: inserted, error: insertError } = await supabase
      .from("payments")
      .insert({
        student_id: single?.studentId ?? null,
        enrollment_id: single
          ? family.enrollmentIds.get(single.studentId) || null
          : null,
        school_year_id: schoolYearId,
        reference: buildReference(
          plan.yearLabel,
          family.familyName?.replace(/^Famil(ien|ie) /, "") ?? null,
          family.children.length,
        ),
        amount: family.amount,
        description: `Skolepenger${plan.yearLabel ? ` ${plan.yearLabel}` : ""} - ${names.join(", ")}`,
        status: "opprettet",
        method: "vipps",
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      console.error("Batch payment insert failed", insertError);
      return "failed" as const;
    }

    if (!single) {
      const { error: targetError } = await supabase
        .from("payment_targets")
        .insert(
          family.children.map((child) => ({
            payment_id: inserted.id,
            student_id: child.studentId,
            amount: child.amount,
          })),
        );
      if (targetError) {
        console.error("Batch payment targets failed", targetError);
        await supabase.from("payments").delete().eq("id", inserted.id);
        return "failed" as const;
      }
    }

    const ok = await sendPaymentLinkEmail({
      to: family.recipients,
      lang: family.lang,
      children: family.children.map((child) => ({
        name: child.name,
        amount: child.amount,
      })),
      amount: family.amount,
      schoolYear: plan.yearLabel,
      className: single?.className ?? null,
      url: `${base}/api/vipps/pay/${inserted.id}`,
    });
    return ok ? ("sent" as const) : ("failed" as const);
  });

  const sent = outcomes.filter((outcome) => outcome === "sent").length;
  const failed = outcomes.length - sent;

  await writeAudit({
    action: "payment.batch_send",
    entityType: "school_years",
    entityId: schoolYearId,
    metadata: {
      families: selected.length,
      sent,
      failed,
      amount: selected.reduce((sum, family) => sum + family.amount, 0),
      excluded: plan.excluded.length,
    },
  });

  revalidate();
  const skipped =
    plan.excluded.length + (plan.families.length - selected.length);
  const parts: string[] = [];
  if (skipped) parts.push(`${skipped} hoppet over`);
  if (failed) parts.push(`${failed} feilet`);
  return {
    ok: true,
    sent,
    skipped,
    failed,
    note: parts.length ? parts.join(", ") : undefined,
  };
}

export async function syncAllPaymentsForYear(schoolYearId: string): Promise<
  | {
      ok: true;
      synced: number;
      failed: { reference: string; error: string }[];
    }
  | { ok: false; error: string }
> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!schoolYearId) return { ok: false, error: "Mangler skoleår" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("reference")
    .eq("school_year_id", schoolYearId)
    .eq("method", "vipps")
    .not("vipps_state", "is", null)
    .in("status", ["opprettet", "autorisert"]);
  if (error) return { ok: false, error: toUserError(error) };
  const refs = data ?? [];
  const failed: { reference: string; error: string }[] = [];
  let synced = 0;
  await mapInChunks(refs, 4, async (row) => {
    try {
      await syncPaymentByReference(row.reference);
      synced++;
    } catch (syncError) {
      console.error("Year sync failed", {
        reference: row.reference,
        syncError,
      });
      failed.push({
        reference: row.reference,
        error: syncError instanceof Error ? syncError.message : "Ukjent feil",
      });
    }
  });
  revalidate();
  return { ok: true, synced, failed };
}

type RolloverRow = { studentId: string; classId: string };

async function runRollover(
  supabase: SupabaseServerClient,
  fromYearId: string,
  toYearId: string,
  rows: RolloverRow[],
): Promise<
  { ok: true; created: number; skipped: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("rollover_enrollments", {
    p_from_year: fromYearId,
    p_to_year: toYearId,
    p_rows: rows.map((row) => ({
      student_id: row.studentId,
      class_id: row.classId,
    })),
  });
  if (error) {
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error:
          "Databasen mangler oppdateringen for skoleårsovergang. Be den som drifter systemet om å kjøre den.",
      };
    }
    return { ok: false, error: toUserError(error) };
  }
  const result = data as { created?: unknown[]; skipped?: number } | null;
  return {
    ok: true,
    created: result?.created?.length ?? 0,
    skipped: result?.skipped ?? 0,
  };
}

const rolloverSchema = z.object({
  fromYearId: z.string().uuid("Velg skoleåret det flyttes fra"),
  toYearId: z.string().uuid("Velg skoleåret det flyttes til"),
  rows: z
    .array(
      z.object({ studentId: z.string().uuid(), classId: z.string().uuid() }),
    )
    .min(1, "Velg minst én elev som skal flyttes")
    .max(1000),
});

export async function confirmRollover(input: {
  fromYearId: string;
  toYearId: string;
  rows: RolloverRow[];
}): Promise<
  { ok: true; created: number; skipped: number } | { ok: false; error: string }
> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = rolloverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { fromYearId, toYearId } = parsed.data;
  if (fromYearId === toYearId) {
    return { ok: false, error: "Velg to ulike skoleår" };
  }
  const seen = new Set<string>();
  const rows = parsed.data.rows.filter((row) => {
    if (seen.has(row.studentId)) return false;
    seen.add(row.studentId);
    return true;
  });

  const supabase = await createClient();
  const result = await runRollover(supabase, fromYearId, toYearId, rows);
  if (!result.ok) return result;

  await writeAudit({
    action: "school_year.rollover",
    entityType: "school_years",
    entityId: toYearId,
    metadata: {
      fromSchoolYearId: fromYearId,
      requested: rows.length,
      created: result.created,
      skipped: result.skipped,
    },
  });
  revalidate();
  return result;
}

async function getPaymentReference(paymentId: string): Promise<{
  reference: string;
  amount: number;
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  method: string;
  status: string;
  vippsState: string | null;
  voidedAt: string | null;
  schoolYearId: string | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select(
      "reference, amount, authorized_amount, captured_amount, refunded_amount, method, status, vipps_state, voided_at, school_year_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!data) return null;
  return {
    reference: data.reference,
    amount: data.amount,
    authorizedAmount: data.authorized_amount,
    capturedAmount: data.captured_amount,
    refundedAmount: data.refunded_amount,
    method: data.method,
    status: data.status,
    vippsState: data.vipps_state,
    voidedAt: data.voided_at,
    schoolYearId: data.school_year_id,
  };
}

function isVippsReference(row: { method: string; reference: string }) {
  return (
    row.method === "vipps" &&
    !row.reference.startsWith("manual-") &&
    !row.reference.startsWith("sadaqa-")
  );
}

async function cancelOpenVippsPayment(row: {
  method: string;
  reference: string;
  vippsState: string | null;
}): Promise<string | null> {
  if (!isVippsReference(row) || !row.vippsState) return null;
  try {
    await cancelPayment(row.reference);
    return null;
  } catch (error) {
    try {
      const current = await getPayment(row.reference);
      if (current.capturedAmount > 0) {
        return "Betalingen er allerede betalt i Vipps. Synkroniser og refunder i stedet.";
      }
      if (
        current.state === "ABORTED" ||
        current.state === "EXPIRED" ||
        current.state === "TERMINATED"
      ) {
        return null;
      }
    } catch {
      void 0;
    }
    console.error("Vipps cancel before void failed", {
      reference: row.reference,
      error,
    });
    return "Kunne ikke stoppe betalingen i Vipps. Prøv igjen om litt.";
  }
}

export async function syncPaymentStatus(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };

  if (!row.vippsState) {
    return { ok: false, error: "Betalingen er ikke åpnet i Vipps ennå" };
  }

  try {
    await syncPaymentByReference(row.reference);
  } catch (error) {
    return { ok: false, error: vippsError(error) };
  }
  revalidate();
  return { ok: true, id: paymentId };
}

export async function captureVippsPayment(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };

  const capturableAmount = row.authorizedAmount - row.capturedAmount;
  if (capturableAmount <= 0) {
    return { ok: false, error: "Betalingen har ikke noe beløp som kan fanges" };
  }

  try {
    await capturePayment(row.reference, capturableAmount);
    await writeAudit({
      action: "payment.capture_requested",
      entityType: "payments",
      entityId: paymentId,
      metadata: { amount: capturableAmount },
    });
    await syncPaymentByReference(row.reference);
  } catch (error) {
    return { ok: false, error: vippsError(error) };
  }
  revalidate();
  return { ok: true, id: paymentId };
}

export type RefundLine = { studentId: string | null; amount: number };

export async function refundPaymentAction(input: {
  paymentId: string;
  lines: RefundLine[];
  method: "vipps" | "kontant" | "bank" | "annet";
  reason: string;
  refundedOn?: string | null;
  notify?: boolean;
  requestId?: string;
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { paymentId, method } = input;
  const reason = input.reason.trim();
  if (!paymentId) return { ok: false, error: "Mangler betaling" };
  if (!reason) return { ok: false, error: "Begrunnelse er påkrevd" };
  if (!["vipps", "kontant", "bank", "annet"].includes(method)) {
    return { ok: false, error: "Ugyldig refusjonsmåte" };
  }

  const lines = input.lines.filter((line) => line.amount > 0);
  if (lines.length === 0) {
    return { ok: false, error: "Velg minst ett beløp å refundere" };
  }
  if (lines.some((line) => !Number.isInteger(line.amount))) {
    return { ok: false, error: "Ugyldig beløp" };
  }

  const supabase = await createClient();
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };

  if (row.status !== "fanget" && row.status !== "refundert") {
    return { ok: false, error: "Bare betalte beløp kan refunderes" };
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const refundable =
    row.capturedAmount -
    row.refundedAmount -
    (await giftedFromPayment(supabase, paymentId));
  if (totalAmount > refundable) {
    return {
      ok: false,
      error: `Beløpet overstiger det som kan refunderes (${formatNok(refundable)})`,
    };
  }

  if (method === "vipps" && !isVippsReference(row)) {
    return {
      ok: false,
      error:
        "Denne betalingen gikk ikke gjennom Vipps. Registrer en manuell refusjon i stedet.",
    };
  }

  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("student_id, school_year_id, amount")
    .eq("payment_id", paymentId);
  const allocationByStudent = new Map(
    (allocations ?? []).map((allocation) => [
      allocation.student_id,
      allocation,
    ]),
  );

  const { data: priorRefunds } = await supabase
    .from("refunds")
    .select("student_id, amount, method")
    .eq("payment_id", paymentId);
  const refundedByStudent = new Map<string, number>();
  let localVippsRefunded = 0;
  for (const refund of priorRefunds ?? []) {
    if (refund.method === "vipps") localVippsRefunded += refund.amount;
    if (!refund.student_id) continue;
    refundedByStudent.set(
      refund.student_id,
      (refundedByStudent.get(refund.student_id) ?? 0) + refund.amount,
    );
  }

  const hasAllocations = (allocations ?? []).length > 0;
  for (const line of lines) {
    if (!line.studentId) {
      if (hasAllocations && (allocations ?? []).length > 1) {
        return {
          ok: false,
          error: "Velg hvilket barn refusjonen gjelder",
        };
      }
      continue;
    }
    const allocation = allocationByStudent.get(line.studentId);
    if (!allocation) {
      return { ok: false, error: "Barnet er ikke knyttet til betalingen" };
    }
    const alreadyRefunded = refundedByStudent.get(line.studentId) ?? 0;
    if (line.amount > allocation.amount - alreadyRefunded) {
      return {
        ok: false,
        error:
          "Beløpet overstiger barnets andel av betalingen. Fordel refusjonen på flere barn.",
      };
    }
  }

  const user = await getUser();
  const refundGroupId =
    input.requestId && z.string().uuid().safeParse(input.requestId).success
      ? input.requestId
      : randomUUID();
  const idempotencyKey =
    method === "vipps"
      ? vippsIdempotencyKey("refund", row.reference, totalAmount, refundGroupId)
      : null;

  if (method === "vipps") {
    try {
      const current = await getPayment(row.reference);
      if (current.refundedAmount > localVippsRefunded) {
        return {
          ok: false,
          error:
            "Vipps viser refusjoner som ikke er registrert her. Trykk Synkroniser på betalingen før du refunderer.",
        };
      }
      if (current.capturedAmount - current.refundedAmount < totalAmount) {
        return {
          ok: false,
          error: `Vipps kan bare refundere ${formatNok(Math.max(current.capturedAmount - current.refundedAmount, 0))} på denne betalingen.`,
        };
      }
    } catch (error) {
      return { ok: false, error: vippsError(error) };
    }
  }

  const { error: insertError } = await supabase.from("refunds").insert(
    lines.map((line, index) => {
      const allocation = line.studentId
        ? allocationByStudent.get(line.studentId)
        : null;
      return {
        payment_id: paymentId,
        student_id: line.studentId,
        school_year_id: allocation?.school_year_id ?? null,
        amount: line.amount,
        method,
        reason,
        refunded_by: user?.email ?? "admin",
        refund_group_id: refundGroupId,
        refunded_on: input.refundedOn ?? osloToday(),
        idempotency_key: idempotencyKey
          ? `${idempotencyKey}:${index + 1}`
          : null,
      };
    }),
  );
  if (insertError) {
    console.error("Refund insert failed", { paymentId, insertError });
    return {
      ok: false,
      error:
        insertError.code === "23505"
          ? "Denne refusjonen er allerede registrert. Last inn siden på nytt."
          : toUserError(insertError),
    };
  }

  const releaseRefund = () =>
    supabase.from("refunds").delete().eq("refund_group_id", refundGroupId);

  const [{ data: allRefunds }, { data: fresh }] = await Promise.all([
    supabase.from("refunds").select("amount").eq("payment_id", paymentId),
    supabase
      .from("payments")
      .select("captured_amount")
      .eq("id", paymentId)
      .maybeSingle(),
  ]);
  const refundedTotal = (allRefunds ?? []).reduce(
    (sum, refund) => sum + refund.amount,
    0,
  );
  if (!fresh || refundedTotal > (fresh.captured_amount ?? 0)) {
    await releaseRefund();
    return {
      ok: false,
      error:
        "En annen refusjon ble registrert samtidig. Last inn siden på nytt og sjekk beløpet før du prøver igjen.",
    };
  }

  if (method === "vipps" && idempotencyKey) {
    try {
      await refundPayment(row.reference, totalAmount, idempotencyKey);
    } catch (error) {
      await releaseRefund();
      return { ok: false, error: vippsError(error) };
    }
  }

  await writeAudit({
    action: "payment.refund_requested",
    entityType: "payments",
    entityId: paymentId,
    metadata: {
      amount: totalAmount,
      method,
      reason,
      refundGroupId,
      lines: lines.map((line) => ({
        studentId: line.studentId,
        amount: line.amount,
      })),
    },
  });

  if (row.refundedAmount + totalAmount >= row.capturedAmount) {
    await supabase
      .from("payments")
      .update({ status: "refundert" })
      .eq("id", paymentId)
      .eq("status", "fanget");
  }

  if (method === "vipps") {
    try {
      await syncPaymentByReference(row.reference);
    } catch (error) {
      console.error("Refund sync failed", { paymentId, error });
    }
  }

  for (const line of lines) {
    if (!line.studentId) continue;
    const allocation = allocationByStudent.get(line.studentId);
    if (allocation?.school_year_id) {
      try {
        await rebuildPendingInstallmentsForStudent(
          supabase,
          line.studentId,
          allocation.school_year_id,
        );
      } catch (error) {
        console.error("Installment rebuild after refund failed", {
          paymentId,
          error,
        });
      }
    }
  }

  let note: string | undefined;
  if (input.notify !== false) {
    const notice = await sendRefundNotice(supabase, {
      paymentId,
      studentIds: lines
        .map((line) => line.studentId)
        .filter((id): id is string => Boolean(id)),
      amount: totalAmount,
      amountByStudent: Object.fromEntries(
        lines
          .filter((line) => line.studentId)
          .map((line) => [line.studentId as string, line.amount]),
      ),
      method,
      refundedOn: input.refundedOn ?? osloToday(),
    });
    note = notice.sent
      ? "E-post sendt til foresatte"
      : `E-post ikke sendt: ${notice.reason ?? "ukjent feil"}`;
  }

  revalidate();
  return { ok: true, id: paymentId, note };
}

export async function cancelVippsPayment(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };

  try {
    await cancelPayment(row.reference);
    await writeAudit({
      action: "payment.cancel_requested",
      entityType: "payments",
      entityId: paymentId,
    });
    await syncPaymentByReference(row.reference);
  } catch (error) {
    return { ok: false, error: vippsError(error) };
  }

  revalidate();
  return { ok: true, id: paymentId };
}

type LinkPerson = {
  id: string;
  family_id: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  mother_first_name: string | null;
  mother_last_name: string | null;
  father_first_name: string | null;
  father_last_name: string | null;
  mother_email: string | null;
  father_email: string | null;
};

const LINK_PERSON =
  "id, family_id, child_first_name, child_last_name, mother_first_name, mother_last_name, father_first_name, father_last_name, mother_email, father_email";

export async function sendPaymentLink(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!(await emailNotifications())) {
    return { ok: false, error: EMAIL_OFF_ERROR };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select(
      `amount, due_date, status, voided_at, school_year_id, school_years(label), enrollments(classes(name_no)), students!payments_student_id_fkey(${LINK_PERSON}), payment_targets(amount, students(${LINK_PERSON}))`,
    )
    .eq("id", paymentId)
    .maybeSingle();

  const payment = data as unknown as {
    amount: number;
    due_date: string | null;
    status: string;
    voided_at: string | null;
    school_year_id: string | null;
    school_years: { label: string } | null;
    enrollments: { classes: { name_no: string | null } | null } | null;
    students: LinkPerson | null;
    payment_targets: { amount: number; students: LinkPerson | null }[] | null;
  } | null;

  if (!payment) return { ok: false, error: "Fant ikke betalingen" };
  if (payment.voided_at) {
    return { ok: false, error: "Betalingen er annullert og kan ikke sendes" };
  }
  if (payment.status !== "opprettet" && payment.status !== "avbrutt") {
    return { ok: false, error: "Betalingen er ikke åpen lenger" };
  }

  const targets = (payment.payment_targets ?? []).filter(
    (target): target is { amount: number; students: LinkPerson } =>
      target.students != null,
  );
  const people = targets.length
    ? targets.map((target) => target.students)
    : payment.students
      ? [payment.students]
      : [];
  if (people.length === 0) {
    return { ok: false, error: "Betalingen er ikke knyttet til et barn" };
  }

  const recipients = await recipientsFor(supabase, people[0]);
  if (recipients.to.length === 0) {
    return { ok: false, error: "Ingen foresatte med e-post mottar varsler" };
  }

  const ok = await sendPaymentLinkEmail({
    to: recipients.to,
    lang: recipients.lang,
    children: targets.length
      ? targets.map((target) => ({
          name: studentDisplayName(target.students),
          amount: target.amount,
        }))
      : [{ name: studentDisplayName(people[0]), amount: payment.amount }],
    amount: payment.amount,
    schoolYear: payment.school_years?.label ?? null,
    className: payment.enrollments?.classes?.name_no ?? null,
    dueDate: payment.due_date,
    remaining: await remainingFor(
      supabase,
      people.map((person) => person.id),
      payment.school_year_id,
    ),
    url: `${siteUrl()}/api/vipps/pay/${paymentId}`,
  });
  if (!ok) {
    return { ok: false, error: "E-posten kunne ikke sendes" };
  }

  return { ok: true, id: paymentId };
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const row = await getPaymentReference(id);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };
  if (
    row.capturedAmount > 0 ||
    row.status === "fanget" ||
    row.status === "refundert"
  ) {
    return {
      ok: false,
      error:
        "Registrerte betalinger kan ikke slettes. Bruk korrigering eller refusjon.",
    };
  }
  const cancelError = await cancelOpenVippsPayment(row);
  if (cancelError) return { ok: false, error: cancelError };
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return { ok: false, error: toUserError(error) };
  await writeAudit({
    action: "payment.delete",
    entityType: "payments",
    entityId: id,
  });
  revalidate();
  return { ok: true, id };
}

export async function updateStudentFee(
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const studentId = readString(formData, "student_id");
  const schoolYearId = readString(formData, "school_year_id");
  const amountNok = readNumber(formData, "amount_nok");
  const note = readOptionalString(formData, "note");

  if (!studentId || !schoolYearId) {
    return { ok: false, error: "Mangler elev eller skoleår" };
  }
  if (amountNok == null || amountNok < 0) {
    return { ok: false, error: "Ugyldig beløp" };
  }

  const supabase = await createClient();
  await setStudentFee(supabase, studentId, schoolYearId, {
    amount: Math.round(amountNok * 100),
    note,
  });
  await rebuildPendingInstallmentsForStudent(supabase, studentId, schoolYearId);

  await writeAudit({
    action: "student_fee.update",
    entityType: "student_fees",
    entityId: studentId,
    metadata: { schoolYearId, amountNok },
  });

  revalidate();
  return { ok: true, id: studentId };
}

const adjustmentTypes = [
  "soskenrabatt",
  "laererbarn",
  "frivillig",
  "annet",
] as const;

export async function grantFeeAdjustment(
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const studentId = readString(formData, "student_id");
  const schoolYearId = readString(formData, "school_year_id");
  const type = readString(formData, "type");
  const amountNok = readNumber(formData, "amount_nok");
  const note = readString(formData, "note");
  const teacherGuardianId = readOptionalString(formData, "teacher_guardian_id");

  if (!studentId || !schoolYearId) {
    return { ok: false, error: "Mangler elev eller skoleår" };
  }
  if (!adjustmentTypes.includes(type as (typeof adjustmentTypes)[number])) {
    return { ok: false, error: "Ugyldig rabattype" };
  }
  if (amountNok == null || amountNok <= 0) {
    return { ok: false, error: "Beløpet må være større enn null" };
  }
  if (!note) {
    return { ok: false, error: "Begrunnelse er påkrevd" };
  }
  if (type === "laererbarn" && !teacherGuardianId) {
    return { ok: false, error: "Velg hvilken lærer rabatten gjelder" };
  }

  const user = await getUser();
  const supabase = await createClient();
  await ensureStudentFee(supabase, studentId, schoolYearId);

  const balance = await fetchBalance(supabase, studentId, schoolYearId);
  const capped = capAtLimit(Math.round(amountNok * 100), balance.owed);
  if (!capped.ok) {
    return {
      ok: false,
      error:
        balance.owed <= 0
          ? "Eleven skal ikke betale noe dette skoleåret, så fradraget har ingen virkning."
          : `Fradraget er større enn det eleven skal betale (${formatNok(balance.owed)}).`,
    };
  }

  const { error } = await supabase.from("student_fee_adjustments").insert({
    student_id: studentId,
    school_year_id: schoolYearId,
    type,
    amount: capped.amount,
    note,
    granted_by: user?.email ?? "admin",
    teacher_guardian_id: type === "laererbarn" ? teacherGuardianId : null,
  });
  if (error) return { ok: false, error: toUserError(error) };

  await rebuildPendingInstallmentsForStudent(supabase, studentId, schoolYearId);

  await writeAudit({
    action: "student_fee.adjustment_granted",
    entityType: "student_fees",
    entityId: studentId,
    metadata: { schoolYearId, type, amountNok, note },
  });

  revalidate();
  return { ok: true, id: studentId };
}

export async function revokeFeeAdjustment(
  adjustmentId: string,
  reason: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!adjustmentId) return { ok: false, error: "Mangler justering" };
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, error: "Begrunnelse er påkrevd" };

  const user = await getUser();
  const supabase = await createClient();

  const { data: adjustment, error: fetchError } = await supabase
    .from("student_fee_adjustments")
    .select("id, student_id, school_year_id, revoked_at")
    .eq("id", adjustmentId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: toUserError(fetchError) };
  if (!adjustment) return { ok: false, error: "Fant ikke justeringen" };
  if (adjustment.revoked_at) {
    return { ok: false, error: "Justeringen er allerede opphevet" };
  }

  const { error } = await supabase
    .from("student_fee_adjustments")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: user?.email ?? "admin",
      revoke_reason: trimmedReason,
    })
    .eq("id", adjustmentId);
  if (error) return { ok: false, error: toUserError(error) };

  await rebuildPendingInstallmentsForStudent(
    supabase,
    adjustment.student_id,
    adjustment.school_year_id,
  );

  await writeAudit({
    action: "student_fee.adjustment_revoked",
    entityType: "student_fees",
    entityId: adjustment.student_id,
    metadata: { adjustmentId, reason: trimmedReason },
  });

  revalidate();
  return { ok: true, id: adjustment.student_id };
}

async function giftedFromPayment(
  supabase: SupabaseServerClient,
  paymentId: string,
): Promise<number> {
  const { data } = await supabase
    .from("sadaqa_gifts")
    .select("amount")
    .eq("source_payment_id", paymentId)
    .is("voided_at", null);
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

export async function voidPayment(
  paymentId: string,
  reason: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const user = await getUser();
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };
  if (row.voidedAt)
    return { ok: false, error: "Betalingen er allerede annullert" };
  if (await giftedFromPayment(supabase, paymentId)) {
    return {
      ok: false,
      error:
        "Deler av betalingen er gitt som sadaqa-gave. Angre gaven på sadaqa-siden før du annullerer betalingen.",
    };
  }
  if (
    isVippsReference(row) &&
    (row.capturedAmount > 0 ||
      row.status === "fanget" ||
      row.status === "refundert")
  ) {
    return {
      ok: false,
      error:
        "En fanget Vipps-betaling må refunderes i Vipps og kan ikke annulleres lokalt.",
    };
  }
  if (row.status === "opprettet" || row.status === "autorisert") {
    const cancelError = await cancelOpenVippsPayment(row);
    if (cancelError) return { ok: false, error: cancelError };
  }

  const { error } = await supabase
    .from("payments")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: reason,
      duplicate_reviewed_at: new Date().toISOString(),
      duplicate_reviewed_by: user?.email ?? null,
    } as never)
    .eq("id", paymentId);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "payment.void",
    entityType: "payments",
    entityId: paymentId,
    metadata: { reason },
  });

  revalidate();
  return { ok: true, id: paymentId };
}

export async function restorePayment(paymentId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();

  const { error } = await supabase
    .from("payments")
    .update({
      voided_at: null,
      void_reason: null,
      duplicate_of_payment_id: null,
    } as never)
    .eq("id", paymentId);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "payment.restore",
    entityType: "payments",
    entityId: paymentId,
  });

  revalidate();
  return { ok: true, id: paymentId };
}

export async function markPaymentAsDuplicate(
  paymentId: string,
  originalPaymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const user = await getUser();
  const now = new Date().toISOString();
  const row = await getPaymentReference(paymentId);
  if (!row) return { ok: false, error: "Fant ikke betalingen" };
  if (!row.reference.startsWith("manual-")) {
    return {
      ok: false,
      error:
        "Bare manuelt registrerte betalinger kan merkes som dobbeltføring.",
    };
  }

  const { error } = await supabase
    .from("payments")
    .update({
      voided_at: now,
      void_reason: "Dobbeltføring av Vipps-betaling",
      duplicate_of_payment_id: originalPaymentId,
      duplicate_reviewed_at: now,
      duplicate_reviewed_by: user?.email ?? null,
    } as never)
    .eq("id", paymentId);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "payment.mark_duplicate",
    entityType: "payments",
    entityId: paymentId,
    metadata: { originalPaymentId },
  });

  revalidate();
  return { ok: true, id: paymentId };
}

export async function keepPaymentAsSeparate(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const user = await getUser();

  const { error } = await supabase
    .from("payments")
    .update({
      duplicate_reviewed_at: new Date().toISOString(),
      duplicate_reviewed_by: user?.email ?? null,
    } as never)
    .eq("id", paymentId);

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "payment.keep_separate",
    entityType: "payments",
    entityId: paymentId,
  });

  revalidate();
  return { ok: true, id: paymentId };
}

export async function reallocatePayment(
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  if (await giftedFromPayment(supabase, paymentId)) {
    return {
      ok: false,
      error:
        "Deler av betalingen er gitt som sadaqa-gave. Angre gaven på sadaqa-siden hvis betalingen skal fordeles automatisk.",
    };
  }
  const { error: unlockError } = await supabase
    .from("payment_allocation_locks")
    .delete()
    .eq("payment_id", paymentId);
  if (unlockError) return { ok: false, error: toUserError(unlockError) };
  try {
    await allocatePayment(supabase, paymentId);
  } catch (error) {
    console.error("Reallocation failed", { paymentId, error });
    return { ok: false, error: "Fordelingen feilet" };
  }
  await writeAudit({
    action: "payment.reallocate",
    entityType: "payments",
    entityId: paymentId,
  });
  revalidate();
  return { ok: true, id: paymentId };
}

export async function reallocateYearPayments(
  schoolYearId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!schoolYearId) return { ok: false, error: "Mangler skoleår" };
  const supabase = await createClient();

  const { data } = await supabase
    .from("payments")
    .select("id")
    .eq("school_year_id", schoolYearId)
    .eq("status", "fanget")
    .is("voided_at", null)
    .order("created_at", { ascending: true });

  const ids = ((data as unknown as { id: string }[] | null) ?? []).map(
    (row) => row.id,
  );
  if (ids.length === 0) return { ok: true, count: 0 };

  const failures: string[] = [];
  await mapInChunks(ids, 4, async (id) => {
    try {
      await allocatePayment(supabase, id);
    } catch (error) {
      console.error("Year reallocation failed", { id, error });
      failures.push(id);
    }
  });
  if (failures.length > 0) {
    return {
      ok: false,
      error: `Fordelingen feilet for ${failures.length} av ${ids.length} betalinger`,
    };
  }

  await writeAudit({
    action: "payment.reallocate_year",
    entityType: "school_years",
    entityId: schoolYearId,
    metadata: { payments: ids.length },
  });

  revalidate();
  return { ok: true, count: ids.length };
}

export async function updatePaymentAllocations(
  paymentId: string,
  rows: { studentId: string; amount: number }[],
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();

  const { data: paymentRow } = await supabase
    .from("payments")
    .select("id, net_paid_amount, school_year_id")
    .eq("id", paymentId)
    .maybeSingle();

  const payment = paymentRow as unknown as {
    id: string;
    net_paid_amount: number;
    school_year_id: string | null;
  } | null;

  if (!payment) return { ok: false, error: "Fant ikke betalingen" };
  if (!payment.school_year_id) {
    return { ok: false, error: "Betalingen mangler skoleår" };
  }

  const cleaned = rows
    .map((row) => ({
      studentId: row.studentId,
      amount: Math.round(row.amount),
    }))
    .filter((row) => row.studentId && row.amount > 0);

  const unique = new Set(cleaned.map((row) => row.studentId));
  if (unique.size !== cleaned.length) {
    return { ok: false, error: "Samme elev er lagt til flere ganger" };
  }

  const total = cleaned.reduce((sum, row) => sum + row.amount, 0);
  if (total > payment.net_paid_amount) {
    return {
      ok: false,
      error: `Fordelt beløp (${formatNok(total)}) er større enn netto innbetalt beløp (${formatNok(payment.net_paid_amount)})`,
    };
  }
  const gifted = await giftedFromPayment(supabase, paymentId);
  if (total > payment.net_paid_amount - gifted) {
    return {
      ok: false,
      error: `${formatNok(gifted)} av betalingen er gitt som sadaqa-gave, så du kan fordele høyst ${formatNok(Math.max(payment.net_paid_amount - gifted, 0))} på barna.`,
    };
  }

  try {
    await replacePaymentAllocations(supabase, paymentId, cleaned);
  } catch (error) {
    console.error("Manual allocation failed", { paymentId, error });
    return { ok: false, error: "Fordelingen feilet" };
  }

  await writeAudit({
    action: "payment.allocate",
    entityType: "payments",
    entityId: paymentId,
    metadata: { rows: cleaned, total },
  });

  revalidate();
  return { ok: true, id: paymentId };
}

export async function sendWelcomeEmail(
  studentId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!studentId) return { ok: false, error: "Mangler elev" };
  if (!(await emailNotifications())) {
    return { ok: false, error: EMAIL_OFF_ERROR };
  }

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select(LINK_PERSON)
    .eq("id", studentId)
    .maybeSingle();
  const person = student as unknown as LinkPerson | null;
  if (!person) return { ok: false, error: "Fant ikke eleven" };

  const { data: year } = await supabase
    .from("school_years")
    .select("id, label, starts_on")
    .eq("is_active", true)
    .maybeSingle();
  if (!year) return { ok: false, error: "Det finnes ikke noe aktivt skoleår" };

  const { data: enrollmentRow } = await supabase
    .from("enrollments")
    .select("id, classes(name_no, name_en)")
    .eq("student_id", studentId)
    .eq("school_year_id", year.id)
    .eq("status", "aktiv")
    .limit(1)
    .maybeSingle();
  const enrollment = enrollmentRow as unknown as {
    id: string;
    classes: { name_no: string | null; name_en: string | null } | null;
  } | null;
  if (!enrollment) {
    return { ok: false, error: "Eleven har ingen plass i aktivt skoleår" };
  }

  const recipients = await recipientsFor(supabase, person);
  if (recipients.to.length === 0) {
    return { ok: false, error: "Ingen foresatte med e-post mottar varsler" };
  }

  const settings = await getSiteSettings();
  const className =
    (recipients.lang === "en"
      ? enrollment.classes?.name_en
      : enrollment.classes?.name_no) ??
    enrollment.classes?.name_no ??
    null;

  const ok = await sendWelcome({
    to: recipients.to,
    lang: recipients.lang,
    childName: studentDisplayName(person),
    className,
    schoolYear: year.label,
    startsOn: year.starts_on,
    address: settings?.address ?? null,
    hours: settings?.hours ?? null,
  });
  if (!ok) return { ok: false, error: "E-posten kunne ikke sendes" };

  await writeAudit({
    action: "student.welcome_sent",
    entityType: "students",
    entityId: studentId,
    metadata: { enrollmentId: enrollment.id, recipients: recipients.to.length },
  });

  return { ok: true, id: studentId };
}

"use server";

import { revalidatePath } from "next/cache";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { toUserError } from "@/lib/action-errors";
import {
  assignPaymentPlan,
  rebuildPendingInstallments,
  SEMESTER_INSTALLMENT_ORE,
  type PaymentPlanType,
} from "@/lib/payment-plans";
import { sendInstallmentBatch } from "@/lib/installment-billing";
import {
  buildCustomConfig,
  type CustomPlanConfig,
} from "@/lib/custom-payment-plan";
import { sendLoginLink } from "@/lib/login-link";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";

type FamilyActionResult = { ok: true } | { ok: false; error: string };

const roles = new Set([
  "foresatt",
  "mor",
  "far",
  "steforelder",
  "verge",
  "annet",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateFamilyRelationships(
  familyId: string,
  formData: FormData,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const keys = Array.from(
    new Set(
      read(formData, "guardian_keys")
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const primaryKey = read(formData, "primary_guardian_key");
  if (keys.length === 0 || !keys.includes(primaryKey)) {
    return { ok: false, error: "Velg minst én foresatt og en primær kontakt" };
  }

  const guardians = keys.map((key) => ({
    key,
    id: read(formData, `guardian_${key}_id`) || null,
    first_name: read(formData, `guardian_${key}_first_name`),
    last_name: read(formData, `guardian_${key}_last_name`),
    email: read(formData, `guardian_${key}_email`) || null,
    phone: read(formData, `guardian_${key}_phone`) || null,
    role: read(formData, `guardian_${key}_role`),
  }));

  for (const guardian of guardians) {
    if (!guardian.first_name && !guardian.last_name) {
      return { ok: false, error: "Alle foresatte må ha et navn" };
    }
    if (!roles.has(guardian.role)) {
      return { ok: false, error: "Velg en gyldig relasjon for alle foresatte" };
    }
    if (guardian.email && !emailPattern.test(guardian.email)) {
      return { ok: false, error: "Skriv inn en gyldig e-postadresse" };
    }
  }

  guardians.sort((left, right) => {
    if (left.key === primaryKey) return -1;
    if (right.key === primaryKey) return 1;
    return keys.indexOf(left.key) - keys.indexOf(right.key);
  });

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_family_relationships", {
    p_family_id: familyId,
    p_family: {
      display_name: read(formData, "display_name") || null,
      address: read(formData, "address") || null,
      postal_code: read(formData, "postal_code") || null,
      city: read(formData, "city") || null,
    },
    p_guardians: guardians.map((guardian) => ({
      id: guardian.id,
      first_name: guardian.first_name,
      last_name: guardian.last_name,
      email: guardian.email,
      phone: guardian.phone,
      role: guardian.role,
    })),
    p_resolve_reviews: formData.get("resolve_reviews") === "on",
  });

  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "family.relationships_updated",
    entityType: "families",
    entityId: familyId,
    metadata: { guardianCount: guardians.length },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

const planTypes = new Set(["full", "semester", "maanedlig", "egendefinert"]);

export async function assignPaymentPlanAction(
  formData: FormData,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const familyId = read(formData, "family_id");
  const schoolYearId = read(formData, "school_year_id");
  const planType = read(formData, "plan_type");
  const monthlyAmountNok = Number(read(formData, "monthly_amount_nok"));
  const note = read(formData, "note") || null;

  if (!familyId || !schoolYearId) {
    return { ok: false, error: "Mangler familie eller skoleår" };
  }
  if (!planTypes.has(planType)) {
    return { ok: false, error: "Velg en gyldig betalingsplan" };
  }
  if (
    planType === "maanedlig" &&
    (!Number.isFinite(monthlyAmountNok) || monthlyAmountNok <= 0)
  ) {
    return { ok: false, error: "Velg månedsbeløp" };
  }
  let customConfig: CustomPlanConfig | null = null;
  if (planType === "egendefinert") {
    const built = buildCustomConfig({
      initial_amount_nok: read(formData, "initial_amount_nok"),
      initial_mode: read(formData, "initial_mode"),
      initial_due_date: read(formData, "initial_due_date"),
      monthly_amount_nok: read(formData, "custom_monthly_amount_nok"),
      monthly_mode: read(formData, "monthly_mode"),
      final_amount_nok: read(formData, "final_amount_nok"),
      final_mode: read(formData, "final_mode"),
      final_due_date: read(formData, "final_due_date"),
      start_month: read(formData, "start_month"),
      end_month: read(formData, "end_month"),
      due_day: read(formData, "due_day"),
    });
    if (!built.ok) return { ok: false, error: built.error };
    customConfig = built.config;
  }

  const user = await getUser();
  const supabase = await createClient();

  try {
    const planId = await assignPaymentPlan(supabase, {
      familyId,
      schoolYearId,
      planType: planType as PaymentPlanType,
      monthlyAmount:
        planType === "maanedlig" ? Math.round(monthlyAmountNok * 100) : null,
      customConfig,
      createdBy: user?.email ?? "admin",
      note,
    });

    await writeAudit({
      action: "payment_plan.assigned",
      entityType: "families",
      entityId: familyId,
      metadata: { schoolYearId, planType, planId },
    });
    scheduleSchoolEmails(familyId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ukjent feil",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function endPaymentPlan(
  planId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!planId) return { ok: false, error: "Mangler plan" };

  const supabase = await createClient();
  const { error: cancelError } = await supabase
    .from("installments")
    .update({ status: "kansellert" })
    .eq("plan_id", planId)
    .in("status", ["planlagt", "stoppet"]);
  if (cancelError) return { ok: false, error: cancelError.message };

  const { data: plan, error } = await supabase
    .from("payment_plans")
    .update({ status: "avsluttet" })
    .eq("id", planId)
    .select("family_id")
    .single();
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "payment_plan.ended",
    entityType: "families",
    entityId: plan.family_id,
    metadata: { planId },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setPlanPaused(
  planId: string,
  paused: boolean,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!planId) return { ok: false, error: "Mangler plan" };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("payment_plans")
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq("id", planId)
    .select("family_id")
    .single();
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: paused ? "payment_plan.paused" : "payment_plan.resumed",
    entityType: "families",
    entityId: plan.family_id,
    metadata: { planId },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopInstallment(
  installmentId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  const supabase = await createClient();

  const { error } = await supabase
    .from("installments")
    .update({ status: "stoppet" })
    .eq("id", installmentId)
    .eq("status", "planlagt");
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "installment.stopped",
    entityType: "installments",
    entityId: installmentId,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function reopenInstallment(
  installmentId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  const supabase = await createClient();

  const { error } = await supabase
    .from("installments")
    .update({ status: "planlagt" })
    .eq("id", installmentId)
    .eq("status", "stoppet");
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "installment.reopened",
    entityType: "installments",
    entityId: installmentId,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function sendInstallmentNow(
  installmentId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!siteUrl) return { ok: false, error: "NEXT_PUBLIC_SITE_URL mangler" };

  const supabase = await createClient();
  const { data: installment, error } = await supabase
    .from("installments")
    .select(
      "id, plan_id, school_year_id, due_date, status, payment_plans!inner(family_id)",
    )
    .eq("id", installmentId)
    .maybeSingle();
  if (error) return { ok: false, error: toUserError(error) };
  if (!installment) return { ok: false, error: "Fant ikke avdraget" };
  if (installment.status !== "planlagt" && installment.status !== "stoppet") {
    return { ok: false, error: "Avdraget er allerede sendt eller betalt" };
  }

  if (installment.status === "stoppet") {
    await supabase
      .from("installments")
      .update({ status: "planlagt" })
      .eq("id", installmentId);
  }

  const { data: rows, error: rowsError } = await supabase
    .from("installments")
    .select("id, student_id, amount")
    .eq("plan_id", installment.plan_id)
    .eq("due_date", installment.due_date)
    .eq("status", "planlagt")
    .gt("amount", 0);
  if (rowsError) return { ok: false, error: rowsError.message };
  if (!rows || rows.length === 0) {
    return { ok: false, error: "Ingen avdrag å sende" };
  }

  const plan = installment.payment_plans as unknown as { family_id: string };

  try {
    const outcome = await sendInstallmentBatch(
      supabase,
      {
        planId: installment.plan_id,
        familyId: plan.family_id,
        schoolYearId: installment.school_year_id,
        dueDate: installment.due_date,
        installments: rows.map((row) => ({
          id: row.id,
          studentId: row.student_id,
          amount: row.amount,
        })),
        totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
      },
    );
    if (outcome === "skipped") {
      return { ok: false, error: "Beløpet er allerede dekket" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ukjent feil",
    };
  }

  await writeAudit({
    action: "installment.sent_manually",
    entityType: "installments",
    entityId: installmentId,
  });
  scheduleSchoolEmails(plan.family_id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function approveSiblingDiscount(
  formData: FormData,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const familyId = read(formData, "family_id");
  const schoolYearId = read(formData, "school_year_id");
  const studentId = read(formData, "student_id");

  if (!familyId || !schoolYearId || !studentId) {
    return { ok: false, error: "Mangler familie, skoleår eller barn" };
  }

  const user = await getUser();
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, family_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.family_id !== familyId) {
    return { ok: false, error: "Barnet tilhører ikke familien" };
  }

  const { data: existing } = await supabase
    .from("student_fee_adjustments")
    .select("id, students!inner(family_id)")
    .eq("school_year_id", schoolYearId)
    .eq("type", "soskenrabatt")
    .is("revoked_at", null)
    .eq("students.family_id", familyId)
    .limit(1);
  if ((existing ?? []).length > 0) {
    return { ok: false, error: "Familien har allerede søskenrabatt i år" };
  }

  const { error } = await supabase.from("student_fee_adjustments").insert({
    student_id: studentId,
    school_year_id: schoolYearId,
    type: "soskenrabatt",
    amount: SEMESTER_INSTALLMENT_ORE,
    note: "Søskenrabatt: 3 eller flere søsken",
    granted_by: user?.email ?? "admin",
  });
  if (error) return { ok: false, error: toUserError(error) };

  await rebuildPendingInstallments(supabase, familyId, schoolYearId);

  await writeAudit({
    action: "student_fee.sibling_discount_approved",
    entityType: "families",
    entityId: familyId,
    metadata: { schoolYearId, studentId },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dismissSiblingSuggestion(
  familyId: string,
  schoolYearId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!familyId || !schoolYearId) {
    return { ok: false, error: "Mangler familie eller skoleår" };
  }

  const user = await getUser();
  const supabase = await createClient();
  const { error } = await supabase.from("sibling_discount_dismissals").upsert({
    family_id: familyId,
    school_year_id: schoolYearId,
    dismissed_by: user?.email ?? "admin",
  });
  if (error) return { ok: false, error: toUserError(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeGuardianFromFamily(
  familyId: string,
  guardianId: string,
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!familyId || !guardianId) {
    return { ok: false, error: "Mangler familie eller foresatt" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "admin_remove_guardian_from_family",
    { p_family_id: familyId, p_guardian_id: guardianId },
  );
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "family.guardian_removed",
    entityType: "families",
    entityId: familyId,
    metadata: { guardianId, result: data },
  });
  revalidatePath("/", "layout");
  return { ok: true, deleted: data === "deleted" };
}

export async function mergeFamilies(
  keepFamilyId: string,
  mergeFamilyId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!keepFamilyId || !mergeFamilyId) {
    return { ok: false, error: "Velg familien du vil slå sammen med" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_merge_families", {
    p_keep: keepFamilyId,
    p_merge: mergeFamilyId,
  });
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "family.merged",
    entityType: "families",
    entityId: keepFamilyId,
    metadata: { mergedFamilyId: mergeFamilyId },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function moveStudentToFamily(
  studentId: string,
  familyId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!studentId || !familyId) {
    return { ok: false, error: "Velg familien eleven skal flyttes til" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_move_student_to_family", {
    p_student_id: studentId,
    p_family_id: familyId,
  });
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "student.family_moved",
    entityType: "students",
    entityId: studentId,
    metadata: { familyId },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateGuardianRoles(
  formData: FormData,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const guardianId = read(formData, "guardian_id");
  if (!guardianId) return { ok: false, error: "Mangler foresatt" };

  const isTeacher = formData.get("is_teacher") === "on";
  const isVolunteer = formData.get("is_volunteer") === "on";
  const teacherNote = read(formData, "teacher_note") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("guardians")
    .update({
      is_teacher: isTeacher,
      is_volunteer: isVolunteer,
      ...(formData.has("teacher_note") ? { teacher_note: teacherNote } : {}),
    })
    .eq("id", guardianId);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "guardian.roles_updated",
    entityType: "guardians",
    entityId: guardianId,
    metadata: { isTeacher, isVolunteer },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

type TeacherActionResult =
  | { ok: true; linkedName?: string; inviteError?: string }
  | { ok: false; error: string };

export async function registerTeacher(
  formData: FormData,
): Promise<TeacherActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const guardianId = read(formData, "guardian_id");
  const firstName = read(formData, "first_name");
  const lastName = read(formData, "last_name");
  const email = read(formData, "email").toLowerCase() || null;
  const phone = read(formData, "phone") || null;
  const sourceApplicationId = read(formData, "source_application_id") || null;
  const teacherNote = read(formData, "teacher_note") || null;
  const sendLink = formData.get("send_login_link") === "on";
  const locale = read(formData, "locale") === "en" ? "en" : "no";
  const extras = {
    ...(teacherNote ? { teacher_note: teacherNote } : {}),
    ...(sourceApplicationId ? { source_application_id: sourceApplicationId } : {}),
  };

  const supabase = await createClient();

  async function finish(id: string, email: string | null, metadata: Record<string, unknown>, linkedName?: string) {
    if (sourceApplicationId) {
      await supabase
        .from("teacher_applications")
        .update({ status: "kontaktet" })
        .eq("id", sourceApplicationId)
        .eq("status", "ny");
    }
    await writeAudit({
      action: "teacher.registered",
      entityType: "guardians",
      entityId: id,
      metadata: { ...metadata, fromApplication: sourceApplicationId },
    });
    revalidatePath("/", "layout");
    if (sendLink && email && !isPlaceholderEmail(email)) {
      const sent = await sendLoginLink({ email, locale });
      if (!sent.ok) return { ok: true as const, linkedName, inviteError: sent.error };
    }
    return { ok: true as const, linkedName };
  }

  if (guardianId) {
    const { data: updated, error } = await supabase
      .from("guardians")
      .update({ is_teacher: true, ...extras })
      .eq("id", guardianId)
      .select("email")
      .maybeSingle();
    if (error) return { ok: false, error: toUserError(error) };
    const savedEmail = updated?.email?.trim().toLowerCase() ?? "";
    return finish(guardianId, emailPattern.test(savedEmail) ? savedEmail : null, {});
  }

  if (!firstName && !lastName) {
    return { ok: false, error: "Navn er påkrevd" };
  }
  if (email && !emailPattern.test(email)) {
    return { ok: false, error: "Skriv inn en gyldig e-postadresse" };
  }

  if (email && !isPlaceholderEmail(email)) {
    const { data: candidates, error: matchError } = await supabase
      .from("guardians")
      .select("id, first_name, last_name, email")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"));
    if (matchError) return { ok: false, error: toUserError(matchError) };
    const matches = (candidates ?? []).filter(
      (row) => row.email?.trim().toLowerCase() === email,
    );
    if (matches.length > 1) {
      return {
        ok: false,
        error:
          "Flere foresatte har denne e-postadressen. Åpne riktig familie og gjør personen til lærer fra familiesiden.",
      };
    }
    const match = matches[0];
    if (match) {
      const { error } = await supabase
        .from("guardians")
        .update({ is_teacher: true, ...extras })
        .eq("id", match.id);
      if (error) return { ok: false, error: toUserError(error) };
      const name =
        [match.first_name, match.last_name].filter(Boolean).join(" ") || email;
      return finish(match.id, email, { matchedByEmail: true }, name);
    }
  }

  const { data: created, error } = await supabase
    .from("guardians")
    .insert({
      first_name: firstName || null,
      last_name: lastName || null,
      email,
      phone,
      is_teacher: true,
      teacher_note: teacherNote,
      source_application_id: sourceApplicationId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: toUserError(error) };
  return finish(created.id, email, {});
}

export async function removeTeacher(
  guardianId: string,
): Promise<FamilyActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!guardianId) return { ok: false, error: "Mangler lærer" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("guardians")
    .update({ is_teacher: false })
    .eq("id", guardianId);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "teacher.removed",
    entityType: "guardians",
    entityId: guardianId,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

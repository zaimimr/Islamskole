import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { studentDisplayName } from "@/lib/student-name";
import { formatNok } from "@/lib/money";
import { addCalendarDays, osloToday } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";
import type { SchoolEmailKind } from "./content";

export type SchoolDelivery = Database["public"]["Tables"]["school_email_deliveries"]["Row"];
type Admin = ReturnType<typeof createAdminClient>;

function dateLabel(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
    timeZone: "Europe/Oslo", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

async function parentRecipient(admin: Admin, delivery: SchoolDelivery) {
  if (!delivery.family_id) return false;
  const { data, error } = await admin.from("family_guardians")
    .select("guardians(email)").eq("family_id", delivery.family_id).eq("receives_communication", true);
  if (error) throw error;
  return data.some((row) => row.guardians?.email?.trim().toLowerCase() === delivery.email);
}

async function signupData(admin: Admin, delivery: SchoolDelivery) {
  const { data, error } = await admin.from("student_applications")
    .select("id, child_first_name, child_last_name, child_email, payment_id, status")
    .eq("family_id", delivery.family_id!).or(`payment_id.eq.${delivery.entity_id},id.eq.${delivery.entity_id}`);
  if (error) throw error;
  const applications = data.filter((row) => row.status !== "arkivert" &&
    (delivery.kind === "signup_parent" || row.child_email?.trim().toLowerCase() === delivery.email));
  return applications.length ? { names: applications.map(studentDisplayName) } : null;
}

async function welcomeData(admin: Admin, delivery: SchoolDelivery) {
  const { data, error } = await admin.from("enrollments")
    .select("students!inner(id, child_first_name, child_last_name, child_email, family_id), school_years!inner(is_active)")
    .eq("status", "aktiv").eq("school_years.is_active", true)
    .eq("students.family_id", delivery.family_id!);
  if (error) throw error;
  const students = data.map((row) => row.students).filter((student) =>
    delivery.kind === "welcome_parent" || (student.id === delivery.entity_id && student.child_email?.trim().toLowerCase() === delivery.email));
  return students.length ? { names: [...new Set(students.map(studentDisplayName))] } : null;
}

async function planData(admin: Admin, delivery: SchoolDelivery, locale: string) {
  const { data: plan, error: planError } = await admin.from("payment_plans")
    .select("status, family_id, paused_at").eq("id", delivery.entity_id).maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.status !== "aktiv" || plan.paused_at || plan.family_id !== delivery.family_id) return null;
  const { data, error } = await admin.from("installments")
    .select("due_date, amount, students(child_first_name, child_last_name)")
    .eq("plan_id", delivery.entity_id).in("status", ["planlagt", "sendt", "betalt"]).gt("amount", 0)
    .order("due_date");
  if (error) throw error;
  if (!data.length) return null;
  const totals = new Map<string, number>();
  for (const slot of data) totals.set(slot.due_date, (totals.get(slot.due_date) ?? 0) + slot.amount);
  return {
    names: [...new Set(data.flatMap((row) => row.students ? [studentDisplayName(row.students)] : []))],
    schedule: [...totals].map(([date, amount]) => ({ date: dateLabel(date, locale), amount: formatNok(amount) })),
  };
}

async function reminderData(admin: Admin, delivery: SchoolDelivery, locale: string) {
  const { data, error } = await admin.from("payments")
    .select("status, voided_at, amount, due_date, school_year_id, student_id, school_years(is_active), students!payments_student_id_fkey(id, child_first_name, child_last_name, family_id)")
    .eq("id", delivery.entity_id).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "opprettet" || data.voided_at || !data.school_years?.is_active || !data.due_date ||
    data.due_date > addCalendarDays(osloToday(), -7) || !data.school_year_id) return null;
  const { data: targets, error: targetError } = await admin.from("payment_targets")
    .select("amount, students(id, child_first_name, child_last_name, family_id)").eq("payment_id", delivery.entity_id);
  if (targetError) throw targetError;
  const children = targets.length ? targets : data.students ? [{ amount: data.amount, students: data.students }] : [];
  if (!children.length || children.some((row) => row.students?.family_id !== delivery.family_id)) return null;
  const { data: balances, error: balanceError } = await admin.from("student_balances")
    .select("student_id, remaining").in("student_id", children.map((row) => row.students!.id)).eq("school_year_id", data.school_year_id);
  if (balanceError) throw balanceError;
  const collectible = children.map((row) => ({
    student: row.students!, amount: Math.max(0, Math.min(row.amount, balances.find((balance) => balance.student_id === row.students!.id)?.remaining ?? 0)),
  })).filter((row) => row.amount > 0);
  if (!collectible.length) return null;
  return { names: collectible.map((row) => studentDisplayName(row.student)), amount: formatNok(Math.min(data.amount, collectible.reduce((sum, row) => sum + row.amount, 0))), dueDate: dateLabel(data.due_date, locale) };
}

async function installmentData(admin: Admin, delivery: SchoolDelivery, locale: string) {
  const { data: payment, error: paymentError } = await admin.from("payments").select("status, voided_at")
    .eq("id", delivery.entity_id).maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || payment.voided_at || payment.status !== "opprettet") return null;
  const { data, error } = await admin.from("installments")
    .select("student_id, school_year_id, due_date, amount, school_years!inner(is_active), students(child_first_name, child_last_name), payment_plans!inner(family_id, status, paused_at)")
    .eq("payment_id", delivery.entity_id).eq("status", "sendt").eq("payment_plans.family_id", delivery.family_id!)
    .eq("payment_plans.status", "aktiv").is("payment_plans.paused_at", null).eq("school_years.is_active", true).gt("amount", 0);
  if (error) throw error;
  if (!data.length) return null;
  if (delivery.kind === "installment_reminder" && data.every((row) => row.due_date > addCalendarDays(osloToday(), -7))) return null;
  const { data: balances, error: balanceError } = await admin.from("student_balances")
    .select("student_id, remaining").in("student_id", data.map((row) => row.student_id)).eq("school_year_id", data[0].school_year_id);
  if (balanceError) throw balanceError;
  const collectible = data.filter((row) => balances.some((balance) => balance.student_id === row.student_id && (balance.remaining ?? 0) > 0));
  if (!collectible.length) return null;
  return {
    names: collectible.flatMap((row) => row.students ? [studentDisplayName(row.students)] : []),
    amount: formatNok(collectible.reduce((sum, row) => sum + Math.min(row.amount, balances.find((balance) => balance.student_id === row.student_id)?.remaining ?? 0), 0)),
    dueDate: dateLabel(data[0].due_date, locale), paymentId: delivery.entity_id,
  };
}

async function reportData(admin: Admin, delivery: SchoolDelivery) {
  const { data, error } = await admin.from("term_report_publications")
    .select("id, students!inner(child_first_name, child_last_name, family_id)").eq("id", delivery.entity_id).maybeSingle();
  if (error) throw error;
  return data?.students.family_id === delivery.family_id ? { names: [studentDisplayName(data.students)], publicationId: data.id } : null;
}

async function followUpData(admin: Admin, delivery: SchoolDelivery) {
  const { data, error } = await admin.from("attendance_followups")
    .select("message, action, students!inner(child_first_name, child_last_name, family_id)").eq("id", delivery.entity_id).maybeSingle();
  if (error) throw error;
  return data?.action === "email" && data.students.family_id === delivery.family_id
    ? { names: [studentDisplayName(data.students)], followUpMessage: data.message } : null;
}

async function activityData(admin: Admin, delivery: SchoolDelivery, locale: string) {
  let activityId = delivery.entity_id;
  let studentId: string | null = null;
  if (delivery.kind === "activity_added") {
    const { data: invitation, error } = await admin.from("activity_added_invitations").select("activity_id, student_id").eq("id", delivery.entity_id).maybeSingle();
    if (error) throw error;
    if (!invitation) return null;
    activityId = invitation.activity_id;
    studentId = invitation.student_id;
  }
  const { data: activity, error } = await admin.from("school_activities").select("title, event_date, respond_by, status").eq("id", activityId).maybeSingle();
  if (error) throw error;
  if (!activity || activity.status !== (delivery.kind === "activity_cancelled" ? "cancelled" : "published") ||
    (delivery.kind !== "activity_cancelled" && activity.respond_by < osloToday())) return null;
  let query = admin.from("activity_students").select("students!inner(id, child_first_name, child_last_name, family_id)")
    .eq("activity_id", activityId).eq("students.family_id", delivery.family_id!);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error: studentError } = await query;
  if (studentError) throw studentError;
  return data.length ? { names: data.map((row) => studentDisplayName(row.students)), activityId,
    activityTitle: activity.title, activityDate: dateLabel(activity.event_date, locale), activityDeadline: dateLabel(activity.respond_by, locale), activityStudentId: data[0].students.id } : null;
}

export async function schoolDeliveryContent(admin: Admin, delivery: SchoolDelivery) {
  const { data: family, error } = await admin.from("families").select("preferred_language")
    .eq("id", delivery.family_id!).maybeSingle();
  if (error) throw error;
  if (!family) return null;
  const locale: "en" | "no" = family.preferred_language === "en" ? "en" : "no";
  const kind = delivery.kind as SchoolEmailKind;
  if (!kind.endsWith("student") && !(await parentRecipient(admin, delivery))) return null;
  const content = kind.startsWith("signup") ? await signupData(admin, delivery)
    : kind.startsWith("welcome") ? await welcomeData(admin, delivery)
    : kind.startsWith("activity") ? await activityData(admin, delivery, locale)
    : kind === "attendance_followup" ? await followUpData(admin, delivery)
    : kind === "report_published" ? await reportData(admin, delivery)
    : kind === "plan_confirmed" ? await planData(admin, delivery, locale)
    : kind.startsWith("installment") ? await installmentData(admin, delivery, locale)
    : await reminderData(admin, delivery, locale);
  return content ? { kind, locale, ...content } : null;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toUserError } from "@/lib/action-errors";
import { writeAudit } from "@/lib/audit";
import { getIsAdmin, getUser } from "@/lib/auth";
import { validatePlans, validateSlots, type SlotPlan } from "@/lib/lessons";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true; count?: number } | { ok: false; error: string };

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const slotSchema = z.object({ label: z.string().trim().min(1).max(60), starts_at: time, ends_at: time });
const planSchema = z.object({
  start_position: z.number().int().min(1),
  end_position: z.number().int().min(1),
  subject: text(120),
  teacher_guardian_id: uuid.nullable(),
  co_teacher_guardian_id: uuid.nullable(),
});
const lessonSchema = z.object({
  subject: text(120),
  teacherGuardianId: uuid.nullable(),
  coTeacherGuardianId: uuid.nullable(),
  cancelled: z.boolean(),
  note: text(500),
});

async function requireAdmin(): Promise<ActionResult | null> {
  if (await getIsAdmin()) return null;
  const user = await getUser();
  return {
    ok: false,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt og prøv igjen.",
  };
}

function failure(error: { code?: string; message?: string }): ActionResult {
  return { ok: false, error: error.code === "23P01" ? error.message ?? toUserError(error) : toUserError(error) };
}

function revalidate() {
  revalidatePath("/", "layout");
}

export async function saveTimeSlots(
  schoolYearId: string,
  slots: { label: string; starts_at: string; ends_at: string }[],
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z.array(slotSchema).min(1).max(12).safeParse(slots);
  if (!uuid.safeParse(schoolYearId).success || !parsed.success) {
    return { ok: false, error: validateSlots(slots) ?? "Sjekk navn og klokkeslett for timene." };
  }
  const invalid = validateSlots(parsed.data);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_time_slots", {
    p_school_year_id: schoolYearId,
    p_slots: parsed.data,
  });
  if (error) return failure(error);

  await writeAudit({
    action: "time_slots.save",
    entityType: "school_year",
    entityId: schoolYearId,
    metadata: { slots: parsed.data },
  });
  revalidate();
  return { ok: true, count: data ?? parsed.data.length };
}

export async function saveClassSlotPlans(
  classId: string,
  schoolYearId: string,
  slotCount: number,
  plans: SlotPlan[],
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z.array(planSchema).max(24).safeParse(plans);
  if (!uuid.safeParse(classId).success || !uuid.safeParse(schoolYearId).success || !parsed.success) {
    return { ok: false, error: "Ugyldig timeplan." };
  }
  const invalid = validatePlans(parsed.data, slotCount);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_class_slot_plans", {
    p_class_id: classId,
    p_school_year_id: schoolYearId,
    p_plans: parsed.data,
  });
  if (error) return failure(error);

  await writeAudit({
    action: "class_slot_plans.save",
    entityType: "class",
    entityId: classId,
    metadata: { school_year_id: schoolYearId, plans: parsed.data },
  });
  revalidate();
  return { ok: true, count: data ?? parsed.data.length };
}

export async function updateLesson(
  lessonId: string,
  values: {
    subject: string | null;
    teacherGuardianId: string | null;
    coTeacherGuardianId: string | null;
    cancelled: boolean;
    note: string | null;
  },
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = lessonSchema.safeParse(values);
  if (!uuid.safeParse(lessonId).success || !parsed.success) return { ok: false, error: "Ugyldig time." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_lesson", {
    p_lesson_id: lessonId,
    p_subject: parsed.data.subject,
    p_teacher_guardian_id: parsed.data.teacherGuardianId,
    p_cancelled: parsed.data.cancelled,
    p_note: parsed.data.note,
    p_co_teacher_guardian_id: parsed.data.coTeacherGuardianId,
  });
  if (error) return failure(error);

  await writeAudit({ action: "lesson.update", entityType: "lesson", entityId: lessonId, metadata: parsed.data });
  revalidate();
  return { ok: true };
}

export async function mergeLessons(lessonId: string, otherLessonId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(lessonId).success || !uuid.safeParse(otherLessonId).success) {
    return { ok: false, error: "Ugyldig time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_merge_lessons", {
    p_lesson_id: lessonId,
    p_other_lesson_id: otherLessonId,
  });
  if (error) return failure(error);

  await writeAudit({
    action: "lesson.merge",
    entityType: "lesson",
    entityId: lessonId,
    metadata: { merged_lesson_id: otherLessonId },
  });
  revalidate();
  return { ok: true };
}

export async function splitLesson(lessonId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(lessonId).success) return { ok: false, error: "Ugyldig time." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_split_lesson", { p_lesson_id: lessonId });
  if (error) return failure(error);

  await writeAudit({ action: "lesson.split", entityType: "lesson", entityId: lessonId, metadata: { created: data } });
  revalidate();
  return { ok: true, count: data ?? 0 };
}

export async function ensureDayLessons(schoolDayId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(schoolDayId).success) return { ok: false, error: "Ugyldig dag." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_lessons", { p_school_day_id: schoolDayId });
  if (error) return failure(error);

  revalidate();
  return { ok: true, count: data ?? 0 };
}

export async function resetDayLessons(schoolDayId: string, classId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(schoolDayId).success || !uuid.safeParse(classId).success) {
    return { ok: false, error: "Ugyldig dag." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reset_day_lessons", {
    p_school_day_id: schoolDayId,
    p_class_id: classId,
  });
  if (error) return failure(error);

  await writeAudit({
    action: "lesson.reset_day",
    entityType: "class",
    entityId: classId,
    metadata: { school_day_id: schoolDayId },
  });
  revalidate();
  return { ok: true };
}

const teacherAbsenceSchema = z.object({
  guardianId: uuid,
  schoolDayId: uuid,
  notified: z.boolean(),
  reason: text(500),
});

export async function saveTeacherAbsence(values: {
  guardianId: string;
  schoolDayId: string;
  notified: boolean;
  reason: string | null;
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = teacherAbsenceSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Velg lærer og om fraværet var varslet." };

  const supabase = await createClient();
  const { data: existing, error: findError } = await supabase
    .from("teacher_absences")
    .select("id")
    .eq("guardian_id", parsed.data.guardianId)
    .eq("school_day_id", parsed.data.schoolDayId)
    .maybeSingle();
  if (findError) return failure(findError);

  const { data, error } = existing
    ? await supabase
        .from("teacher_absences")
        .update({ notified: parsed.data.notified, reason: parsed.data.reason })
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase
        .from("teacher_absences")
        .insert({
          guardian_id: parsed.data.guardianId,
          school_day_id: parsed.data.schoolDayId,
          notified: parsed.data.notified,
          reason: parsed.data.reason,
          source: "admin",
        })
        .select("id")
        .single();
  if (error) return failure(error);

  await writeAudit({
    action: existing ? "teacher_absence.update" : "teacher_absence.create",
    entityType: "teacher_absence",
    entityId: data.id,
    metadata: parsed.data,
  });
  revalidate();
  return { ok: true };
}

export async function removeTeacherAbsence(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Ugyldig fravær." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_absences")
    .delete()
    .eq("id", id)
    .select("guardian_id, school_day_id")
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return { ok: false, error: "Fraværet finnes ikke lenger." };

  await writeAudit({ action: "teacher_absence.delete", entityType: "teacher_absence", entityId: id, metadata: data });
  revalidate();
  return { ok: true };
}

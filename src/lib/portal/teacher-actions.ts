"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getPortalContext } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";
import type { PortalActionResult } from "@/lib/portal/types";

const uuid = z.string().uuid();

export async function deleteClassNote(lessonId: string): Promise<PortalActionResult> {
  if (!uuid.safeParse(lessonId).success) return { ok: false, error: "invalid" };
  const context = await getPortalContext();
  if (!context.user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notes")
    .delete()
    .eq("lesson_id", lessonId)
    .select("id, class_id, school_day_id");
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "unknown" };

  if (data?.length) {
    await writeAudit({
      action: "class_note.delete",
      entityType: "class_note",
      entityId: data[0].id,
      metadata: { class_id: data[0].class_id, school_day_id: data[0].school_day_id, lesson_id: lessonId },
    });
  }
  revalidatePath("/[locale]/min-side", "layout");
  return { ok: true };
}

export async function startSubstitute(classId: string): Promise<PortalActionResult> {
  if (!uuid.safeParse(classId).success) return { ok: false, error: "invalid" };
  const context = await getPortalContext();
  if (!context.user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_start_substitute", { p_class_id: classId });
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "unknown" };

  await writeAudit({
    action: "class_substitute.start",
    entityType: "class",
    entityId: classId,
    metadata: { until: data },
  });
  revalidatePath("/[locale]/min-side", "layout");
  return { ok: true };
}

export async function endSubstitute(classId: string): Promise<PortalActionResult> {
  if (!uuid.safeParse(classId).success) return { ok: false, error: "invalid" };
  const context = await getPortalContext();
  if (!context.user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_end_substitute", { p_class_id: classId });
  if (error) return { ok: false, error: "unknown" };

  await writeAudit({ action: "class_substitute.end", entityType: "class", entityId: classId });
  revalidatePath("/[locale]/min-side", "layout");
  return { ok: true };
}

const teacherAbsenceSchema = z.object({
  schoolDayId: uuid,
  reason: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});

export async function reportTeacherAbsence(schoolDayId: string, reason?: string | null): Promise<PortalActionResult> {
  const parsed = teacherAbsenceSchema.safeParse({ schoolDayId, reason });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const context = await getPortalContext();
  if (!context.user) return { ok: false, error: "unauthenticated" };
  if (!context.guardianIds.length) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data: teacherId } = await supabase.rpc("portal_teacher_guardian_id");
  if (!teacherId) return { ok: false, error: "forbidden" };

  const { data, error } = await supabase
    .from("teacher_absences")
    .insert({
      guardian_id: teacherId,
      school_day_id: parsed.data.schoolDayId,
      reason: parsed.data.reason,
      notified: true,
      source: "laerer",
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.code === "23505" ? "duplicate" : error.code === "42501" ? "closed" : "unknown" };
  }

  await writeAudit({
    action: "teacher_absence.report",
    entityType: "teacher_absence",
    entityId: data.id,
    metadata: { guardian_id: teacherId, school_day_id: parsed.data.schoolDayId },
  });
  revalidatePath("/[locale]/min-side", "layout");
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true, id: data.id };
}

export async function withdrawTeacherAbsence(id: string): Promise<PortalActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid" };
  const context = await getPortalContext();
  if (!context.user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_absences")
    .delete()
    .eq("id", id)
    .select("guardian_id, school_day_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "unknown" };
  if (!data) return { ok: false, error: "not_found" };

  await writeAudit({ action: "teacher_absence.withdraw", entityType: "teacher_absence", entityId: id, metadata: data });
  revalidatePath("/[locale]/min-side", "layout");
  revalidatePath("/[locale]/admin", "layout");
  return { ok: true };
}

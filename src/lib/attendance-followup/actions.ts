"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";

const schema = z.object({ id: z.string().uuid(), studentId: z.string().uuid(), classId: z.string().uuid(), yearId: z.string().uuid(),
  endedOn: z.string().date(), action: z.enum(["contacted", "monitor", "resolved", "email"]), note: z.string().trim().max(2000), message: z.string().trim().max(2000) });

export async function recordAbsenceFollowUp(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const value = parsed.data;
  const { error } = await (await createClient()).rpc("record_attendance_followup", {
    p_id: value.id, p_student_id: value.studentId, p_class_id: value.classId, p_year: value.yearId,
    p_ended_on: value.endedOn, p_action: value.action, p_note: value.note, p_message: value.message,
  });
  if (error) {
    console.error("Attendance follow-up failed", { code: error.code });
    return { ok: false as const, changed: error.code === "PT409" };
  }
  if (value.action === "email") scheduleSchoolEmails();
  revalidatePath("/", "layout");
  return { ok: true as const };
}

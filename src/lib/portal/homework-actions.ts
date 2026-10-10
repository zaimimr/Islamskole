"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function respondToHomework(input: { noteId: string; studentId: string; status: string; homeworkVersion: number }) {
  const parsed = z.object({ noteId: z.string().uuid(), studentId: z.string().uuid(), homeworkVersion: z.number().int().positive(), status: z.enum(["not_started", "completed", "needs_help"]) }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { noteId, studentId, status, homeworkVersion } = parsed.data;
  const { error } = await (await createClient()).rpc("record_homework_response", {
    p_note_id: noteId, p_student_id: studentId, p_status: status, p_homework_version: homeworkVersion,
  });
  if (error) {
    console.error("Homework response failed", { code: error.code });
    return { ok: false as const, changed: error.code === "40001" };
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

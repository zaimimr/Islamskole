"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLearningGoals, getLearningHistory } from "./data";
import { learningGoalSchema, learningPageSchema, progressUpdateSchema } from "./schema";
import type { LearningGoalDraft, LearningResult, ProgressUpdateDraft } from "./schema";

function failed(error: { code?: string }): LearningResult {
  if (error.code === "42501") return { ok: false, error: "forbidden" };
  if (error.code === "PT409") return { ok: false, error: "conflict" };
  if (["23514", "23502", "22P02", "22003"].includes(error.code ?? "")) return { ok: false, error: "invalid" };
  console.error("Learning progress save failed", { code: error.code });
  return { ok: false, error: "unavailable" };
}

export async function createLearningGoal(input: LearningGoalDraft): Promise<LearningResult> {
  const parsed = learningGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((issue) => issue.message === "invalid_reference") ? "invalid_reference" : "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  const value = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_learning_goal", {
    p_id: value.id, p_student_id: value.studentId, p_class_id: value.classId,
    p_subject: value.subject, p_title: value.title, p_surah: value.surah,
    p_ayah_from: value.ayahFrom, p_ayah_to: value.ayahTo, p_status: value.status,
    p_feedback: value.feedback, p_next_target: value.nextTarget,
  });
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function recordLearningProgress(input: ProgressUpdateDraft): Promise<LearningResult> {
  const parsed = progressUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  const value = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_learning_progress", {
    p_id: value.id, p_goal_id: value.goalId, p_expected_update_id: value.expectedUpdateId,
    p_status: value.status, p_feedback: value.feedback, p_next_target: value.nextTarget,
  });
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function loadLearningGoals(studentId: string, offset: number) {
  const parsed = learningPageSchema.safeParse({ id: studentId, offset });
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  if (!(await getUser())) return { ok: false as const, error: "forbidden" as const };
  return getLearningGoals(parsed.data.id, parsed.data.offset);
}

export async function loadLearningHistory(goalId: string, offset: number) {
  const parsed = learningPageSchema.safeParse({ id: goalId, offset });
  if (!parsed.success) return { ok: false as const, error: "invalid" as const };
  if (!(await getUser())) return { ok: false as const, error: "forbidden" as const };
  return getLearningHistory(parsed.data.id, parsed.data.offset);
}

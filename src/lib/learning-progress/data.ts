import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LEARNING_PAGE_SIZE } from "./schema";
import type { LearningResult } from "./schema";
import type { LearningGoal, LearningPage, LearningUpdate } from "./types";

export async function getLearningGoals(studentId: string, offset = 0): Promise<LearningResult<LearningPage<LearningGoal>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_goals")
    .select("id, student_id, subject, title, surah, ayah_from, ayah_to, status, feedback, next_target, latest_update_id, updated_at, updated_by_name")
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false }).order("id")
    .range(offset, offset + LEARNING_PAGE_SIZE);
  if (error) {
    console.error("Learning goals load failed", { code: error.code });
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, data: { rows: (data ?? []).slice(0, LEARNING_PAGE_SIZE), hasMore: (data?.length ?? 0) > LEARNING_PAGE_SIZE } };
}

export async function getLearningHistory(goalId: string, offset = 0): Promise<LearningResult<LearningPage<LearningUpdate>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_progress_updates")
    .select("id, goal_id, status, feedback, next_target, teacher_name, created_at")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false }).order("id")
    .range(offset, offset + LEARNING_PAGE_SIZE);
  if (error) {
    console.error("Learning history load failed", { code: error.code });
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, data: { rows: (data ?? []).slice(0, LEARNING_PAGE_SIZE), hasMore: (data?.length ?? 0) > LEARNING_PAGE_SIZE } };
}

export async function getLearningClassStudents(classId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_class_students", { p_class_id: classId });
  if (error) {
    console.error("Learning class students load failed", { code: error.code });
    return { ok: false as const, error: "unavailable" as const };
  }
  return { ok: true as const, data: data ?? [] };
}

import type { Database } from "@/lib/supabase/types";

export type LearningGoal = Omit<Database["public"]["Tables"]["learning_goals"]["Row"], "created_by" | "created_at">;
export type LearningUpdate = Omit<Database["public"]["Tables"]["learning_progress_updates"]["Row"], "recorded_by" | "student_id">;
export type LearningPage<T> = { rows: T[]; hasMore: boolean };

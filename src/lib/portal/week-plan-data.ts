import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WeekPlanEntry } from "@/lib/semester-plan";

export async function getWeekPlans(classId: string, schoolYearId: string): Promise<WeekPlanEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_week_plans")
    .select("id, class_id, school_year_id, week_start, start_position, end_position, subject, title, description, goals, completed_at, resource_url, sort_order, updated_at")
    .eq("class_id", classId)
    .eq("school_year_id", schoolYearId)
    .order("week_start", { ascending: true });
  if (error) {
    console.error("class_week_plans failed", error);
    return [];
  }
  return data ?? [];
}

export async function getClassBlocks(classId: string, schoolYearId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_slot_plans")
    .select("start_position, end_position, subject")
    .eq("class_id", classId)
    .eq("school_year_id", schoolYearId)
    .order("start_position", { ascending: true });
  if (error) console.error("class_slot_plans failed", error);
  return data ?? [];
}

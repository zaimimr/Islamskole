import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type LessonMaterial = Database["public"]["Tables"]["lesson_materials"]["Row"];

export async function getLessonMaterials(classId: string, schoolYearId: string, lessonId?: string, includeUploads = false) {
  const supabase = await createClient();
  let query = supabase.from("lesson_materials").select("*")
    .eq("class_id", classId).eq("school_year_id", schoolYearId)
    .order("created_at", { ascending: false });
  if (lessonId) query = query.or(`lesson_id.is.null,lesson_id.eq.${lessonId}`);
  if (!includeUploads) query = query.eq("status", "ready");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

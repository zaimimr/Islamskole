import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function countCopyableAssignments(activeYearId: string | null | undefined) {
  if (!activeYearId) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("class_teachers")
    .select("class_id, guardians!inner(person_roles!inner(role_key))", { count: "exact", head: true })
    .eq("school_year_id", activeYearId)
    .eq("guardians.person_roles.role_key", "teacher");
  if (error) console.error("class_teachers count failed", error);
  return count ?? 0;
}

"use server";

import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { toUserError } from "@/lib/action-errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateStudentLoginEmail(
  studentId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  const raw = formData.get("child_email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email && !emailPattern.test(email)) {
    return { ok: false, error: "Skriv inn en gyldig e-postadresse" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ child_email: email || null })
    .eq("id", studentId);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "student.update",
    entityType: "students",
    entityId: studentId,
    metadata: { fields: ["child_email"] },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

"use server";

import { hasAdminRole } from "@/lib/impersonation/constants";

import { revalidatePath } from "next/cache";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toUserError } from "@/lib/action-errors";
import { findAuthUserId } from "@/lib/login-link";

type ActionResult = { ok: true } | { ok: false; error: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loginToMove(guardianId: string, oldEmail: string, newEmail: string) {
  const admin = createAdminClient();
  const pattern = oldEmail.replace(/[\\%_]/g, "\\$&");
  const [others, students] = await Promise.all([
    admin.from("guardians").select("email").neq("id", guardianId).ilike("email", pattern),
    admin.from("students").select("child_email").ilike("child_email", pattern),
  ]);
  if (others.error || students.error) return null;
  if ((others.data ?? []).some((row) => row.email?.trim().toLowerCase() === oldEmail)) return null;
  if ((students.data ?? []).some((row) => row.child_email?.trim().toLowerCase() === oldEmail)) {
    return null;
  }

  const userId = await findAuthUserId(oldEmail);
  if (!userId) return null;
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error || hasAdminRole(profile?.role)) return null;
  if (await findAuthUserId(newEmail)) return null;
  return userId;
}

async function setLoginEmail(userId: string, email: string) {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  return error;
}

export async function updateTeacher(formData: FormData): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };

  const guardianId = read(formData, "guardian_id");
  if (!guardianId) return { ok: false, error: "Mangler lærer" };
  const firstName = read(formData, "first_name");
  const lastName = read(formData, "last_name");
  const email = read(formData, "email").toLowerCase() || null;
  const phone = read(formData, "phone") || null;
  const teacherNote = read(formData, "teacher_note") || null;

  if (!firstName && !lastName) return { ok: false, error: "Navn er påkrevd" };
  if (email && !emailPattern.test(email)) {
    return { ok: false, error: "Skriv inn en gyldig e-postadresse" };
  }

  const supabase = await createClient();
  const { data: before, error: lookupError } = await supabase
    .from("guardians")
    .select("first_name, last_name, email, phone, teacher_note")
    .eq("id", guardianId)
    .maybeSingle();
  if (lookupError) return { ok: false, error: toUserError(lookupError) };
  if (!before) return { ok: false, error: "Fant ikke læreren" };

  const next = {
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    phone,
    teacher_note: teacherNote,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
    (key) => (before[key] ?? null) !== next[key],
  );
  if (!changed.length) return { ok: true };

  const oldEmail = before.email?.trim().toLowerCase();
  let movedUserId: string | null = null;
  if (email && oldEmail && oldEmail !== email) {
    try {
      movedUserId = await loginToMove(guardianId, oldEmail, email);
    } catch (lookupFailure) {
      console.error("teacher login lookup failed", lookupFailure);
      return { ok: false, error: "Kunne ikke sjekke innloggingen. Ingenting er endret." };
    }
    if (movedUserId) {
      const moveError = await setLoginEmail(movedUserId, email);
      if (moveError) {
        console.error("teacher login email move failed", moveError);
        return {
          ok: false,
          error: "Kunne ikke flytte innloggingen til den nye e-postadressen. Ingenting er endret.",
        };
      }
    }
  }

  const { error } = await supabase.from("guardians").update(next).eq("id", guardianId);
  if (error) {
    if (movedUserId && oldEmail) {
      const rollbackError = await setLoginEmail(movedUserId, oldEmail);
      if (rollbackError) console.error("teacher login email rollback failed", rollbackError);
    }
    return { ok: false, error: toUserError(error) };
  }

  await writeAudit({
    action: "teacher.updated",
    entityType: "guardians",
    entityId: guardianId,
    metadata: { fields: changed },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setTeacherSuspended(
  guardianId: string,
  suspended: boolean,
  reason?: string,
): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!guardianId) return { ok: false, error: "Mangler lærer" };
  const trimmedReason = reason?.trim() ?? "";
  if (suspended && !trimmedReason) {
    return { ok: false, error: "Skriv en grunn for suspensjonen" };
  }

  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardians")
    .update(
      suspended
        ? {
            teacher_suspended_at: new Date().toISOString(),
            teacher_suspended_reason: trimmedReason,
            teacher_suspended_by: user?.email ?? null,
          }
        : {
            teacher_suspended_at: null,
            teacher_suspended_reason: null,
            teacher_suspended_by: null,
          },
    )
    .eq("id", guardianId)
    .eq("is_teacher", true)
    .select("id");
  if (error) return { ok: false, error: toUserError(error) };
  if (!data?.length) return { ok: false, error: "Fant ikke læreren" };

  await writeAudit({
    action: suspended ? "teacher.suspended" : "teacher.unsuspended",
    entityType: "guardians",
    entityId: guardianId,
    metadata: suspended ? { reason: trimmedReason } : {},
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

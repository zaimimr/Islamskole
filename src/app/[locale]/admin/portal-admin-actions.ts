"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIsAdmin, getUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { toUserError } from "@/lib/action-errors";
import { isPlaceholderEmail } from "@/lib/portal/emails";
import { sendLoginLink } from "@/lib/login-link";

type ActionResult =
  | { ok: true; id?: string; count?: number }
  | { ok: false; error: string };

type Denied = { ok: false; error: string };

const uuid = z.string().uuid();

async function requireAdmin(): Promise<Denied | null> {
  if (await getIsAdmin()) return null;
  const user = await getUser();
  return {
    ok: false,
    error: user
      ? "Kontoen din har ikke tilgang til å gjøre dette."
      : "Du er logget ut. Logg inn på nytt og prøv igjen.",
  };
}

function revalidate() {
  revalidatePath("/", "layout");
}

async function activeSchoolYearId() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function assignTeacher(
  classId: string,
  guardianId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(classId).success || !uuid.safeParse(guardianId).success) {
    return { ok: false, error: "Velg en lærer." };
  }

  const schoolYearId = await activeSchoolYearId();
  if (!schoolYearId) return { ok: false, error: "Ingen aktivt skoleår." };

  const supabase = await createClient();
  const { data: teacherRole } = await supabase
    .from("person_roles")
    .select("suspended_at")
    .eq("guardian_id", guardianId)
    .eq("role_key", "teacher")
    .maybeSingle();
  if (!teacherRole) {
    return { ok: false, error: "Personen er ikke registrert som lærer." };
  }
  if (teacherRole.suspended_at) {
    return { ok: false, error: "Læreren er suspendert og kan ikke knyttes til en klasse." };
  }

  const { error } = await supabase.from("class_teachers").insert({
    class_id: classId,
    guardian_id: guardianId,
    school_year_id: schoolYearId,
  });
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Læreren er allerede knyttet til klassen."
          : toUserError(error),
    };
  }

  await writeAudit({
    action: "class_teacher.assign",
    entityType: "class_teacher",
    entityId: classId,
    metadata: { guardian_id: guardianId, school_year_id: schoolYearId },
  });
  revalidate();
  return { ok: true };
}

export async function removeTeacher(
  classId: string,
  guardianId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(classId).success || !uuid.safeParse(guardianId).success) {
    return { ok: false, error: "Ugyldig lærer." };
  }

  const schoolYearId = await activeSchoolYearId();
  if (!schoolYearId) return { ok: false, error: "Ingen aktivt skoleår." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_teachers")
    .delete()
    .eq("class_id", classId)
    .eq("guardian_id", guardianId)
    .eq("school_year_id", schoolYearId);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "class_teacher.remove",
    entityType: "class_teacher",
    entityId: classId,
    metadata: { guardian_id: guardianId, school_year_id: schoolYearId },
  });
  revalidate();
  return { ok: true };
}

export async function setSchoolDayCancelled(
  schoolDayId: string,
  cancelled: boolean,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(schoolDayId).success) {
    return { ok: false, error: "Ugyldig skoledag." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_days")
    .update({ cancelled })
    .eq("id", schoolDayId)
    .select("id, date, school_year_id")
    .maybeSingle();
  if (error) return { ok: false, error: toUserError(error) };
  if (!data) return { ok: false, error: "Fant ikke skoledagen." };

  await writeAudit({
    action: cancelled ? "school_day.cancel" : "school_day.uncancel",
    entityType: "school_day",
    entityId: data.id,
    metadata: { date: data.date, school_year_id: data.school_year_id },
  });
  revalidate();
  return { ok: true, id: data.id };
}

export async function generateSchoolDays(
  schoolYearId: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(schoolYearId).success) {
    return { ok: false, error: "Ugyldig skoleår." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_school_days", {
    p_school_year_id: schoolYearId,
  });
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "school_day.generate",
    entityType: "school_year",
    entityId: schoolYearId,
    metadata: { created: data ?? 0 },
  });
  revalidate();
  return { ok: true, count: data ?? 0 };
}

export async function sendLoginLinkToGuardian(
  guardianId: string,
  locale = "no",
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!uuid.safeParse(guardianId).success) {
    return { ok: false, error: "Ugyldig foresatt." };
  }

  const admin = createAdminClient();
  const { data: guardian, error: lookupError } = await admin
    .from("guardians")
    .select("id, email")
    .eq("id", guardianId)
    .maybeSingle();
  if (lookupError) return { ok: false, error: toUserError(lookupError) };
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .safeParse(guardian?.email ?? "");
  if (!guardian || !parsed.success || isPlaceholderEmail(parsed.data)) {
    return { ok: false, error: "Foresatt mangler gyldig e-post." };
  }
  const email = parsed.data;

  const sent = await sendLoginLink({ email, locale: locale === "en" ? "en" : "no" });
  if (!sent.ok) return sent;

  await writeAudit({
    action: "portal.login_link_sent",
    entityType: "guardian",
    entityId: guardian.id,
    metadata: { email },
  });
  return { ok: true };
}

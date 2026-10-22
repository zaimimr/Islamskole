"use server";

import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { toUserError } from "@/lib/action-errors";
import { createStudentFromApplication } from "@/app/[locale]/admin/students-actions";

type AdmitItem = { applicationId: string; classId: string | null };

type AdmitResult =
  | {
      ok: true;
      admitted: number;
      failed: { applicationId: string; error: string }[];
    }
  | { ok: false; error: string };

export async function admitApplications(
  items: AdmitItem[],
  schoolYearId: string | null,
): Promise<AdmitResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Ingen innmeldinger valgt" };
  }
  if (items.length > 100) {
    return { ok: false, error: "Velg maks 100 innmeldinger om gangen" };
  }

  let admitted = 0;
  const failed: { applicationId: string; error: string }[] = [];
  for (const item of items) {
    try {
      const result = await createStudentFromApplication(item.applicationId, {
        classId: item.classId,
        schoolYearId: item.classId ? schoolYearId : null,
      });
      if (result.ok) {
        admitted += 1;
      } else {
        failed.push({ applicationId: item.applicationId, error: result.error });
      }
    } catch {
      failed.push({
        applicationId: item.applicationId,
        error: "Noe gikk galt. Prøv igjen.",
      });
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, admitted, failed };
}

export async function markApplicationsAsSpam(
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Ingen innmeldinger valgt" };
  }

  const supabase = await createClient();
  const { data: converted } = await supabase
    .from("students")
    .select("application_id")
    .in("application_id", ids);
  const blocked = new Set(
    ((converted as { application_id: string | null }[] | null) ?? [])
      .map((row) => row.application_id)
      .filter(Boolean),
  );
  const targets = ids.filter((id) => !blocked.has(id));
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Innmeldinger som allerede er registrert som elever kan ikke merkes som spam",
    };
  }

  const { error } = await supabase
    .from("student_applications")
    .update({ status: "arkivert" } as never)
    .in("id", targets);
  if (error) return { ok: false, error: toUserError(error) };

  await writeAudit({
    action: "application.spam",
    entityType: "student_applications",
    entityId: targets.length === 1 ? targets[0] : undefined,
    metadata: { count: targets.length, ids: targets, status: "arkivert" },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

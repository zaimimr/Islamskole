"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleSchoolEmails } from "./delivery";

export async function processSchoolEmailQueue() {
  if (!(await getIsAdmin())) return { ok: false };
  await writeAudit({ action: "school_email.process", entityType: "school_email_deliveries" });
  scheduleSchoolEmails();
  return { ok: true };
}

export async function retrySchoolEmail(id: string) {
  if (!z.string().uuid().safeParse(id).success || !(await getIsAdmin())) return { ok: false };
  const { data, error } = await createAdminClient().from("school_email_deliveries")
    .update({ status: "pending", attempts: 0, last_error: null }).eq("id", id).eq("status", "failed")
    .select("family_id").maybeSingle();
  if (error || !data) return { ok: false };
  await writeAudit({ action: "school_email.retry", entityType: "school_email_deliveries", entityId: id });
  scheduleSchoolEmails(data.family_id ?? undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";

const id = z.string().uuid();
const version = z.string().datetime({ offset: true });
const draft = z.object({ id, expected: version, summary: z.string().trim().max(6000), nextSteps: z.string().trim().max(4000), refresh: z.boolean() });

export async function prepareReport(input: { studentId: string; yearId: string; term: string }) {
  const parsed = z.object({ studentId: id, yearId: id, term: z.enum(["autumn", "spring"]) }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { data, error } = await (await createClient()).rpc("prepare_term_report", {
    p_student_id: parsed.data.studentId, p_year: parsed.data.yearId, p_term: parsed.data.term,
  });
  if (error) {
    console.error("Prepare report failed", { code: error.code });
    return { ok: false as const };
  }
  return { ok: true as const, report: data };
}

export async function saveReport(input: z.infer<typeof draft>) {
  const parsed = draft.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { data, error } = await (await createClient()).rpc("save_term_report", {
    p_id: parsed.data.id, p_expected: parsed.data.expected, p_summary: parsed.data.summary,
    p_next_steps: parsed.data.nextSteps, p_refresh: parsed.data.refresh,
  });
  if (error) {
    console.error("Save report failed", { code: error.code });
    return { ok: false as const, changed: error.code === "PT409" };
  }
  revalidatePath("/", "layout");
  return { ok: true as const, report: data };
}

export async function publishReport(input: { id: string; expected: string; requestId: string }) {
  const parsed = z.object({ id, expected: version, requestId: id }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { data, error } = await (await createClient()).rpc("publish_term_report", {
    p_id: parsed.data.id, p_expected: parsed.data.expected, p_request_id: parsed.data.requestId,
  });
  if (error) {
    console.error("Publish report failed", { code: error.code });
    return { ok: false as const, changed: error.code === "PT409" };
  }
  scheduleSchoolEmails();
  revalidatePath("/", "layout");
  return { ok: true as const, publicationId: data };
}

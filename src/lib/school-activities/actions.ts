"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scheduleSchoolEmails } from "@/lib/school-emails/delivery";

const id = z.string().uuid();
const version = z.string().datetime({ offset: true });
const activity = z.object({ id, classId: id, yearId: id, expected: version.nullable(), title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000), consent: z.string().trim().min(1).max(4000), date: z.string().date(), respondBy: z.string().date() });

export async function saveActivity(input: z.infer<typeof activity>) {
  const parsed = activity.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const value = parsed.data;
  const { data, error } = await (await createClient()).rpc("save_school_activity", { p_id: value.id, p_class_id: value.classId, p_year: value.yearId,
    p_expected: value.expected, p_title: value.title, p_description: value.description, p_consent: value.consent, p_date: value.date, p_respond_by: value.respondBy });
  if (error) { console.error("Save activity failed", { code: error.code }); return { ok: false as const, code: error.code }; }
  revalidatePath("/", "layout");
  return { ok: true as const, activity: data };
}

export async function changeActivity(input: { id: string; expected: string; action: string }) {
  const parsed = z.object({ id, expected: version, action: z.enum(["publish", "cancel", "add_students"]) }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const client = await createClient();
  const args = { p_id: parsed.data.id, p_expected: parsed.data.expected };
  const { error } = parsed.data.action === "add_students" ? await client.rpc("add_activity_students", { p_id: parsed.data.id })
    : parsed.data.action === "publish" ? await client.rpc("publish_school_activity", args) : await client.rpc("cancel_school_activity", args);
  if (error) { console.error("Change activity failed", { code: error.code }); return { ok: false as const, code: error.code }; }
  scheduleSchoolEmails();
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function respondActivity(input: { requestId: string; activityId: string; studentId: string; expected: string; consent: string; going: boolean; healthConfirmed?: boolean }) {
  const parsed = z.object({ requestId: id, activityId: id, studentId: id, expected: version, consent: z.enum(["granted", "declined"]), going: z.boolean(), healthConfirmed: z.boolean().optional() }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const value = parsed.data;
  const { error } = await (await createClient()).rpc("respond_school_activity", { p_request_id: value.requestId, p_id: value.activityId,
    p_student: value.studentId, p_expected: value.expected, p_consent: value.consent, p_going: value.going, p_health_confirmed: value.healthConfirmed ?? false });
  if (error) { console.error("Activity response failed", { code: error.code }); return { ok: false as const, code: error.code }; }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function markActivityParticipation(input: { activityId: string; studentId: string; participation: string }) {
  const parsed = z.object({ activityId: id, studentId: id, participation: z.enum(["unrecorded", "participated", "absent"]) }).safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { error } = await (await createClient()).rpc("record_activity_participation", { p_id: parsed.data.activityId, p_student: parsed.data.studentId, p_participation: parsed.data.participation });
  if (error) { console.error("Activity participation failed", { code: error.code }); return { ok: false as const }; }
  revalidatePath("/", "layout");
  return { ok: true as const };
}

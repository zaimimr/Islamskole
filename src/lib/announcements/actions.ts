"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { announcementEmailAvailable, deliverAnnouncementEmails } from "@/lib/announcements/delivery";
import { announcementSchema, type AnnouncementDraft, type AnnouncementResult, type Audience } from "@/lib/announcements/schema";

function failure(error: { code?: string } | null): AnnouncementResult<never> {
  if (error?.code === "42501") return { ok: false, error: "forbidden" };
  if (error?.code === "23514") return { ok: false, error: "no_recipients" };
  console.error("Announcement action failed", error);
  return { ok: false, error: "unavailable" };
}

function queueDelivery(id: string) {
  after(async () => {
    try {
      await deliverAnnouncementEmails(id);
    } catch (error) {
      console.error("Announcement queue processing failed", { announcementId: id, error });
    }
  });
}

export async function previewAnnouncementAudience(classId: string | null): Promise<AnnouncementResult<Audience>> {
  if (!z.string().uuid().nullable().safeParse(classId).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  const client = await createClient();
  const { data, error } = await client.rpc("announcement_audience", { p_class_id: classId ?? undefined });
  if (error || !data?.[0]) return failure(error);
  if (!data[0].family_count) return { ok: false, error: "no_recipients" };
  return { ok: true, data: data[0] };
}

export async function publishAnnouncement(input: AnnouncementDraft): Promise<AnnouncementResult<string>> {
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  if (parsed.data.emailEnabled && !(await announcementEmailAvailable())) return { ok: false, error: "email_unavailable" };
  const client = await createClient();
  const { data, error } = await client.rpc("publish_announcement", {
    p_id: parsed.data.id,
    p_class_id: parsed.data.classId!,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_email_enabled: parsed.data.emailEnabled,
    p_requires_acknowledgement: parsed.data.requiresAcknowledgement,
  });
  if (error || !data) return failure(error);
  if (parsed.data.emailEnabled) queueDelivery(data);
  revalidatePath("/", "layout");
  return { ok: true, data };
}

export async function acknowledgeAnnouncement(id: string, familyId: string): Promise<AnnouncementResult> {
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(familyId).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  const client = await createClient();
  const { error } = await client.rpc("acknowledge_announcement", { p_id: id, p_family_id: familyId });
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function retryAnnouncementEmails(id: string): Promise<AnnouncementResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "forbidden" };
  if (!(await announcementEmailAvailable())) return { ok: false, error: "email_unavailable" };
  const client = await createClient();
  const { error } = await client.rpc("retry_announcement_emails", { p_id: id });
  if (error) return failure(error);
  queueDelivery(id);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

import "server-only";
import { emailNotifications } from "@/flags";
import { sendAnnouncementEmails, type AnnouncementEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["announcement_deliveries"]["Row"];
type AdminClient = ReturnType<typeof createAdminClient>;
const DELIVERY_WINDOW_MS = 40_000;

export async function announcementEmailAvailable() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return Boolean(
    siteUrl && /^https?:\/\//.test(siteUrl) &&
    (process.env.EMAIL_OUTBOX_DIR || process.env.RESEND_API_KEY) &&
    await emailNotifications(),
  );
}

async function emailBatch(admin: AdminClient, deliveries: Delivery[], available: boolean) {
  if (!available) return deliveries.map(() => false);
  const ids = [...new Set(deliveries.map((delivery) => delivery.announcement_id))];
  const { data, error } = await admin.from("school_announcements")
    .select("id, title, body, requires_acknowledgement").in("id", ids);
  if (error) throw new Error("Could not load announcement email content", { cause: error });
  const emails: AnnouncementEmail[] = deliveries.map((delivery) => {
    const announcement = data?.find((row) => row.id === delivery.announcement_id);
    if (!announcement) throw new Error("Announcement email content not found");
    const lang = delivery.language === "en" ? "en" : "no";
    return {
      to: delivery.email, lang, title: announcement.title, body: announcement.body,
      requiresAcknowledgement: announcement.requires_acknowledgement,
      url: `${process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, "")}/${lang}/min-side/beskjeder/${delivery.announcement_id}`,
    };
  });
  return sendAnnouncementEmails(emails, deliveries[0].batch_id!);
}

export async function deliverAnnouncementEmails(announcementId?: string) {
  const admin = createAdminClient();
  const available = await announcementEmailAvailable();
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  while (Date.now() - started < DELIVERY_WINDOW_MS) {
    const { data, error } = await admin.rpc("claim_announcement_emails", {
      ...(announcementId ? { p_id: announcementId } : {}), p_limit: 50,
    });
    if (error) throw new Error("Could not claim announcement email", { cause: error });
    if (!data?.length) break;
    const deliveries = [...data].sort((left, right) => left.id.localeCompare(right.id));
    let results: boolean[];
    try {
      results = await emailBatch(admin, deliveries, available);
    } catch (error) {
      console.error("Announcement email failed", { batchId: deliveries[0].batch_id, error });
      results = deliveries.map(() => false);
    }
    const failedIds = deliveries.filter((_, index) => !results[index]).map((delivery) => delivery.id);
    const { error: updateError } = await admin.rpc("finish_announcement_email_batch", {
      p_batch_id: deliveries[0].batch_id!, p_attempted_at: deliveries[0].attempted_at!, p_failed_ids: failedIds,
      p_error: available ? "Email provider did not accept delivery" : "Announcement email is disabled or not configured",
    });
    if (updateError) throw new Error("Could not record announcement email batch", { cause: updateError });
    sent += deliveries.length - failedIds.length;
    failed += failedIds.length;
    if (!process.env.EMAIL_OUTBOX_DIR) await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { sent, failed };
}

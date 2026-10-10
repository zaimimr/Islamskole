import "server-only";
import { after } from "next/server";
import { emailNotifications } from "@/flags";
import { sendSchoolNotification } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { schoolEmailContent } from "./content";
import { schoolDeliveryContent, type SchoolDelivery } from "./data";

function configuredSiteUrl() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

async function deliverOne(delivery: SchoolDelivery, siteUrl: string) {
  const admin = createAdminClient();
  let status: "sent" | "failed" | "skipped" = "failed";
  try {
    const input = await schoolDeliveryContent(admin, delivery);
    if (!input) status = "skipped";
    else {
      const content = schoolEmailContent(input);
      const sent = await sendSchoolNotification({
        to: delivery.email, lang: input.locale, subject: content.subject, title: content.title,
        intro: content.intro, rows: content.rows, note: content.note,
        cta: content.href ? { label: content.ctaLabel, url: `${siteUrl}${content.href.startsWith("/api/") ? "" : `/${input.locale}`}${content.href}` } : undefined,
        idempotencyKey: `school-email/${delivery.id}`,
      });
      status = sent ? "sent" : "failed";
    }
  } catch (error) {
    console.error("School email delivery failed", { deliveryId: delivery.id, error });
  }
  const { error } = await admin.rpc("finish_school_email", {
    p_id: delivery.id, p_attempted_at: delivery.attempted_at!, p_status: status,
    ...(status === "failed" ? { p_error: "Email could not be sent. Retry delivery." } : {}),
  });
  if (error) throw new Error("Could not record school email delivery", { cause: error });
  return status;
}

export async function deliverSchoolEmails(familyId?: string, deadline = Date.now() + 40_000) {
  const siteUrl = configuredSiteUrl();
  if (!siteUrl || !(process.env.EMAIL_OUTBOX_DIR || process.env.RESEND_API_KEY) || !(await emailNotifications())) {
    return { sent: 0, failed: 0, skipped: 0, disabled: true };
  }
  const admin = createAdminClient();
  const counts = { sent: 0, failed: 0, skipped: 0, disabled: false };
  const batchSize = process.env.EMAIL_OUTBOX_DIR ? 20 : 1;
  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("claim_school_emails", { p_limit: batchSize, ...(familyId ? { p_family_id: familyId } : {}) });
    if (error) throw new Error("Could not claim school email delivery", { cause: error });
    for (const delivery of data) {
      counts[await deliverOne(delivery, siteUrl)] += 1;
      if (!process.env.EMAIL_OUTBOX_DIR) await new Promise((resolve) => setTimeout(resolve, 550));
    }
    if (data.length < batchSize) break;
  }
  return counts;
}

export function scheduleSchoolEmails(familyId?: string) {
  after(async () => {
    try {
      await deliverSchoolEmails(familyId);
    } catch (error) {
      console.error("School email processing failed", error);
    }
  });
}

import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type EmailLogInput = { to: string | string[]; subject: string; lang: "no" | "en" };

export async function startEmailLogs(messages: EmailLogInput[]) {
  if (!messages.length) return [];
  const rows = messages.map((message) => ({
    id: randomUUID(),
    recipients: (Array.isArray(message.to) ? message.to : [message.to]).map((email) => email.trim().toLowerCase()),
    subject: message.subject,
    locale: message.lang,
    transport: process.env.EMAIL_OUTBOX_DIR ? "outbox" : "resend",
  }));
  try {
    const { error } = await createAdminClient().from("email_send_logs").insert(rows);
    if (error) throw error;
    return rows.map((row) => row.id);
  } catch {
    console.error("Could not start email send log");
    return null;
  }
}

export async function finishEmailLog(id: string, status: "sent" | "failed" | "disabled", providerId?: string) {
  try {
    const { error } = await createAdminClient().from("email_send_logs").update({
      status, completed_at: new Date().toISOString(), provider_id: providerId ?? null,
    }).eq("id", id).eq("status", "sending");
    if (error) throw error;
  } catch {
    console.error("Could not complete email send log", { id });
  }
}

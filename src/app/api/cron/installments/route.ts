import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDueInstallmentBatches } from "@/lib/payment-plans";
import { sendInstallmentBatch } from "@/lib/installment-billing";
import { deliverSchoolEmails } from "@/lib/school-emails/delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEAD_DAYS = 14;
const MAX_BATCHES_PER_RUN = 20;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

type Admin = ReturnType<typeof createAdminClient>;

async function sendBatches(admin: Admin) {
  const batches = await findDueInstallmentBatches(admin, {
    leadDays: LEAD_DAYS,
    limit: MAX_BATCHES_PER_RUN,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const batch of batches) {
    try {
      const outcome = await sendInstallmentBatch(admin, batch);
      if (outcome === "sent") sent += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error("Installment batch send failed", {
        planId: batch.planId,
        dueDate: batch.dueDate,
        error,
      });
    }
  }

  return { sent, skipped, failed };
}

export async function GET(request: NextRequest) {
  const deadline = Date.now() + 40_000;
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!siteUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SITE_URL missing" },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const batchResult = await sendBatches(admin);
  const { error } = await admin.rpc("queue_overdue_payment_emails");
  if (error) throw new Error("Could not queue payment reminders", { cause: error });
  const reminderResult = await deliverSchoolEmails(undefined, deadline);

  return NextResponse.json({
    ok: true,
    ...batchResult,
    email: reminderResult,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { deliverSchoolEmails } from "@/lib/school-emails/delivery";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const deadline = Date.now() + 40_000;
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("queue_overdue_payment_emails");
    if (error) throw error;
    const { error: activityError } = await admin.rpc("queue_activity_reminders");
    if (activityError) throw activityError;
    return NextResponse.json(await deliverSchoolEmails(undefined, deadline));
  } catch (error) {
    console.error("School email cron failed", error);
    return NextResponse.json({ error: "Could not process school emails" }, { status: 500 });
  }
}

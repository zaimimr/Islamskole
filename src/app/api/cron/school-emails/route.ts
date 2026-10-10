import { NextRequest, NextResponse } from "next/server";
import { deliverSchoolEmails } from "@/lib/school-emails/delivery";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { error } = await createAdminClient().rpc("queue_overdue_payment_emails");
    if (error) throw error;
    return NextResponse.json(await deliverSchoolEmails());
  } catch (error) {
    console.error("School email cron failed", error);
    return NextResponse.json({ error: "Could not process school emails" }, { status: 500 });
  }
}

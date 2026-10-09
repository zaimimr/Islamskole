import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { deliverAnnouncementEmails } from "@/lib/announcements/delivery";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const token = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || token.length !== expected.length || !timingSafeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...await deliverAnnouncementEmails() });
  } catch (error) {
    console.error("Announcement cron failed", error);
    return NextResponse.json({ error: "Announcement delivery unavailable" }, { status: 503 });
  }
}

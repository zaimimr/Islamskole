import { z } from "zod";

export const announcementSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  emailEnabled: z.boolean(),
  requiresAcknowledgement: z.boolean(),
});

export type AnnouncementDraft = z.infer<typeof announcementSchema>;
export type AnnouncementError = "invalid" | "forbidden" | "unavailable" | "no_recipients" | "email_unavailable";
export type AnnouncementResult<T = undefined> = { ok: true; data: T } | { ok: false; error: AnnouncementError };
export type Audience = { family_count: number; email_count: number; missing_email_count: number };

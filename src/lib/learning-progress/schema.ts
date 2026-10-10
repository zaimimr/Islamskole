import { z } from "zod";

export const LEARNING_SUBJECTS = ["quran", "arabic", "islam"] as const;
export const LEARNING_STATUSES = ["practising", "achieved", "needs_revision"] as const;
export const LEARNING_PAGE_SIZE = 20;

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
const ayah = z.number().int().positive().max(2147483647).nullable();

export const progressUpdateSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  expectedUpdateId: z.string().uuid(),
  status: z.enum(LEARNING_STATUSES),
  feedback: optionalText(2000),
  nextTarget: optionalText(1000),
});

export const learningGoalSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  subject: z.enum(LEARNING_SUBJECTS),
  title: z.string().trim().min(1).max(200),
  surah: optionalText(120),
  ayahFrom: ayah,
  ayahTo: ayah,
  status: z.enum(LEARNING_STATUSES),
  feedback: optionalText(2000),
  nextTarget: optionalText(1000),
}).refine((value) => {
  if (value.subject !== "quran") return value.surah === null && value.ayahFrom === null && value.ayahTo === null;
  if (value.ayahFrom === null && value.ayahTo === null) return true;
  return value.surah !== null && value.ayahFrom !== null && value.ayahTo !== null && value.ayahTo >= value.ayahFrom;
}, { path: ["surah"], message: "invalid_reference" });

export const learningPageSchema = z.object({ id: z.string().uuid(), offset: z.number().int().min(0).max(100000) });

export type LearningGoalDraft = z.infer<typeof learningGoalSchema>;
export type ProgressUpdateDraft = z.infer<typeof progressUpdateSchema>;
export type LearningError = "invalid" | "invalid_reference" | "forbidden" | "conflict" | "unavailable";
export type LearningResult<T = undefined> = { ok: true; data: T } | { ok: false; error: LearningError };

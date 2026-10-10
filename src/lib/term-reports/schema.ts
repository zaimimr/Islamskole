import { z } from "zod";

export const reportSnapshotSchema = z.object({
  studentName: z.string(), yearLabel: z.string(), term: z.string(),
  periodStart: z.string(), periodEnd: z.string(), generatedAt: z.string(),
  summary: z.string().optional(), nextSteps: z.string().optional(),
  attendance: z.object({ total: z.number(), present: z.number(), late: z.number(), reportedAbsent: z.number(), absent: z.number(), unrecorded: z.number() }),
  goals: z.array(z.object({ id: z.string(), subject: z.string(), title: z.string(), status: z.string(),
    feedback: z.string().nullable(), next_target: z.string().nullable(), surah: z.string().nullable(),
    ayah_from: z.number().nullable(), ayah_to: z.number().nullable(), teacher_name: z.string() })),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

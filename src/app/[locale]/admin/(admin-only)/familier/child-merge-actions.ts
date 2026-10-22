"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIsAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toUserError } from "@/lib/action-errors";

const requestSchema = z.object({
  keepId: z.uuid(),
  sourceId: z.uuid(),
  sourceType: z.enum(["student", "application"]),
  token: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
});

const previewSchema = z.object({
  token: z.string(),
  keepName: z.string(),
  otherName: z.string(),
  conflicts: z.array(z.string()),
  fields: z.array(
    z.object({ field: z.string(), kept: z.string(), other: z.string() }),
  ),
  finances: z.array(
    z.object({
      year: z.string(),
      owed: z.number(),
      paid: z.number(),
      remaining: z.number(),
    }),
  ),
  classes: z.array(z.object({ year: z.string(), class: z.string() })),
  merged: z.boolean().optional(),
});

export type ChildMergePreview = z.infer<typeof previewSchema>;
export type ChildMergeRequest = z.infer<typeof requestSchema>;
type Result =
  { ok: true; preview: ChildMergePreview } | { ok: false; error: string };

export async function reviewChildMerge(
  request: ChildMergeRequest,
): Promise<Result> {
  if (!(await getIsAdmin())) return { ok: false, error: "Ikke autorisert" };
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success)
    return { ok: false, error: "Velg barna som skal slås sammen." };
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_merge_children", {
    p_keep: input.keepId,
    p_student: input.sourceType === "student" ? input.sourceId : undefined,
    p_application:
      input.sourceType === "application" ? input.sourceId : undefined,
    p_confirm: Boolean(input.token),
    p_expected: input.token,
  });
  if (error) return { ok: false, error: toUserError(error) };
  const preview = previewSchema.safeParse(data);
  if (!preview.success)
    return { ok: false, error: "Kunne ikke lese resultatet. Oppdater siden." };
  if (input.token) revalidatePath("/", "layout");
  return { ok: true, preview: preview.data };
}

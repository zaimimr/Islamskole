"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { copyableEntries, missingInWeek, type WeekPlanDraft } from "@/lib/semester-plan";
import { createClient } from "@/lib/supabase/server";
import type { PortalErrorCode } from "@/lib/portal/types";

export type WeekPlanResult = { ok: true; id?: string; count?: number } | { ok: false; error: PortalErrorCode };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const draftSchema = z
  .object({
    start_position: z.number().int().min(1).nullable(),
    end_position: z.number().int().min(1).nullable(),
    subject: optional(120),
    title: z.string().trim().min(1).max(200),
    description: optional(4000),
    goals: optional(2000),
    resource_url: optional(500).refine((value) => !value || /^https?:\/\//i.test(value)),
  })
  .refine(
    (value) =>
      (value.start_position === null) === (value.end_position === null) &&
      (value.start_position === null || (value.end_position ?? 0) >= value.start_position),
  );

const scopeSchema = z.object({ classId: uuid, schoolYearId: uuid });

function dbError(error: { code?: string } | null | undefined): PortalErrorCode {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "23514":
    case "22P02":
      return "invalid";
    case "23503":
      return "not_found";
    default:
      return "unknown";
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

async function weekRows(classId: string, schoolYearId: string, weeks: string[]) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_week_plans")
    .select("week_start, start_position, end_position, subject, title, description, goals, completed_at, resource_url, sort_order")
    .eq("class_id", classId)
    .eq("school_year_id", schoolYearId)
    .in("week_start", weeks);
  return { supabase, rows: data ?? [], error };
}

export async function saveWeekPlanEntry(input: {
  id?: string | null;
  classId: string;
  schoolYearId: string;
  weekStart: string;
  draft: WeekPlanDraft;
  alsoWeeks?: string[];
}): Promise<WeekPlanResult> {
  const scope = scopeSchema.safeParse(input);
  const draft = draftSchema.safeParse(input.draft);
  const week = isoDate.safeParse(input.weekStart);
  const extra = z.array(isoDate).max(60).safeParse(input.alsoWeeks ?? []);
  if (!scope.success || !draft.success || !week.success || !extra.success) return { ok: false, error: "invalid" };
  if (input.id && !uuid.safeParse(input.id).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const { classId, schoolYearId } = scope.data;
  const supabase = await createClient();
  let id = input.id ?? undefined;
  if (id) {
    const { data, error } = await supabase
      .from("class_week_plans")
      .update(draft.data)
      .eq("id", id)
      .eq("class_id", classId)
      .select("id");
    if (error) return { ok: false, error: dbError(error) };
    if (!data?.length) return { ok: false, error: "not_found" };
  } else {
    const { data, error } = await supabase
      .from("class_week_plans")
      .insert({ ...draft.data, class_id: classId, school_year_id: schoolYearId, week_start: week.data })
      .select("id")
      .single();
    if (error) return { ok: false, error: dbError(error) };
    id = data.id;
  }

  const others = [...new Set(extra.data)].filter((value) => value !== week.data);
  let count = 1;
  if (others.length) {
    const existing = await weekRows(classId, schoolYearId, others);
    if (existing.error) return { ok: false, error: dbError(existing.error) };
    const inserts = others
      .filter((value) => missingInWeek(draft.data, existing.rows.filter((row) => row.week_start === value)))
      .map((value) => ({ ...draft.data, class_id: classId, school_year_id: schoolYearId, week_start: value }));
    if (inserts.length) {
      const { error } = await supabase.from("class_week_plans").insert(inserts);
      if (error) return { ok: false, error: dbError(error) };
    }
    count += inserts.length;
  }

  refresh();
  return { ok: true, id, count };
}

export async function deleteWeekPlanEntry(id: string): Promise<WeekPlanResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("class_week_plans").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  refresh();
  return { ok: true };
}

export async function completeWeekPlanEntry(id: string, completed: boolean): Promise<WeekPlanResult> {
  if (!uuid.safeParse(id).success || typeof completed !== "boolean") return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  const { data, error } = await (await createClient()).from("class_week_plans")
    .update({ completed_at: completed ? new Date().toISOString() : null }).eq("id", id).select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!data?.length) return { ok: false, error: "forbidden" };
  refresh();
  return { ok: true };
}

export async function copyTeachingYear(input: { classId: string; schoolYearId: string; sourceYearId: string }): Promise<WeekPlanResult> {
  if (!scopeSchema.safeParse(input).success || !uuid.safeParse(input.sourceYearId).success) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };
  const { data, error } = await (await createClient()).rpc("copy_teaching_year", {
    p_class_id: input.classId, p_target_year_id: input.schoolYearId, p_source_year_id: input.sourceYearId,
  });
  if (error) return { ok: false, error: dbError(error) };
  refresh();
  return { ok: true, count: data };
}

export async function copyWeekPlan(input: {
  classId: string;
  schoolYearId: string;
  fromWeek: string;
  toWeek: string;
}): Promise<WeekPlanResult> {
  const scope = scopeSchema.safeParse(input);
  const from = isoDate.safeParse(input.fromWeek);
  const to = isoDate.safeParse(input.toWeek);
  if (!scope.success || !from.success || !to.success || from.data === to.data) return { ok: false, error: "invalid" };
  if (!(await getUser())) return { ok: false, error: "unauthenticated" };

  const { classId, schoolYearId } = scope.data;
  const { supabase, rows, error } = await weekRows(classId, schoolYearId, [from.data, to.data]);
  if (error) return { ok: false, error: dbError(error) };
  const source = rows
    .filter((row) => row.week_start === from.data)
    .sort((left, right) => (left.start_position ?? 0) - (right.start_position ?? 0) || left.sort_order - right.sort_order);
  const copies = copyableEntries(source, rows.filter((row) => row.week_start === to.data)).map((row, index) => ({
    ...row,
    sort_order: index,
    class_id: classId,
    school_year_id: schoolYearId,
    week_start: to.data,
  }));
  if (copies.length) {
    const { error: insertError } = await supabase.from("class_week_plans").insert(copies);
    if (insertError) return { ok: false, error: dbError(insertError) };
  }
  refresh();
  return { ok: true, count: copies.length };
}

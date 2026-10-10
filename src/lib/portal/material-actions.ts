"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const scope = z.object({
  classId: z.string().uuid(), schoolYearId: z.string().uuid(), lessonId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
});
const fileSchema = scope.extend({
  fileName: z.string().min(1).max(200), size: z.number().int().min(1).max(20971520),
  mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"]),
});
const linkSchema = scope.extend({ url: z.string().trim().url().max(2000).refine((url) => /^https?:\/\//i.test(url)) });

function failed(error: { message: string; code?: string } | null) {
  if (error) console.error("Teaching resource action failed", { code: error.code, message: error.message });
  return { ok: false as const };
}

export async function addMaterialLink(input: z.input<typeof linkSchema>) {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { classId, schoolYearId, lessonId, title, url } = parsed.data;
  const { error } = await (await createClient()).from("lesson_materials").insert({
    class_id: classId, school_year_id: schoolYearId, lesson_id: lessonId, title, url, kind: "link",
  });
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function startMaterialUpload(input: z.input<typeof fileSchema>) {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { classId, schoolYearId, lessonId, title, fileName, size, mime } = parsed.data;
  const supabase = await createClient();
  const id = randomUUID();
  const path = `${classId}/${id}/resource`;
  const { error } = await supabase.from("lesson_materials").insert({
    id, class_id: classId, school_year_id: schoolYearId, lesson_id: lessonId, title, kind: "file", status: "uploading",
    file_path: path, file_name: fileName, mime_type: mime, file_size: size,
  });
  if (error) return failed(error);
  const { data, error: uploadError } = await supabase.storage.from("lesson-materials").createSignedUploadUrl(path);
  if (uploadError) {
    await supabase.from("lesson_materials").delete().eq("id", id);
    return failed(uploadError);
  }
  return { ok: true as const, id, path, token: data.token };
}

export async function finishMaterialUpload(id: string) {
  if (!z.string().uuid().safeParse(id).success || !(await getUser())) return { ok: false as const };
  const { data, error } = await (await createClient()).from("lesson_materials")
    .update({ status: "ready" }).eq("id", id).eq("status", "uploading").select("id");
  if (error || !data?.length) return failed(error);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function removeLessonMaterial(id: string) {
  if (!z.string().uuid().safeParse(id).success || !(await getUser())) return { ok: false as const };
  const supabase = await createClient();
  const { data, error } = await supabase.from("lesson_materials").select("class_id, school_year_id, lesson_id, file_path").eq("id", id).maybeSingle();
  if (error || !data) return failed(error);
  const { data: canManage } = await supabase.rpc("can_manage_lesson_material", {
    p_class_id: data.class_id, p_school_year_id: data.school_year_id, p_lesson_id: data.lesson_id,
  });
  if (!canManage) return { ok: false as const };
  if (data.file_path) {
    const { error: storageError } = await supabase.storage.from("lesson-materials").remove([data.file_path]);
    if (storageError) return failed(storageError);
  }
  const { data: removed, error: deleteError } = await supabase.from("lesson_materials").delete().eq("id", id).select("id");
  if (deleteError || !removed?.length) return failed(deleteError);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function saveLessonHandover(lessonId: string, instructions: string) {
  const parsed = z.object({ lessonId: z.string().uuid(), instructions: z.string().trim().max(6000) }).safeParse({ lessonId, instructions });
  if (!parsed.success || !(await getUser())) return { ok: false as const };
  const { error } = await (await createClient()).from("lesson_handovers").upsert({ lesson_id: lessonId, instructions: parsed.data.instructions });
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

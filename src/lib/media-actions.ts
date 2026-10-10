"use server";

import { z } from "zod";
import { getIsAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createMediaUpload(path: string) {
  if (!z.string().regex(/^[0-9a-f-]{36}\.[a-zA-Z0-9]{1,10}$/).safeParse(path).success || !(await getIsAdmin())) {
    return { ok: false as const };
  }
  const { data, error } = await (await createClient()).storage.from("media").createSignedUploadUrl(path);
  if (error) console.error("media upload authorization failed", error.message);
  return error ? { ok: false as const } : { ok: true as const, token: data.token };
}

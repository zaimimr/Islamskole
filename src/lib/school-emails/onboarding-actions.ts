"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function completePortalOnboarding(role: string) {
  if (!z.enum(["parent", "student"]).safeParse(role).success) return { ok: false };
  const user = await getUser();
  if (!user) return { ok: false };
  const client = await createClient();
  const { error } = await client.from("portal_onboarding").insert({ user_id: user.id, role });
  if (error && error.code !== "23505") {
    console.error("Could not complete portal onboarding", error);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

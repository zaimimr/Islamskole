"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIsAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toUserError } from "@/lib/action-errors";
import { writeAudit } from "@/lib/audit";

const optionalNumber = (max: number) => z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().int().min(0).max(max).nullable());
const settingsSchema = z.object({
  name_no: z.string().trim().min(1, "Klassen må ha et navn").max(200),
  age_min: optionalNumber(100),
  age_max: optionalNumber(100),
  capacity: optionalNumber(10000),
  price: optionalNumber(1000000),
}).refine((value) => value.age_min == null || value.age_max == null || value.age_min <= value.age_max, { message: "Alder fra kan ikke være høyere enn alder til" });

export async function saveClassSettings(id: string, expectedUpdatedAt: string, formData: FormData) {
  if (!(await getIsAdmin())) return { ok: false as const, error: "Du har ikke tilgang til å endre klassen" };
  if (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(expectedUpdatedAt).success) return { ok: false as const, error: "Last inn klassen på nytt før du lagrer" };
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("classes").update(parsed.data).eq("id", id).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) return { ok: false as const, error: toUserError(error) };
  if (!data) return { ok: false as const, error: "Klassen er endret av noen andre. Last inn siden på nytt før du lagrer." };
  await writeAudit({ action: "class.update", entityType: "classes", entityId: id, metadata: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function saveClassWebsite(id: string, expectedUpdatedAt: string, formData: FormData) {
  if (!(await getIsAdmin())) return { ok: false as const, error: "Du har ikke tilgang til å endre klassen" };
  if (!z.iso.datetime({ offset: true }).safeParse(expectedUpdatedAt).success) return { ok: false as const, error: "Last inn klassen på nytt før du lagrer" };
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const schema = z.object({
    name_no: z.string().min(1, "Klassen må ha et navn").max(200),
    name_en: z.string().max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nettadressen må ha små bokstaver, tall og bindestrek").max(200),
    description_no: z.string().max(20000), description_en: z.string().max(20000),
    curriculum_no: z.string().max(20000), curriculum_en: z.string().max(20000),
    image_url: z.union([z.literal(""), z.string().regex(/^\/(?![\/\\])[^\s\\]*$/), z.url().refine((value) => value.startsWith("https://"), "Bildet må bruke HTTPS eller en lokal bildeadresse")]),
    published: z.boolean(),
  });
  const parsed = schema.safeParse({
    name_no: text("name_no"), name_en: text("name_en"), slug: text("slug"),
    description_no: text("description_no"), description_en: text("description_en"),
    curriculum_no: text("curriculum_no"), curriculum_en: text("curriculum_en"),
    image_url: text("image_url"), published: text("published") === "true",
  });
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false as const, error: parsed.success ? "Fant ikke klassen" : parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("classes").update({ ...parsed.data, name_en: parsed.data.name_en || parsed.data.name_no, image_url: parsed.data.image_url || null }).eq("id", id).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error) return { ok: false as const, error: toUserError(error) };
  if (!data) return { ok: false as const, error: "Klassen er endret av noen andre. Last inn siden på nytt før du lagrer." };
  await writeAudit({ action: "class.update", entityType: "classes", entityId: id, metadata: { name_no: parsed.data.name_no, published: parsed.data.published } });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

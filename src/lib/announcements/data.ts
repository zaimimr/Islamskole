import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getIsAdmin } from "@/lib/auth";
import { getMyClasses } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";
import { announcementEmailAvailable } from "@/lib/announcements/delivery";

export const ANNOUNCEMENT_PAGE_SIZE = 20;

export const getAnnouncementWorkspace = cache(async (locale: string) => {
  const client = await createClient();
  const [isAdmin, emailAvailable] = await Promise.all([
    getIsAdmin(), announcementEmailAvailable(),
  ]);
  if (isAdmin) {
    const [{ data, error }, year] = await Promise.all([
      client.from("classes").select("id, name_no, name_en").order("name_no"),
      client.from("school_years").select("id").eq("is_active", true).maybeSingle(),
    ]);
    if (error) throw new Error("Could not load announcement classes", { cause: error });
    if (year.error) throw new Error("Could not load announcement school year", { cause: year.error });
    return {
      isAdmin, canPublish: Boolean(year.data), emailAvailable,
      classes: (data ?? []).map((row) => ({ id: row.id, name: locale === "en" ? row.name_en : row.name_no })),
    };
  }
  const classes = await getMyClasses();
  return {
    isAdmin, canPublish: classes.length > 0, emailAvailable,
    classes: classes.map((row) => ({ id: row.class_id, name: locale === "en" ? row.name_en : row.name_no })),
  };
});

export async function getAnnouncements(page = 1) {
  const client = await createClient();
  const offset = (page - 1) * ANNOUNCEMENT_PAGE_SIZE;
  const { data, error } = await client.from("school_announcements")
    .select("*, announcement_families(family_id, acknowledged_at)")
    .order("published_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + ANNOUNCEMENT_PAGE_SIZE);
  if (error) throw new Error("Could not load announcements", { cause: error });
  return { rows: (data ?? []).slice(0, ANNOUNCEMENT_PAGE_SIZE), hasNext: (data?.length ?? 0) > ANNOUNCEMENT_PAGE_SIZE };
}

export async function getAnnouncement(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const client = await createClient();
  const { data, error } = await client.from("school_announcements")
    .select("*, announcement_families(family_id, family_name, acknowledged_at)").eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load announcement", { cause: error });
  if (!data) return null;
  const { data: canManage, error: permissionError } = await client.rpc("announcement_can_manage", { p_id: id });
  if (permissionError) throw new Error("Could not load announcement access", { cause: permissionError });
  const report = canManage ? await client.rpc("announcement_family_status", { p_id: id }) : null;
  if (report?.error) throw new Error("Could not load announcement delivery report", { cause: report.error });
  return { announcement: data, canManage: Boolean(canManage), families: report?.data ?? [] };
}

export async function getPendingAcknowledgementCount() {
  const client = await createClient();
  const { data: familyIds, error: familyError } = await client.rpc("portal_my_family_ids");
  if (familyError) throw new Error("Could not load announcement families", { cause: familyError });
  if (!familyIds?.length) return 0;
  const { data, error } = await client.from("announcement_families")
    .select("announcement_id, school_announcements!inner(requires_acknowledgement)")
    .in("family_id", familyIds).is("acknowledged_at", null).eq("school_announcements.requires_acknowledgement", true);
  if (error) throw new Error("Could not load pending acknowledgements", { cause: error });
  return new Set(data?.map((row) => row.announcement_id)).size;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { PageHeader } from "@/components/admin/page-header";
import { SfoActivityForm } from "@/components/sfo/sfo-activity-form";

export const metadata: Metadata = { title: "Ny SFO-aktivitet" };

export default async function NewSfoActivityPage({ params }: PageProps<"/[locale]/admin/sfo/ny">) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  if (!(await hasPermission("activities.sfo.manage"))) redirect(`${basePath}/sfo`);
  const { data } = await (await createClient()).from("classes").select("id, name_no").eq("published", true).order("sort_order");
  return <div className="grid gap-6">
    <PageHeader title="Ny aktivitet" />
    <SfoActivityForm audience={[]} classes={(data ?? []).map((row) => ({ id: row.id, name: row.name_no }))} basePath={basePath} />
  </div>;
}

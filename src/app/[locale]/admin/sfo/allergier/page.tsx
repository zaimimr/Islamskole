import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath, localePrefix } from "@/components/admin/paths";
import { PageHeader } from "@/components/admin/page-header";
import { LoadError } from "@/components/admin/load-error";
import { PrintRoster } from "@/components/school-activities/print-roster";

export const metadata: Metadata = { title: "Allergiliste" };

export default async function AllergyListPage({ params }: PageProps<"/[locale]/admin/sfo/allergier">) {
  const { locale } = await params;
  const access = await getAccess();
  if (!access.permissions.has("students.allergies.read")) redirect(`${localePrefix(locale)}/min-side`);
  const basePath = adminBasePath(locale);
  const { data, error } = await (await createClient()).rpc("sfo_allergy_list");
  const groups = new Map<string, NonNullable<typeof data>>();
  for (const row of data ?? []) groups.set(row.classes, [...(groups.get(row.classes) ?? []), row]);
  return <div className="grid gap-6">
    <Link href={`${basePath}/${access.admin ? "aktiviteter" : "sfo"}`} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-bold print:hidden"><ChevronLeft aria-hidden="true" className="size-4" />Aktiviteter</Link>
    <PageHeader title="Allergiliste" action={<PrintRoster locale="no" />} />
    {error ? <LoadError title="Allergilisten kunne ikke lastes" retryHref={`${basePath}/sfo/allergier`} />
      : groups.size === 0 ? <p className="text-sm text-admin-muted">Ingen elever med allergier</p>
      : <div className="grid gap-4 lg:grid-cols-2">{[...groups].map(([name, rows]) => <section key={name} aria-label={name} className="grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
        <h2 className="font-heading text-xl font-bold">{name}</h2>
        <ul className="grid gap-2">{rows.map((row) => <li key={row.student_id} className="grid gap-0.5 border-t border-[#ECE8DF] pt-2 first:border-t-0 first:pt-0">
          <span className="font-bold">{row.name}</span>
          <span className="whitespace-pre-line wrap-anywhere">{row.allergies}</span>
        </li>)}</ul>
      </section>)}</div>}
  </div>;
}

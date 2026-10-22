import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { SchoolYearForm } from "@/components/admin/school-year-form";
import { createClient } from "@/lib/supabase/server";
import { countCopyableAssignments } from "../copyable-assignments";

export const metadata: Metadata = { title: "Nytt skoleår" };

export default async function NyttSkolearPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const listHref = `${adminBasePath(locale)}/skolear`;
  const supabase = await createClient();
  const { data: activeYear } = await supabase
    .from("school_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  const copyableAssignments = await countCopyableAssignments(activeYear?.id);

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til skoleår
        </Link>
        <h1 className="mt-3 text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Nytt skoleår
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Angi perioden og årsavgiften før skoleåret tas i bruk.
        </p>
      </header>
      <SchoolYearForm listHref={listHref} copyableAssignments={copyableAssignments} />
    </div>
  );
}

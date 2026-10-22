import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, UserRoundPlus } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { StudentForm } from "@/components/admin/student-form";
import { getAdminFamilies } from "@/lib/families/service";
import { familyOptions } from "@/app/[locale]/admin/(admin-only)/familier/family-options";

export const metadata: Metadata = { title: "Ny elev" };

export default async function NyElevPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, { familie }, families] = await Promise.all([
    params,
    searchParams,
    getAdminFamilies(),
  ]);
  const listHref = `${adminBasePath(locale)}/elever`;
  const options = familyOptions(families, null);

  return (
    <div className="grid gap-5 sm:gap-6">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til elever
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
            <UserRoundPlus aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h1 className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Ny elev
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-admin-muted sm:text-base">
              Registrer barnet i en eksisterende familie, eller med minst én
              foresatt i en ny familie.
            </p>
          </div>
        </div>
      </header>
      <StudentForm
        listHref={listHref}
        families={options}
        defaultFamilyId={
          options.find((option) => option.id === familie)?.id ?? ""
        }
      />
    </div>
  );
}

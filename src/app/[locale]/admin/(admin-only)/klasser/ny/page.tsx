import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { ClassForm } from "@/components/admin/class-form";

export const metadata: Metadata = { title: "Ny klasse" };

export default async function NyKlassePage({
  params,
}: PageProps<"/[locale]/admin/klasser/ny">) {
  const { locale } = await params;
  const listHref = `${adminBasePath(locale)}/klasser`;

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til klasser
        </Link>
        <h1 className="mt-3 text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Ny klasse
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Opprett undervisningstilbudet og bestem hva som skal vises offentlig.
        </p>
      </header>
      <ClassForm listHref={listHref} />
    </div>
  );
}

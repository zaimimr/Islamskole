import type { Metadata } from "next";
import { relationshipKey } from "@/lib/relationship";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { adminBasePath } from "@/components/admin/paths";
import { FamilyEditor } from "@/components/admin/family-editor";
import { getAdminFamilyById } from "@/lib/families/service";

export const metadata: Metadata = { title: "Rediger familie" };

export default async function EditFamilyPage({
  params,
}: PageProps<"/[locale]/admin/familier/[id]/rediger">) {
  const { locale, id } = await params;
  const family = await getAdminFamilyById(id);
  if (!family) notFound();
  const familyHref = `${adminBasePath(locale)}/familier/${id}`;

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <header>
        <Link
          href={familyHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til familien
        </Link>
        <h1 className="mt-2 text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          Rediger {family.displayName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-admin-muted sm:text-base">
          Oppdater familieopplysninger, kontaktpersoner og relasjoner på ett
          sted.
        </p>
      </header>

      <FamilyEditor
        familyId={family.id}
        familyHref={familyHref}
        family={{
          displayName: family.displayName,
          displayNameOverride: family.displayNameOverride,
          address: family.address,
          postalCode: family.postalCode,
          city: family.city,
          openReviewCount: family.openReviews.length,
        }}
        guardians={family.guardians.map((guardian, index) => ({
          key: guardian.id,
          id: guardian.id,
          firstName: guardian.firstName ?? "",
          lastName: guardian.lastName ?? "",
          email: guardian.email ?? "",
          phone: guardian.phone ?? "",
          role: relationshipKey(guardian.relationshipLabel),
          isPrimary:
            guardian.isPrimaryContact ||
            (!family.guardians.some((candidate) => candidate.isPrimaryContact) &&
              index === 0),
        }))}
      />
    </div>
  );
}

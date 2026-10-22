"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateFamilyRelationships } from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

type GuardianEditorValue = {
  key: string;
  id: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

type FamilyEditorProps = {
  familyId: string;
  familyHref: string;
  family: {
    displayName: string;
    displayNameOverride: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    openReviewCount: number;
  };
  guardians: GuardianEditorValue[];
};

const roleOptions = [
  ["foresatt", "Foresatt"],
  ["mor", "Mor"],
  ["far", "Far"],
  ["steforelder", "Steforelder"],
  ["verge", "Verge"],
  ["annet", "Annen relasjon"],
] as const;

export function FamilyEditor({
  familyId,
  familyHref,
  family,
  guardians: initialGuardians,
}: FamilyEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextGuardianId, setNextGuardianId] = useState(0);
  const [guardians, setGuardians] = useState<GuardianEditorValue[]>(
    initialGuardians.length
      ? initialGuardians
      : [
          {
            key: "new-0",
            id: null,
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            role: "foresatt",
            isPrimary: true,
          },
        ],
  );

  function addGuardian() {
    const key = `new-${nextGuardianId + 1}`;
    setNextGuardianId((current) => current + 1);
    setGuardians((current) => [
      ...current,
      {
        key,
        id: null,
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "foresatt",
        isPrimary: false,
      },
    ]);
  }

  function removeNewGuardian(key: string) {
    setGuardians((current) =>
      current.filter((guardian) => guardian.key !== key),
    );
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFamilyRelationships(familyId, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Familien er oppdatert");
      router.push(familyHref);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      className="grid gap-5"
    >
      <input
        type="hidden"
        name="guardian_keys"
        value={guardians.map((guardian) => guardian.key).join(",")}
      />

      <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
        <h2 className="font-heading text-xl font-bold">Familieinformasjon</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Navnet kan overstyres. La feltet stå tomt for automatisk familienavn.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="display_name">Familienavn</Label>
            <Input
              id="display_name"
              name="display_name"
              defaultValue={family.displayNameOverride ?? ""}
              placeholder={family.displayName}
              className="min-h-11"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              name="address"
              defaultValue={family.address ?? ""}
              className="min-h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="postal_code">Postnummer</Label>
            <Input
              id="postal_code"
              name="postal_code"
              inputMode="numeric"
              defaultValue={family.postalCode ?? ""}
              className="min-h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="city">Poststed</Label>
            <Input
              id="city"
              name="city"
              defaultValue={family.city ?? ""}
              className="min-h-11"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-bold">Foresatte</h2>
            <p className="mt-1 text-sm text-admin-muted">
              Den primære kontakten vises først og brukes for betaling.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={addGuardian}>
            <Plus aria-hidden="true" className="size-4" />
            Legg til foresatt
          </Button>
        </div>

        <div id="new-guardian" className="mt-5 grid gap-4">
          {guardians.map((guardian, index) => {
            const prefix = `guardian_${guardian.key}`;
            return (
              <fieldset
                key={guardian.key}
                className="grid gap-4 rounded-2xl bg-[#FAF9F5] p-4 ring-1 ring-[#E8E3D9]"
              >
                <input
                  type="hidden"
                  name={`${prefix}_id`}
                  value={guardian.id ?? ""}
                />
                <legend className="px-1 font-heading text-base font-bold">
                  Foresatt {index + 1}
                </legend>
                <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 text-sm font-bold ring-1 ring-[#E3DED3]">
                  <input
                    type="radio"
                    name="primary_guardian_key"
                    value={guardian.key}
                    defaultChecked={
                      guardian.isPrimary || guardians.length === 1
                    }
                    className="size-4 accent-[#2F7938]"
                  />
                  Primær kontakt
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`${prefix}_first_name`}>Fornavn</Label>
                    <Input
                      id={`${prefix}_first_name`}
                      name={`${prefix}_first_name`}
                      defaultValue={guardian.firstName}
                      className="min-h-11"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${prefix}_last_name`}>Etternavn</Label>
                    <Input
                      id={`${prefix}_last_name`}
                      name={`${prefix}_last_name`}
                      defaultValue={guardian.lastName}
                      className="min-h-11"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${prefix}_role`}>Relasjon</Label>
                    <SelectField
                      id={`${prefix}_role`}
                      name={`${prefix}_role`}
                      defaultValue={guardian.role}
                      options={roleOptions.map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${prefix}_phone`}>Telefon</Label>
                    <Input
                      id={`${prefix}_phone`}
                      name={`${prefix}_phone`}
                      type="tel"
                      defaultValue={guardian.phone}
                      className="min-h-11"
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor={`${prefix}_email`}>E-post</Label>
                    <Input
                      id={`${prefix}_email`}
                      name={`${prefix}_email`}
                      type="email"
                      defaultValue={guardian.email}
                      spellCheck={false}
                      className="min-h-11"
                    />
                  </div>
                </div>
                {!guardian.id && guardians.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-start text-destructive"
                    onClick={() => removeNewGuardian(guardian.key)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Fjern foresatt
                  </Button>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      </section>

      {family.openReviewCount > 0 ? (
        <section className="rounded-2xl bg-[#EEF7FE] p-5 ring-1 ring-[#BFDDF2]">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="resolve_reviews"
              className="mt-1 size-4 accent-[#2F7938]"
            />
            <span>
              <span className="block font-bold">
                Marker {family.openReviewCount} datakontroll som avklart
              </span>
              <span className="mt-1 block text-[#36586E]">
                Velg dette når du har kontrollert at familie, foresatte og barn
                hører sammen.
              </span>
            </span>
          </label>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Lagre familie
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(familyHref)}
        >
          Avbryt
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Loader2,
  MapPin,
  Save,
  StickyNote,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  createStudent,
  updateStudent,
} from "@/app/[locale]/admin/students-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

export type StudentRecord = {
  id: string;
  child_first_name: string | null;
  child_last_name: string | null;
  child_birth_date: string | null;
  child_gender: string | null;
  child_address: string | null;
  child_postal_code: string | null;
  child_city: string | null;
  child_email: string | null;
  child_phone: string | null;
  mother_first_name: string | null;
  mother_last_name: string | null;
  mother_phone: string | null;
  mother_email: string | null;
  father_first_name: string | null;
  father_last_name: string | null;
  father_phone: string | null;
  father_email: string | null;
  child_level_quran: string | null;
  child_level_arabic: string | null;
  child_level_islam: string | null;
  notes: string | null;
};

const levelOptions = [
  { value: "", label: "Ikke satt" },
  { value: "nybegynner", label: "Nybegynner" },
  { value: "litt", label: "Litt erfaring" },
  { value: "middels", label: "Middels" },
  { value: "god", label: "God" },
];

const genderOptions = [
  { value: "", label: "Ikke satt" },
  { value: "gutt", label: "Gutt" },
  { value: "jente", label: "Jente" },
];

const guardianRoleOptions = [
  { value: "foresatt", label: "Foresatt" },
  { value: "mor", label: "Mor" },
  { value: "far", label: "Far" },
  { value: "steforelder", label: "Steforelder" },
  { value: "verge", label: "Verge" },
  { value: "annet", label: "Annen relasjon" },
];

function LevelSelect({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <SelectField
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        options={levelOptions}
      />
    </div>
  );
}

function FormSectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
        {icon}
      </span>
      <div>
        <h2 className="font-heading text-xl font-bold">{title}</h2>
        <p className="mt-0.5 text-sm text-admin-muted">{description}</p>
      </div>
    </div>
  );
}

export function StudentForm({
  student,
  listHref,
  families = [],
  defaultFamilyId = "",
}: {
  student?: StudentRecord;
  listHref: string;
  families?: { id: string; name: string; description?: string }[];
  defaultFamilyId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [familyId, setFamilyId] = useState(defaultFamilyId);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = student
        ? await updateStudent(student.id, formData)
        : await createStudent(formData);
      if (result.ok) {
        toast.success(student ? "Elev oppdatert" : "Elev registrert");
        router.push(result.id ? `${listHref}/${result.id}` : listHref);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:border-[#CFC9BD] [&_input]:shadow-none [&_textarea]:rounded-xl [&_textarea]:border-[#CFC9BD] [&_textarea]:shadow-none"
      aria-busy={pending}
    >
      {!student && families.length > 0 ? (
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
          <FormSectionHeading
            icon={<UsersRound aria-hidden="true" className="size-4" />}
            title="Familie"
            description="Velg en familie som allerede er registrert, eller lag en ny."
          />
          <div className="grid gap-2 p-4 sm:p-5">
            <Label htmlFor="family_id">Familie</Label>
            <SelectField
              id="family_id"
              name="family_id"
              value={familyId}
              onValueChange={setFamilyId}
              options={[
                { value: "", label: "Ny familie" },
                ...families.map((family) => ({
                  value: family.id,
                  label: family.name,
                  description: family.description,
                })),
              ]}
            />
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <FormSectionHeading
          icon={<UserRound aria-hidden="true" className="size-4" />}
          title="Grunnopplysninger"
          description="Barnets identitet og kontaktinformasjon."
        />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="child_first_name" required>
                Fornavn
              </Label>
              <Input
                id="child_first_name"
                name="child_first_name"
                required
                defaultValue={student?.child_first_name ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="child_last_name" required>
                Etternavn
              </Label>
              <Input
                id="child_last_name"
                name="child_last_name"
                required
                defaultValue={student?.child_last_name ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="birth_date">Fødselsdato</Label>
              <Input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={student?.child_birth_date ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gender">Kjønn</Label>
              <SelectField
                id="gender"
                name="gender"
                defaultValue={student?.child_gender ?? ""}
                options={genderOptions}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Adresse</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#2F7938]" />
              <Input
                id="address"
                name="address"
                className="pl-10"
                defaultValue={student?.child_address ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="postal_code">Postnummer</Label>
              <Input
                id="postal_code"
                name="postal_code"
                defaultValue={student?.child_postal_code ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city">Poststed</Label>
              <Input
                id="city"
                name="city"
                defaultValue={student?.child_city ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="email">Elevens e-post (innlogging)</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={student?.child_email ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefon (kontakt)</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={student?.child_phone ?? ""}
              />
            </div>
          </div>
        </div>
      </section>

      {student || familyId ? null : (
        <>
          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            <FormSectionHeading
              icon={<UsersRound aria-hidden="true" className="size-4" />}
              title="Primær foresatt"
              description="Minst én foresatt må registreres for barnet."
            />
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-2">
                <Label htmlFor="mother_relationship">Relasjon</Label>
                <SelectField
                  id="mother_relationship"
                  name="mother_relationship"
                  defaultValue="foresatt"
                  options={guardianRoleOptions}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="mother_first_name">Fornavn</Label>
                  <Input
                    id="mother_first_name"
                    name="mother_first_name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mother_last_name">Etternavn</Label>
                  <Input
                    id="mother_last_name"
                    name="mother_last_name"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="mother_phone">Telefon</Label>
                  <Input
                    id="mother_phone"
                    name="mother_phone"
                    type="tel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mother_email">E-post</Label>
                  <Input
                    id="mother_email"
                    name="mother_email"
                    type="email"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            <FormSectionHeading
              icon={<UsersRound aria-hidden="true" className="size-4" />}
              title="Ekstra foresatt"
              description="Valgfri kontakt som også kan knyttes til familien."
            />
            <div className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-2">
                <Label htmlFor="father_relationship">Relasjon</Label>
                <SelectField
                  id="father_relationship"
                  name="father_relationship"
                  defaultValue="foresatt"
                  options={guardianRoleOptions}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="father_first_name">Fornavn</Label>
                  <Input
                    id="father_first_name"
                    name="father_first_name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="father_last_name">Etternavn</Label>
                  <Input
                    id="father_last_name"
                    name="father_last_name"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="father_phone">Telefon</Label>
                  <Input
                    id="father_phone"
                    name="father_phone"
                    type="tel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="father_email">E-post</Label>
                  <Input
                    id="father_email"
                    name="father_email"
                    type="email"
                  />
                </div>
              </div>
              <p className="rounded-xl bg-[#EFF8FD] p-3 text-sm text-[#245D7C]">
                Betalingslenken kan sendes til begge foresatte. Når én har
                betalt, ser den andre kvitteringssiden.
              </p>
            </div>
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <FormSectionHeading
          icon={<BookOpen aria-hidden="true" className="size-4" />}
          title="Nivå og notater"
          description="Opplysninger som hjelper skolen med oppstart og plassering."
        />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <LevelSelect
              name="level_quran"
              label="Koran"
              defaultValue={student?.child_level_quran ?? null}
            />
            <LevelSelect
              name="level_arabic"
              label="Arabisk"
              defaultValue={student?.child_level_arabic ?? null}
            />
            <LevelSelect
              name="level_islam"
              label="Islam"
              defaultValue={student?.child_level_islam ?? null}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes" className="inline-flex items-center gap-2">
              <StickyNote
                aria-hidden="true"
                className="size-4 text-[#2F7938]"
              />
              Notater
            </Label>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={student?.notes ?? ""}
            />
          </div>
        </div>
      </section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col-reverse gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#D8D3C8] sm:flex-row sm:justify-end lg:bottom-4">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(student ? `${listHref}/${student.id}` : listHref)
          }
          className="min-h-11 rounded-xl px-5 font-bold"
        >
          Avbryt
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl px-5 font-bold"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {!pending ? <Save aria-hidden="true" className="size-4" /> : null}
          {student ? "Lagre endringer" : "Registrer elev"}
        </Button>
      </div>
    </form>
  );
}

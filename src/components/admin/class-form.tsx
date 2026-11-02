"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Globe2, Loader2, Settings2 } from "lucide-react";
import { createClass } from "@/app/[locale]/admin/actions";
import { saveClassWebsite } from "@/app/[locale]/admin/(admin-only)/klasser/class-settings-actions";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export type ClassRecord = {
  id: string;
  slug: string | null;
  name_no: string | null;
  name_en: string | null;
  age_min: number | null;
  age_max: number | null;
  capacity: number | null;
  price: number | null;
  description_no: string | null;
  description_en: string | null;
  curriculum_no: string | null;
  curriculum_en: string | null;
  image_url: string | null;
  sort_order: number | null;
  published: boolean | null;
  updated_at?: string;
};

export function ClassForm({
  classRecord,
  listHref,
}: {
  classRecord?: ClassRecord;
  listHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState(classRecord?.published ?? false);

  function handleSubmit(formData: FormData) {
    formData.set("published", published ? "true" : "false");
    startTransition(async () => {
      const result = classRecord
        ? await saveClassWebsite(classRecord.id, classRecord.updated_at ?? "", formData)
        : await createClass(formData);
      if (result.ok) {
        toast.success(classRecord ? "Klasse oppdatert" : "Klasse opprettet");
        router.push(listHref);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit(new FormData(event.currentTarget));
      }}
      className="grid gap-5"
    >
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.72fr)]">
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
          <div className="border-b border-[#ECE8DF] px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
                <Globe2 aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">
                  Innhold på nettsiden
                </h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Norsk er obligatorisk. Engelsk brukes på den engelske siden.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6">
            <fieldset
              className="grid gap-4"
              aria-labelledby="class-norsk-title"
            >
              <div>
                <h3
                  id="class-norsk-title"
                  className="font-heading text-lg font-bold"
                >
                  Norsk
                </h3>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Primær informasjon for elever og foresatte.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name_no" required>
                  Navn
                </Label>
                <Input
                  id="name_no"
                  name="name_no"
                  required
                  autoComplete="off"
                  defaultValue={classRecord?.name_no ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description_no">Beskrivelse</Label>
                <Textarea
                  id="description_no"
                  name="description_no"
                  rows={4}
                  defaultValue={classRecord?.description_no ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="curriculum_no">Læreplan</Label>
                <Textarea
                  id="curriculum_no"
                  name="curriculum_no"
                  rows={7}
                  defaultValue={classRecord?.curriculum_no ?? ""}
                />
              </div>
            </fieldset>

            <fieldset
              className="grid gap-4 border-t border-[#ECE8DF] pt-6"
              aria-labelledby="class-engelsk-title"
            >
              <div>
                <h3
                  id="class-engelsk-title"
                  className="font-heading text-lg font-bold"
                >
                  Engelsk
                </h3>
                <p className="mt-0.5 text-sm text-admin-muted">
                  La feltene stå tomme dersom klassen ikke skal beskrives på
                  engelsk ennå.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name_en">Navn</Label>
                <Input
                  id="name_en"
                  name="name_en"
                  autoComplete="off"
                  defaultValue={classRecord?.name_en ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description_en">Beskrivelse</Label>
                <Textarea
                  id="description_en"
                  name="description_en"
                  rows={4}
                  defaultValue={classRecord?.description_en ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="curriculum_en">Læreplan</Label>
                <Textarea
                  id="curriculum_en"
                  name="curriculum_en"
                  rows={7}
                  defaultValue={classRecord?.curriculum_en ?? ""}
                />
              </div>
            </fieldset>
          </div>
        </section>

        <aside className="grid gap-5 xl:sticky xl:top-24">
          {!classRecord ? <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
                <Settings2 aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">Rammer</h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Alder, kapasitet og pris for klassen.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <div className="grid gap-2">
                  <Label htmlFor="age_min">Alder fra</Label>
                  <Input
                    id="age_min"
                    name="age_min"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue=""
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="age_max">Alder til</Label>
                  <Input
                    id="age_max"
                    name="age_max"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue=""
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="capacity">Kapasitet</Label>
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue=""
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="price">Egen pris per år (kr)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="La stå tom for å bruke årsavgiften"
                  defaultValue=""
                />
                <p className="text-sm text-admin-muted">
                  Brukes sjelden. En egen pris overstyrer årsavgiften for alle
                  elever som plasseres i klassen.
                </p>
              </div>
            </div>
          </section> : null}

          <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEEF9] text-[#245D84]">
                <Eye aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">Synlighet</h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Bilde, nettadresse og offentlig status.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5">
              <ImageUpload
                name="image_url"
                defaultValue={classRecord?.image_url}
              />
              <div className="grid gap-2">
                <Label htmlFor="slug">Nettadresse</Label>
                <Input
                  id="slug"
                  name="slug"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Genereres automatisk fra navn"
                  defaultValue={classRecord?.slug ?? ""}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-[#F7F6F1] px-4 py-3">
                <div>
                  <Label htmlFor="published" className="font-bold">
                    Publisert
                  </Label>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    Vis klassen på nettsiden.
                  </p>
                </div>
                <Switch
                  id="published"
                  checked={published}
                  onCheckedChange={setPublished}
                />
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="flex flex-col-reverse gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(listHref)}
          className="min-h-11"
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {classRecord ? "Lagre endringer" : "Opprett klasse"}
        </Button>
      </div>
    </form>
  );
}

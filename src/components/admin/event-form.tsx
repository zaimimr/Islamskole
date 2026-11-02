"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Eye, Globe2, Loader2, MapPin } from "lucide-react";
import { createEvent, updateEvent } from "@/app/[locale]/admin/actions";
import { isoToOsloLocal } from "@/lib/dates";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export type EventRecord = {
  id: string;
  slug: string | null;
  title_no: string | null;
  title_en: string | null;
  excerpt_no: string | null;
  excerpt_en: string | null;
  body_no: string | null;
  body_en: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  published: boolean | null;
};

function toLocalInput(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return isoToOsloLocal(value);
}

export function EventForm({
  event,
  listHref,
}: {
  event?: EventRecord;
  listHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState(event?.published ?? false);

  function handleSubmit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const formData = new FormData(submitEvent.currentTarget);
    formData.set("published", published ? "true" : "false");
    startTransition(async () => {
      const result = event
        ? await updateEvent(event.id, formData)
        : await createEvent(formData);
      if (result.ok) {
        toast.success(event ? "Aktivitet oppdatert" : "Aktivitet opprettet");
        router.push(listHref);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
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
                  Norsk er obligatorisk. Engelsk vises på den engelske siden.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6">
            <fieldset className="grid gap-4">
              <legend className="font-heading text-lg font-bold">Norsk</legend>
              <p className="text-sm text-admin-muted">
                Skriv det foresatte og besøkende trenger å vite først.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="title_no" required>
                  Tittel
                </Label>
                <Input
                  id="title_no"
                  name="title_no"
                  required
                  autoComplete="off"
                  defaultValue={event?.title_no ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="excerpt_no">Ingress</Label>
                <Textarea
                  id="excerpt_no"
                  name="excerpt_no"
                  rows={3}
                  defaultValue={event?.excerpt_no ?? ""}
                />
                <p className="text-sm text-admin-muted">
                  Kort sammendrag som kan brukes i aktivitetsoversikten.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="body_no">Brødtekst</Label>
                <Textarea
                  id="body_no"
                  name="body_no"
                  rows={10}
                  defaultValue={event?.body_no ?? ""}
                />
              </div>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-[#ECE8DF] pt-6">
              <legend className="font-heading text-lg font-bold">
                Engelsk
              </legend>
              <p className="-mt-3 text-sm text-admin-muted">
                La feltene stå tomme dersom aktiviteten ikke skal ha engelsk
                innhold ennå.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="title_en">Tittel</Label>
                <Input
                  id="title_en"
                  name="title_en"
                  autoComplete="off"
                  defaultValue={event?.title_en ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="excerpt_en">Ingress</Label>
                <Textarea
                  id="excerpt_en"
                  name="excerpt_en"
                  rows={3}
                  defaultValue={event?.excerpt_en ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="body_en">Brødtekst</Label>
                <Textarea
                  id="body_en"
                  name="body_en"
                  rows={10}
                  defaultValue={event?.body_en ?? ""}
                />
              </div>
            </fieldset>
          </div>
        </section>

        <aside className="grid gap-5 xl:sticky xl:top-24">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
                <CalendarDays aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">Tid og sted</h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Når og hvor aktiviteten skjer.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="starts_at" required>
                  Starttidspunkt
                </Label>
                <Input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  required
                  aria-describedby="event-time-hint"
                  defaultValue={toLocalInput(event?.starts_at ?? null)}
                />
                <p id="event-time-hint" className="text-sm text-admin-muted">
                  Oppgis i norsk tid.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ends_at">Sluttidspunkt</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={toLocalInput(event?.ends_at ?? null)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">Sted</Label>
                <div className="relative">
                  <MapPin
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-admin-muted"
                  />
                  <Input
                    id="location"
                    name="location"
                    className="pl-10"
                    defaultValue={event?.location ?? ""}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEEF9] text-[#245D84]">
                <Eye aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">Publisering</h2>
                <p className="mt-0.5 text-sm text-admin-muted">
                  Bilde, nettadresse og offentlig status.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5">
              <ImageUpload name="image_url" defaultValue={event?.image_url} />
              <div className="grid gap-2">
                <Label htmlFor="slug">Nettadresse</Label>
                <Input
                  id="slug"
                  name="slug"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Genereres automatisk fra tittel"
                  defaultValue={event?.slug ?? ""}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-[#F7F6F1] px-4 py-3">
                <div>
                  <Label htmlFor="published" className="font-bold">
                    Publisert
                  </Label>
                  <p className="mt-0.5 text-xs text-admin-muted">
                    Gjør aktiviteten synlig på nettsiden.
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

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex flex-col-reverse gap-3 rounded-2xl bg-white/95 p-4 ring-1 ring-[#E3DED3] supports-backdrop-filter:backdrop-blur-md sm:flex-row sm:items-center sm:justify-end lg:bottom-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(listHref)}
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {event ? "Lagre endringer" : "Opprett aktivitet"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, MapPin, Share2 } from "lucide-react";
import { updateSettings } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SettingsRecord = {
  contact_email: string | null;
  enroll_email: string | null;
  address: string | null;
  hours: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
};

export function SettingsForm({
  settings,
}: {
  settings: SettingsRecord | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateSettings(formData);
      if (result.ok) {
        toast.success("Innstillinger lagret");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
              <Mail aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold">Kontaktkanaler</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="contact_email">Kontakt-e-post</Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                defaultValue={settings?.contact_email ?? ""}
              />
            </div>
            <div className="grid gap-2 border-t border-[#ECE8DF] pt-5">
              <Label htmlFor="enroll_email">Påmeldings-e-post</Label>
              <Input
                id="enroll_email"
                name="enroll_email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                defaultValue={settings?.enroll_email ?? ""}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
              <MapPin aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold">
                Besøksinformasjon
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                name="address"
                autoComplete="street-address"
                defaultValue={settings?.address ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hours">Åpningstider</Label>
              <Textarea
                id="hours"
                name="hours"
                rows={4}
                defaultValue={settings?.hours ?? ""}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEEF9] text-[#245D84]">
            <Share2 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-bold">Sosiale medier</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="facebook_url">Facebook</Label>
            <Input
              id="facebook_url"
              name="facebook_url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://facebook.com/..."
              defaultValue={settings?.facebook_url ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="instagram_url">Instagram</Label>
            <Input
              id="instagram_url"
              name="instagram_url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://instagram.com/..."
              defaultValue={settings?.instagram_url ?? ""}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3]">
        <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
          {pending ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          Lagre
        </Button>
      </div>
    </form>
  );
}

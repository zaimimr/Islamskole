import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { LoadError } from "@/components/admin/load-error";
import {
  SettingsForm,
  type SettingsRecord,
} from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Innstillinger" };

async function getSettings(): Promise<
  { ok: true; settings: SettingsRecord | null } | { ok: false }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select(
        "contact_email, enroll_email, address, hours, facebook_url, instagram_url",
      )
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, settings: (data as SettingsRecord | null) ?? null };
  } catch {
    return { ok: false };
  }
}

export default async function InnstillingerPage({
  params,
}: PageProps<"/[locale]/admin/innstillinger">) {
  const { locale } = await params;
  const result = await getSettings();

  if (!result.ok) {
    return (
      <LoadError
        title="Innstillingene kunne ikke lastes"
        description="Kontaktopplysningene på nettsiden er ikke endret. Last siden på nytt før du lagrer, ellers kan tomme felt overskrive det som vises i dag."
        retryHref={`${adminBasePath(locale)}/innstillinger`}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Innstillinger
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Kontaktinformasjon og offentlige lenker som brukes på nettsiden.
        </p>
      </header>
      <SettingsForm settings={result.settings} />
    </div>
  );
}

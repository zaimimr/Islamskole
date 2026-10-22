import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { EventForm, type EventRecord } from "@/components/admin/event-form";

const getEvent = cache(async (id: string): Promise<EventRecord | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as EventRecord | null) ?? null;
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/aktiviteter/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event?.title_no ?? "Rediger aktivitet" };
}

export default async function RedigerAktivitetPage({
  params,
}: PageProps<"/[locale]/admin/aktiviteter/[id]">) {
  const { locale, id } = await params;
  const listHref = `${adminBasePath(locale)}/aktiviteter`;
  const event = await getEvent(id);

  if (!event) notFound();

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tilbake til aktiviteter
        </Link>
        <h1 className="mt-3 text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          {event.title_no ?? "Rediger aktivitet"}
        </h1>
        <p className="mt-1 max-w-2xl text-admin-muted">
          Oppdater innhold, tidspunkt og offentlig synlighet.
        </p>
      </header>
      <EventForm event={event} listHref={listHref} />
    </div>
  );
}

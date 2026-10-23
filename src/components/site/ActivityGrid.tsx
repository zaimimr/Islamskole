import { Fragment } from "react";
import type { EventItem, PublicSfoActivity } from "@/lib/data";
import type { Locale } from "@/i18n/routing";
import { EventCard } from "./EventCard";
import { SfoActivityCard } from "./SfoActivityCard";

type Entry = { key: string; at: string; node: React.ReactNode };

export function ActivityGrid({ events, sfo = [], locale, limit }: { events: EventItem[]; sfo?: PublicSfoActivity[]; locale: Locale; limit?: number }) {
  const entries: Entry[] = [
    ...events.map((item) => ({ key: `event-${item.id}`, at: item.starts_at ?? "9999", node: <EventCard item={item} locale={locale} /> })),
    ...sfo.map((item) => ({ key: `sfo-${item.id}`, at: `${item.event_date}T${item.start_time ?? "00:00"}`, node: <SfoActivityCard item={item} locale={locale} /> })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {entries.slice(0, limit).map((entry) => <Fragment key={entry.key}>{entry.node}</Fragment>)}
    </div>
  );
}

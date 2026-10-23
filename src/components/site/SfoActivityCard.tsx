import { getTranslations } from "next-intl/server";
import { CalendarDaysIcon, MapPinIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicSfoActivity } from "@/lib/data";
import type { Locale } from "@/i18n/routing";
import { formatNok } from "@/lib/money";
import { MediaFrame } from "./MediaFrame";
import { formatEventDate } from "./format";

export async function SfoActivityCard({ item, locale }: { item: PublicSfoActivity; locale: Locale }) {
  const t = await getTranslations("events");
  const time = [item.start_time?.slice(0, 5), item.end_time?.slice(0, 5)].filter(Boolean).join("–");
  const date = [formatEventDate(`${item.event_date}T12:00:00`, locale), time].filter(Boolean).join(" · ");
  const ages = item.min_age != null && item.max_age != null ? t("sfoAges", { min: item.min_age, max: item.max_age })
    : item.min_age != null ? t("sfoFromAge", { min: item.min_age }) : item.max_age != null ? t("sfoToAge", { max: item.max_age }) : null;
  const full = item.spots_left === 0;
  const facts = [ages, item.price_ore != null ? formatNok(item.price_ore) : null, full ? t("sfoFull") : item.spots_left != null ? t("sfoSpots", { count: item.spots_left }) : null].filter(Boolean);
  return (
    <article className="soft-card flex flex-col overflow-hidden">
      <MediaFrame alt={item.title} tone="green" className="aspect-[16/10] w-full" />
      <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="flex flex-wrap gap-3 text-sm font-semibold text-brand-green-dark">
        <span className="inline-flex items-center gap-1.5"><CalendarDaysIcon className="size-4" aria-hidden="true" />{date}</span>
        {item.location && <span className="inline-flex items-center gap-1.5 text-muted-foreground"><MapPinIcon className="size-4" aria-hidden="true" />{item.location}</span>}
      </div>
      <h3 className="text-xl font-bold">{item.title}</h3>
      {item.description && <p className="line-clamp-4 text-base text-muted-foreground text-balance-pretty">{item.description}</p>}
      {facts.length > 0 && <p className="text-sm font-semibold">{facts.join(" · ")}</p>}
      {item.signup && !full && <Link href="/min-side/logg-inn?next=/min-side" className="mt-auto inline-flex min-h-11 w-fit items-center rounded-full bg-brand-green-dark px-5 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("sfoSignUp")}</Link>}
      </div>
    </article>
  );
}

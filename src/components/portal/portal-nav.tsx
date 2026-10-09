"use client";

import { useTranslations } from "next-intl";
import { ClipboardPen, House, Megaphone, Users, Wallet } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/min-side", key: "home", icon: House },
  { href: "/min-side/beskjeder", key: "announcements", icon: Megaphone },
  { href: "/min-side/familie", key: "family", icon: Users },
  { href: "/min-side/okonomi", key: "economy", icon: Wallet },
  { href: "/min-side/pamelding", key: "enroll", icon: ClipboardPen },
] as const;

export function PortalNav({ variant }: { variant: "top" | "bottom" }) {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();
  const items = ITEMS.map((item) => ({
    ...item,
    active:
      item.href === "/min-side"
        ? pathname === "/min-side" || pathname.startsWith("/min-side/barn")
        : pathname.startsWith(item.href),
  }));

  if (variant === "bottom") {
    return (
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/8 bg-background/95 pb-[env(safe-area-inset-bottom)] supports-backdrop-filter:backdrop-blur-md sm:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold outline-none transition-colors focus-visible:bg-muted",
                    item.active ? "text-brand-green-dark" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      item.active && "bg-primary/12",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                  </span>
                  <span className="max-w-full truncate">{t(item.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={t("label")} className="mx-auto hidden w-full max-w-6xl px-6 pb-2 sm:block">
      <ul className="flex gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  item.active
                    ? "bg-primary/12 text-brand-green-dark ring-primary/30"
                    : "bg-card text-foreground ring-foreground/10 hover:bg-muted",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

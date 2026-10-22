"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function FinanceTabs({
  basePath,
  reviewCount,
}: {
  basePath: string;
  reviewCount: number;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const root = `${basePath}/betaling`;
  const tabs = [
    { href: root, label: "Oversikt" },
    { href: `${root}/logg`, label: "Betalingslogg" },
    { href: `${root}/avdrag`, label: "Avdrag" },
    { href: `${root}/rabatter`, label: "Rabatter" },
    { href: `${root}/sadaqa`, label: "Sadaqa" },
    { href: `${root}/avstemming`, label: "Avstemming" },
    { href: `${root}/dobbeltforinger`, label: "Til kontroll", count: reviewCount },
  ];

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Økonomi" className="relative -mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b border-[#E3DED3]">
        {tabs.map((tab) => {
          const active =
            tab.href === root ? pathname === root : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-bold whitespace-nowrap outline-none transition-colors focus-visible:rounded-t-lg focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-[#277A31] text-[#18201A]"
                    : "border-transparent text-admin-muted hover:border-[#DCD7CC] hover:text-[#18201A]",
                )}
              >
                {tab.label}
                {tab.count ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#F9DEDB] px-1.5 text-xs font-bold text-[#8B2F2B] tabular-nums">
                    <span className="sr-only">, </span>
                    {tab.count}
                    <span className="sr-only"> saker</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

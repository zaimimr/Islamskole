"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function FinanceTabs({
  basePath,
  reviewCount,
}: {
  basePath: string;
  reviewCount: number;
}) {
  const pathname = usePathname();
  const root = `${basePath}/betaling`;
  const primary = [
    { href: root, label: "Oversikt" },
    { href: `${root}/oppfolging`, label: "Oppfølging" },
    { href: `${root}/avdrag`, label: "Avdrag" },
  ];
  const tools = [
    { href: `${root}/logg`, label: "Betalingslogg" },
    { href: `${root}/rabatter`, label: "Rabatter og fritak" },
    { href: `${root}/sadaqa`, label: "Sadaqa" },
    { href: `${root}/avstemming`, label: "Avstemming" },
    { href: `${root}/dobbeltforinger`, label: "Til kontroll", count: reviewCount },
  ];

  const activeTool = tools.find((tool) => pathname.startsWith(tool.href));
  const linkClass = "inline-flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-2 text-sm font-bold outline-none transition-colors focus-visible:rounded-t-lg focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3";

  return (
    <nav aria-label="Betaling" className="min-w-0">
      <ul className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-start border-b border-[#E3DED3] sm:flex sm:flex-wrap sm:gap-1">
        {primary.map((tab) => {
          const active =
            tab.href === root ? pathname === root : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  linkClass,
                  active
                    ? "border-[#277A31] text-[#18201A]"
                    : "border-transparent text-admin-muted hover:border-[#DCD7CC] hover:text-[#18201A]",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(linkClass, "w-full", activeTool
                ? "border-[#277A31] text-foreground"
                : "border-transparent text-admin-muted hover:border-[#DCD7CC] hover:text-foreground")}
              aria-label={activeTool ? `${activeTool.label}, flere betalingsverktøy` : "Flere betalingsverktøy"}
            >
              <span className="hidden sm:inline">{activeTool?.label ?? "Flere verktøy"}</span>
              <span className="sm:hidden">Mer</span>
              {reviewCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#F9DEDB] px-1 text-xs font-bold tabular-nums text-[#8B2F2B]">
                  {reviewCount}<span className="sr-only"> til kontroll</span>
                </span>
              ) : null}
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {tools.map((tool) => (
                <DropdownMenuItem
                  key={tool.href}
                  nativeButton={false}
                  render={<Link href={tool.href} aria-current={activeTool === tool ? "page" : undefined} />}
                  className={cn("justify-between", activeTool === tool && "bg-[#F0F8F1] font-bold text-[#216A2B]")}
                >
                  {tool.label}
                  {tool.count ? <span className="font-bold tabular-nums text-[#8B2F2B]">{tool.count}</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}

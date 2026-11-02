"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Backpack, CalendarClock, GraduationCap } from "lucide-react";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { cn } from "@/lib/utils";

export function AdminBottomNav({ basePath, loginHref }: { basePath: string; loginHref: string }) {
  const pathname = usePathname();
  const items = [
    { path: "/dagsplan", label: "Dagplan", icon: CalendarClock },
    { path: "/elever", label: "Elever", icon: Backpack },
    { path: "/klasser", label: "Klasser", icon: GraduationCap },
  ];

  return (
    <nav aria-label="Hovednavigasjon" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-[#E3DED3] bg-white px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden print:hidden">
      {items.map(({ path, label, icon: Icon }) => {
        const href = `${basePath}${path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={path} href={href} aria-current={active ? "page" : undefined}
          className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", active ? "bg-[#E7F1E7] text-admin-action" : "text-admin-muted")}>
          <Icon aria-hidden="true" className="size-5" />
          <span>{label}</span>
        </Link>;
      })}
      <AdminMobileNav basePath={basePath} loginHref={loginHref} isAdmin bottom active={!items.some((item) => pathname === `${basePath}${item.path}` || pathname.startsWith(`${basePath}${item.path}/`))} />
    </nav>
  );
}

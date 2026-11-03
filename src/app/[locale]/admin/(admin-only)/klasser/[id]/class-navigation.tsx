"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ClassNavigation({ href, current }: { href: string; current: string }) {
  const teaching = ["undervisning", "semesterplan", "materiell", "aktiviteter"].includes(current);
  const items = [
    { label: "Oversikt", href, active: current === "klasseinfo" },
    { label: "Elever", href: `${href}?fane=elever`, active: current === "elever" },
    { label: "Undervisning", href: `${href}?fane=undervisning`, active: teaching },
  ];
  return (
    <nav aria-label="Klassevisning" className="sticky top-20 z-10 grid grid-cols-3 gap-1 border-b border-[#E3DED3] bg-background py-1 print:hidden">
      {items.map((item) => <Link key={item.label} href={item.href} aria-current={item.active ? "page" : undefined} className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-lg px-1 text-sm font-bold text-admin-muted outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-white aria-[current=page]:text-admin-action aria-[current=page]:ring-1 aria-[current=page]:ring-foreground/10">{item.label}</Link>)}
    </nav>
  );
}

export function ClassActionsMenu({ href, current }: { href: string; current: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="icon" variant="ghost" aria-label="Klassehandlinger" className="size-11 shrink-0 print:hidden" />}><MoreHorizontal aria-hidden="true" className="size-5" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem nativeButton={false} render={<Link href={`${href}?fane=oppsett`} aria-current={current === "oppsett" ? "page" : undefined} />}><Pencil aria-hidden="true" />Oppsett for klassen</DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href={`${href}?fane=nettside`} aria-current={current === "nettside" ? "page" : undefined} />}><Globe aria-hidden="true" />På nettsiden</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

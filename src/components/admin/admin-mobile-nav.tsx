"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AdminMobileNav({
  basePath,
  isAdmin,
  loginHref,
}: {
  basePath: string;
  isAdmin: boolean;
  loginHref: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Åpne administrasjonsmenyen"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#E4E1D8] bg-white text-foreground outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
          />
        }
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[88%] max-w-[20rem] gap-0 overscroll-contain border-[#E4E1D8] bg-[#FEFEFE] p-0"
      >
        <SheetHeader className="border-b border-[#E9E5DC] px-5 py-4">
          <SheetTitle className="pr-10">
            <Image
              src="/brand/logo.png"
              alt="Islamskole Bærum"
              width={125}
              height={51}
              priority
            />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigasjon for administrasjonssystemet
          </SheetDescription>
          <SheetClose
            render={
              <button
                type="button"
                aria-label="Lukk administrasjonsmenyen"
                className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-xl text-admin-muted outline-none transition-colors hover:bg-[#F2F1EB] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            }
          >
            <X aria-hidden="true" className="size-5" />
          </SheetClose>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
          <SidebarNav
            basePath={basePath}
            isAdmin={isAdmin}
            onNavigate={() => setOpen(false)}
          />
          <div className="mt-3 border-t border-[#E9E5DC] pt-3">
            <SignOutButton
              loginHref={loginHref}
              className="min-h-10 rounded-lg px-3 font-semibold text-foreground/72 hover:bg-[#F2F1EB]"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import type { Metadata } from "next";
import NextLink from "next/link";
import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/site/Logo";
import { LocaleSwitcher } from "@/components/site/LocaleSwitcher";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import { PortalNav } from "@/components/portal/portal-nav";
import { getAccess, getUser } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal/data";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/impersonation/banner";

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]/min-side">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PortalLayout({
  children,
  params,
}: LayoutProps<"/[locale]/min-side">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, user, access, context] = await Promise.all([
    getTranslations("portal"),
    getUser(),
    getAccess(),
    getPortalContext(),
  ]);

  return (
    <div data-portal-shell className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-foreground/8 bg-background/90 supports-backdrop-filter:backdrop-blur-md">
        <ImpersonationBanner />
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
          <Logo priority className="mr-auto" />
          <LocaleSwitcher />
          {access.admin || access.permissions.size > 0 ? (
            <NextLink
              href="/admin"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{t("adminLink")}</span>
              <span className="sr-only sm:hidden">{t("adminLink")}</span>
            </NextLink>
          ) : null}
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              <p className="hidden min-w-0 text-right text-sm leading-tight sm:block">
                <span className="block text-muted-foreground">{t("signedInAs")}</span>
                <span className="block max-w-[14rem] truncate font-semibold">{user.email}</span>
              </p>
              <PortalSignOutButton label={t("signOut")} />
            </div>
          ) : null}
        </div>
        {context.isGuardian ? <PortalNav variant="top" /> : null}
      </header>
      {user ? (
        <p className="mx-auto w-full max-w-6xl truncate px-4 pt-3 text-sm text-muted-foreground sm:hidden">
          {t("signedInAs")} <span className="font-semibold text-foreground">{user.email}</span>
        </p>
      ) : null}
      <div
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8",
          context.isGuardian && "pb-28 sm:pb-8",
        )}
      >
        {children}
      </div>
      {context.isGuardian ? <PortalNav variant="bottom" /> : null}
    </div>
  );
}

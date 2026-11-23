import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PortalLoginForm } from "@/components/portal/portal-login-form";
import { Button } from "@/components/ui/button";
import { getIsAdmin, getUser } from "@/lib/auth";
import { resolvePostLoginPath, safeNextPath } from "@/lib/auth-redirect";

export default async function PortalLoginPage({
  params,
  searchParams,
}: PageProps<"/[locale]/min-side/logg-inn">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, query, t] = await Promise.all([
    getUser(),
    searchParams,
    getTranslations("portal"),
  ]);
  const next = safeNextPath(typeof query.next === "string" ? query.next : null);
  const vippsParams = new URLSearchParams({ locale });
  if (next) vippsParams.set("next", next);
  const vippsHref = `/api/auth/vipps/start?${vippsParams}`;
  const vippsError = query.vipps === "ingen-konto" || query.vipps === "feil" ? query.vipps : null;
  if (user) {
    redirect(resolvePostLoginPath({ next, isAdmin: await getIsAdmin(), locale }));
  }

  return (
    <div className="mx-auto grid w-full max-w-md gap-6 pt-2 sm:pt-8">
      <div className="grid gap-2">
        <h1 className="font-heading text-3xl font-semibold text-balance">{t("login.title")}</h1>
        <p className="text-pretty text-muted-foreground">{t("login.intro")}</p>
      </div>
      <div className="soft-card grid gap-5 p-5 sm:p-7">
        {vippsError ? (
          <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t(vippsError === "ingen-konto" ? "login.vippsNoAccount" : "login.vippsFailed")}
          </p>
        ) : null}
        <Button
          nativeButton={false}
          render={<a href={vippsHref} />}
          className="h-12 w-full rounded-xl bg-[#ff5b24] text-base font-semibold text-white hover:bg-[#e64f1a] focus-visible:ring-[#ff5b24]/40"
        >
          {t("login.vipps")}
        </Button>
        <p className="text-center text-sm text-muted-foreground">{t("login.or")}</p>
        <PortalLoginForm
          invalidLink={query.lenke === "ugyldig"}
          next={next ?? undefined}
        />
      </div>
    </div>
  );
}

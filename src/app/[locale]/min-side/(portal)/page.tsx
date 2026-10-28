import NextLink from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ParentHome } from "@/components/portal/parent-home";
import { StudentHome } from "@/components/portal/student-home";
import { TeacherHome } from "@/components/portal/teacher-home";
import { PortalOnboarding } from "@/components/portal/onboarding";
import { PortalTabs } from "@/components/portal/parent/portal-tabs";
import { buttonVariants } from "@/components/ui/button";
import { getSiteSettings } from "@/lib/data";
import { TeacherSuspendedNotice } from "@/components/portal/teacher/suspended-notice";
import { getPortalContext, isRegisteredTeacher, isSuspendedTeacher } from "@/lib/portal/data";

export default async function PortalHomePage({
  params,
  searchParams,
}: PageProps<"/[locale]/min-side">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [context, t, tCommon, settings] = await Promise.all([
    getPortalContext(),
    getTranslations("portal.home"),
    getTranslations("portal.common"),
    getSiteSettings(),
  ]);
  if (!context.user) redirect({ href: "/min-side/logg-inn", locale });

  const [registered, suspended] = await Promise.all([isRegisteredTeacher(), isSuspendedTeacher()]);
  const isTeacher = context.isTeacher || registered;
  const hasRole = context.isGuardian || isTeacher || context.isStudent || suspended;

  return (
    <div className="grid gap-8">
      <h1 className="sr-only">{t("title")}</h1>
      <PortalOnboarding locale={locale} context={context} />
      {suspended ? <TeacherSuspendedNotice /> : null}
      {isTeacher && context.isGuardian ? (
        <PortalTabs
          defaultTab={query.fane === "klasse" ? "klasse" : "barn"}
          parentLabel={t("parentTitle")}
          teacherLabel={t("teacherTitle")}
          parent={<ParentHome locale={locale} />}
          teacher={<TeacherHome locale={locale} />}
        />
      ) : null}
      {isTeacher && !context.isGuardian ? <TeacherHome locale={locale} /> : null}
      {context.isGuardian && !isTeacher ? <ParentHome locale={locale} /> : null}
      {context.isStudent ? <StudentHome locale={locale} /> : null}
      {!hasRole ? (
        <div className="soft-card grid gap-4 p-6 sm:p-8">
          <h2 className="font-heading text-2xl font-semibold text-balance">
            {t("emptyTitle")}
          </h2>
          <p className="text-pretty text-muted-foreground">
            {t("empty", { email: context.email ?? "" })}
          </p>
          {settings?.contact_email ? (
            <p className="text-pretty">
              {tCommon("writeTo")}{" "}
              <a
                href={`mailto:${settings.contact_email}`}
                className="rounded-sm font-semibold text-brand-green-dark underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {settings.contact_email}
              </a>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/kontakt" className={buttonVariants()}>
              {t("contact")}
            </Link>
            {context.isAdmin ? (
              <NextLink href="/admin" className={buttonVariants({ variant: "outline" })}>
                {t("adminLink")}
              </NextLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

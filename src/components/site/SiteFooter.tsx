import { getTranslations } from "next-intl/server";
import { MailIcon, MapPinIcon, ClockIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getSiteSettings } from "@/lib/data";
import { Logo } from "./Logo";
import { WaveDivider } from "./decor";
import { FacebookIcon, InstagramIcon } from "./brand-icons";
import { FooterAccountLink } from "./FooterAccountLink";

const exploreLinks = [
  { href: "/klasser", key: "classes" },
  { href: "/aktiviteter", key: "events" },
  { href: "/om-oss", key: "about" },
  { href: "/bli-laerer", key: "teacher" },
  { href: "/kontakt", key: "contact" },
  { href: "/donasjon", key: "donate" },
] as const;

export async function SiteFooter() {
  const t = await getTranslations();
  const settings = await getSiteSettings();

  const email = settings?.contact_email ?? "baerum@islamskole.no";
  const enrollEmail = settings?.enroll_email ?? "opptak@islamskole.no";
  const address = settings?.address ?? t("contact.addressValue");
  const hours = settings?.hours ?? t("contact.hoursValue");
  const facebook = settings?.facebook_url ?? null;
  const instagram = settings?.instagram_url ?? null;

  return (
    <footer className="site-footer mt-auto text-primary-foreground">
      <div className="bg-background text-primary">
        <WaveDivider className="text-brand-green-dark" />
      </div>
      <div className="bg-brand-green-dark">
        <div className="section-shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <Logo variant="white" />
            <p className="max-w-xs text-base text-primary-foreground/85">
              {t("footer.tagline")}
            </p>
            {(facebook || instagram) && (
              <div className="flex items-center gap-3 pt-1">
                {facebook && (
                  <a
                    href={facebook}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("contact.facebook")}
                    className="inline-flex size-10 items-center justify-center rounded-full bg-primary-foreground/12 transition-colors hover:bg-primary-foreground/25 focus-visible:ring-3 focus-visible:ring-primary-foreground/50 outline-none"
                  >
                    <FacebookIcon className="size-5" />
                  </a>
                )}
                {instagram && (
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("contact.instagram")}
                    className="inline-flex size-10 items-center justify-center rounded-full bg-primary-foreground/12 transition-colors hover:bg-primary-foreground/25 focus-visible:ring-3 focus-visible:ring-primary-foreground/50 outline-none"
                  >
                    <InstagramIcon className="size-5" />
                  </a>
                )}
              </div>
            )}
          </div>

          <nav aria-label={t("footer.explore")} className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">
              {t("footer.explore")}
            </h2>
            <ul className="flex flex-col sm:gap-2.5">
              {exploreLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center text-primary-foreground/85 transition-colors hover:text-primary-foreground focus-visible:underline outline-none sm:min-h-0"
                  >
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">
              {t("footer.getInTouch")}
            </h2>
            <ul className="flex flex-col gap-3 text-primary-foreground/85">
              <li className="flex items-start gap-3">
                <MailIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <a
                  href={`mailto:${email}`}
                  className="-my-1 py-1 hover:text-primary-foreground focus-visible:underline outline-none"
                >
                  {email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MailIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <a
                  href={`mailto:${enrollEmail}`}
                  className="-my-1 py-1 hover:text-primary-foreground focus-visible:underline outline-none"
                >
                  {enrollEmail}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPinIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span>{address}</span>
              </li>
              <li className="flex items-start gap-3">
                <ClockIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span>{hours}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/15">
          <div className="section-shell flex flex-col items-center justify-between gap-2 py-5 text-sm text-primary-foreground/70 sm:flex-row">
            <p className="text-center sm:text-left">
              &copy; {new Date().getFullYear()} Islamskole Bærum.{" "}
              {t("footer.rights")} Org.nr 917 342 385.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link
                href="/salgsbetingelser"
                className="inline-flex min-h-11 items-center font-semibold sm:min-h-0 transition-colors hover:text-primary-foreground focus-visible:underline outline-none"
              >
                {t("footer.legal")}
              </Link>
              <span>Skuiveien 40, 1339 Vøyenenga</span>
              <FooterAccountLink />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

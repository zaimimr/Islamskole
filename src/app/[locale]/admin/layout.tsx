import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CalendarRange, House, UserRound } from "lucide-react";
import { getIsAdmin, getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { CommandPalette } from "@/components/admin/command-palette";
import {
  NavCountsProvider,
  SidebarNav,
  type NavCounts,
} from "@/components/admin/sidebar-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { ImpersonationBanner } from "@/components/impersonation/banner";
import { adminBasePath, localePrefix, loginPath } from "@/components/admin/paths";

export const metadata: Metadata = {
  title: {
    template: "%s · Admin · Islamskole Bærum",
    default: "Admin",
  },
  robots: { index: false, follow: false },
};

async function getNavCounts(): Promise<NavCounts> {
  try {
    const supabase = await createClient();
    const [applications, teacherApplications] = await Promise.all([
      supabase
        .from("student_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny"),
      supabase
        .from("teacher_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "ny"),
    ]);
    return {
      applications: applications.count ?? 0,
      teacherApplications: teacherApplications.count ?? 0,
    };
  } catch {
    return { applications: 0, teacherApplications: 0 };
  }
}

async function getActiveSchoolYear() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_years")
    .select("label")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { label: null, unavailable: true };
  }

  return {
    label: (data as { label: string } | null)?.label ?? null,
    unavailable: false,
  };
}

async function ActiveSchoolYearLabel() {
  const schoolYear = await getActiveSchoolYear();
  return schoolYear.unavailable
    ? "Skoleår utilgjengelig"
    : (schoolYear.label ?? "Velg skoleår");
}

async function hasPortalRole(email: string | undefined) {
  if (!email) return false;
  const pattern = email.replace(/[\\%_]/g, "\\$&");
  const admin = createAdminClient();
  const [guardians, students] = await Promise.all([
    admin.from("guardians").select("id").ilike("email", pattern).limit(1),
    admin.from("students").select("id").ilike("child_email", pattern).limit(1),
  ]);
  return Boolean(guardians.data?.length || students.data?.length);
}

async function PortalLink({
  email,
  href,
}: {
  email: string | undefined;
  href: string;
}) {
  if (!(await hasPortalRole(email))) return null;
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[#E4E1D8] bg-white px-3 text-sm font-bold text-foreground outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <House aria-hidden="true" className="size-4 text-[#3C8F44]" />
      <span className="hidden xl:inline">Min side</span>
      <span className="sr-only xl:hidden">Min side</span>
    </Link>
  );
}

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const [user, isAdmin] = await Promise.all([getUser(), getIsAdmin()]);
  if (!user) {
    redirect(`${loginPath(locale)}?next=${encodeURIComponent(adminBasePath(locale))}`);
  }
  if (!isAdmin) {
    redirect(`${localePrefix(locale)}/min-side`);
  }
  const navCounts = getNavCounts();

  const basePath = adminBasePath(locale);
  const resolvedLoginPath = loginPath(locale);

  return (
    <NavCountsProvider counts={navCounts}>
      <div
        data-admin-shell
        className="flex min-h-dvh w-full overflow-x-clip bg-[#FCFAF5] text-[#18201A]"
      >
        <a
          href="#admin-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-xl focus:bg-admin-action focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
        >
          Hopp til innholdet
        </a>
        <aside className="sticky top-0 hidden h-dvh print:hidden w-[16.5rem] shrink-0 flex-col border-r border-[#E9E5DC] bg-[#FEFEFE] px-4 py-5 lg:flex">
          <Link
            href={basePath}
            aria-label="Gå til arbeidsflaten"
            className="mb-6 inline-flex w-fit rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Image
              src="/brand/logo.png"
              alt="Islamskole Bærum"
              width={125}
              height={51}
              priority
            />
          </Link>
          <SidebarNav basePath={basePath} />
          <div className="mt-3 border-t border-[#E9E5DC] pt-3">
            <SignOutButton
              loginHref={resolvedLoginPath}
              className="min-h-10 rounded-lg px-3 font-semibold text-foreground/72 hover:bg-[#F2F1EB]"
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b print:hidden border-[#E9E5DC] bg-[#FCFAF5]/95 supports-backdrop-filter:backdrop-blur-md">
            <ImpersonationBanner />
            <div className="mx-auto flex w-full max-w-[96rem] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8 lg:py-3">
              <AdminMobileNav
                basePath={basePath}
                loginHref={resolvedLoginPath}
              />
              <Link
                href={basePath}
                aria-label="Gå til arbeidsflaten"
                className="mr-auto inline-flex min-h-11 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
              >
                <Image
                  src="/brand/logo.png"
                  alt="Islamskole Bærum"
                  width={96}
                  height={39}
                  priority
                />
              </Link>

              <Link
                href={`${basePath}/skolear`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[#E4E1D8] bg-white px-3 text-sm font-bold text-foreground outline-none transition-colors hover:border-[#BFD9C2] hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-w-[10.5rem] lg:px-4"
              >
                <CalendarRange
                  aria-hidden="true"
                  className="size-4 text-[#3C8F44]"
                />
                <span className="sr-only">Aktivt skoleår: </span>
                <span className="max-w-[6.5rem] truncate sm:max-w-none">
                  <Suspense
                    fallback={
                      <span className="inline-block h-4 w-[4.5rem] animate-pulse rounded-md bg-muted align-middle" />
                    }
                  >
                    <ActiveSchoolYearLabel />
                  </Suspense>
                </span>
              </Link>

              <div className="flex lg:mx-auto lg:w-full lg:max-w-[46rem]">
                <CommandPalette basePath={basePath} />
              </div>

              <Suspense fallback={null}>
                <PortalLink
                  email={user.email}
                  href={`${localePrefix(locale)}/min-side`}
                />
              </Suspense>

              <Link
                href={`${basePath}/konto`}
                className="hidden shrink-0 items-center gap-2 rounded-xl border border-[#E4E1D8] bg-white px-3 text-foreground outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50 lg:inline-flex lg:min-h-11"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
                  <UserRound aria-hidden="true" className="size-4" />
                </span>
                <span className="hidden text-sm font-bold xl:inline">
                  Min konto
                </span>
                <span className="sr-only xl:hidden">Min konto</span>
              </Link>
            </div>
          </header>

          <div
            id="admin-content"
            tabIndex={-1}
            className="flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8"
          >
            <div className="mx-auto w-full max-w-[96rem]">{children}</div>
          </div>
        </div>
      </div>
    </NavCountsProvider>
  );
}

"use client";

import { Suspense, createContext, use, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CircleUserRound,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavCounts = {
  applications: number;
  teacherApplications: number;
};

const NavCountsContext = createContext<Promise<NavCounts> | null>(null);

export function NavCountsProvider({
  counts,
  children,
}: {
  counts: Promise<NavCounts>;
  children: React.ReactNode;
}) {
  return (
    <NavCountsContext.Provider value={counts}>
      {children}
    </NavCountsContext.Provider>
  );
}

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  alsoMatches?: string[];
  countKey?: keyof NavCounts;
  countLabel?: string;
};

type NavGroup = {
  label: string | null;
  links: NavLink[];
};

function buildNavigation(basePath: string) {
  const groups: NavGroup[] = [
    {
      label: null,
      links: [{ href: basePath, label: "Arbeidsflate", icon: LayoutDashboard }],
    },
    {
      label: "Skolen",
      links: [
        {
          href: `${basePath}/register`,
          label: "Opptak",
          icon: ClipboardCheck,
          countKey: "applications",
          countLabel: "nye innmeldinger",
        },
        {
          href: `${basePath}/familier`,
          label: "Familier",
          icon: Users,
          alsoMatches: [`${basePath}/elever`],
        },
        { href: `${basePath}/klasser`, label: "Klasser", icon: GraduationCap },
        { href: `${basePath}/dagsplan`, label: "Dagsplan", icon: CalendarClock },
        { href: `${basePath}/beskjeder`, label: "Beskjeder", icon: Megaphone },
        {
          href: `${basePath}/laerere`,
          label: "Lærere",
          icon: UserCheck,
          countKey: "teacherApplications",
          countLabel: "nye lærersøknader",
        },
        { href: `${basePath}/betaling`, label: "Økonomi", icon: Wallet },
      ],
    },
    {
      label: "Nettside",
      links: [
        {
          href: `${basePath}/aktiviteter`,
          label: "Aktiviteter",
          icon: CalendarDays,
        },
        {
          href: `${basePath}/innstillinger`,
          label: "Innstillinger",
          icon: Settings,
        },
      ],
    },
    {
      label: "Oppsett",
      links: [
        { href: `${basePath}/skolear`, label: "Skoleår", icon: CalendarRange },
        { href: `${basePath}/brukere`, label: "Brukere", icon: ShieldCheck },
        {
          href: `${basePath}/revisjon`,
          label: "Revisjonshistorikk",
          icon: ScrollText,
        },
      ],
    },
  ];

  const account: NavLink = {
    href: `${basePath}/konto`,
    label: "Min konto",
    icon: CircleUserRound,
  };

  return { groups, account };
}

function NavCountBadge({
  countKey,
  label,
}: {
  countKey: keyof NavCounts;
  label?: string;
}) {
  const promise = useContext(NavCountsContext);
  const count = promise ? use(promise)[countKey] : 0;
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-[#FEEDCA] px-1.5 py-0.5 text-xs font-bold text-[#6B4A06] tabular-nums">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function NavItem({
  link,
  active,
  onSelect,
}: {
  link: NavLink;
  active: boolean;
  onSelect: (href: string) => void;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(link.href)}
      className={cn(
        "group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-[#DCEDDD] text-[#216A2B]"
          : "text-foreground/72 hover:bg-[#F2F1EB] hover:text-foreground",
      )}
    >
      <Icon
        aria-hidden={true}
        className={cn(
          "size-[1.125rem] shrink-0 stroke-[1.8]",
          active
            ? "text-[#3C8F44]"
            : "text-admin-muted group-hover:text-foreground/75",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      {link.countKey ? (
        <Suspense fallback={null}>
          <NavCountBadge countKey={link.countKey} label={link.countLabel} />
        </Suspense>
      ) : null}
    </Link>
  );
}

export function SidebarNav({
  basePath,
  onNavigate,
}: {
  basePath: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ href: string; from: string } | null>(
    null,
  );
  const navigation = buildNavigation(basePath);
  const currentPath =
    pending && pending.from === pathname ? pending.href : pathname;

  function matchesPath(href: string) {
    if (href === basePath) return currentPath === basePath;
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }

  function isActive(link: NavLink) {
    return (
      matchesPath(link.href) ||
      (link.alsoMatches ?? []).some((href) => matchesPath(href))
    );
  }

  function select(href: string) {
    setPending({ href, from: pathname });
    onNavigate?.();
  }

  return (
    <nav
      aria-label="Administrasjon"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1"
    >
      <div className="grid gap-5">
        {navigation.groups.map((group) => (
          <section
            key={group.label ?? "start"}
            aria-labelledby={group.label ? `nav-${group.label}` : undefined}
          >
            {group.label ? (
              <h2
                id={`nav-${group.label}`}
                className="mb-1.5 px-3 font-sans text-[0.6875rem] font-bold tracking-[0.08em] text-admin-muted uppercase"
              >
                {group.label}
              </h2>
            ) : null}
            <ul className="grid gap-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <NavItem
                    link={link}
                    active={isActive(link)}
                    onSelect={select}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-auto pt-5 lg:hidden">
        <NavItem
          link={navigation.account}
          active={isActive(navigation.account)}
          onSelect={select}
        />
      </div>
    </nav>
  );
}

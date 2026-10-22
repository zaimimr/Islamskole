import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CircleAlert,
  Layers3,
  Plus,
  UsersRound,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { formatOsloDate, osloToday } from "@/lib/dates";
import { schoolYearStart } from "@/lib/age";

export const metadata: Metadata = { title: "Skoleår" };

type YearRow = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  fee: number | null;
  enrollments: { status: string }[];
};

function activeCount(year: YearRow) {
  return (year.enrollments ?? []).filter((row) => row.status === "aktiv")
    .length;
}

async function getYears(): Promise<YearRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_years")
      .select(
        "id, label, starts_on, ends_on, is_active, fee, enrollments(status)",
      )
      .order("label", { ascending: false });
    return (data as YearRow[] | null) ?? [];
  } catch {
    return [];
  }
}

function formatDate(value: string | null) {
  return formatOsloDate(value) || null;
}

function isUpcoming(year: YearRow, activeYear: YearRow | null, today: string) {
  if (year.is_active) return false;
  if (year.starts_on) return year.starts_on > today;
  const start = schoolYearStart(year.label);
  const activeStart = schoolYearStart(activeYear?.label);
  return start != null && activeStart != null && start > activeStart;
}

export default async function SkolearPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const years = await getYears();
  const activeYear = years.find((year) => year.is_active) ?? null;
  const today = osloToday();
  const upcomingYears = years
    .filter((year) => isUpcoming(year, activeYear, today))
    .reverse();
  const historicalYears = years.filter(
    (year) => !year.is_active && !isUpcoming(year, activeYear, today),
  );

  return (
    <div className="grid gap-6 lg:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Skoleår
          </h1>
          <p className="mt-1 max-w-2xl text-admin-muted">
            Hold plassering, skolepenger og videreføring knyttet til riktig år.
          </p>
        </div>
        <Link
          href={`${basePath}/skolear/ny`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus aria-hidden="true" className="size-4" />
          Nytt skoleår
        </Link>
      </header>

      {activeYear ? (
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCEDDD] px-2.5 py-1 text-xs font-bold text-[#216A2B]">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-[#3C8F44]"
                />
                Aktivt skoleår
              </span>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
                {activeYear.label}
              </h2>
              <p className="mt-1 text-sm text-admin-muted">
                {formatDate(activeYear.starts_on) &&
                formatDate(activeYear.ends_on)
                  ? `${formatDate(activeYear.starts_on)} - ${formatDate(activeYear.ends_on)}`
                  : "Periode er ikke registrert"}
              </p>
            </div>

            <dl className="grid gap-3 rounded-xl bg-[#F7F6F1] p-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DDEEF9] text-[#245D84]">
                  <UsersRound aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <dt className="text-xs text-admin-muted">Elever med plass</dt>
                  <dd className="font-heading text-xl font-bold tabular-nums">
                    {activeCount(activeYear)}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
                  <Wallet aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <dt className="text-xs text-admin-muted">Årsavgift</dt>
                  <dd className="font-heading text-xl font-bold tabular-nums">
                    {activeYear.fee != null
                      ? `${activeYear.fee.toLocaleString("nb-NO")} kr`
                      : "Ikke satt"}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
          <Link
            href={`${basePath}/skolear/${activeYear.id}`}
            className="group flex min-h-14 items-center justify-between gap-4 border-t border-[#ECE8DF] px-5 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-6"
          >
            Åpne elever, betaling og innstillinger
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl bg-[#FFF8E9] p-5 ring-1 ring-[#ECDCB9] sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
              <CircleAlert aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold">
                Aktivt skoleår mangler
              </h2>
              <p className="mt-0.5 max-w-xl text-sm text-[#6D5A2D]">
                Velg et aktivt skoleår før nye plasseringer og innkrevinger
                fortsetter.
              </p>
            </div>
          </div>
          <Link
            href={`${basePath}/skolear/ny`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#E9B63B] px-4 text-sm font-bold text-[#392B08] outline-none transition-colors hover:bg-[#DDA726] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Opprett skoleår
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      )}

      {upcomingYears.length > 0 ? (
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
          <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
            <h2 className="font-heading text-xl font-bold">Kommende skoleår</h2>
            <p className="mt-0.5 text-sm text-admin-muted">
              Opprettet på forhånd. Gjør året aktivt når det starter.
            </p>
          </div>
          <YearList years={upcomingYears} basePath={basePath} />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <h2 className="font-heading text-xl font-bold">Tidligere skoleår</h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Historikk for elever, avgifter og betalinger beholdes per skoleår.
          </p>
        </div>

        {historicalYears.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
            {activeYear ? (
              <CalendarRange
                aria-hidden="true"
                className="size-7 text-admin-muted"
              />
            ) : (
              <Layers3 aria-hidden="true" className="size-7 text-admin-muted" />
            )}
            <p className="mt-3 font-bold">Ingen tidligere skoleår</p>
            <p className="mt-1 text-sm text-admin-muted">
              Avsluttede skoleår vil bli liggende her som historikk.
            </p>
          </div>
        ) : (
          <YearList years={historicalYears} basePath={basePath} />
        )}
      </section>
    </div>
  );
}

function YearList({ years, basePath }: { years: YearRow[]; basePath: string }) {
  return (
    <ul className="divide-y divide-[#ECE8DF]">
      {years.map((year) => {
        const start = formatDate(year.starts_on);
        const end = formatDate(year.ends_on);
        const count = activeCount(year);
        return (
          <li key={year.id}>
            <Link
              href={`${basePath}/skolear/${year.id}`}
              className="group grid min-h-20 gap-3 px-4 py-4 outline-none transition-colors hover:bg-[#FBFAF6] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(13rem,1.2fr)_minmax(8rem,0.65fr)_minmax(6rem,0.45fr)_auto] sm:items-center sm:px-5"
            >
              <span className="font-heading text-lg font-bold">
                {year.label}
              </span>
              <span className="text-sm text-admin-muted">
                {start && end ? `${start} - ${end}` : "Periode mangler"}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {year.fee != null
                  ? `${year.fee.toLocaleString("nb-NO")} kr per år`
                  : "Avgift mangler"}
              </span>
              <span className="text-sm text-admin-muted">
                {count} {count === 1 ? "elev med plass" : "elever med plass"}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-admin-muted transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

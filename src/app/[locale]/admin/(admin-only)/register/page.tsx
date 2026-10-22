import type { Metadata } from "next";
import { Suspense, cache } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Phone,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { studentDisplayName } from "@/lib/student-name";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { formatOsloDateTime } from "@/lib/dates";
import { adminBasePath } from "@/components/admin/paths";
import { StudentStatusMenu } from "@/components/admin/student-status-select";
import { Pagination } from "@/components/admin/pagination";
import {
  ListCardSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";
import { ExportButton } from "@/components/admin/export-button";
import {
  BulkActions,
  BulkSelectAll,
  BulkRowCheckbox,
} from "@/components/admin/bulk-actions";
import { AdmitDialog } from "./admit-dialog";
import { ApplicationFilters } from "./application-filters";
import { suggestPlacements, type PlacementClass } from "./placement";

export const metadata: Metadata = { title: "Opptak" };

type StudentApplicationRow = {
  id: string;
  family_id: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  child_birth_date: string | null;
  child_gender: string | null;
  child_address: string | null;
  child_postal_code: string | null;
  child_city: string | null;
  child_email: string | null;
  child_phone: string | null;
  mother_first_name: string | null;
  mother_last_name: string | null;
  mother_phone: string | null;
  mother_email: string | null;
  father_first_name: string | null;
  father_last_name: string | null;
  father_phone: string | null;
  father_email: string | null;
  desired_class: string | null;
  child_level_quran: string | null;
  child_level_arabic: string | null;
  child_level_islam: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  payment_id: string | null;
  payments: { status: string | null } | null;
};

const paymentLabels: Record<string, string> = {
  fanget: "Betalt",
  autorisert: "Autorisert",
  opprettet: "Avventer betaling",
  avbrutt: "Avbrutt",
  feilet: "Feilet",
  refundert: "Refundert",
};

function paymentLabel(app: StudentApplicationRow): {
  label: string;
  paid: boolean;
} {
  const status = app.payments?.status ?? null;
  if (!app.payment_id || !status) {
    return { label: "Ikke startet", paid: false };
  }
  return { label: paymentLabels[status] ?? status, paid: status === "fanget" };
}

const genderLabels: Record<string, string> = {
  gutt: "Gutt",
  jente: "Jente",
};

function genderLabel(value: string | null): string {
  if (!value) return "-";
  return genderLabels[value] ?? value;
}

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

function addressLine(app: StudentApplicationRow): string {
  const parts = [
    app.child_address,
    [app.child_postal_code, app.child_city].filter(Boolean).join(" "),
  ].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(", ") : "-";
}

const levelLabels: Record<string, string> = {
  nybegynner: "Nybegynner",
  litt: "Litt erfaring",
  middels: "Middels",
  god: "God",
};

function levelLabel(value: string | null) {
  if (!value) return "-";
  return levelLabels[value] ?? value;
}

const OPEN_STATUSES = ["ny", "kontaktet", "akseptert"];

async function getApplications(
  q: string,
  status: string,
): Promise<StudentApplicationRow[] | null> {
  try {
    const supabase = await createClient();
    let query = supabase
      .rpc("admin_search_student_applications", { p_query: q })
      .select(
        "id, family_id, child_first_name, child_last_name, child_birth_date, child_gender, child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email, desired_class, child_level_quran, child_level_arabic, child_level_islam, message, status, created_at, payment_id, payments(status)",
      )
      .order("created_at", { ascending: false });

    if (!status) {
      query = query.in("status", OPEN_STATUSES);
    } else if (status !== "alle") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return null;
    return (data as StudentApplicationRow[] | null) ?? [];
  } catch {
    return null;
  }
}

async function getRegisteredMap(): Promise<Map<string, string> | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("students")
      .select("id, application_id")
      .not("application_id", "is", null);
    if (error) return null;
    const rows =
      (data as { id: string; application_id: string | null }[] | null) ?? [];
    return new Map(
      rows
        .filter((r) => r.application_id)
        .map((r) => [r.application_id as string, r.id]),
    );
  } catch {
    return null;
  }
}

type GuardianContact = {
  name: string;
  phone: string | null;
  email: string | null;
};

async function getFamilyGuardians(
  familyIds: string[],
): Promise<Map<string, GuardianContact[]>> {
  const byFamily = new Map<string, GuardianContact[]>();
  if (familyIds.length === 0) return byFamily;
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_guardians")
    .select("family_id, guardians(first_name, last_name, phone, email)")
    .in("family_id", familyIds)
    .order("sort_order", { ascending: true });
  for (const row of data ?? []) {
    const guardian = row.guardians as unknown as {
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
    } | null;
    if (!guardian) continue;
    byFamily.set(row.family_id, [
      ...(byFamily.get(row.family_id) ?? []),
      {
        name: fullName(guardian.first_name, guardian.last_name),
        phone: guardian.phone,
        email: guardian.email,
      },
    ]);
  }
  return byFamily;
}

async function getPlacementOptions(): Promise<{
  classes: PlacementClass[];
  activeYear: { id: string; label: string } | null;
}> {
  try {
    const supabase = await createClient();
    const [{ data: classes }, { data: year }] = await Promise.all([
      supabase
        .from("classes")
        .select("id, name_no, age_min, age_max, capacity")
        .order("sort_order", { ascending: true }),
      supabase
        .from("school_years")
        .select("id, label")
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    const activeYear = year as { id: string; label: string } | null;
    const { data: enrollments } = activeYear
      ? await supabase
          .from("enrollments")
          .select("class_id")
          .eq("school_year_id", activeYear.id)
          .eq("status", "aktiv")
      : { data: [] };
    const counts = new Map<string, number>();
    for (const row of (enrollments as { class_id: string }[] | null) ?? []) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
    }
    return {
      activeYear,
      classes: (
        (classes as
          | {
              id: string;
              name_no: string | null;
              age_min: number | null;
              age_max: number | null;
              capacity: number | null;
            }[]
          | null) ?? []
      ).map((c) => ({
        id: c.id,
        name: c.name_no ?? "(uten navn)",
        ageMin: c.age_min,
        ageMax: c.age_max,
        capacity: c.capacity,
        enrolled: counts.get(c.id) ?? 0,
      })),
    };
  } catch {
    return { classes: [], activeYear: null };
  }
}

const statusLabels: Record<string, { label: string; className: string }> = {
  ny: { label: "Ny", className: "bg-[#FEEDCA] text-[#775108]" },
  kontaktet: { label: "Kontaktet", className: "bg-[#DDEEF9] text-[#245D84]" },
  akseptert: { label: "Tatt opp", className: "bg-[#DCEDDD] text-[#216A2B]" },
  avslatt: { label: "Avslått", className: "bg-[#F9DEDB] text-[#8B2F2B]" },
  arkivert: { label: "Arkivert", className: "bg-[#F0F0ED] text-[#4D554F]" },
};

function telHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

function formatDate(value: string | null) {
  return formatOsloDateTime(value) || "-";
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  if (!value || value === "-") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">
        {href ? (
          <a
            href={href}
            className="inline-flex min-h-11 items-center font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

const PAGE_SIZE = 25;

const loadOpptak = cache(async (q: string, status: string, page: number) => {
  const [allApplications, registered, placement] = await Promise.all([
    getApplications(q, status),
    getRegisteredMap(),
    getPlacementOptions(),
  ]);
  if (!allApplications || !registered) return null;

  const unregistered = allApplications.filter((a) => !registered.has(a.id));
  const total = unregistered.length;
  const from = (page - 1) * PAGE_SIZE;
  const applications = unregistered.slice(from, from + PAGE_SIZE);
  const activeYear = placement.activeYear;
  const ageYear =
    schoolYearStart(activeYear?.label) ?? new Date().getFullYear();
  const filtered = Boolean(q || status);
  const pageIds = applications.map((a) => a.id);
  const newCount = unregistered.filter(
    (application) => (application.status ?? "ny") === "ny",
  ).length;
  const paidCount = unregistered.filter(
    (application) => paymentLabel(application).paid,
  ).length;
  const candidates = applications.map((application) => ({
    id: application.id,
    name: studentDisplayName(application) || "Navn mangler",
    age: ageInYear(application.child_birth_date, ageYear),
    desiredClass: application.desired_class,
  }));
  const suggestions = suggestPlacements(candidates, placement.classes);
  const familyGuardians = await getFamilyGuardians([
    ...new Set(
      applications
        .map((application) => application.family_id)
        .filter((familyId): familyId is string => Boolean(familyId)),
    ),
  ]);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  return {
    total,
    applications,
    activeYear,
    placement,
    filtered,
    pageIds,
    newCount,
    paidCount,
    candidates,
    suggestions,
    familyGuardians,
    candidateById,
  };
});

type OpptakQuery = { q: string; status: string; page: number };

async function OpptakStats({ q, status, page }: OpptakQuery) {
  const data = await loadOpptak(q, status, page);
  if (!data) return null;
  const { newCount, paidCount, total, filtered } = data;
  return (
  <section
    aria-label="Status for innmeldinger"
    className="grid grid-cols-3 divide-x divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
  >
    {[
      {
        value: newCount,
        label: "Nye",
        icon: CalendarClock,
        tone: "bg-[#FEEDCA] text-[#775108]",
      },
      {
        value: paidCount,
        label: "Har betalt",
        icon: CreditCard,
        tone: "bg-[#DCEDDD] text-[#216A2B]",
      },
      {
        value: total,
        label: filtered ? "I utvalget" : "Til behandling",
        icon: Users,
        tone: "bg-[#EFF8FD] text-[#245D7C]",
      },
    ].map((stat) => {
      const Icon = stat.icon;
      return (
        <div
          key={stat.label}
          className="flex items-center gap-3 px-3 py-3 sm:min-h-24 sm:px-5 sm:py-4"
        >
          <span
            className={`hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex ${stat.tone}`}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-heading text-xl font-bold tabular-nums sm:text-2xl">
              {stat.value}
            </p>
            <p className="text-xs text-admin-muted sm:text-sm">
              {stat.label}
            </p>
          </div>
        </div>
      );
    })}
  </section>
  );
}

async function OpptakList({
  q,
  status,
  page,
  basePath,
  sp,
}: OpptakQuery & {
  basePath: string;
  sp: { [key: string]: string | string[] | undefined };
}) {
  const data = await loadOpptak(q, status, page);
  if (!data) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <CircleAlert aria-hidden="true" className="size-5" />
        </span>
        <h1 className="font-heading text-2xl font-bold">
          Opptak kunne ikke lastes
        </h1>
        <p className="mt-2 text-admin-muted">
          Ingen innmeldinger er skjult med vilje. Last siden på nytt om litt.
        </p>
      </section>
    );
  }
  const {
    total,
    applications,
    activeYear,
    placement,
    filtered,
    pageIds,
    candidates,
    suggestions,
    familyGuardians,
    candidateById,
  } = data;
  return (
  <section
    aria-labelledby="applications-list-title"
    className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]"
  >
    <div className="border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
      <h2
        id="applications-list-title"
        className="font-heading text-xl font-bold"
      >
        Innmeldinger
      </h2>
      <p className="mt-0.5 text-sm text-admin-muted" aria-live="polite">
        {total} {total === 1 ? "innmelding" : "innmeldinger"}
        {filtered ? " passer valgte filtre" : " venter på opptak"}
      </p>
    </div>
    {applications.length === 0 ? (
      <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
          <CircleCheck aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-4 font-heading text-xl font-bold">
          {filtered ? "Ingen innmeldinger passer" : "Ingen venter på opptak"}
        </p>
        <p className="mt-1 max-w-md text-sm text-admin-muted">
          {filtered
            ? "Prøv et annet søk eller velg en annen visning."
            : "Nye innmeldinger vises her når foresatte har sendt dem inn."}
        </p>
      </div>
    ) : (
      <BulkActions
        entity="applications"
        ids={pageIds}
        admit={{
          classes: placement.classes,
          schoolYear: activeYear,
          candidates,
        }}
      >
        <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-[#ECE8DF] bg-[#FBFAF6] px-4 text-sm text-admin-muted sm:px-5">
          <BulkSelectAll />
          <span>Velg alle på denne siden</span>
        </label>
        <ul className="divide-y divide-[#ECE8DF]">
          {applications.map((application) => {
            const payment = paymentLabel(application);
            const candidate = candidateById.get(application.id);
            const name = candidate?.name ?? "Navn mangler";
            const appStatus = application.status ?? "ny";
            const statusChip = statusLabels[appStatus] ?? statusLabels.arkivert;
            const guardians = (
              (application.family_id &&
                familyGuardians.get(application.family_id)) || [
                {
                  name: fullName(
                    application.mother_first_name,
                    application.mother_last_name,
                  ),
                  phone: application.mother_phone,
                  email: application.mother_email,
                },
                {
                  name: fullName(
                    application.father_first_name,
                    application.father_last_name,
                  ),
                  phone: application.father_phone,
                  email: application.father_email,
                },
              ]
            ).filter((guardian) => guardian.name || guardian.phone);
            const canAdmit = !["avslatt", "arkivert"].includes(appStatus);
            return (
              <li key={application.id} className="p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(22rem,1.45fr)] lg:items-start">
                  <div className="flex min-w-0 items-start gap-3">
                    <label className="-m-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                      <BulkRowCheckbox id={application.id} />
                      <span className="sr-only">Velg {name}</span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-lg font-bold">
                          {name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusChip.className}`}
                        >
                          {statusChip.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-admin-muted">
                        {candidate?.age != null ? `${candidate.age} år` : "Alder mangler"}
                        , {genderLabel(application.child_gender)}
                      </p>
                      {appStatus === "akseptert" ? (
                        <p className="mt-2 flex items-start gap-1.5 text-sm font-bold text-[#775108]">
                          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          Merket som tatt opp, men ikke registrert som elev.
                        </p>
                      ) : null}
                      {guardians.length > 0 ? (
                        <ul className="mt-2 grid gap-1 text-sm">
                          {guardians.map((guardian, index) => (
                            <li
                              key={index}
                              className="flex flex-wrap items-center gap-x-2"
                            >
                              <span className="text-admin-muted">
                                {guardian.name || "Foresatt"}
                              </span>
                              {guardian.phone ? (
                                <a
                                  href={telHref(guardian.phone)}
                                  className="inline-flex min-h-11 items-center gap-1.5 rounded font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
                                >
                                  <Phone aria-hidden="true" className="size-3.5" />
                                  {guardian.phone}
                                </a>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-admin-muted">
                          Ingen foresatt registrert
                        </p>
                      )}
                      {application.family_id ? (
                        <Link
                          href={`${basePath}/familier/${application.family_id}`}
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          Åpne familie
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-[#F8F6F0] p-3">
                      <div>
                        <dt className="text-xs font-bold text-admin-muted">
                          Betaling
                        </dt>
                        <dd className="mt-1">
                          <span
                            className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold ${
                              payment.paid
                                ? "bg-[#DCEDDD] text-[#216A2B]"
                                : "bg-[#FEEDCA] text-[#775108]"
                            }`}
                          >
                            {payment.label}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-admin-muted">
                          Mottatt
                        </dt>
                        <dd className="mt-1 text-sm font-bold">
                          {formatDate(application.created_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-admin-muted">
                          Ønsket klasse
                        </dt>
                        <dd className="mt-1 text-sm font-bold">
                          {application.desired_class ?? "Ikke oppgitt"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {canAdmit ? (
                        <AdmitDialog
                          applicationId={application.id}
                          childName={name}
                          childAge={candidate?.age ?? null}
                          desiredClass={application.desired_class}
                          classes={placement.classes}
                          suggestedClassId={suggestions.get(application.id) ?? null}
                          schoolYear={activeYear}
                          basePath={basePath}
                        />
                      ) : null}
                      <StudentStatusMenu
                        id={application.id}
                        name={name}
                        status={appStatus}
                        paid={payment.paid}
                      />
                    </div>
                  </div>
                </div>

                <details className="group mt-3 border-t border-[#ECE8DF] pt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-bold text-admin-muted outline-none hover:bg-[#F2F1EB] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    Detaljer
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <dl className="mt-2 grid gap-x-8 gap-y-4 rounded-xl bg-[#F8F6F0] p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Adresse"
                      value={addressLine(application)}
                    />
                    <Field
                      label="E-post barn"
                      value={application.child_email}
                      href={application.child_email ? `mailto:${application.child_email}` : undefined}
                    />
                    <Field
                      label="Telefon barn"
                      value={application.child_phone}
                      href={application.child_phone ? telHref(application.child_phone) : undefined}
                    />
                    {guardians.map((guardian, index) => (
                      <Field
                        key={index}
                        label={`E-post ${guardian.name || `foresatt ${index + 1}`}`}
                        value={guardian.email}
                        href={guardian.email ? `mailto:${guardian.email}` : undefined}
                      />
                    ))}
                    <Field
                      label="Nivå (Koran / Arabisk / Islam)"
                      value={`${levelLabel(application.child_level_quran)} / ${levelLabel(application.child_level_arabic)} / ${levelLabel(application.child_level_islam)}`}
                    />
                    <Field label="Melding" value={application.message} />
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      </BulkActions>
    )}
    {total > PAGE_SIZE ? (
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath={`${basePath}/register`}
        searchParams={sp}
      />
    ) : null}
  </section>
  );
}

export default async function OpptakPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/register">) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const basePath = adminBasePath(locale);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);

  return (
    <div className="grid gap-4 sm:gap-6">
      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Opptak
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-admin-muted sm:mt-2 sm:text-base">
            Gå gjennom innmeldinger, ta opp barnet og plasser det i klasse.
          </p>
        </div>
        <div className="hidden sm:block">
          <ExportButton entity="applications" />
        </div>
      </header>

      <Suspense fallback={<StatStripSkeleton />}>
        <OpptakStats q={q} status={status} page={page} />
      </Suspense>

      <section className="rounded-2xl bg-white px-4 py-2 ring-1 ring-[#E3DED3] sm:p-5">
        <ApplicationFilters />
      </section>

      <Suspense fallback={<ListCardSkeleton rows={4} tall />}>
        <OpptakList
          q={q}
          status={status}
          page={page}
          basePath={basePath}
          sp={sp}
        />
      </Suspense>
    </div>
  );
}

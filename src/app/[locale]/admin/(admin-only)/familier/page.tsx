import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserRoundPlus } from "lucide-react";
import { adminBasePath } from "@/components/admin/paths";
import { getAdminFamilies } from "@/lib/families/service";
import type { FamilyDetails } from "@/lib/families/repository";
import { createClient } from "@/lib/supabase/server";
import { findDuplicateFamilies } from "./duplicates";
import { FamilyListSkeleton } from "./loading";
import { FamilyList, type FamilyListRow } from "./family-list";
import { familyQueues, type FamilyQueueId } from "./family-queues";

export const metadata: Metadata = { title: "Familier" };

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("nb-NO");
}

function guardianName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ") || "Navn mangler";
}

type EnrollmentRow = {
  student_id: string;
  school_year_id: string;
  status: string;
  school_years: { label: string } | null;
};

type FamilyState = {
  remainingOre: number;
  missingPlacement: number;
  needsReview: boolean;
  newApplications: number;
};

async function getFamilyStates(families: FamilyDetails[]) {
  const supabase = await createClient();
  const { data: year, error: yearError } = await supabase
    .from("school_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  const activeYearId = (year as { id: string } | null)?.id ?? null;
  const [enrollmentResult, balanceResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, school_year_id, status, school_years(label)"),
    activeYearId
      ? supabase
          .from("student_balances")
          .select("student_id, remaining")
          .eq("school_year_id", activeYearId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const enrollments = (enrollmentResult.data as EnrollmentRow[] | null) ?? [];
  const remainingByStudent = new Map<string, number>();
  for (const row of (balanceResult.data as
    | { student_id: string | null; remaining: number | null }[]
    | null) ?? []) {
    if (row.student_id) remainingByStudent.set(row.student_id, row.remaining ?? 0);
  }
  const enrollmentsByStudent = new Map<string, EnrollmentRow[]>();
  for (const row of enrollments) {
    const list = enrollmentsByStudent.get(row.student_id) ?? [];
    list.push(row);
    enrollmentsByStudent.set(row.student_id, list);
  }

  const expectsPlacement = (studentId: string) => {
    const rows = enrollmentsByStudent.get(studentId) ?? [];
    if (activeYearId && rows.some((row) => row.school_year_id === activeYearId && row.status === "aktiv")) {
      return false;
    }
    if (rows.length === 0) return true;
    const latest = [...rows].sort((left, right) =>
      (right.school_years?.label ?? "").localeCompare(left.school_years?.label ?? ""),
    )[0];
    return latest.status === "aktiv";
  };

  const duplicates = findDuplicateFamilies(families);
  const states = new Map<string, FamilyState>();
  for (const family of families) {
    const converted = new Set(
      family.students
        .map((student) => student.applicationId)
        .filter((id): id is string => Boolean(id)),
    );
    states.set(family.id, {
      remainingOre: family.students.reduce(
        (sum, student) => sum + Math.max(remainingByStudent.get(student.id) ?? 0, 0),
        0,
      ),
      missingPlacement: activeYearId
        ? family.students.filter((student) => expectsPlacement(student.id)).length
        : 0,
      needsReview: family.openReviews.length > 0 || duplicates.has(family.id),
      newApplications: family.applications.filter(
        (application) =>
          application.status === "ny" && !converted.has(application.id),
      ).length,
    });
  }

  return {
    ok: !yearError && !enrollmentResult.error && !balanceResult.error,
    states,
    duplicates,
  };
}

function matchesQueue(state: FamilyState | undefined, queue: FamilyQueueId) {
  if (!queue) return true;
  if (!state) return false;
  if (queue === "skylder") return state.remainingOre > 0;
  if (queue === "mangler_plass") return state.missingPlacement > 0;
  if (queue === "gjennomga") return state.needsReview;
  return state.newApplications > 0;
}

async function FamilyListLoader({
  basePath,
  query,
}: {
  basePath: string;
  query: { [key: string]: string | string[] | undefined };
}) {
  const allFamilies = await getAdminFamilies();
  const { ok, states, duplicates } = await getFamilyStates(allFamilies);

  const rows: FamilyListRow[] = allFamilies.map((family) => {
    const state = states.get(family.id);
    const duplicateMatches = duplicates.get(family.id) ?? [];
    const primary =
      family.guardians.find((guardian) => guardian.isPrimaryContact) ??
      family.guardians[0];
    const convertedApplications = new Set(
      family.students
        .map((student) => student.applicationId)
        .filter((id): id is string => Boolean(id)),
    );
    const pendingApplications = family.applications.filter(
      (application) =>
        !convertedApplications.has(application.id) &&
        !["avslatt", "arkivert"].includes(application.status),
    );
    return {
      id: family.id,
      displayName: family.displayName,
      childCount: family.students.length + pendingApplications.length,
      addressLine: family.address
        ? [family.address, family.city].filter(Boolean).join(", ")
        : null,
      flags: [
        state?.needsReview
          ? duplicateMatches.length > 0
            ? "Mulig duplikat"
            : "Må gjennomgås"
          : null,
        state?.newApplications
          ? `${state.newApplications} ny innmelding`
          : null,
        state?.missingPlacement
          ? `${state.missingPlacement} mangler plass`
          : null,
      ].filter((flag): flag is string => Boolean(flag)),
      primaryName: primary
        ? guardianName(primary.firstName, primary.lastName)
        : "Foresatt mangler",
      primaryEmail: primary?.email ?? null,
      remainingOre: state?.remainingOre ?? 0,
      queues: familyQueues
        .map((item) => item.id)
        .filter((id) => id && matchesQueue(state, id)),
      searchText: [
        family.displayName,
        family.address,
        family.postalCode,
        family.city,
        ...family.guardians.flatMap((guardian) => [
          guardian.firstName,
          guardian.lastName,
          guardian.email,
          guardian.phone,
        ]),
        ...family.students.flatMap((student) => [
          student.firstName,
          student.lastName,
        ]),
        ...family.applications.flatMap((application) => [
          application.firstName,
          application.lastName,
        ]),
      ]
        .map(normalized)
        .join("\n"),
    };
  });

  return (
    <>
    {!ok ? (
      <p role="alert" className="rounded-xl bg-[#FFF2F1] p-3 text-sm text-[#8B2F2B]">
        Plassering og betaling kunne ikke lastes. Arbeidskøene kan være
        ufullstendige.
      </p>
    ) : null}
      <FamilyList
        rows={rows}
        basePath={basePath}
        initialQuery={typeof query.q === "string" ? query.q : ""}
        initialQueue={typeof query.vis === "string" ? query.vis : ""}
        initialPage={Math.max(1, Number(query.page) || 1)}
      />
    </>
  );
}

export default async function FamiliesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/familier">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const basePath = adminBasePath(locale);

  return (
    <div className="grid gap-4 sm:gap-6">
      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Familier
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-admin-muted sm:mt-2 sm:text-base">
            Foresatte, søsken, plassering og betaling samlet per familie.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${basePath}/elever`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#D8D3C8] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Alle elever
          </Link>
          <Link
            href={`${basePath}/elever/ny`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <UserRoundPlus aria-hidden="true" className="size-4" />
            Ny elev
          </Link>
        </div>
      </header>

      <Suspense fallback={<FamilyListSkeleton />}>
        <FamilyListLoader basePath={basePath} query={query} />
      </Suspense>
    </div>
  );
}

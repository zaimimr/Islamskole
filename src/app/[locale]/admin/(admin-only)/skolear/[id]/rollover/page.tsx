import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { RolloverWizard } from "@/components/admin/rollover/rollover-wizard";
import {
  nextClassId,
  type RolloverClass,
  type RolloverStudent,
} from "@/components/admin/rollover/plan";
import { studentDisplayName } from "@/lib/student-name";
import { ageInYear, schoolYearStart } from "@/lib/age";

export const metadata: Metadata = { title: "Videreføre elever" };

type YearRow = {
  id: string;
  label: string;
  fee: number | null;
  starts_on: string | null;
};

function yearSortKey(year: YearRow) {
  return year.starts_on ?? `${schoolYearStart(year.label) ?? 0}-08-01`;
}

export default async function RolloverPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  const basePath = adminBasePath(locale);
  const yearHref = `${basePath}/skolear/${id}`;
  const supabase = await createClient();

  const [{ data: yearData }, { data: classData }] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, label, fee, starts_on")
      .order("label", { ascending: false }),
    supabase
      .from("classes")
      .select("id, name_no, capacity, price")
      .order("sort_order", { ascending: true }),
  ]);

  const years = (yearData as YearRow[] | null) ?? [];
  const target = years.find((year) => year.id === id);
  if (!target) notFound();

  const earlier = years
    .filter((year) => year.id !== id && yearSortKey(year) < yearSortKey(target))
    .sort((a, b) => yearSortKey(b).localeCompare(yearSortKey(a)));
  const requested = typeof sp.fra === "string" ? sp.fra : null;
  const source =
    years.find((year) => year.id === requested && year.id !== id) ??
    earlier[0] ??
    null;

  const classes: RolloverClass[] = (classData ?? []).map((item) => ({
    id: item.id,
    name: item.name_no ?? "(uten navn)",
    capacity: item.capacity,
    price: item.price,
  }));

  const header = (
    <header>
      <Link
        href={yearHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tilbake til {target.label}
      </Link>
      <h1 className="mt-3 text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
        Flytt elever til {target.label}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-admin-muted sm:text-base">
        Hver elev foreslås til neste klasse. Se over, endre der det trengs, og
        bekreft til slutt. Ingenting lagres før du bekrefter.
      </p>
    </header>
  );

  if (!source || target.fee == null) {
    return (
      <div className="grid gap-5 sm:gap-6">
        {header}
        <div className="flex items-start gap-3 rounded-2xl bg-[#FFF8E6] p-4 text-sm text-[#775108] ring-1 ring-[#EFD9A6] sm:p-5">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">
              {target.fee == null
                ? `Sett årspris for ${target.label} først`
                : "Det finnes ikke noe skoleår å flytte elever fra"}
            </p>
            <p className="mt-1">
              {target.fee == null
                ? "Elevene får årsprisen for det nye skoleåret når de flyttes, så den må være satt."
                : "Opprett eller velg et tidligere skoleår med elever."}
            </p>
            {target.fee == null ? (
              <Link
                href={yearHref}
                className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
              >
                Gå til skoleåret
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const [{ data: sourceData }, { data: targetData }] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "student_id, class_id, students(child_first_name, child_last_name, child_birth_date, family_id, continues_next_year)",
      )
      .eq("school_year_id", source.id)
      .eq("status", "aktiv"),
    supabase
      .from("enrollments")
      .select("student_id, class_id")
      .eq("school_year_id", target.id)
      .eq("status", "aktiv"),
  ]);

  const placedClass = new Map(
    (targetData ?? []).map((row) => [row.student_id, row.class_id]),
  );
  const existingCounts: Record<string, number> = {};
  for (const row of targetData ?? []) {
    existingCounts[row.class_id] = (existingCounts[row.class_id] ?? 0) + 1;
  }

  const ageYear = schoolYearStart(target.label) ?? new Date().getFullYear();
  const classOrder = new Map(classes.map((item, index) => [item.id, index]));
  const seen = new Set<string>();
  const students: RolloverStudent[] = [];
  for (const row of (sourceData as
    | {
        student_id: string;
        class_id: string;
        students: {
          child_first_name: string | null;
          child_last_name: string | null;
          child_birth_date: string | null;
          family_id: string | null;
          continues_next_year: boolean | null;
        } | null;
      }[]
    | null) ?? []) {
    if (seen.has(row.student_id)) continue;
    seen.add(row.student_id);
    students.push({
      studentId: row.student_id,
      name: row.students
        ? studentDisplayName(row.students) || "Uten navn"
        : "Uten navn",
      age: ageInYear(row.students?.child_birth_date, ageYear),
      familyId: row.students?.family_id ?? null,
      currentClassId: row.class_id,
      proposedClassId: nextClassId(classes, row.class_id),
      placedClassId: placedClass.get(row.student_id) ?? null,
      continues: row.students?.continues_next_year ?? null,
    });
  }
  students.sort(
    (a, b) =>
      (classOrder.get(a.currentClassId) ?? 0) -
        (classOrder.get(b.currentClassId) ?? 0) ||
      a.name.localeCompare(b.name, "nb-NO"),
  );

  return (
    <div className="grid gap-5 pb-28 sm:gap-6">
      {header}
      <RolloverWizard
        key={source.id}
        basePath={basePath}
        target={{ id: target.id, label: target.label, fee: target.fee }}
        source={{ id: source.id, label: source.label }}
        sourceOptions={years
          .filter((year) => year.id !== id)
          .map((year) => ({ id: year.id, label: year.label }))}
        classes={classes}
        students={students}
        existingCounts={existingCounts}
      />
    </div>
  );
}

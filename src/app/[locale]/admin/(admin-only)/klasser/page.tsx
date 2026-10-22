import type { Metadata } from "next";
import Link from "next/link";
import { Layers3, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import {
  ClassSortList,
  type SortableClass,
} from "@/components/admin/class-sort-list";

export const metadata: Metadata = { title: "Klasser" };

type ClassRow = {
  id: string;
  name_no: string | null;
  age_min: number | null;
  age_max: number | null;
  capacity: number | null;
  price: number | null;
  published: boolean | null;
};

async function getClasses() {
  const supabase = await createClient();
  const [classResult, yearResult] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name_no, age_min, age_max, capacity, price, published")
      .order("sort_order", { ascending: true }),
    supabase
      .from("school_years")
      .select("id, label")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const activeYear = yearResult.data as { id: string; label: string } | null;
  const enrollmentResult = activeYear
    ? await supabase
        .from("enrollments")
        .select("class_id")
        .eq("school_year_id", activeYear.id)
        .eq("status", "aktiv")
    : { data: [], error: null };
  const counts = new Map<string, number>();
  for (const row of (enrollmentResult.data as { class_id: string }[] | null) ??
    []) {
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }
  return {
    ok: !classResult.error && !yearResult.error && !enrollmentResult.error,
    classes: (classResult.data as ClassRow[] | null) ?? [],
    activeYearLabel: activeYear?.label ?? null,
    counts,
  };
}

function formatAge(min: number | null, max: number | null) {
  if (min == null && max == null) return "Alder ikke satt";
  if (min != null && max != null) return `${min}-${max} år`;
  if (min != null) return `fra ${min} år`;
  return `til ${max} år`;
}

export default async function KlasserPage({
  params,
}: PageProps<"/[locale]/admin/klasser">) {
  const { locale } = await params;
  const basePath = adminBasePath(locale);
  const { ok, classes, activeYearLabel, counts } = await getClasses();

  const items: SortableClass[] = classes.map((c) => ({
    id: c.id,
    name: c.name_no ?? "(uten navn)",
    age: formatAge(c.age_min, c.age_max),
    capacity: c.capacity,
    enrolled: counts.get(c.id) ?? 0,
    price: c.price,
    published: Boolean(c.published),
  }));

  const publishedCount = items.filter((item) => item.published).length;
  const enrolledTotal = items.reduce((sum, item) => sum + item.enrolled, 0);

  if (!ok) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]">
        <h1 className="font-heading text-2xl font-bold">
          Klassene kunne ikke lastes
        </h1>
        <p className="mt-2 text-admin-muted">
          Ingen tall er erstattet med null. Last siden på nytt om litt.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Klasser
          </h1>
          <p className="mt-1 max-w-2xl text-admin-muted">
            {activeYearLabel
              ? `Elever med plass i ${activeYearLabel}, kapasitet og innhold på nettsiden.`
              : "Kapasitet og innhold på nettsiden. Velg et aktivt skoleår for å se elevtall."}
          </p>
        </div>
        <Link
          href={`${basePath}/klasser/ny`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#245E2B] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus aria-hidden="true" className="size-4" />
          Ny klasse
        </Link>
      </header>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-heading text-xl font-bold">Klasseoversikt</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-admin-muted">
              Åpne en klasse for elevlisten. Rekkefølgen styrer nettsiden. Bruk
              håndtaket for å flytte en klasse.
            </p>
          </div>
          {items.length > 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-[#F7F6F1] px-3 py-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
                <Layers3 aria-hidden="true" className="size-4" />
              </span>
              <span>
                <span className="font-bold tabular-nums">{items.length}</span>{" "}
                klasser
                <span className="text-admin-muted">
                  {` · ${enrolledTotal} elever · ${publishedCount} publisert`}
                </span>
              </span>
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
              <Layers3 aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 font-heading text-xl font-bold">
              Ingen klasser ennå
            </h2>
            <p className="mt-1 max-w-sm text-sm text-admin-muted">
              Opprett den første klassen for å gjøre undervisningstilbudet
              klart.
            </p>
            <Link
              href={`${basePath}/klasser/ny`}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#CFC8BA] px-4 text-sm font-bold text-[#277A31] outline-none transition-colors hover:bg-[#F7FBF7] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus aria-hidden="true" className="size-4" />
              Opprett klasse
            </Link>
          </div>
        ) : (
          <ClassSortList classes={items} basePath={basePath} />
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Percent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { formatNok } from "@/lib/money";
import { formatOsloDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FinanceLoadError } from "../load-error";

export const metadata: Metadata = { title: "Rabatter" };

type AdjustmentRow = {
  id: string;
  student_id: string;
  school_year_id: string;
  type: string;
  amount: number;
  note: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
  teacher_guardian_id: string | null;
  students: {
    child_first_name: string | null;
    child_last_name: string | null;
    family_id: string | null;
  } | null;
  guardians: { first_name: string | null; last_name: string | null } | null;
};

type FeeRow = {
  student_id: string;
  school_year_id: string;
  amount: number;
  discount: number;
};

const typeLabels: Record<string, string> = {
  soskenrabatt: "Søskenrabatt",
  laererbarn: "Lærerbarn",
  frivillig: "Frivillig",
  annet: "Annet fritak",
};

function personName(
  first: string | null | undefined,
  last: string | null | undefined,
  fallback: string,
) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

export default async function DiscountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const basePath = adminBasePath(locale);
  const supabase = await createClient();

  const [yearResult, adjustmentResult, feeResult] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, label, is_active")
      .order("label", { ascending: false }),
    supabase
      .from("student_fee_adjustments")
      .select(
        "id, student_id, school_year_id, type, amount, note, granted_by, created_at, revoked_at, teacher_guardian_id, students(child_first_name, child_last_name, family_id), guardians(first_name, last_name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("student_fees")
      .select("student_id, school_year_id, amount, discount"),
  ]);
  if (yearResult.error || adjustmentResult.error || feeResult.error) {
    return (
      <FinanceLoadError
        title="Rabattene kunne ikke lastes"
        retryHref={`${basePath}/betaling/rabatter`}
      />
    );
  }

  const years =
    (yearResult.data as { id: string; label: string; is_active: boolean }[] | null) ??
    [];
  const requestedYear = typeof sp.aar === "string" ? sp.aar : "";
  const selectedYear =
    years.find((year) => year.id === requestedYear) ??
    years.find((year) => year.is_active) ??
    years[0] ??
    null;
  const adjustments =
    (adjustmentResult.data as unknown as AdjustmentRow[] | null) ?? [];
  const fees = new Map(
    ((feeResult.data as FeeRow[] | null) ?? []).map((fee) => [
      `${fee.student_id}:${fee.school_year_id}`,
      fee,
    ]),
  );

  const yearAdjustments = selectedYear
    ? adjustments.filter((adjustment) => adjustment.school_year_id === selectedYear.id)
    : [];
  const activeAdjustments = yearAdjustments.filter(
    (adjustment) => !adjustment.revoked_at,
  );

  const totalsByType = new Map<string, { amount: number; count: number }>();
  const adjustedByStudent = new Map<string, number>();
  for (const adjustment of activeAdjustments) {
    const entry = totalsByType.get(adjustment.type) ?? { amount: 0, count: 0 };
    entry.amount += adjustment.amount;
    entry.count += 1;
    totalsByType.set(adjustment.type, entry);
    adjustedByStudent.set(
      adjustment.student_id,
      (adjustedByStudent.get(adjustment.student_id) ?? 0) + adjustment.amount,
    );
  }
  const registeredTotal = activeAdjustments.reduce(
    (sum, adjustment) => sum + adjustment.amount,
    0,
  );
  const effectiveTotal = [...adjustedByStudent.entries()].reduce(
    (sum, [studentId, amount]) => {
      const fee = selectedYear ? fees.get(`${studentId}:${selectedYear.id}`) : null;
      const cap = fee ? Math.max(fee.amount - fee.discount, 0) : amount;
      return sum + Math.min(amount, cap);
    },
    0,
  );

  const teacherTotals = new Map<
    string,
    { name: string; amount: number; students: Set<string> }
  >();
  for (const adjustment of activeAdjustments) {
    if (adjustment.type !== "laererbarn") continue;
    const key = adjustment.teacher_guardian_id ?? "ukjent";
    const entry = teacherTotals.get(key) ?? {
      name: personName(
        adjustment.guardians?.first_name,
        adjustment.guardians?.last_name,
        "Ukjent lærer",
      ),
      amount: 0,
      students: new Set<string>(),
    };
    entry.amount += adjustment.amount;
    entry.students.add(adjustment.student_id);
    teacherTotals.set(key, entry);
  }

  const typeTiles = (["soskenrabatt", "laererbarn", "frivillig", "annet"] as const)
    .map((type) => ({ type, entry: totalsByType.get(type) }))
    .filter(
      (tile): tile is { type: typeof tile.type; entry: { amount: number; count: number } } =>
        Boolean(tile.entry),
    );

  return (
    <div className="grid gap-6 lg:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Rabatter og fritak
          </h1>
          <p className="mt-1 max-w-3xl text-admin-muted">
            Hver rabatt logges med type, begrunnelse og hvem som ga den.
            Rabatter gis fra familie- eller elevsiden.
          </p>
        </div>
        {years.length > 1 ? (
          <nav aria-label="Velg skoleår" className="flex flex-wrap gap-1">
            {years.map((year) => (
              <Link
                key={year.id}
                href={`${basePath}/betaling/rabatter?aar=${year.id}`}
                aria-current={year.id === selectedYear?.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  year.id === selectedYear?.id
                    ? "bg-[#DCEDDD] text-[#216A2B]"
                    : "text-admin-muted hover:bg-[#F2F1EB]",
                )}
              >
                {year.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      {yearAdjustments.length === 0 ? (
        <section className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#E3DED3]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F0F0ED] text-admin-muted">
            <Percent aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 font-heading text-xl font-semibold">
            Ingen rabatter eller fritak i {selectedYear?.label ?? "dette skoleåret"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
            Åpne familien som skal ha søskenrabatt, lærerbarn-fradrag eller
            fritak, og gi rabatten der.
          </p>
          <Link
            href={`${basePath}/familier`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Gå til familier
          </Link>
        </section>
      ) : (
        <>
          <section
            aria-labelledby="discount-totals"
            className="rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5"
          >
            <h2 id="discount-totals" className="sr-only">
              Sum {selectedYear?.label}
            </h2>
            <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <div>
                <dt className="text-sm font-bold text-admin-muted">
                  Effekt på krav {selectedYear?.label}
                </dt>
                <dd className="font-heading text-2xl font-bold tabular-nums">
                  {formatNok(effectiveTotal)}
                </dd>
                <dd className="text-xs text-admin-muted">
                  {activeAdjustments.length} aktive fradrag
                  {registeredTotal > effectiveTotal
                    ? `, registrert ${formatNok(registeredTotal)}`
                    : ""}
                </dd>
              </div>
              {typeTiles.map(({ type, entry }) => (
                <div key={type}>
                  <dt className="text-sm font-bold text-admin-muted">
                    {typeLabels[type]}
                  </dt>
                  <dd className="font-heading text-xl font-bold tabular-nums">
                    {formatNok(entry.amount)}
                  </dd>
                  <dd className="text-xs text-admin-muted">
                    {entry.count} fradrag
                  </dd>
                </div>
              ))}
            </dl>
            {registeredTotal > effectiveTotal ? (
              <p className="mt-3 text-sm text-[#6B5524]">
                Noen barn har fått mer i fradrag enn skolepengene. Effekten er
                begrenset til kravet, så {formatNok(registeredTotal - effectiveTotal)}{" "}
                påvirker ikke saldoen.
              </p>
            ) : null}
          </section>

          {teacherTotals.size > 0 ? (
            <section
              aria-labelledby="teacher-report"
              className="rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]"
            >
              <h2
                id="teacher-report"
                className="font-heading text-xl font-bold"
              >
                Gitt gratis per lærer
              </h2>
              <p className="mt-1 text-sm text-admin-muted">
                Lærerbarn-fradrag i {selectedYear?.label}.
              </p>
              <ul className="mt-3 grid gap-1.5">
                {[...teacherTotals.entries()]
                  .sort(([, left], [, right]) => right.amount - left.amount)
                  .map(([key, teacher]) => (
                    <li
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF9F5] px-3 py-2 text-sm ring-1 ring-[#E8E3D9]"
                    >
                      <span className="font-bold">{teacher.name}</span>
                      <span className="text-admin-muted">
                        {teacher.students.size} barn ·{" "}
                        <span className="font-bold text-foreground tabular-nums">
                          {formatNok(teacher.amount)}
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="all-adjustments" className="grid gap-3">
            <h2 id="all-adjustments" className="font-heading text-xl font-bold">
              Alle fradrag i {selectedYear?.label}
            </h2>
            <ul className="grid gap-1.5 rounded-2xl bg-white p-3 ring-1 ring-[#E3DED3] sm:p-4">
              {yearAdjustments.map((adjustment) => (
                <li
                  key={adjustment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF9F5] px-3 py-2 text-sm ring-1 ring-[#E8E3D9]"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link
                      href={`${basePath}/elever/${adjustment.student_id}`}
                      className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {personName(
                        adjustment.students?.child_first_name,
                        adjustment.students?.child_last_name,
                        "Ukjent barn",
                      )}
                    </Link>
                    <span className="rounded-full bg-[#DCEDDD] px-2 py-0.5 text-xs font-bold text-[#216A2B]">
                      {typeLabels[adjustment.type] ?? adjustment.type}
                      {adjustment.type === "laererbarn"
                        ? ` (${personName(adjustment.guardians?.first_name, adjustment.guardians?.last_name, "ukjent lærer")})`
                        : ""}
                    </span>
                    <span className="text-admin-muted">{adjustment.note}</span>
                    {adjustment.revoked_at ? (
                      <span className="rounded-full bg-[#F0F0ED] px-2 py-0.5 text-xs font-bold text-[#4E5550]">
                        Opphevet
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3 text-admin-muted">
                    <span>
                      {formatOsloDate(adjustment.created_at)} ·{" "}
                      {adjustment.granted_by}
                    </span>
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        adjustment.revoked_at
                          ? "text-admin-muted line-through"
                          : "text-foreground",
                      )}
                    >
                      −{formatNok(adjustment.amount)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

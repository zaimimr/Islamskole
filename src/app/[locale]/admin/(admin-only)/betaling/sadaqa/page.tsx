import type { Metadata } from "next";
import Link from "next/link";
import { Gift, HandHeart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFamilyNames } from "@/lib/families/names";
import { adminBasePath } from "@/components/admin/paths";
import { formatNok } from "@/lib/money";
import { formatOsloDate } from "@/lib/dates";
import { studentDisplayName } from "@/lib/student-name";
import { getSadaqaTotals, sadaqaSupportNote } from "@/lib/sadaqa";
import { cn } from "@/lib/utils";
import {
  SadaqaCoverDialog,
  SadaqaGiftDialog,
  SadaqaUndoMenu,
  type SadaqaFamily,
} from "@/components/admin/sadaqa";
import { FinanceLoadError } from "../load-error";

export const metadata: Metadata = { title: "Sadaqa" };

type DisbursementRow = {
  payment_id: string;
  net_paid_amount: number;
  refunded_amount: number;
  description: string | null;
  disbursed_at: string;
  student_id: string | null;
  allocated_amount: number | null;
};

type GiftRow = {
  id: string;
  amount: number;
  received_on: string;
  method: string;
  donor_name: string | null;
  family_id: string | null;
  note: string | null;
};

type StudentRow = {
  id: string;
  family_id: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
};

const giftMethodLabels: Record<string, string> = {
  vipps: "Vipps",
  bank: "Bank",
  kontant: "Kontant",
  overbetaling: "Overskudd fra betaling",
  annet: "Annet",
};

export default async function SadaqaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const basePath = adminBasePath(locale);
  const pageHref = `${basePath}/betaling/sadaqa`;
  const supabase = await createClient();

  const { data: yearData, error: yearError } = await supabase
    .from("school_years")
    .select("id, label, is_active")
    .order("label", { ascending: false });
  if (yearError) {
    return (
      <FinanceLoadError
        title="Sadaqa-oversikten kunne ikke lastes"
        retryHref={pageHref}
      />
    );
  }
  const years = yearData ?? [];
  const requestedYear = typeof sp.aar === "string" ? sp.aar : "";
  const selectedYear =
    years.find((year) => year.id === requestedYear) ??
    years.find((year) => year.is_active) ??
    years[0] ??
    null;

  if (!selectedYear) {
    return (
      <FinanceLoadError
        title="Opprett et skoleår før du registrerer sadaqa"
        retryHref={pageHref}
      />
    );
  }

  const [
    totals,
    disbursementResult,
    giftResult,
    balanceResult,
    studentResult,
    familyNames,
  ] = await Promise.all([
    getSadaqaTotals(supabase, selectedYear.id),
    supabase
      .from("sadaqa_disbursements")
      .select(
        "payment_id, net_paid_amount, refunded_amount, description, disbursed_at, student_id, allocated_amount",
      )
      .eq("school_year_id", selectedYear.id)
      .order("disbursed_at", { ascending: false }),
    supabase
      .from("sadaqa_gifts")
      .select("id, amount, received_on, method, donor_name, family_id, note")
      .eq("school_year_id", selectedYear.id)
      .is("voided_at", null)
      .order("received_on", { ascending: false }),
    supabase
      .from("student_balances")
      .select("student_id, remaining")
      .eq("school_year_id", selectedYear.id),
    supabase
      .from("students")
      .select("id, family_id, child_first_name, child_last_name"),
    loadFamilyNames(supabase),
  ]);
  if (
    !totals ||
    disbursementResult.error ||
    giftResult.error ||
    balanceResult.error ||
    studentResult.error
  ) {
    return (
      <FinanceLoadError
        title="Sadaqa-oversikten kunne ikke lastes"
        retryHref={pageHref}
      />
    );
  }

  const students = new Map(
    ((studentResult.data as StudentRow[] | null) ?? []).map((student) => [
      student.id,
      student,
    ]),
  );
  const childName = (studentId: string | null) => {
    const student = studentId ? students.get(studentId) : null;
    return student ? studentDisplayName(student) || "Ukjent barn" : "Ikke fordelt";
  };
  const familyName = (familyId: string, fallbackLastName?: string | null) =>
    familyNames.get(familyId) ||
    (fallbackLastName ? `Familien ${fallbackLastName}` : "Familie uten navn");

  const disbursements = (disbursementResult.data as DisbursementRow[] | null) ?? [];
  const allocatedByPayment = new Map<string, number>();
  for (const row of disbursements) {
    allocatedByPayment.set(
      row.payment_id,
      (allocatedByPayment.get(row.payment_id) ?? 0) + (row.allocated_amount ?? 0),
    );
  }
  const support = disbursements.map((row) => {
    const allocated = allocatedByPayment.get(row.payment_id) ?? 0;
    const net = row.net_paid_amount;
    const amount =
      row.allocated_amount == null
        ? Math.max(net - allocated, 0)
        : allocated > net && allocated > 0
          ? Math.round((row.allocated_amount * net) / allocated)
          : row.allocated_amount;
    const student = row.student_id ? students.get(row.student_id) : null;
    return {
      key: `${row.payment_id}-${row.student_id ?? "none"}`,
      paymentId: row.payment_id,
      studentId: row.student_id,
      familyId: student?.family_id ?? null,
      familyLastName: student?.child_last_name ?? null,
      name: childName(row.student_id),
      date: row.disbursed_at,
      amount,
      refunded: row.refunded_amount,
      note: sadaqaSupportNote(row.description),
    };
  });
  const gifts = (giftResult.data as GiftRow[] | null) ?? [];

  const remainingByStudent = new Map(
    (balanceResult.data ?? [])
      .filter((row) => row.student_id)
      .map((row) => [row.student_id as string, row.remaining ?? 0]),
  );
  const familyGroups = new Map<string, SadaqaFamily>();
  for (const [studentId, remainingOre] of remainingByStudent) {
    const student = students.get(studentId);
    if (!student) continue;
    const key = student.family_id ?? studentId;
    const group = familyGroups.get(key) ?? {
      id: key,
      name: student.family_id
        ? familyName(student.family_id, student.child_last_name)
        : studentDisplayName(student) || "Ukjent barn",
      children: [],
    };
    group.children.push({
      id: studentId,
      name: studentDisplayName(student) || "Ukjent barn",
      remainingOre,
    });
    familyGroups.set(key, group);
  }
  const pickerFamilies = [...familyGroups.values()]
    .map((family) => ({
      ...family,
      children: family.children.sort((a, b) =>
        a.name.localeCompare(b.name, "nb-NO"),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  const giftFamilies = [...familyNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));

  const difference = totals.giftsOre - totals.supportOre;

  const coverDialog = (
    <SadaqaCoverDialog
      schoolYearId={selectedYear.id}
      families={pickerFamilies}
      triggerVariant="default"
    />
  );
  const giftDialog = (
    <SadaqaGiftDialog schoolYearId={selectedYear.id} families={giftFamilies} />
  );

  return (
    <div className="grid gap-6 lg:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Sadaqa
          </h1>
          <p className="mt-1 max-w-3xl text-admin-muted">
            Sadaqa-støtte føres som betalt fra sadaqa-kontoen. Gaver er penger
            gitt til sadaqa.
          </p>
        </div>
        {years.length > 1 ? (
          <nav aria-label="Velg skoleår" className="flex flex-wrap gap-1">
            {years.map((year) => (
              <Link
                key={year.id}
                href={`${pageHref}?aar=${year.id}`}
                aria-current={year.id === selectedYear.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  year.id === selectedYear.id
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

      <section
        aria-labelledby="sadaqa-totals"
        className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5"
      >
        <h2 id="sadaqa-totals" className="sr-only">
          Sadaqa {selectedYear.label}
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <div>
            <dt className="text-sm font-bold text-admin-muted">
              Gitt i støtte
            </dt>
            <dd className="font-heading text-2xl font-bold tabular-nums">
              {formatNok(totals.supportOre)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-admin-muted">
              Mottatt i gaver
            </dt>
            <dd className="font-heading text-2xl font-bold tabular-nums">
              {formatNok(totals.giftsOre)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-admin-muted">
              Differanse (registrert)
            </dt>
            <dd
              className={cn(
                "font-heading text-2xl font-bold tabular-nums",
                difference < 0 ? "text-[#775108]" : "text-[#216A2B]",
              )}
            >
              {difference > 0 ? "+" : ""}
              {formatNok(difference)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-admin-muted">
          {selectedYear.label}. Systemet vet bare det som er registrert her, ikke
          hva som faktisk står på sadaqa-kontoen.
        </p>
        <div className="flex flex-wrap gap-2 border-t border-[#ECE8DF] pt-4">
          {coverDialog}
          {giftDialog}
        </div>
      </section>

      <section aria-labelledby="sadaqa-support" className="grid gap-3">
        <div>
          <h2 id="sadaqa-support" className="font-heading text-xl font-bold">
            Støtte ({support.length})
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Skolepenger sadaqa-kontoen har betalt for barn.
          </p>
        </div>
        {support.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#E3DED3]">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F0F0ED] text-admin-muted">
              <HandHeart aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-semibold">
              Ingen sadaqa-støtte i {selectedYear.label}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
              Når en familie trenger hjelp, dekk hele eller deler av
              skolepengene med sadaqa.
            </p>
            <div className="mt-4 flex justify-center">{coverDialog}</div>
          </div>
        ) : (
          <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            {support.map((entry) => (
              <li
                key={entry.key}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {entry.studentId ? (
                      <Link
                        href={`${basePath}/elever/${entry.studentId}`}
                        className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {entry.name}
                      </Link>
                    ) : (
                      <span className="font-bold">{entry.name}</span>
                    )}
                    {entry.familyId ? (
                      <Link
                        href={`${basePath}/familier/${entry.familyId}`}
                        className="text-sm text-[#277A31] outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {familyName(entry.familyId, entry.familyLastName)}
                      </Link>
                    ) : null}
                    {entry.refunded > 0 ? (
                      <span className="rounded-full bg-[#FEEDCA] px-2 py-0.5 text-xs font-bold text-[#775108]">
                        {formatNok(entry.refunded)} tilbakeført
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-admin-muted">
                    {formatOsloDate(entry.date)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <p className="font-heading text-lg font-bold tabular-nums">
                  {formatNok(entry.amount)}
                </p>
                <SadaqaUndoMenu
                  kind="support"
                  id={entry.paymentId}
                  title={`Angre sadaqa-støtten på ${formatNok(entry.amount)}?`}
                  description={`${entry.name} får ${formatNok(entry.amount)} tilbake som utestående. Raden beholdes i historikken som annullert.`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sadaqa-gifts" className="grid gap-3">
        <div>
          <h2 id="sadaqa-gifts" className="font-heading text-xl font-bold">
            Gaver ({gifts.length})
          </h2>
          <p className="mt-0.5 text-sm text-admin-muted">
            Penger gitt til sadaqa, også overskudd familier har gitt bort.
          </p>
        </div>
        {gifts.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#E3DED3]">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F0F0ED] text-admin-muted">
              <Gift aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-semibold">
              Ingen gaver registrert i {selectedYear.label}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
              Registrer gaver som kommer inn, så ser du hva som er gitt og brukt.
            </p>
            <div className="mt-4 flex justify-center">{giftDialog}</div>
          </div>
        ) : (
          <ul className="divide-y divide-[#ECE8DF] overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            {gifts.map((gift) => {
              const from =
                gift.donor_name ||
                (gift.family_id ? familyName(gift.family_id) : null);
              return (
                <li
                  key={gift.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-4 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {gift.family_id ? (
                        <Link
                          href={`${basePath}/familier/${gift.family_id}`}
                          className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {from}
                        </Link>
                      ) : (
                        <span className="font-bold">
                          {from ?? "Ukjent giver"}
                        </span>
                      )}
                      <span className="rounded-full bg-[#F0F0ED] px-2 py-0.5 text-xs font-bold text-[#4E5550]">
                        {giftMethodLabels[gift.method] ?? gift.method}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-admin-muted">
                      {formatOsloDate(gift.received_on)}
                      {gift.note ? ` · ${gift.note}` : ""}
                    </p>
                  </div>
                  <p className="font-heading text-lg font-bold tabular-nums">
                    {formatNok(gift.amount)}
                  </p>
                  <SadaqaUndoMenu
                    kind="gift"
                    id={gift.id}
                    title={`Angre gaven på ${formatNok(gift.amount)}?`}
                    description={
                      gift.method === "overbetaling"
                        ? "Gaven tas ut av oversikten, og beløpet legges tilbake på betalingen det kom fra. Barnet står da som overbetalt igjen."
                        : "Gaven tas ut av oversikten. Den beholdes i historikken som angret."
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

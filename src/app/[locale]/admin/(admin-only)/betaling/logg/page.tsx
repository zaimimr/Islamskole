import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { studentDisplayName } from "@/lib/student-name";
import { adminBasePath } from "@/components/admin/paths";
import {
  AllocatePaymentDialog,
  type AllocationStudent,
} from "@/components/admin/allocate-payment-dialog";
import { RefundPaymentDialog } from "@/components/admin/refund-payment-dialog";
import { PaymentLinkActions } from "@/components/admin/payment-link-actions";
import { cn } from "@/lib/utils";
import { formatNok } from "@/lib/money";
import {
  formatOsloDate,
  formatOsloDateTime,
  osloLocalToIso,
} from "@/lib/dates";
import { SelectField } from "@/components/ui/select-field";

export const metadata: Metadata = { title: "Betalingslogg" };

const PAGE_SIZE = 50;
const SUM_PAGE_SIZE = 1000;

const statusLabels: Record<string, string> = {
  opprettet: "Venter",
  autorisert: "Autorisert",
  fanget: "Betalt",
  avbrutt: "Avbrutt",
  refundert: "Refundert",
  feilet: "Feilet",
};

const statusClasses: Record<string, string> = {
  opprettet: "bg-[#DDEEF9] text-[#245D84]",
  autorisert: "bg-[#FEEDCA] text-[#775108]",
  fanget: "bg-[#DCEDDD] text-[#216A2B]",
  avbrutt: "bg-[#F0F0ED] text-[#4E5550]",
  refundert: "bg-[#F0F0ED] text-[#4E5550]",
  feilet: "bg-[#F9DEDB] text-[#8B2F2B]",
};

const methodLabels: Record<string, string> = {
  vipps: "Vipps",
  kontant: "Kontant",
  bank: "Bankoverføring",
  annet: "Annet",
  sadaqa: "Sadaqa-støtte",
};

type PaymentRow = {
  id: string;
  reference: string;
  amount: number;
  status: string;
  method: string;
  captured_amount: number;
  refunded_amount: number;
  description: string | null;
  paid_at: string | null;
  due_date: string | null;
  created_at: string;
  payer_name: string | null;
  payer_phone: string | null;
  payer_email: string | null;
  vipps_payment_method: string | null;
  voided_at: string | null;
  last_synced_at: string | null;
  school_years: { label: string } | null;
};

type AllocationRow = {
  payment_id: string;
  student_id: string;
  amount: number;
  students: {
    child_first_name: string | null;
    child_last_name: string | null;
  } | null;
};

type ApplicationRow = {
  payment_id: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  status: string | null;
};

type EventRow = {
  reference: string;
  name: string;
  occurred_at: string;
  success: boolean | null;
};

type RefundRow = {
  payment_id: string;
  student_id: string | null;
  amount: number;
  method: string;
  reason: string;
  refunded_on: string;
  refunded_by: string;
};

type PaymentLogData = {
  payments: PaymentRow[];
  allocations: AllocationRow[];
  targets: AllocationRow[];
  activityTargets: AllocationRow[];
  events: EventRow[];
  applications: ApplicationRow[];
  students: AllocationStudent[];
  refunds: RefundRow[];
  gifts: { source_payment_id: string | null; amount: number }[];
  total: number;
  netTotal: number;
};

const statusFilters: Record<string, string[]> = {
  venter: ["opprettet", "autorisert"],
  betalt: ["fanget"],
  avbrutt: ["avbrutt", "feilet"],
  refundert: ["refundert"],
};

const methodFilters = ["vipps", "kontant", "bank", "annet", "sadaqa"];

function formatDateTime(value: string | null) {
  return formatOsloDateTime(value) || "-";
}

function formatDueDate(value: string | null) {
  return formatOsloDate(value) || null;
}

type LogFilters = {
  query: string;
  status: string;
  method: string;
  from: string;
  to: string;
};

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function nextDay(date: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}


function buildLogHref(
  basePath: string,
  values: LogFilters & { page?: number },
) {
  const params = new URLSearchParams();
  if (values.query) params.set("q", values.query);
  if (values.status) params.set("status", values.status);
  if (values.method) params.set("metode", values.method);
  if (values.from) params.set("fra", values.from);
  if (values.to) params.set("til", values.to);
  if ((values.page ?? 1) > 1) params.set("page", String(values.page));
  const suffix = params.toString();
  return `${basePath}/betaling/logg${suffix ? `?${suffix}` : ""}`;
}

async function getData(
  filters: LogFilters,
  page: number,
): Promise<{ ok: true; data: PaymentLogData } | { ok: false }> {
  try {
    const supabase = await createClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const studentResult = await supabase
      .from("students")
      .select("id, child_first_name, child_last_name")
      .order("child_first_name", { ascending: true });
    if (studentResult.error) return { ok: false };
    const allStudents =
      (studentResult.data as
        | {
            id: string;
            child_first_name: string | null;
            child_last_name: string | null;
          }[]
        | null) ?? [];

    const term = filters.query.trim().slice(0, 120);
    function applyFilters<
      Q extends {
        in: (column: string, values: string[]) => Q;
        is: (column: string, value: null) => Q;
        not: (column: string, operator: string, value: null) => Q;
        eq: (column: string, value: string) => Q;
        gte: (column: string, value: string) => Q;
        lt: (column: string, value: string) => Q;
      },
    >(query: Q): Q {
      let next = query;
      const statuses = statusFilters[filters.status];
      if (statuses) next = next.in("status", statuses);
      if (filters.status === "annullert") {
        next = next.not("voided_at", "is", null);
      } else if (filters.status) {
        next = next.is("voided_at", null);
      }
      if (filters.method) next = next.eq("method", filters.method);
      if (filters.from) {
        next = next.gte("paid_at", osloLocalToIso(`${filters.from}T00:00`));
      }
      if (filters.to) {
        next = next.lt("paid_at", osloLocalToIso(`${nextDay(filters.to)}T00:00`));
      }
      return next;
    }

    const paymentQuery = applyFilters(
      supabase
        .rpc("admin_search_payments", { p_query: term }, { count: "exact" })
        .select(
          "id, reference, amount, status, method, description, paid_at, due_date, created_at, captured_amount, refunded_amount, payer_name, payer_phone, payer_email, vipps_payment_method, voided_at, last_synced_at, school_years(label)",
        ),
    )
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    let netTotal = 0;
    for (let start = 0; ; start += SUM_PAGE_SIZE) {
      const { data: sumData, error: sumError } = await applyFilters(
        supabase
          .rpc("admin_search_payments", { p_query: term })
          .select("id, captured_amount, refunded_amount, voided_at"),
      )
        .order("id", { ascending: true })
        .range(start, start + SUM_PAGE_SIZE - 1);
      if (sumError) return { ok: false };
      const rows =
        (sumData as
          | {
              captured_amount: number;
              refunded_amount: number;
              voided_at: string | null;
            }[]
          | null) ?? [];
      for (const row of rows) {
        if (!row.voided_at) netTotal += row.captured_amount - row.refunded_amount;
      }
      if (rows.length < SUM_PAGE_SIZE) break;
    }

    const paymentResult = await paymentQuery;
    if (paymentResult.error) return { ok: false };

    const payments = (paymentResult.data as PaymentRow[] | null) ?? [];
    const ids = payments.map((payment) => payment.id);
    const references = payments.map((payment) => payment.reference);
    const [allocationResult, eventResult, applicationResult, refundResult] =
      await Promise.all([
        ids.length > 0
          ? supabase
              .from("payment_allocations")
              .select(
                "payment_id, student_id, amount, students(child_first_name, child_last_name)",
              )
              .in("payment_id", ids)
          : Promise.resolve({ data: [], error: null }),
        references.length > 0
          ? supabase
              .from("payment_events")
              .select("reference, name, occurred_at, success")
              .in("reference", references)
              .order("occurred_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        ids.length > 0
          ? supabase
              .from("student_applications")
              .select("payment_id, child_first_name, child_last_name, status")
              .in("payment_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length > 0
          ? supabase
              .from("refunds")
              .select(
                "payment_id, student_id, amount, method, reason, refunded_on, refunded_by",
              )
              .in("payment_id", ids)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);

    const targetResult =
      ids.length > 0
        ? await supabase
            .from("payment_targets")
            .select(
              "payment_id, student_id, amount, students(child_first_name, child_last_name)",
            )
            .in("payment_id", ids)
        : { data: [], error: null };

    const activityTargetResult =
      ids.length > 0
        ? await supabase
            .from("activity_payment_targets")
            .select(
              "payment_id, student_id, amount, students(child_first_name, child_last_name)",
            )
            .in("payment_id", ids)
        : { data: [], error: null };

    const giftResult =
      ids.length > 0
        ? await supabase
            .from("sadaqa_gifts")
            .select("source_payment_id, amount")
            .in("source_payment_id", ids)
            .is("voided_at", null)
        : { data: [], error: null };

    if (
      giftResult.error ||
      allocationResult.error ||
      eventResult.error ||
      applicationResult.error ||
      refundResult.error
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      data: {
        payments,
        allocations: (allocationResult.data as AllocationRow[] | null) ?? [],
        targets: targetResult.error
          ? []
          : ((targetResult.data as AllocationRow[] | null) ?? []),
        activityTargets: activityTargetResult.error
          ? []
          : ((activityTargetResult.data as AllocationRow[] | null) ?? []),
        events: (eventResult.data as EventRow[] | null) ?? [],
        applications: (applicationResult.data as ApplicationRow[] | null) ?? [],
        refunds: (refundResult.data as RefundRow[] | null) ?? [],
        gifts: giftResult.data ?? [],
        students: allStudents.map((student) => ({
          id: student.id,
          name: studentDisplayName(student) || "Uten navn",
        })),
        total: paymentResult.count ?? 0,
        netTotal,
      },
    };
  } catch {
    return { ok: false };
  }
}

export default async function PaymentLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const text = (key: string) => (typeof sp[key] === "string" ? sp[key] : "");
  const statusParam = text("status");
  const methodParam = text("metode");
  const filters: LogFilters = {
    query: text("q"),
    status:
      statusParam in statusFilters || statusParam === "annullert"
        ? statusParam
        : "",
    method: methodFilters.includes(methodParam) ? methodParam : "",
    from: isDate(text("fra")) ? text("fra") : "",
    to: isDate(text("til")) ? text("til") : "",
  };
  const pageParam = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page =
    Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const basePath = adminBasePath(locale);
  const result = await getData(filters, page);

  if (!result.ok) {
    return (
      <section
        aria-labelledby="payment-log-error"
        className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1
          id="payment-log-error"
          className="mt-4 font-heading text-3xl font-bold tracking-[-0.02em]"
        >
          Betalingsloggen kunne ikke lastes
        </h1>
        <p className="mt-2 max-w-prose text-admin-muted">
          Historikken er ikke erstattet med en tom liste. Prøv igjen før du
          avstemmer eller endrer en betaling.
        </p>
        <Link
          href={buildLogHref(basePath, { ...filters, page })}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Prøv igjen
        </Link>
      </section>
    );
  }

  const data = result.data;
  const allocationsByPayment = new Map<string, AllocationRow[]>();
  const applicationsByPayment = new Map<string, ApplicationRow[]>();
  const eventsByReference = new Map<string, EventRow[]>();

  for (const allocation of data.allocations) {
    const list = allocationsByPayment.get(allocation.payment_id) ?? [];
    list.push(allocation);
    allocationsByPayment.set(allocation.payment_id, list);
  }
  const giftByPayment = new Map<string, number>();
  for (const gift of data.gifts) {
    if (!gift.source_payment_id) continue;
    giftByPayment.set(
      gift.source_payment_id,
      (giftByPayment.get(gift.source_payment_id) ?? 0) + gift.amount,
    );
  }
  const targetsByPayment = new Map<string, AllocationRow[]>();
  const activityPayments = new Set(
    data.activityTargets.map((target) => target.payment_id),
  );
  for (const target of [...data.targets, ...data.activityTargets]) {
    const list = targetsByPayment.get(target.payment_id) ?? [];
    list.push(target);
    targetsByPayment.set(target.payment_id, list);
  }
  for (const application of data.applications) {
    if (!application.payment_id) continue;
    const list = applicationsByPayment.get(application.payment_id) ?? [];
    list.push(application);
    applicationsByPayment.set(application.payment_id, list);
  }
  for (const event of data.events) {
    const list = eventsByReference.get(event.reference) ?? [];
    list.push(event);
    eventsByReference.set(event.reference, list);
  }
  const refundsByPayment = new Map<string, RefundRow[]>();
  for (const refund of data.refunds) {
    const list = refundsByPayment.get(refund.payment_id) ?? [];
    list.push(refund);
    refundsByPayment.set(refund.payment_id, list);
  }

  const fromRecord = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = Math.min(page * PAGE_SIZE, data.total);
  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < data.total;
  const filtered = Boolean(
    filters.query || filters.status || filters.method || filters.from || filters.to,
  );

  const fieldClass =
    "min-h-11 w-full rounded-xl border border-[#DCD7CC] bg-white px-3 text-base sm:text-sm outline-none focus-visible:border-[#3C8F44] focus-visible:ring-3 focus-visible:ring-ring/30";

  return (
    <div className="grid gap-6 lg:gap-7">
      <header>
        <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Betalingslogg
        </h1>
        <p className="mt-1 max-w-3xl text-admin-muted">
          Hvem som betalte, hvilke barn betalingen dekker og hva Vipps sist
          rapporterte.
        </p>
      </header>

      <form
        action={`${basePath}/betaling/logg`}
        className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3]"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_11rem]">
          <div className="col-span-2 grid gap-1.5 md:col-span-1">
            <label htmlFor="payment-search" className="text-sm font-bold">
              Søk
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-admin-muted"
              />
              <input
                id="payment-search"
                type="search"
                name="q"
                defaultValue={filters.query}
                placeholder="Barn, betaler, telefon eller referanse"
                spellCheck={false}
                className={cn(fieldClass, "pl-10 placeholder:text-[#6A716C]")}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="payment-status" className="text-sm font-bold">
              Status
            </label>
            <SelectField
              id="payment-status"
              name="status"
              defaultValue={filters.status}
              options={[
                { value: "", label: "Alle statuser" },
                { value: "betalt", label: "Betalt" },
                { value: "venter", label: "Sendt, venter på betaling" },
                { value: "refundert", label: "Refundert" },
                { value: "avbrutt", label: "Avbrutt eller feilet" },
                { value: "annullert", label: "Annullert" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="payment-method" className="text-sm font-bold">
              Betalingsmåte
            </label>
            <SelectField
              id="payment-method"
              name="metode"
              defaultValue={filters.method}
              options={[
                { value: "", label: "Alle" },
                ...methodFilters.map((method) => ({
                  value: method,
                  label: methodLabels[method],
                })),
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end md:grid-cols-[11rem_11rem_1fr]">
          <div className="grid gap-1.5">
            <label htmlFor="payment-from" className="text-sm font-bold">
              Betalt fra
            </label>
            <input
              id="payment-from"
              type="date"
              name="fra"
              defaultValue={filters.from}
              className={fieldClass}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="payment-to" className="text-sm font-bold">
              Betalt til
            </label>
            <input
              id="payment-to"
              type="date"
              name="til"
              defaultValue={filters.to}
              className={fieldClass}
            />
          </div>
          <div className="col-span-2 flex gap-2 sm:col-span-1 sm:justify-end">
            <button
              type="submit"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-none"
            >
              Vis resultater
            </button>
            {filtered ? (
              <Link
                href={`${basePath}/betaling/logg`}
                aria-label="Nullstill filtre"
                className="inline-flex size-11 items-center justify-center rounded-xl border border-[#DCD7CC] bg-white outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <section aria-labelledby="payment-results-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="payment-results-title"
              className="font-heading text-xl font-semibold"
            >
              {filtered ? "Søkeresultater" : "Nyeste betalinger"}
            </h2>
            <p className="mt-0.5 text-sm text-admin-muted" aria-live="polite">
              {data.total === 0 ? (
                "Ingen betalinger funnet"
              ) : (
                <>
                  <span className="font-bold text-foreground tabular-nums">
                    {data.total} {data.total === 1 ? "betaling" : "betalinger"} ·{" "}
                    {formatNok(data.netTotal)} netto
                  </span>
                  {data.total > PAGE_SIZE
                    ? ` · viser ${fromRecord}-${toRecord}`
                    : ""}
                </>
              )}
            </p>
          </div>
        </div>

        {data.payments.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#E3DED3]">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F0F0ED] text-admin-muted">
              <ReceiptText aria-hidden="true" className="size-6" />
            </span>
            <h3 className="mt-4 font-heading text-xl font-semibold">
              {filtered ? "Ingen betalinger samsvarer" : "Ingen betalinger ennå"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-admin-muted">
              {filtered
                ? "Prøv et annet navn, en annen periode eller fjern et filter."
                : "Betalinger vises her så snart de er opprettet eller registrert."}
            </p>
          </div>
        ) : (
          <ol className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
            <li
              aria-hidden="true"
              className="hidden grid-cols-[8.5rem_minmax(10rem,1fr)_minmax(12rem,1.2fr)_7.5rem_8rem_minmax(10rem,auto)] gap-4 border-b border-[#E8E3D9] bg-[#FAF9F5] px-5 py-3 text-xs font-bold text-admin-muted xl:grid"
            >
              <span>Dato</span>
              <span>Betaler</span>
              <span>Barn</span>
              <span>Beløp</span>
              <span>Status</span>
              <span className="text-right">Handlinger</span>
            </li>
            {data.payments.map((payment) => {
              const allocations = allocationsByPayment.get(payment.id) ?? [];
              const applications = applicationsByPayment.get(payment.id) ?? [];
              const refunds = refundsByPayment.get(payment.id) ?? [];
              const refundedByStudent = new Map<string, number>();
              for (const refund of refunds) {
                if (!refund.student_id) continue;
                refundedByStudent.set(
                  refund.student_id,
                  (refundedByStudent.get(refund.student_id) ?? 0) +
                    refund.amount,
                );
              }
              const events = eventsByReference.get(payment.reference) ?? [];
              const latestEvent = events[0] ?? null;
              const voided = Boolean(payment.voided_at);
              const vippsPayment =
                payment.method === "vipps" &&
                !payment.reference.startsWith("manual-");
              const dueDate = formatDueDate(payment.due_date);
              const hasMoney = !voided && payment.captured_amount > 0;
              const allocationName = (allocation: AllocationRow) =>
                allocation.students
                  ? studentDisplayName(allocation.students) || "Ukjent barn"
                  : "Ukjent barn";
              const targets = targetsByPayment.get(payment.id) ?? [];
              const childSummary =
                allocations.length > 0
                  ? allocations.map(allocationName).join(", ")
                  : targets.length > 0
                    ? targets.map(allocationName).join(", ")
                    : applications.length > 0
                    ? applications
                        .map(
                          (application) =>
                            studentDisplayName(application) || "Ukjent barn",
                        )
                        .join(", ")
                    : null;

              const actions = (
                <>
                  {hasMoney && !activityPayments.has(payment.id) ? (
                    <AllocatePaymentDialog
                      paymentId={payment.id}
                      paymentAmount={payment.captured_amount - payment.refunded_amount}
                      students={data.students}
                      existing={allocations.map((allocation) => ({
                        studentId: allocation.student_id,
                        amount: allocation.amount,
                      }))}
                    />
                  ) : null}
                  {vippsPayment &&
                  (payment.status === "opprettet" ||
                    payment.status === "autorisert") &&
                  !voided ? (
                    <PaymentLinkActions paymentId={payment.id} />
                  ) : null}
                  {hasMoney &&
                  payment.refunded_amount < payment.captured_amount ? (
                    <RefundPaymentDialog
                      paymentId={payment.id}
                      capturedAmount={payment.captured_amount}
                      refundedAmount={payment.refunded_amount}
                      payerName={payment.payer_name}
                      vippsRefundAvailable={vippsPayment}
                      allocations={allocations.map((allocation) => ({
                        studentId: allocation.student_id,
                        name: allocationName(allocation),
                        amount: allocation.amount,
                        refunded:
                          refundedByStudent.get(allocation.student_id) ?? 0,
                      }))}
                    />
                  ) : null}
                </>
              );
              const hasActions =
                hasMoney ||
                (vippsPayment &&
                  !voided &&
                  (payment.status === "opprettet" ||
                    payment.status === "autorisert"));

              return (
                <li
                  key={payment.id}
                  className={cn(
                    "border-b border-[#ECE8DF] px-4 py-3 last:border-b-0 sm:px-5 xl:py-4",
                    voided && "bg-[#FAF9F5]",
                  )}
                >
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 xl:grid-cols-[8.5rem_minmax(10rem,1fr)_minmax(12rem,1.2fr)_7.5rem_8rem_minmax(10rem,auto)] xl:items-start xl:gap-4">
                    <div className="min-w-0 xl:order-2">
                      <p className="truncate font-bold">
                        <span className="xl:hidden">
                          {childSummary ?? payment.payer_name ?? "Ikke fordelt"}
                        </span>
                        <span className="hidden xl:inline">
                          {payment.payer_name ?? "Betaler ikke oppgitt"}
                        </span>
                      </p>
                      {payment.payer_phone || payment.payer_email ? (
                        <p className="mt-0.5 hidden break-words text-sm text-admin-muted xl:block">
                          {[payment.payer_phone, payment.payer_email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    <p
                      className={cn(
                        "text-right font-heading text-lg font-bold tabular-nums xl:order-4 xl:text-left xl:text-base",
                        voided && "text-admin-muted line-through",
                      )}
                    >
                      {formatNok(payment.amount)}
                      <span className="mt-0.5 hidden font-sans text-xs font-normal text-admin-muted no-underline xl:block">
                        {payment.school_years?.label ?? "Skoleår mangler"}
                      </span>
                    </p>

                    <p className="min-w-0 truncate text-sm text-admin-muted xl:order-1 xl:whitespace-normal">
                      <span className="font-semibold text-foreground xl:block">
                        {vippsPayment
                          ? formatDateTime(payment.paid_at ?? payment.created_at)
                          : formatOsloDate(payment.paid_at ?? payment.created_at) || "-"}
                      </span>
                      <span className="xl:hidden"> · </span>
                      <span className="xl:mt-0.5 xl:block xl:text-xs">
                        {methodLabels[payment.method] ?? payment.method}
                        {payment.vipps_payment_method
                          ? `, ${payment.vipps_payment_method}`
                          : ""}
                      </span>
                    </p>

                    <div className="flex justify-end xl:order-5 xl:block">
                      <PaymentStatus
                        status={payment.status}
                        voided={voided}
                        capturedAmount={payment.captured_amount}
                        refundedAmount={payment.refunded_amount}
                      />
                      {latestEvent?.success === false ? (
                        <p className="mt-2 hidden items-center gap-1 text-xs font-semibold text-[#8B2F2B] xl:flex">
                          <AlertTriangle aria-hidden="true" className="size-3.5" />
                          Vipps-feil
                        </p>
                      ) : latestEvent ? (
                        <p className="mt-2 hidden items-center gap-1 text-xs text-admin-muted xl:flex">
                          <CheckCircle2 aria-hidden="true" className="size-3.5" />
                          Synkronisert
                        </p>
                      ) : null}
                      {dueDate && payment.status !== "fanget" ? (
                        <span className="mt-2 hidden rounded-full bg-[#FEEDCA] px-2.5 py-1 text-xs font-bold text-[#775108] xl:inline-flex">
                          Frist {dueDate}
                        </span>
                      ) : null}
                    </div>

                    <div className="hidden xl:order-3 xl:block">
                      {allocations.length > 0 ? (
                        <ul className="grid gap-1">
                          {allocations.map((allocation) => (
                            <li
                              key={`${payment.id}-${allocation.student_id}`}
                              className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm"
                            >
                              <Link
                                href={`${basePath}/elever/${allocation.student_id}`}
                                className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                {allocationName(allocation)}
                              </Link>
                              <span className="text-admin-muted tabular-nums">
                                {formatNok(allocation.amount)}
                              </span>
                            </li>
                          ))}
                          {giftByPayment.get(payment.id) ? (
                            <li className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                              <Link
                                href={`${basePath}/betaling/sadaqa`}
                                className="font-bold outline-none underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                Sadaqa-gave
                              </Link>
                              <span className="text-admin-muted tabular-nums">
                                {formatNok(giftByPayment.get(payment.id) ?? 0)}
                              </span>
                            </li>
                          ) : null}
                        </ul>
                      ) : applications.length > 0 ? (
                        <div>
                          <p className="font-bold">{childSummary}</p>
                          <p className="mt-0.5 text-xs text-admin-muted">
                            Påmelding ikke godkjent ennå
                          </p>
                        </div>
                      ) : hasMoney ? (
                        <p className="text-sm font-semibold text-[#8B2F2B]">
                          Ikke fordelt
                        </p>
                      ) : (
                        <p className="text-sm text-admin-muted">-</p>
                      )}
                    </div>

                    <div className="hidden flex-wrap justify-end gap-2 xl:order-6 xl:flex [&_[data-slot=button]]:min-h-11">
                      {actions}
                    </div>
                  </div>

                  <details className="group mt-2 rounded-xl xl:mt-3 xl:bg-[#FAF9F5] xl:ring-1 xl:ring-[#E8E3D9]">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50 xl:px-3 xl:text-foreground [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-2">
                        {vippsPayment ? (
                          <Smartphone aria-hidden="true" className="hidden size-4 xl:block" />
                        ) : (
                          <ReceiptText aria-hidden="true" className="hidden size-4 xl:block" />
                        )}
                        <span className="xl:hidden">
                          {hasActions ? "Detaljer og handlinger" : "Detaljer"}
                        </span>
                        <span className="hidden xl:inline">
                          Referanse og hendelser
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-admin-muted transition-transform group-open:rotate-90"
                      />
                    </summary>
                    <div className="grid gap-3 rounded-xl bg-[#FAF9F5] px-3 py-3 ring-1 ring-[#E8E3D9] xl:rounded-none xl:border-t xl:border-[#E8E3D9] xl:ring-0">
                      {hasActions ? (
                        <div className="flex flex-wrap gap-2 xl:hidden [&_[data-slot=button]]:min-h-11">
                          {actions}
                        </div>
                      ) : null}
                      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        <LogDetail
                          label="Betaler"
                          value={
                            [payment.payer_name ?? "Ikke oppgitt", payment.payer_phone, payment.payer_email]
                              .filter(Boolean)
                              .join(" · ")
                          }
                        />
                        <LogDetail
                          label="Barn"
                          value={
                            allocations.length > 0
                              ? allocations
                                  .map(
                                    (allocation) =>
                                      `${allocationName(allocation)} ${formatNok(allocation.amount)}`,
                                  )
                                  .join(", ")
                              : (childSummary ?? "Ikke fordelt")
                          }
                        />
                        <LogDetail
                          label="Skoleår"
                          value={payment.school_years?.label ?? "Mangler"}
                        />
                        <LogDetail label="Referanse" value={payment.reference} mono />
                        <LogDetail
                          label="Siste Vipps-hendelse"
                          value={
                            latestEvent
                              ? `${latestEvent.name}, ${formatDateTime(latestEvent.occurred_at)}${latestEvent.success === false ? ", feilet" : ""}`
                              : "Ingen hendelser registrert"
                          }
                        />
                        <LogDetail
                          label="Sist synkronisert"
                          value={formatDateTime(payment.last_synced_at)}
                        />
                        {dueDate && payment.status !== "fanget" ? (
                          <LogDetail label="Frist" value={dueDate} />
                        ) : null}
                        {payment.description ? (
                          <LogDetail label="Beskrivelse" value={payment.description} />
                        ) : null}
                        {refunds.length > 0 ? (
                          <LogDetail
                            label="Refusjoner"
                            value={refunds
                              .map((refund) => {
                                const child = refund.student_id
                                  ? allocations.find(
                                      (allocation) =>
                                        allocation.student_id === refund.student_id,
                                    )
                                  : null;
                                const name = child ? allocationName(child) : null;
                                return `${formatNok(refund.amount)} (${methodLabels[refund.method] ?? refund.method}${name ? `, ${name}` : ""}, ${formatDueDate(refund.refunded_on) ?? refund.refunded_on}) - ${refund.reason}`;
                              })
                              .join("\n")}
                          />
                        ) : null}
                      </dl>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {data.total > PAGE_SIZE ? (
        <nav
          aria-label="Sider i betalingsloggen"
          className="flex items-center justify-between gap-3"
        >
          {hasPrevious ? (
            <Link
              href={buildLogHref(basePath, { ...filters, page: page - 1 })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Forrige
            </Link>
          ) : (
            <span className="min-h-11" />
          )}
          <span className="text-sm font-semibold text-admin-muted">
            Side {page} av {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
          </span>
          {hasNext ? (
            <Link
              href={buildLogHref(basePath, { ...filters, page: page + 1 })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCD7CC] bg-white px-3 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Neste
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span className="min-h-11" />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function PaymentStatus({
  status,
  voided,
  capturedAmount = 0,
  refundedAmount = 0,
  className,
}: {
  status: string;
  voided: boolean;
  capturedAmount?: number;
  refundedAmount?: number;
  className?: string;
}) {
  const partiallyRefunded =
    !voided &&
    status === "fanget" &&
    refundedAmount > 0 &&
    refundedAmount < capturedAmount;
  const label = voided ? "Annullert" : (statusLabels[status] ?? status);
  const tone = voided
    ? "bg-[#F9DEDB] text-[#8B2F2B]"
    : (statusClasses[status] ?? "bg-[#F0F0ED] text-[#4E5550]");

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
          tone,
        )}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {label}
      </span>
      {partiallyRefunded ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#FEEDCA] px-2.5 py-1 text-xs font-bold whitespace-nowrap text-[#775108]">
          Delvis refundert · {formatNok(refundedAmount)}
        </span>
      ) : null}
    </span>
  );
}

function LogDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-admin-muted">{label}</dt>
      <dd
        className={cn("mt-0.5 break-words", mono && "font-mono text-xs")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

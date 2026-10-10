import { StudentReports } from "@/components/term-reports/student-reports";
import type { Metadata } from "next";
import { relationshipLabel } from "@/lib/relationship";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  CircleDollarSign,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminBasePath } from "@/components/admin/paths";
import { StudentForm } from "@/components/admin/student-form";
import {
  EnrollmentManager,
  type EnrollmentRow,
} from "@/components/admin/enrollment-manager";
import {
  PaymentManager,
  type PaymentRow,
  type YearFee,
} from "@/components/admin/payment-manager";
import { getStudentDeleteBlockers } from "@/app/[locale]/admin/students-actions";
import { suggestPlacements } from "@/app/[locale]/admin/register/placement";
import { studentDisplayName } from "@/lib/student-name";
import { ageInYear, formatAge, schoolYearStart } from "@/lib/age";
import { formatOsloDate, formatOsloDateTime } from "@/lib/dates";
import { getLastParentChange } from "@/lib/parent-changes";
import { formatNok } from "@/lib/money";
import { StudentExitPanel } from "./student-exit-panel";
import { StudentLoginEmail } from "./student-login-email";
import { getAdminFamilies } from "@/lib/families/service";
import { FamilyPickerDialog } from "@/app/[locale]/admin/familier/family-controls";
import { familyOptions } from "@/app/[locale]/admin/familier/family-options";
import { moveStudentToFamily } from "@/app/[locale]/admin/familier/families-actions";
import { LearningProgressSection } from "@/components/learning-progress/progress-section";

export const metadata: Metadata = { title: "Elev" };

type StudentData = {
  id: string;
  family_id: string | null;
  application_id: string | null;
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
  child_level_quran: string | null;
  child_level_arabic: string | null;
  child_level_islam: string | null;
  notes: string | null;
  allergies: string | null;
  medical_notes: string | null;
  photo_consent: boolean | null;
};

type GuardianLink = {
  relationship_label: string;
  receives_communication: boolean;
  guardians: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

const levelLabels: Record<string, string> = {
  nybegynner: "Nybegynner",
  litt: "Litt erfaring",
  middels: "Middels",
  god: "God",
};

const genderLabels: Record<string, string> = { gutt: "Gutt", jente: "Jente" };


function telHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

const linkClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded font-bold text-[#277A31] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8";

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-admin-muted">{label}</dt>
      <dd className="mt-1 text-sm font-bold">{children}</dd>
    </div>
  );
}

export default async function ElevDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const editing = (await searchParams).rediger === "1";
  const basePath = adminBasePath(locale);
  const listHref = `${basePath}/elever`;
  const supabase = await createClient();

  const [
    { data: studentData },
    { data: classData },
    { data: yearData },
    { data: enrollmentData },
    { data: allocationData },
    { data: balanceData },
    { data: feeData },
    { data: adjustmentData },
    { data: teacherData },
    lastParentChange,
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, family_id, application_id, child_first_name, child_last_name, child_birth_date, child_gender, child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone, mother_email, father_first_name, father_last_name, father_phone, father_email, child_level_quran, child_level_arabic, child_level_islam, notes, allergies, medical_notes, photo_consent",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("classes")
      .select("id, name_no, price, age_min, age_max, capacity")
      .order("sort_order", { ascending: true }),
    supabase
      .from("school_years")
      .select("id, label, is_active, fee")
      .order("label", { ascending: false }),
    supabase
      .from("enrollments")
      .select(
        "id, class_id, school_year_id, status, price_snapshot, classes(name_no, price), school_years(label)",
      )
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_allocations")
      .select("payment_id, amount, school_year_id")
      .eq("student_id", id),
    supabase
      .from("student_balances")
      .select("school_year_id, owed, paid, remaining, state")
      .eq("student_id", id),
    supabase
      .from("student_fees")
      .select("school_year_id, amount, discount, note")
      .eq("student_id", id),
    supabase
      .from("student_fee_adjustments")
      .select(
        "id, school_year_id, type, amount, note, created_at, guardians(first_name, last_name)",
      )
      .eq("student_id", id)
      .is("revoked_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("guardians")
      .select("id, first_name, last_name")
      .eq("is_teacher", true)
      .order("first_name", { ascending: true }),
    getLastParentChange({ studentId: id }),
  ]);

  const student = studentData as StudentData | null;
  if (!student) notFound();

  const classRows =
    (classData as
      | {
          id: string;
          name_no: string | null;
          price: number | null;
          age_min: number | null;
          age_max: number | null;
          capacity: number | null;
        }[]
      | null) ?? [];
  const classes = classRows.map((c) => ({
    id: c.id,
    name: c.name_no ?? "(uten navn)",
    price: c.price,
  }));

  const yearsRaw =
    (yearData as
      | { id: string; label: string; is_active: boolean; fee: number | null }[]
      | null) ?? [];
  const schoolYears = yearsRaw.map((y) => ({ id: y.id, label: y.label }));
  const enrollmentYears = yearsRaw.map((y) => ({
    id: y.id,
    label: y.label,
    fee: y.fee,
  }));
  const trulyActiveYear = yearsRaw.find((y) => y.is_active) ?? null;
  const activeYear = trulyActiveYear ?? yearsRaw[0];
  const defaultSchoolYearId = activeYear?.id ?? null;

  const [
    { data: guardianData },
    { data: applicationData },
    { data: yearEnrollmentData },
    { data: targetData },
    deleteBlockers,
    allFamilies,
    { data: pickupData },
  ] = await Promise.all([
    student.family_id
      ? supabase
          .from("family_guardians")
          .select(
            "relationship_label, receives_communication, guardians(id, first_name, last_name, phone, email)",
          )
          .eq("family_id", student.family_id)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    student.application_id
      ? supabase
          .from("student_applications")
          .select("desired_class")
          .eq("id", student.application_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    defaultSchoolYearId
      ? supabase
          .from("enrollments")
          .select("class_id")
          .eq("school_year_id", defaultSchoolYearId)
          .eq("status", "aktiv")
      : Promise.resolve({ data: [] }),
    supabase.from("payment_targets").select("payment_id").eq("student_id", id),
    getStudentDeleteBlockers(id),
    getAdminFamilies(),
    student.family_id
      ? supabase
          .from("family_pickup_persons")
          .select("id, name, phone, relation")
          .eq("family_id", student.family_id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const pickup = pickupData ?? [];

  const guardians = ((guardianData as GuardianLink[] | null) ?? []).filter(
    (link) => link.guardians,
  );

  const classCounts = new Map<string, number>();
  for (const row of (yearEnrollmentData as { class_id: string }[] | null) ??
    []) {
    classCounts.set(row.class_id, (classCounts.get(row.class_id) ?? 0) + 1);
  }
  const ageYear =
    schoolYearStart(activeYear?.label) ?? new Date().getFullYear();
  const childAge = ageInYear(student.child_birth_date, ageYear);
  const suggestedClassId =
    suggestPlacements(
      [
        {
          id: student.id,
          age: childAge,
          desiredClass:
            (applicationData as { desired_class: string | null } | null)
              ?.desired_class ?? null,
        },
      ],
      classRows.map((c) => ({
        id: c.id,
        name: c.name_no ?? "",
        ageMin: c.age_min,
        ageMax: c.age_max,
        capacity: c.capacity,
        enrolled: classCounts.get(c.id) ?? 0,
      })),
    ).get(student.id) ?? null;

  const enrollmentRaw =
    (enrollmentData as
      | {
          id: string;
          class_id: string;
          school_year_id: string;
          status: string;
          price_snapshot: number | null;
          classes: { name_no: string | null; price: number | null } | null;
          school_years: { label: string } | null;
        }[]
      | null) ?? [];

  const enrollments: EnrollmentRow[] = enrollmentRaw.map((e) => ({
    id: e.id,
    classId: e.class_id,
    schoolYearId: e.school_year_id,
    schoolYear: e.school_years?.label ?? "-",
    status: e.status,
    className: e.classes?.name_no ?? "(uten navn)",
    price: e.price_snapshot,
  }));

  const activeEnrollment =
    enrollmentRaw.find(
      (e) => e.status === "aktiv" && e.school_year_id === defaultSchoolYearId,
    ) ?? enrollmentRaw.find((e) => e.status === "aktiv");
  const balancesByYear: Record<
    string,
    { owed: number; paid: number; remaining: number }
  > = {};
  for (const row of (balanceData as
    | {
        school_year_id: string | null;
        owed: number | null;
        paid: number | null;
        remaining: number | null;
      }[]
    | null) ?? []) {
    if (!row.school_year_id) continue;
    balancesByYear[row.school_year_id] = {
      owed: row.owed ?? 0,
      paid: row.paid ?? 0,
      remaining: row.remaining ?? 0,
    };
  }

  const feesByYear: Record<string, YearFee> = {};
  for (const row of (feeData as
    | {
        school_year_id: string;
        amount: number | null;
        discount: number | null;
        note: string | null;
      }[]
    | null) ?? []) {
    feesByYear[row.school_year_id] = {
      amount: row.amount ?? 0,
      discount: row.discount ?? 0,
      note: row.note,
    };
  }

  const adjustments = (
    (adjustmentData as
      | {
          id: string;
          school_year_id: string;
          type: string;
          amount: number;
          note: string;
          created_at: string | null;
          guardians: {
            first_name: string | null;
            last_name: string | null;
          } | null;
        }[]
      | null) ?? []
  ).map((adjustment) => ({
    id: adjustment.id,
    schoolYearId: adjustment.school_year_id,
    type: adjustment.type,
    amount: adjustment.amount,
    note: adjustment.note,
    teacherName: adjustment.guardians
      ? [adjustment.guardians.first_name, adjustment.guardians.last_name]
          .filter(Boolean)
          .join(" ") || null
      : null,
    createdAt: adjustment.created_at,
  }));

  const teachers = (
    (teacherData as
      | { id: string; first_name: string | null; last_name: string | null }[]
      | null) ?? []
  ).map((teacher) => ({
    id: teacher.id,
    name:
      [teacher.first_name, teacher.last_name].filter(Boolean).join(" ") ||
      "(uten navn)",
  }));

  const fallbackAmount =
    activeEnrollment?.price_snapshot ?? activeYear?.fee ?? null;
  const defaultAmount = fallbackAmount;

  const allocations =
    (allocationData as
      | { payment_id: string; amount: number; school_year_id: string }[]
      | null) ?? [];

  const allocationByPayment = new Map(
    allocations.map((a) => [a.payment_id, a.amount]),
  );

  const paymentIds = [
    ...new Set([
      ...allocations.map((a) => a.payment_id),
      ...((targetData as { payment_id: string }[] | null) ?? []).map(
        (t) => t.payment_id,
      ),
    ]),
  ];

  const paymentFilter = paymentIds.length
    ? `id.in.(${paymentIds.join(",")}),student_id.eq.${id}`
    : `student_id.eq.${id}`;

  const { data: refundData } = paymentIds.length
    ? await supabase
        .from("refunds")
        .select("payment_id, student_id, amount")
        .in("payment_id", paymentIds)
    : { data: [] };
  const refundRows = (refundData ?? []) as {
    payment_id: string;
    student_id: string | null;
    amount: number;
  }[];

  const { data: lockData } = paymentIds.length
    ? await supabase
        .from("payment_allocation_locks")
        .select("payment_id")
        .in("payment_id", paymentIds)
    : { data: [] };
  const lockedPaymentIds = new Set(
    ((lockData as { payment_id: string }[] | null) ?? []).map(
      (row) => row.payment_id,
    ),
  );

  const { data: paymentData } = await supabase
    .from("payments")
    .select(
      "id, amount, currency, description, status, method, paid_at, due_date, redirect_url, created_at, reference, voided_at, void_reason, payer_name, payer_phone, payer_email, vipps_state, vipps_payment_method, psp_reference, last_synced_at, captured_at, captured_amount, refunded_amount, student_id, school_year_id, school_years(label), payment_allocations(student_id, amount, students(child_first_name, child_last_name))",
    )
    .or(paymentFilter)
    .order("created_at", { ascending: false });

  const payments: PaymentRow[] = (
    (paymentData as
      | (Omit<
          PaymentRow,
          | "schoolYear"
          | "allocatedAmount"
          | "sharedWith"
          | "schoolYearId"
          | "manuallyAllocated"
        > & {
          school_year_id: string | null;
          school_years: { label: string } | null;
          captured_amount: number;
          refunded_amount: number;
          payment_allocations:
            | {
                student_id: string;
                amount: number;
                students: {
                  child_first_name: string | null;
                  child_last_name: string | null;
                } | null;
              }[]
            | null;
        })[]
      | null) ?? []
  ).map((p) => {
    const covers = (p.payment_allocations ?? []).length;
    return {
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      status: p.status,
      method: p.method,
      paid_at: p.paid_at,
      due_date: p.due_date,
      redirect_url: p.redirect_url,
      created_at: p.created_at,
      reference: p.reference,
      voided_at: p.voided_at,
      void_reason: p.void_reason,
      payer_name: p.payer_name,
      payer_phone: p.payer_phone,
      payer_email: p.payer_email,
      vipps_state: p.vipps_state,
      vipps_payment_method: p.vipps_payment_method,
      psp_reference: p.psp_reference,
      last_synced_at: p.last_synced_at,
      captured_at: p.captured_at,
      schoolYear: p.school_years?.label ?? null,
      schoolYearId: p.school_year_id,
      allocatedAmount: allocationByPayment.get(p.id) ?? null,
      sharedWith: covers > 1 ? covers : null,
      manuallyAllocated: lockedPaymentIds.has(p.id),
      capturedAmount: p.captured_amount ?? 0,
      refundedAmount: p.refunded_amount ?? 0,
      refundAllocations: (p.payment_allocations ?? []).map((allocation) => ({
        studentId: allocation.student_id,
        name: allocation.students
          ? studentDisplayName(allocation.students) || "Ukjent barn"
          : "Ukjent barn",
        amount: allocation.amount,
        refunded: (refundRows ?? [])
          .filter(
            (refund) =>
              refund.payment_id === p.id &&
              refund.student_id === allocation.student_id,
          )
          .reduce((sum, refund) => sum + refund.amount, 0),
      })),
    };
  });

  const classByYear: Record<string, string> = {};
  for (const e of enrollmentRaw) {
    if (e.status === "aktiv" && !classByYear[e.school_year_id]) {
      classByYear[e.school_year_id] = e.classes?.name_no ?? "(uten navn)";
    }
  }

  const activeBalance = defaultSchoolYearId
    ? balancesByYear[defaultSchoolYearId]
    : null;
  const activeClass = activeEnrollment?.classes?.name_no ?? "Ikke plassert";

  const name = studentDisplayName(student) || "Elev";
  const studentHref = `${listHref}/${student.id}`;
  const familyHref = student.family_id
    ? `${basePath}/familier/${student.family_id}`
    : null;
  const hasActivePlacement = enrollmentRaw.some((e) => e.status === "aktiv");
  const endedYearId = hasActivePlacement
    ? null
    : (enrollmentRaw.find((e) => e.status === "avsluttet")?.school_year_id ??
      null);
  const endedRemaining = endedYearId
    ? (balancesByYear[endedYearId]?.remaining ?? 0)
    : 0;
  const address = [
    student.child_address,
    [student.child_postal_code, student.child_city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const header = (
    <header>
      <Link
        href={editing ? studentHref : listHref}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#277A31] outline-none hover:bg-[#F2F7F2] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {editing ? "Tilbake til eleven" : "Tilbake til elever"}
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            {editing ? `Rediger ${name}` : name}
          </h1>
          {!editing && childAge != null ? (
            <span className="text-base font-bold text-admin-muted">
              {formatAge(student.child_birth_date, ageYear)} år
            </span>
          ) : null}
          {lastParentChange ? (
            <p className="basis-full text-sm text-admin-muted">
              Sist endret av forelder {formatOsloDateTime(lastParentChange.createdAt)}
              {lastParentChange.actorEmail ? ` (${lastParentChange.actorEmail})` : ""}:{" "}
              {lastParentChange.summary}
            </p>
          ) : null}
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${studentHref}?rediger=1`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#CFC9BD] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Pencil aria-hidden="true" className="size-4 text-[#2F7938]" />
              Rediger
            </Link>
            {familyHref ? (
              <Link
                href={familyHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#CFC9BD] bg-white px-4 text-sm font-bold outline-none transition-colors hover:bg-[#F2F1EB] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <UsersRound
                  aria-hidden="true"
                  className="size-4 text-[#2F7938]"
                />
                Åpne familie
              </Link>
            ) : null}
            <FamilyPickerDialog
              triggerLabel="Flytt til annen familie"
              title={`Flytt ${name} til en annen familie`}
              description="Eleven kobles til den nye familiens foresatte. Betalinger og plasser følger eleven."
              confirmLabel="Flytt"
              successMessage={`${name} er flyttet`}
              options={familyOptions(allFamilies, student.family_id)}
              action={moveStudentToFamily.bind(null, student.id)}
              triggerClassName="border-[#CFC9BD] bg-white px-4"
            />
          </div>
        ) : null}
      </div>
    </header>
  );

  if (editing) {
    return (
      <div className="grid gap-5 sm:gap-6">
        {header}
        <p className="rounded-xl bg-[#EFF8FD] p-3 text-sm text-[#245D7C]">
          Foresatte endres i familien, så opplysningene er like overalt.
          {familyHref ? (
            <>
              {" "}
              <Link
                href={familyHref}
                className="font-bold underline underline-offset-4"
              >
                Endre i familien
              </Link>
            </>
          ) : null}
        </p>
        <StudentForm student={student} listHref={listHref} />
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      {header}

      <section
        aria-label="Aktiv elevstatus"
        className="grid overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] sm:grid-cols-3"
      >
        <div className="flex min-h-24 items-center gap-3 px-4 py-4 sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCEDDD] text-[#216A2B]">
            <GraduationCap aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-admin-muted">Aktiv klasse</p>
            <p className="mt-1 font-heading text-xl font-bold">{activeClass}</p>
          </div>
        </div>
        <div className="flex min-h-24 items-center gap-3 border-t border-[#ECE8DF] px-4 py-4 sm:border-t-0 sm:border-l sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EFF8FD] text-[#245D7C]">
            <GraduationCap aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-admin-muted">Skoleår</p>
            <p className="mt-1 font-heading text-xl font-bold">
              {activeYear?.label ?? "Ikke valgt"}
            </p>
          </div>
        </div>
        <div className="flex min-h-24 items-center gap-3 border-t border-[#ECE8DF] px-4 py-4 sm:border-t-0 sm:border-l sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FEEDCA] text-[#775108]">
            <CircleDollarSign aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-admin-muted">
              Gjenstår å betale
            </p>
            <p className="mt-1 font-heading text-xl font-bold tabular-nums">
              {formatNok(activeBalance?.remaining ?? 0)}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECE8DF] px-4 py-4 sm:px-5">
          <h2 className="font-heading text-xl font-bold">Elev og foresatte</h2>
          {familyHref ? (
            <Link href={familyHref} className={linkClass}>
              Endre i familien
            </Link>
          ) : null}
        </div>
        <div className="grid gap-5 p-4 sm:p-5">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
            <Fact label="Fødselsdato">
              {student.child_birth_date
                ? `${formatOsloDate(student.child_birth_date, { day: "numeric", month: "long", year: "numeric" })}${childAge != null ? `, ${childAge} år` : ""}`
                : "Ikke oppgitt"}
            </Fact>
            <Fact label="Kjønn">
              {student.child_gender
                ? (genderLabels[student.child_gender] ?? student.child_gender)
                : "Ikke oppgitt"}
            </Fact>
          </dl>

          <div>
            <h3 className="text-sm font-bold">Foresatte</h3>
            {guardians.length > 0 ? (
              <ul className="mt-2 grid gap-2">
                {guardians.map((link) => {
                  const guardian = link.guardians!;
                  const guardianFullName =
                    [guardian.first_name, guardian.last_name]
                      .filter(Boolean)
                      .join(" ") || "Uten navn";
                  return (
                    <li
                      key={guardian.id}
                      className="grid gap-1 rounded-xl border border-[#ECE8DF] px-3 py-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-4"
                    >
                      <span className="font-bold">
                        {guardianFullName}
                        <span className="font-normal text-admin-muted">
                          {" "}
                          · {relationshipLabel(link.relationship_label)}
                        </span>
                      </span>
                      {guardian.phone ? (
                        <a href={telHref(guardian.phone)} className={linkClass}>
                          <Phone aria-hidden="true" className="size-3.5" />
                          {guardian.phone}
                        </a>
                      ) : null}
                      {guardian.email ? (
                        <a
                          href={`mailto:${guardian.email}`}
                          className={`${linkClass} break-all`}
                        >
                          <Mail aria-hidden="true" className="size-3.5" />
                          {guardian.email}
                        </a>
                      ) : null}
                      {!link.receives_communication ? (
                        <span className="text-xs font-bold text-admin-muted">
                          Mottar ikke e-post fra skolen
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-admin-muted">
                Ingen foresatte er koblet til familien.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold">Helse, bilder og henting</h3>
            <dl className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
              <Fact label="Allergier">
                {student.allergies ?? "Ikke oppgitt"}
              </Fact>
              <Fact label="Helse">
                {student.medical_notes ?? "Ikke oppgitt"}
              </Fact>
              <Fact label="Fotosamtykke">
                {student.photo_consent == null
                  ? "Ikke svart"
                  : student.photo_consent
                    ? "Ja"
                    : "Nei"}
              </Fact>
            </dl>
            {pickup.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {pickup.map((person) => (
                  <li
                    key={person.id}
                    className="grid gap-1 rounded-xl border border-[#ECE8DF] px-3 py-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-4"
                  >
                    <span className="font-bold">
                      {person.name}
                      {person.relation ? (
                        <span className="font-normal text-admin-muted">
                          {" "}
                          · {person.relation}
                        </span>
                      ) : null}
                    </span>
                    {person.phone ? (
                      <a href={telHref(person.phone)} className={linkClass}>
                        <Phone aria-hidden="true" className="size-3.5" />
                        {person.phone}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-admin-muted">
                Ingen hentepersoner registrert.
              </p>
            )}
          </div>

          <StudentLoginEmail
            studentId={student.id}
            email={student.child_email}
          />

          <details className="group border-t border-[#ECE8DF] pt-2">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-bold text-admin-muted outline-none hover:bg-[#F2F1EB] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Detaljer
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180"
              />
            </summary>
            <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
              <Fact label="Adresse">{address || "Ikke oppgitt"}</Fact>
              <Fact label="Telefon (kontakt)">
                {student.child_phone ? (
                  <a href={telHref(student.child_phone)} className={linkClass}>
                    {student.child_phone}
                  </a>
                ) : (
                  "Ikke oppgitt"
                )}
              </Fact>
              <Fact label="Koran">
                {levelLabels[student.child_level_quran ?? ""] ?? "Ikke satt"}
              </Fact>
              <Fact label="Arabisk">
                {levelLabels[student.child_level_arabic ?? ""] ?? "Ikke satt"}
              </Fact>
              <Fact label="Islam">
                {levelLabels[student.child_level_islam ?? ""] ?? "Ikke satt"}
              </Fact>
            </dl>
            <div className="mt-4">
              <p className="text-xs font-bold text-admin-muted">Notater</p>
              <p className="mt-1 max-w-prose whitespace-pre-line text-sm">
                {student.notes || "Ingen notater"}
              </p>
            </div>
          </details>
        </div>
      </section>

      <EnrollmentManager
        studentId={student.id}
        classes={classes}
        schoolYears={enrollmentYears}
        enrollments={enrollments}
        defaultSchoolYearId={defaultSchoolYearId}
        activeSchoolYearId={trulyActiveYear?.id ?? null}
        suggestedClassId={suggestedClassId}
      />

      <PaymentManager
        studentId={student.id}
        studentName={name}
        classByYear={classByYear}
        schoolYears={schoolYears}
        defaultSchoolYearId={defaultSchoolYearId}
        defaultAmount={defaultAmount}
        balancesByYear={balancesByYear}
        feesByYear={feesByYear}
        payments={payments}
        adjustments={adjustments}
        teachers={teachers}
      />

      <LearningProgressSection
        studentId={student.id}
        classId={null}
      />

      <StudentReports studentId={student.id} locale="no" staff />

      <StudentExitPanel
        studentId={student.id}
        studentName={name}
        hasActivePlacement={hasActivePlacement}
        deleteBlockers={deleteBlockers}
        listHref={listHref}
        outstanding={
          endedYearId && endedRemaining > 0
            ? { schoolYearId: endedYearId, remaining: endedRemaining }
            : null
        }
      />
    </div>
  );
}

import type { Metadata } from "next";
import { relationshipLabel } from "@/lib/relationship";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminFamilies, getAdminFamilyById } from "@/lib/families/service";
import { formatNok } from "@/lib/money";
import { formatOsloDate } from "@/lib/dates";
import { getLastParentChange } from "@/lib/parent-changes";
import { findDuplicateFamilies } from "../duplicates";
import { familyOptions } from "../family-options";
import { adminBasePath } from "@/components/admin/paths";
import { ageInYear, schoolYearStart } from "@/lib/age";
import { FamilyEconomy } from "@/components/admin/family-economy";
import type { CustomPlanConfig } from "@/lib/custom-payment-plan";
import {
  FamilyWorkbench,
  type FamilyActivity,
  type FamilyChildSummary,
  type FamilyFact,
  type FamilyNextAction,
} from "@/components/admin/family-workbench";

export const metadata: Metadata = { title: "Familie" };

type EnrollmentRow = {
  student_id: string;
  school_year_id: string;
  status: string;
  created_at: string;
  classes: { name_no: string | null } | null;
};

type BalanceRow = {
  student_id: string | null;
  school_year_id: string | null;
  owed: number | null;
  paid: number | null;
  remaining: number | null;
  state: string | null;
};

type FeeRow = {
  student_id: string;
  school_year_id: string;
  amount: number;
  discount: number;
};

type PaymentRow = {
  id: string;
  status: string;
  amount: number;
  net_paid_amount: number | null;
  created_at: string;
};

function fullName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ") || "Navn mangler";
}


function admissionFact(status: string): FamilyFact {
  const values: Record<string, FamilyFact> = {
    ny: { value: "Ny innmelding", tone: "warning" },
    kontaktet: { value: "Kontaktet", tone: "info" },
    akseptert: { value: "Tatt opp", tone: "success" },
    avslatt: { value: "Avslått", tone: "neutral" },
    arkivert: { value: "Arkivert", tone: "neutral" },
  };
  return values[status] ?? { value: status, tone: "neutral" };
}

function paymentFact(payment: PaymentRow | undefined): FamilyFact {
  if (!payment) return { value: "Ikke opprettet", tone: "neutral" };
  const values: Record<string, FamilyFact> = {
    opprettet: { value: "Venter på betaling", tone: "warning" },
    autorisert: { value: "Autorisert", tone: "info" },
    fanget: { value: "Betalt", tone: "success" },
    refundert: { value: "Refundert", tone: "neutral" },
    avbrutt: { value: "Avbrutt", tone: "danger" },
    feilet: { value: "Feilet", tone: "danger" },
  };
  const fact = values[payment.status] ?? {
    value: payment.status,
    tone: "neutral" as const,
  };
  if (payment.status === "fanget" && payment.net_paid_amount === 0) {
    return { value: "Fullt refundert", tone: "neutral" };
  }
  return fact;
}

function balanceFact(balance: BalanceRow | undefined): FamilyFact {
  if (!balance) {
    return { value: "Ingen krav", tone: "neutral" };
  }
  if ((balance.owed ?? 0) === 0) {
    return { value: "Fritatt", tone: "neutral" };
  }
  if ((balance.remaining ?? 0) <= 0) {
    return { value: "Betalt", tone: "success" };
  }
  if ((balance.paid ?? 0) > 0) {
    return { value: "Delvis betalt", tone: "warning" };
  }
  return { value: "Ubetalt", tone: "danger" };
}

function birthDescription(
  birthDate: string | null,
  prefix: string,
  ageYear: number,
) {
  if (!birthDate) return prefix;
  const born = formatOsloDate(birthDate);
  if (!born) return prefix;
  const age = ageInYear(birthDate, ageYear);
  const agePart = age != null ? `, ${age} år` : "";
  return `${prefix}${agePart} (født ${born})`;
}

export default async function FamilyPage({
  params,
}: PageProps<"/[locale]/admin/familier/[id]">) {
  const { locale, id } = await params;
  const basePath = adminBasePath(locale);
  const [family, allFamilies] = await Promise.all([
    getAdminFamilyById(id),
    getAdminFamilies(),
  ]);
  if (!family) notFound();
  const duplicateFamilies = (findDuplicateFamilies(allFamilies).get(family.id) ?? []).map(
    (match) => ({
      id: match.familyId,
      name: match.displayName,
      href: `${basePath}/familier/${match.familyId}`,
      reasons: match.reasons,
    }),
  );
  const familyHref = `${basePath}/familier/${family.id}`;
  const editFamilyHref = `${familyHref}/rediger`;

  const supabase = await createClient();
  const studentIds = family.students.map((student) => student.id);
  const paymentIds = [
    ...new Set(
      family.applications
        .map((application) => application.paymentId)
        .filter((paymentId): paymentId is string => Boolean(paymentId)),
    ),
  ];
  const queryStudentIds = studentIds.length
    ? studentIds
    : ["00000000-0000-0000-0000-000000000000"];
  const queryPaymentIds = paymentIds.length
    ? paymentIds
    : ["00000000-0000-0000-0000-000000000000"];

  const [
    yearResult,
    enrollmentResult,
    balanceResult,
    feeResult,
    paymentResult,
    planResult,
    adjustmentResult,
    teacherResult,
    dismissalResult,
    lastParentChange,
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, label, fee, sem1_due_on, sem2_due_on")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select(
        "student_id, school_year_id, status, created_at, classes(name_no)",
      )
      .in("student_id", queryStudentIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("student_balances")
      .select("student_id, school_year_id, owed, paid, remaining, state")
      .in("student_id", queryStudentIds),
    supabase
      .from("student_fees")
      .select("student_id, school_year_id, amount, discount")
      .in("student_id", queryStudentIds),
    supabase
      .from("payments")
      .select("id, status, amount, net_paid_amount, created_at")
      .in("id", queryPaymentIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_plans")
      .select("id, school_year_id, plan_type, monthly_amount, custom_config, paused_at")
      .eq("family_id", id)
      .eq("status", "aktiv"),
    supabase
      .from("student_fee_adjustments")
      .select(
        "id, student_id, school_year_id, type, amount, note, guardians(first_name, last_name)",
      )
      .in("student_id", queryStudentIds)
      .is("revoked_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("guardians")
      .select("id, first_name, last_name, person_roles!inner(role_key)")
      .eq("person_roles.role_key", "teacher")
      .order("first_name", { ascending: true }),
    supabase
      .from("sibling_discount_dismissals")
      .select("school_year_id")
      .eq("family_id", id),
    getLastParentChange({ familyId: id }),
  ]);

  const activeYear = yearResult.data as {
    id: string;
    label: string;
    fee: number | null;
    sem1_due_on: string | null;
    sem2_due_on: string | null;
  } | null;
  const ageYear =
    schoolYearStart(activeYear?.label) ?? new Date().getFullYear();
  const enrollments = (enrollmentResult.data as EnrollmentRow[] | null) ?? [];
  const balances = (balanceResult.data as BalanceRow[] | null) ?? [];
  const familyStudentIds = new Set(
    family.students.map((student) => student.id),
  );
  const fees = (feeResult.data as FeeRow[] | null) ?? [];
  const payments = (paymentResult.data as PaymentRow[] | null) ?? [];
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  const activePlans =
    (planResult.data as
      | {
          id: string;
          school_year_id: string;
          plan_type: "full" | "semester" | "maanedlig" | "egendefinert";
          monthly_amount: number | null;
          custom_config: CustomPlanConfig | null;
          paused_at: string | null;
        }[]
      | null) ?? [];
  const adjustmentRows =
    (adjustmentResult.data as
      | {
          id: string;
          student_id: string;
          school_year_id: string;
          type: string;
          amount: number;
          note: string;
          guardians: {
            first_name: string | null;
            last_name: string | null;
          } | null;
        }[]
      | null) ?? [];
  const teacherOptions = (
    (teacherResult.data as
      | { id: string; first_name: string | null; last_name: string | null }[]
      | null) ?? []
  ).map((teacher) => ({
    id: teacher.id,
    name: fullName(teacher.first_name, teacher.last_name),
  }));
  const dismissedYearIds = new Set(
    (
      (dismissalResult.data as { school_year_id: string }[] | null) ?? []
    ).map((row) => row.school_year_id),
  );
  const applicationById = new Map(
    family.applications.map((application) => [application.id, application]),
  );
  const convertedApplications = new Set(
    family.students
      .map((student) => student.applicationId)
      .filter((applicationId): applicationId is string =>
        Boolean(applicationId),
      ),
  );

  const children: FamilyChildSummary[] = family.students.map((student) => {
    const application = student.applicationId
      ? applicationById.get(student.applicationId)
      : undefined;
    const activeEnrollment = enrollments.find(
      (enrollment) =>
        enrollment.student_id === student.id &&
        enrollment.status === "aktiv" &&
        (!activeYear || enrollment.school_year_id === activeYear.id),
    );
    const balance = balances.find(
      (row) =>
        row.student_id === student.id &&
        (!activeYear || row.school_year_id === activeYear.id),
    );
    const fee = fees.find(
      (row) =>
        row.student_id === student.id &&
        (!activeYear || row.school_year_id === activeYear.id),
    );
    const feeAmount = balance
      ? (balance.owed ?? 0)
      : fee
        ? Math.max(fee.amount - fee.discount, 0)
        : activeEnrollment && activeYear?.fee
        ? activeYear.fee * 100
        : null;

    return {
      id: student.id,
      name: fullName(student.firstName, student.lastName),
      description: birthDescription(student.birthDate, "Registrert elev", ageYear),
      href: `${basePath}/elever/${student.id}`,
      admission: application
        ? admissionFact(application.status)
        : { value: "Registrert", tone: "success" },
      placement: activeEnrollment
        ? {
            value: activeEnrollment.classes?.name_no ?? "Klasse uten navn",
            tone: "success",
          }
        : { value: "Mangler plass", tone: "warning" },
      enrollment: activeEnrollment
        ? { value: "Aktiv", tone: "success" }
        : { value: "Ikke aktiv", tone: "warning" },
      feeAmountOre: feeAmount,
      payment: balanceFact(balance),
    };
  });

  for (const application of family.applications) {
    if (convertedApplications.has(application.id)) continue;
    if (["avslatt", "arkivert"].includes(application.status)) continue;
    const payment = application.paymentId
      ? paymentById.get(application.paymentId)
      : undefined;
    const childName = fullName(application.firstName, application.lastName);
    children.push({
      id: `application-${application.id}`,
      name: childName,
      description: birthDescription(application.birthDate, "Innmelding", ageYear),
      href: `${basePath}/register?q=${encodeURIComponent(childName)}`,
      admission: admissionFact(application.status),
      placement: application.desiredClass
        ? {
            value: `Ønske: ${application.desiredClass}`,
            tone: "info",
          }
        : { value: "Ikke vurdert", tone: "warning" },
      enrollment: { value: "Venter", tone: "warning" },
      feeAmountOre: activeYear?.fee ? activeYear.fee * 100 : null,
      payment: paymentFact(payment),
    });
  }

  const recentActivity: FamilyActivity[] = [
    ...family.applications.map((application) => ({
      id: `application-${application.id}`,
      title: `${fullName(application.firstName, application.lastName)} ble meldt inn`,
      description: admissionFact(application.status).value,
      occurredAt: application.createdAt,
      kind: "admission" as const,
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: paymentFact(payment).value,
      description: formatNok(payment.amount),
      occurredAt: payment.created_at,
      kind: "payment" as const,
    })),
    ...(lastParentChange
      ? [
          {
            id: "parent-change",
            title: "Sist endret av forelder",
            description: [lastParentChange.summary, lastParentChange.actorEmail]
              .filter(Boolean)
              .join(" · "),
            occurredAt: lastParentChange.createdAt,
            kind: "guardian" as const,
          },
        ]
      : []),
    ...family.openReviews.map((review) => ({
      id: `review-${review.id}`,
      title: "Familiedata må gjennomgås",
      description: "Mulig duplikat eller motstridende opplysninger",
      occurredAt: review.createdAt,
      kind: "record" as const,
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
    .slice(0, 6);

  const missingPlacement = children.find(
    (child) => child.placement.tone === "warning",
  );
  const unpaid = children.find((child) => child.payment.tone === "danger");
  const newApplication = family.applications.find(
    (application) =>
      application.status === "ny" && !convertedApplications.has(application.id),
  );
  let nextAction: FamilyNextAction | undefined;

  if (family.openReviews.length > 0) {
    nextAction = {
      title: "Kontroller familierelasjonene",
      description: `${family.openReviews.length} datakontroll må avklares før familien kan brukes videre uten forbehold.`,
      href: editFamilyHref,
      label: "Se opplysningene",
      tone: "danger",
    };
  } else if (duplicateFamilies.length > 0) {
    nextAction = {
      title: "Kontroller mulig duplikat",
      description: `${duplicateFamilies[0].name} har ${duplicateFamilies[0].reasons.join(", ").toLocaleLowerCase("nb-NO")}.`,
      href: duplicateFamilies[0].href,
      label: "Sammenlign familiene",
      tone: "danger",
    };
  } else if (newApplication) {
    const name = fullName(newApplication.firstName, newApplication.lastName);
    nextAction = {
      title: "Behandle ny innmelding",
      description: `${name} venter på opptaksvurdering.`,
      href: `${basePath}/register?q=${encodeURIComponent(name)}`,
      label: "Åpne opptak",
      tone: "warning",
    };
  } else if (missingPlacement) {
    nextAction = {
      title: "Avklar plassering",
      description: `${missingPlacement.name} mangler aktiv klasseplassering.`,
      href: missingPlacement.href,
      label: "Åpne barnet",
      tone: "warning",
    };
  } else if (unpaid) {
    nextAction = {
      title: "Følg opp betaling",
      description: `${unpaid.name} har et utestående beløp.`,
      href: unpaid.href,
      label: "Se betaling",
      tone: "danger",
    };
  }

  const guardians = family.guardians.map((guardian) => ({
    id: guardian.id,
    name: fullName(guardian.firstName, guardian.lastName),
    role: relationshipLabel(guardian.relationshipLabel),
    isPrimary: guardian.isPrimaryContact,
    phone: guardian.phone ?? undefined,
    email: guardian.email ?? undefined,
    isTeacher: guardian.isTeacher,
  }));
  const primaryGuardian =
    family.guardians.find((guardian) => guardian.isPrimaryContact) ??
    family.guardians[0];
  const totalFeeOre = children.some((child) => child.feeAmountOre != null)
    ? children.reduce((sum, child) => sum + (child.feeAmountOre ?? 0), 0)
    : null;
  const allocations = children
    .filter(
      (child): child is FamilyChildSummary & { feeAmountOre: number } =>
        child.feeAmountOre != null,
    )
    .map((child) => ({
      childId: child.id,
      childName: child.name,
      amountOre: child.feeAmountOre,
    }));
  const activePlan = activeYear
    ? (activePlans.find((plan) => plan.school_year_id === activeYear.id) ??
      null)
    : null;

  const studentNameById = new Map(
    family.students.map((student) => [
      student.id,
      fullName(student.firstName, student.lastName),
    ]),
  );

  const installmentRows = activePlan
    ? ((
        await supabase
          .from("installments")
          .select("id, student_id, due_date, amount, status")
          .eq("plan_id", activePlan.id)
          .order("due_date", { ascending: true })
      ).data ?? [])
    : [];

  const yearAdjustments = activeYear
    ? adjustmentRows.filter(
        (adjustment) => adjustment.school_year_id === activeYear.id,
      )
    : [];

  const enrolledStudentIds = activeYear
    ? new Set(
        enrollments
          .filter(
            (enrollment) =>
              enrollment.status === "aktiv" &&
              enrollment.school_year_id === activeYear.id,
          )
          .map((enrollment) => enrollment.student_id),
      )
    : new Set<string>();

  const siblingSuggestion = Boolean(
    activeYear &&
      enrolledStudentIds.size >= 3 &&
      !yearAdjustments.some(
        (adjustment) => adjustment.type === "soskenrabatt",
      ) &&
      !dismissedYearIds.has(activeYear.id),
  );

  return (
    <div className="grid gap-5">
      <FamilyWorkbench
      family={{
        id: family.id,
        name: family.displayName,
        status:
          family.openReviews.length > 0 || duplicateFamilies.length > 0
            ? { value: "Må gjennomgås", tone: "danger" }
            : nextAction
              ? { value: "Krever oppfølging", tone: "warning" }
              : { value: "I orden", tone: "success" },
        updatedAt: family.updatedAt,
        address: [family.address, family.postalCode, family.city]
          .filter(Boolean)
          .join(", "),
        phone: primaryGuardian?.phone ?? undefined,
        email: primaryGuardian?.email ?? undefined,
        guardians,
        children,
        schoolYearLabel: activeYear?.label,
        totalFeeOre,
        allocations,
        relationshipNote:
          family.openReviews.length > 0
            ? "Opplysninger fra tidligere registreringer kan tilhøre samme familie. Kontroller før du slår sammen eller endrer relasjoner."
            : undefined,
      }}
      tabs={[]}
      activeTab="overview"
      editFamilyHref={editFamilyHref}
      addGuardianHref={`${editFamilyHref}#new-guardian`}
      addChildHref={`${basePath}/elever/ny?familie=${family.id}`}
      editRelationshipsHref={editFamilyHref}
      nextAction={nextAction}
      recentActivity={recentActivity}
      duplicateFamilies={duplicateFamilies}
      mergeOptions={familyOptions(allFamilies, family.id)}
      />
      {activeYear ? (
        <FamilyEconomy
          familyId={family.id}
          familyName={family.displayName}
          schoolYearId={activeYear.id}
          schoolYearLabel={activeYear.label}
          sem1DueOn={activeYear.sem1_due_on}
          sem2DueOn={activeYear.sem2_due_on}
          childBalances={balances
            .filter(
              (row) =>
                row.student_id &&
                row.school_year_id === activeYear.id &&
                familyStudentIds.has(row.student_id),
            )
            .map((row) => ({
              id: row.student_id as string,
              owedOre: row.owed ?? 0,
              paidOre: row.paid ?? 0,
              remainingOre: row.remaining ?? 0,
            }))}
          plan={
            activePlan
              ? {
                  id: activePlan.id,
                  planType: activePlan.plan_type,
                  monthlyAmount: activePlan.monthly_amount,
                  customConfig: activePlan.custom_config,
                  pausedAt: activePlan.paused_at,
                }
              : null
          }
          installments={(installmentRows as {
            id: string;
            student_id: string;
            due_date: string;
            amount: number;
            status: string;
          }[]).map((installment) => ({
            id: installment.id,
            studentName:
              studentNameById.get(installment.student_id) ?? "Ukjent barn",
            dueDate: installment.due_date,
            amount: installment.amount,
            status: installment.status,
          }))}
          childrenOptions={family.students.map((student) => ({
            id: student.id,
            name: fullName(student.firstName, student.lastName),
          }))}
          siblingSuggestion={siblingSuggestion}
          adjustments={yearAdjustments.map((adjustment) => ({
            id: adjustment.id,
            studentName:
              studentNameById.get(adjustment.student_id) ?? "Ukjent barn",
            type: adjustment.type,
            amount: adjustment.amount,
            note: adjustment.note,
            teacherName: adjustment.guardians
              ? fullName(
                  adjustment.guardians.first_name,
                  adjustment.guardians.last_name,
                )
              : null,
          }))}
          teachers={teacherOptions}
        />
      ) : null}
    </div>
  );
}

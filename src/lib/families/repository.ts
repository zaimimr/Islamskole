import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { familyDisplayName } from "@/lib/families/naming";
import type { Json, Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type FamilyRow = Omit<
  Database["public"]["Tables"]["families"]["Row"],
  "preferred_language"
>;
type GuardianRow = Database["public"]["Tables"]["guardians"]["Row"];

type FamilyGuardianQueryRow = {
  guardian_id: string;
  is_billing_contact: boolean;
  is_primary_contact: boolean;
  receives_communication: boolean;
  relationship_label: string;
  sort_order: number;
  guardian: Pick<
    GuardianRow,
    "id" | "first_name" | "last_name" | "email" | "phone"
  > & { person_roles: { role_key: string }[] };
};

type FamilyGuardianListQueryRow = FamilyGuardianQueryRow & {
  family_id: string;
};

export type FamilyGuardian = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  isTeacher: boolean;
  relationshipLabel: string;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
  receivesCommunication: boolean;
  sortOrder: number;
};

export type FamilyStudent = {
  id: string;
  applicationId: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
};

export type FamilyApplication = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  desiredClass: string | null;
  birthDate: string | null;
  paymentId: string | null;
  status: string;
  createdAt: string;
};

export type FamilyDataReview = {
  id: string;
  category: string;
  details: Json;
  status: string;
  createdAt: string;
};

export type FamilyDetails = {
  id: string;
  displayName: string;
  displayNameOverride: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  origin: string;
  guardians: FamilyGuardian[];
  students: FamilyStudent[];
  applications: FamilyApplication[];
  openReviews: FamilyDataReview[];
  createdAt: string;
  updatedAt: string;
};

function ensureSuccess(
  operation: string,
  error: { message: string } | null,
): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function mapGuardian(row: FamilyGuardianQueryRow): FamilyGuardian {
  return {
    id: row.guardian.id,
    firstName: row.guardian.first_name,
    lastName: row.guardian.last_name,
    email: row.guardian.email,
    phone: row.guardian.phone,
    isTeacher: row.guardian.person_roles.some((role) => role.role_key === "teacher"),
    relationshipLabel: row.relationship_label,
    isPrimaryContact: row.is_primary_contact,
    isBillingContact: row.is_billing_contact,
    receivesCommunication: row.receives_communication,
    sortOrder: row.sort_order,
  };
}

function assembleFamily(
  family: FamilyRow,
  guardians: FamilyGuardian[],
  students: FamilyStudent[],
  applications: FamilyApplication[],
  openReviews: FamilyDataReview[],
): FamilyDetails {
  return {
    id: family.id,
    displayName: familyDisplayName({
      familyId: family.id,
      displayName: family.display_name,
      guardians,
      students,
    }),
    displayNameOverride: family.display_name,
    address: family.address,
    postalCode: family.postal_code,
    city: family.city,
    origin: family.origin,
    guardians,
    students,
    applications,
    openReviews,
    createdAt: family.created_at,
    updatedAt: family.updated_at,
  };
}

export function createFamilyRepository(client: Client) {
  async function findAll(): Promise<FamilyDetails[]> {
    const familyResult = await client
      .from("families")
      .select(
        "id, display_name, address, postal_code, city, origin, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .order("id");

    ensureSuccess("Could not load families", familyResult.error);
    const families = familyResult.data ?? [];
    if (families.length === 0) return [];

    const familyIds = families.map((family) => family.id);
    const [guardianResult, studentResult, applicationResult, reviewResult] =
      await Promise.all([
        client
          .from("family_guardians")
          .select(
            "family_id, guardian_id, relationship_label, is_primary_contact, is_billing_contact, receives_communication, sort_order, guardian:guardians(id, first_name, last_name, email, phone, person_roles(role_key))",
          )
          .in("family_id", familyIds)
          .order("sort_order")
          .order("guardian_id"),
        client
          .from("students")
          .select(
            "id, family_id, application_id, child_first_name, child_last_name, child_birth_date",
          )
          .in("family_id", familyIds)
          .order("child_last_name")
          .order("child_first_name")
          .order("id"),
        client
          .from("student_applications")
          .select(
            "id, family_id, child_first_name, child_last_name, child_birth_date, desired_class, payment_id, status, created_at",
          )
          .in("family_id", familyIds)
          .order("created_at")
          .order("id"),
        client
          .from("family_data_reviews")
          .select("id, family_id, category, details, status, created_at")
          .in("family_id", familyIds)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .order("id"),
      ]);

    ensureSuccess("Could not load family guardians", guardianResult.error);
    ensureSuccess("Could not load family students", studentResult.error);
    ensureSuccess(
      "Could not load family applications",
      applicationResult.error,
    );
    ensureSuccess("Could not load family reviews", reviewResult.error);

    const guardiansByFamily = new Map<string, FamilyGuardian[]>();
    for (const row of (guardianResult.data ??
      []) as FamilyGuardianListQueryRow[]) {
      const guardians = guardiansByFamily.get(row.family_id) ?? [];
      guardians.push(mapGuardian(row));
      guardiansByFamily.set(row.family_id, guardians);
    }

    const studentsByFamily = new Map<string, FamilyStudent[]>();
    for (const student of studentResult.data ?? []) {
      if (!student.family_id) continue;
      const students = studentsByFamily.get(student.family_id) ?? [];
      students.push({
        id: student.id,
        applicationId: student.application_id,
        firstName: student.child_first_name,
        lastName: student.child_last_name,
        birthDate: student.child_birth_date,
      });
      studentsByFamily.set(student.family_id, students);
    }

    const applicationsByFamily = new Map<string, FamilyApplication[]>();
    for (const application of applicationResult.data ?? []) {
      if (!application.family_id) continue;
      const applications =
        applicationsByFamily.get(application.family_id) ?? [];
      applications.push({
        id: application.id,
        firstName: application.child_first_name,
        lastName: application.child_last_name,
        desiredClass: application.desired_class,
        birthDate: application.child_birth_date,
        paymentId: application.payment_id,
        status: application.status,
        createdAt: application.created_at,
      });
      applicationsByFamily.set(application.family_id, applications);
    }

    const reviewsByFamily = new Map<string, FamilyDataReview[]>();
    for (const review of reviewResult.data ?? []) {
      const reviews = reviewsByFamily.get(review.family_id) ?? [];
      reviews.push({
        id: review.id,
        category: review.category,
        details: review.details,
        status: review.status,
        createdAt: review.created_at,
      });
      reviewsByFamily.set(review.family_id, reviews);
    }

    return families.map((family) =>
      assembleFamily(
        family,
        guardiansByFamily.get(family.id) ?? [],
        studentsByFamily.get(family.id) ?? [],
        applicationsByFamily.get(family.id) ?? [],
        reviewsByFamily.get(family.id) ?? [],
      ),
    );
  }

  async function findById(familyId: string): Promise<FamilyDetails | null> {
    const familyResult = await client
      .from("families")
      .select(
        "id, display_name, address, postal_code, city, origin, created_at, updated_at",
      )
      .eq("id", familyId)
      .maybeSingle();

    ensureSuccess("Could not load family", familyResult.error);
    if (!familyResult.data) return null;

    const [guardianResult, studentResult, applicationResult, reviewResult] =
      await Promise.all([
        client
          .from("family_guardians")
          .select(
            "guardian_id, relationship_label, is_primary_contact, is_billing_contact, receives_communication, sort_order, guardian:guardians(id, first_name, last_name, email, phone, person_roles(role_key))",
          )
          .eq("family_id", familyId)
          .order("sort_order")
          .order("guardian_id"),
        client
          .from("students")
          .select(
            "id, application_id, child_first_name, child_last_name, child_birth_date",
          )
          .eq("family_id", familyId)
          .order("child_last_name")
          .order("child_first_name")
          .order("id"),
        client
          .from("student_applications")
          .select(
            "id, child_first_name, child_last_name, child_birth_date, desired_class, payment_id, status, created_at",
          )
          .eq("family_id", familyId)
          .order("created_at")
          .order("id"),
        client
          .from("family_data_reviews")
          .select("id, category, details, status, created_at")
          .eq("family_id", familyId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .order("id"),
      ]);

    ensureSuccess("Could not load family guardians", guardianResult.error);
    ensureSuccess("Could not load family students", studentResult.error);
    ensureSuccess(
      "Could not load family applications",
      applicationResult.error,
    );
    ensureSuccess("Could not load family reviews", reviewResult.error);

    const guardians = (
      (guardianResult.data ?? []) as FamilyGuardianQueryRow[]
    ).map(mapGuardian);
    const students = (studentResult.data ?? []).map((student) => ({
      id: student.id,
      applicationId: student.application_id,
      firstName: student.child_first_name,
      lastName: student.child_last_name,
      birthDate: student.child_birth_date,
    }));
    const applications = (applicationResult.data ?? []).map((application) => ({
      id: application.id,
      firstName: application.child_first_name,
      lastName: application.child_last_name,
      desiredClass: application.desired_class,
      birthDate: application.child_birth_date,
      paymentId: application.payment_id,
      status: application.status,
      createdAt: application.created_at,
    }));
    const openReviews = (reviewResult.data ?? []).map((review) => ({
      id: review.id,
      category: review.category,
      details: review.details,
      status: review.status,
      createdAt: review.created_at,
    }));

    return assembleFamily(
      familyResult.data,
      guardians,
      students,
      applications,
      openReviews,
    );
  }

  async function findForStudent(
    studentId: string,
  ): Promise<FamilyDetails | null> {
    const result = await client
      .from("students")
      .select("family_id")
      .eq("id", studentId)
      .maybeSingle();

    ensureSuccess("Could not resolve student family", result.error);
    return result.data?.family_id ? findById(result.data.family_id) : null;
  }

  async function findForApplication(
    applicationId: string,
  ): Promise<FamilyDetails | null> {
    const result = await client
      .from("student_applications")
      .select("family_id")
      .eq("id", applicationId)
      .maybeSingle();

    ensureSuccess("Could not resolve application family", result.error);
    return result.data?.family_id ? findById(result.data.family_id) : null;
  }

  return { findAll, findById, findForStudent, findForApplication };
}

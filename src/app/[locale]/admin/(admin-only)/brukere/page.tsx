import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIsAdmin, getIsDeveloper, getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminBasePath } from "@/components/admin/paths";
import { LoadError } from "@/components/admin/load-error";
import { GrantAdminForm } from "./grant-admin-form";
import { UserList, type AdminUser } from "./user-list";

export const metadata: Metadata = { title: "Brukere og tilganger" };

async function listAllUsers() {
  const admin = createAdminClient();
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function getUsers(): Promise<
  { ok: true; users: AdminUser[] } | { ok: false }
> {
  try {
    const admin = createAdminClient();
    const [users, profiles, guardians, students] = await Promise.all([
      listAllUsers(),
      admin.from("profiles").select("id, full_name, role"),
      admin
        .from("guardians")
        .select("email, family_guardians(family_id), person_roles(role_key, suspended_at)")
        .not("email", "is", null),
      admin.from("students").select("child_email").not("child_email", "is", null),
    ]);
    if (profiles.error || guardians.error || students.error) return { ok: false };

    const profileMap = new Map(profiles.data.map((p) => [p.id, p]));
    const rolesByEmail = new Map<string, Set<string>>();
    const guardianEmails = new Set<string>();
    for (const guardian of guardians.data) {
      const email = (guardian.email ?? "").trim().toLowerCase();
      const roles = rolesByEmail.get(email) ?? new Set<string>();
      for (const role of guardian.person_roles) {
        if (!role.suspended_at) roles.add(role.role_key);
      }
      rolesByEmail.set(email, roles);
      if (guardian.family_guardians.length > 0) guardianEmails.add(email);
    }
    const studentEmails = new Set(
      students.data.map((student) => (student.child_email ?? "").trim().toLowerCase()),
    );

    return {
      ok: true,
      users: users
        .map((user) => {
          const profile = profileMap.get(user.id);
          const email = (user.email ?? "").toLowerCase();
          return {
            id: user.id,
            email: user.email ?? "-",
            fullName:
              profile?.full_name ||
              (user.user_metadata?.full_name as string | undefined) ||
              null,
            roles: [...(rolesByEmail.get(email) ?? [])],
            isDeveloper: profile?.role === "developer",
            isGuardian: guardianEmails.has(email),
            isStudent: studentEmails.has(email),
            lastSignInAt: user.last_sign_in_at ?? null,
          };
        })
        .sort(
          (a, b) =>
            Number(b.isDeveloper || b.roles.includes("admin")) -
              Number(a.isDeveloper || a.roles.includes("admin")) ||
            (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, "nb"),
        ),
    };
  } catch {
    return { ok: false };
  }
}

export default async function BrukerePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/brukere">) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!(await getIsAdmin())) notFound();

  const [result, currentUser, canImpersonate] = await Promise.all([getUsers(), getUser(), getIsDeveloper()]);
  if (!result.ok) {
    return (
      <LoadError
        title="Brukerne kunne ikke lastes"
        retryHref={`${adminBasePath(locale)}/brukere`}
      />
    );
  }
  return (
    <div className="grid gap-5 sm:gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-balance font-heading text-[2rem] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Brukere og tilganger
          </h1>
        </div>
      </header>

      <GrantAdminForm />

      <UserList
        allUsers={result.users}
        currentId={currentUser?.id ?? null}
        canImpersonate={canImpersonate}
        initialRole={typeof sp.rolle === "string" ? sp.rolle : ""}
        initialQuery={typeof sp.q === "string" ? sp.q : ""}
        initialPage={Math.max(1, Number(sp.page) || 1)}
      />
    </div>
  );
}

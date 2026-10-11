import { expect, test, type Page } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  confirmIfAsked,
  db,
  ensureAuthUser,
  findAuthUser,
  loginAs,
  pickOption,
  rowAction,
  rowWith,
  seedAdmin,
  seedClass,
  seedFamily,
  seedTeacher,
  toast,
  uid,
  waitForLoginLink,
  zzEmail,
} from "./fixtures";

async function guardiansWithEmail(email: string) {
  const { data, error } = await db()
    .from("guardians")
    .select("id, first_name, last_name, email, phone, teacher_note, is_teacher")
    .ilike("email", email);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    teacher_note: string | null;
    is_teacher: boolean;
  }[];
}

async function classTeacherCount(guardianId: string) {
  const { count, error } = await db()
    .from("class_teachers")
    .select("class_id", { count: "exact", head: true })
    .eq("guardian_id", guardianId);
  if (error) throw error;
  return count ?? 0;
}

async function openAddTeacher(page: Page) {
  await page.goto("/admin/laerere");
  await page.getByRole("button", { name: "Legg til lærer" }).click();
  return page.getByRole("dialog");
}

async function fillTeacher(
  dialog: ReturnType<Page["getByRole"]>,
  values: { first: string; last: string; email: string; phone: string },
) {
  await dialog.getByLabel("Fornavn").fill(values.first);
  await dialog.getByLabel("Etternavn").fill(values.last);
  await dialog.getByLabel("E-post").fill(values.email);
  await dialog.getByLabel("Telefon").fill(values.phone);
}

test.describe("/admin/laerere", () => {
  test.beforeEach(async ({ context }) => {
    const admin = await seedAdmin();
    await loginAs(context, admin.email);
  });

  test("TCH-01 Legg til lærer creates a new teacher and sends an invite", async ({ page }) => {
    const email = zzEmail("ny-laerer");
    const dialog = await openAddTeacher(page);
    await fillTeacher(dialog, { first: `ZZTEST Ny ${uid()}`, last: "ZZTEST", email, phone: "91234567" });
    await expect(dialog.getByRole("checkbox", { name: "Send innloggingslenke nå" })).toBeChecked();
    const since = Date.now();
    await dialog.getByRole("button", { name: "Registrer lærer" }).click();
    await expect.poll(async () => (await guardiansWithEmail(email)).map((row) => row.is_teacher)).toEqual([true]);
    await waitForLoginLink(email, since);
  });

  test("TCH-02 Legg til lærer with an existing guardian email links instead of duplicating", async ({ page }) => {
    const family = await seedFamily();
    const guardian = family.guardians[0];
    const dialog = await openAddTeacher(page);
    await fillTeacher(dialog, {
      first: guardian.firstName,
      last: guardian.lastName,
      email: guardian.email.toUpperCase(),
      phone: guardian.phone,
    });
    await dialog.getByRole("button", { name: "Registrer lærer" }).click();
    await expect(toast(page, guardian.firstName)).toBeVisible();
    await expect.poll(async () => (await guardiansWithEmail(guardian.email)).map((row) => row.id)).toEqual([guardian.id]);
    expect((await guardiansWithEmail(guardian.email))[0].is_teacher).toBe(true);
  });

  test("TCH-02 Legg til lærer refuses when two guardians share the email", async ({ page }) => {
    const email = zzEmail("delt");
    await seedFamily({ guardians: [{ email }] });
    await seedFamily({ guardians: [{ email }] });
    const dialog = await openAddTeacher(page);
    await fillTeacher(dialog, { first: "ZZTEST Delt", last: "ZZTEST", email, phone: "91234568" });
    await dialog.getByRole("button", { name: "Registrer lærer" }).click();
    await expect(toast(page, /familie/i)).toBeVisible();
    const rows = await guardiansWithEmail(email);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.is_teacher)).toBe(true);
  });

  test("TCH-14 Rediger changes name, email and phone and moves the login email", async ({ page }) => {
    const teacher = await seedTeacher();
    const login = await ensureAuthUser(teacher.email);
    const newEmail = zzEmail("endret");
    const newFirst = `ZZTEST Endret ${uid()}`;
    await page.goto("/admin/laerere");
    await rowAction(page, rowWith(page, teacher.email), "Rediger");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Fornavn").fill(newFirst);
    await dialog.getByLabel("E-post").fill(newEmail);
    await dialog.getByLabel("Telefon").fill("98765432");
    await expect(dialog.getByLabel("Notat")).toBeVisible();
    await dialog.getByRole("button", { name: /^Lagre/ }).click();
    await expect
      .poll(async () => {
        const { data } = await db().from("guardians").select("first_name, email, phone").eq("id", teacher.id).single();
        return data;
      })
      .toEqual({ first_name: newFirst, email: newEmail, phone: "98765432" });
    await expect.poll(async () => (await findAuthUser(newEmail))?.id ?? null).toBe(login.id);
  });

  test("TCH-15 Send innloggingslenke from the row menu", async ({ page }) => {
    const teacher = await seedTeacher();
    await page.goto("/admin/laerere");
    const since = Date.now();
    await rowAction(page, rowWith(page, teacher.email), "Send innloggingslenke");
    await waitForLoginLink(teacher.email, since);
  });

  test("TCH-03 Fjern som lærer removes class links and the class page stops listing them", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const teacher = await seedTeacher();
    await assignTeacher(teacher.id, schoolClass.id, year.id);

    await page.goto(`/admin/klasser/${schoolClass.id}?fane=undervisning`);
    await expect(page.locator("main").getByText(teacher.firstName).first()).toBeVisible();

    await page.goto("/admin/laerere");
    await rowAction(page, rowWith(page, teacher.email), "Fjern som lærer");
    await confirmIfAsked(page, /^Fjern/);
    await expect
      .poll(async () => (await guardiansWithEmail(teacher.email))[0]?.is_teacher)
      .toBe(false);
    await expect.poll(() => classTeacherCount(teacher.id)).toBe(0);

    await page.goto(`/admin/klasser/${schoolClass.id}?fane=undervisning`);
    await expect(page.locator("main").getByText(teacher.firstName)).toHaveCount(0);
  });

  test("TCH-04 adding a removed teacher again does not bring old class links back", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const teacher = await seedTeacher();
    await assignTeacher(teacher.id, schoolClass.id, year.id);

    await page.goto("/admin/laerere");
    await rowAction(page, rowWith(page, teacher.email), "Fjern som lærer");
    await confirmIfAsked(page, /^Fjern/);
    await expect.poll(async () => (await guardiansWithEmail(teacher.email))[0]?.is_teacher).toBe(false);

    const dialog = await openAddTeacher(page);
    await fillTeacher(dialog, { first: teacher.firstName, last: teacher.lastName, email: teacher.email, phone: teacher.phone });
    await dialog.getByRole("button", { name: "Registrer lærer" }).click();
    await expect.poll(async () => (await guardiansWithEmail(teacher.email)).map((row) => row.is_teacher)).toEqual([true]);
    expect(await classTeacherCount(teacher.id)).toBe(0);

    await page.goto(`/admin/klasser/${schoolClass.id}?fane=undervisning`);
    await expect(page.locator("main").getByText(teacher.firstName)).toHaveCount(0);
  });

  test("TCH-01 registering from an application marks the application handled", async ({ page }) => {
    const email = zzEmail("soker");
    const fullName = `ZZTEST Søker ${uid()}`;
    const { data, error } = await db()
      .from("teacher_applications")
      .insert({ full_name: fullName, email, phone: "91112222", status: "ny" })
      .select("id")
      .single();
    if (error) throw error;
    const applicationId = (data as { id: string }).id;

    await page.goto("/admin/laerere?tab=soknader");
    await rowWith(page, email).getByRole("button", { name: "Registrer som lærer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Registrer lærer" }).click();
    await expect.poll(async () => (await guardiansWithEmail(email)).map((row) => row.is_teacher)).toEqual([true]);
    await expect
      .poll(async () => {
        const { data: row } = await db().from("teacher_applications").select("status").eq("id", applicationId).single();
        return (row as { status: string } | null)?.status;
      })
      .not.toBe("ny");
  });

  test("archived applications are hidden by default and remain searchable", async ({ page }) => {
    const suffix = uid();
    const activeEmail = zzEmail("active-application");
    const archivedEmail = zzEmail("archived-application");
    const { error } = await db().from("teacher_applications").insert([
      { full_name: `ZZTEST Aktiv ${suffix}`, email: activeEmail, status: "ny" },
      { full_name: `ZZTEST Arkivert ${suffix}`, email: archivedEmail, status: "arkivert" },
    ]);
    if (error) throw error;

    await page.goto(`/admin/laerere?tab=soknader&q=${suffix}`);
    await expect(rowWith(page, activeEmail)).toBeVisible();
    await expect(rowWith(page, archivedEmail)).toHaveCount(0);
    await pickOption(page, page.getByRole("search"), "Vis status", "Arkivert");
    await page.getByRole("button", { name: "Finn", exact: true }).click();
    await expect(rowWith(page, archivedEmail)).toBeVisible();
    await expect(rowWith(page, activeEmail)).toHaveCount(0);
    await page.screenshot({ path: "test-results/teacher-applications-archive.png", fullPage: true });

    await pickOption(page, page.getByRole("search"), "Vis status", "Alle statuser");
    await page.getByRole("button", { name: "Finn", exact: true }).click();
    await expect(rowWith(page, activeEmail)).toBeVisible();
    await expect(rowWith(page, archivedEmail)).toBeVisible();
    await page.getByRole("link", { name: "Nullstill", exact: true }).click();
    await expect(rowWith(page, archivedEmail)).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Vis status" })).toContainText("Aktive søknader");
    await page.screenshot({ path: "test-results/teacher-applications-active.png", fullPage: true });
    await pickOption(page, rowWith(page, activeEmail), "Søknadsstatus", "Arkivert");
    await expect(rowWith(page, activeEmail)).toHaveCount(0);
    await page.goto(`/admin/laerere?tab=soknader&q=${suffix}&status=arkivert`);
    await expect(rowWith(page, activeEmail)).toBeVisible();
    await pickOption(page, rowWith(page, activeEmail), "Søknadsstatus", "Ny");
    await expect(rowWith(page, activeEmail)).toHaveCount(0);
    await page.goto(`/admin/laerere?tab=soknader&q=${suffix}`);
    await expect(rowWith(page, activeEmail)).toBeVisible();
  });
});

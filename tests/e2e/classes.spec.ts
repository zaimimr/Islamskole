import { expect, test } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  db,
  loginAs,
  seedAdmin,
  seedClass,
  seedSchoolYear,
  seedTeacher,
  setActiveYear,
  toast,
  uid,
} from "./fixtures";

async function copyableAssignments(yearId: string) {
  const { data, error } = await db()
    .from("class_teachers")
    .select("class_id, guardians!inner(person_roles!inner(role_key))")
    .eq("school_year_id", yearId)
    .eq("guardians.person_roles.role_key", "teacher");
  if (error) throw error;
  return data?.length ?? 0;
}

test.describe("classes and school years", () => {
  test.beforeEach(async ({ context }) => {
    const admin = await seedAdmin();
    await loginAs(context, admin.email);
  });

  test("CLS-01 class saves without an English name", async ({ page }) => {
    const suffix = uid();
    const name = `ZZTEST Ny klasse ${suffix}`;
    await page.goto("/admin/klasser/ny");
    await page.locator("#name_no").fill(name);
    await page.locator("#name_en").fill("");
    await page.locator("#slug").fill(`zztest-ny-${suffix}`);
    await page.getByRole("button", { name: "Opprett klasse" }).click();
    await expect(toast(page, "Klasse opprettet")).toBeVisible();
    const { data } = await db().from("classes").select("name_no, name_en").eq("name_no", name).single();
    expect(data).toEqual({ name_no: name, name_en: name });
  });

  test("CLS-17 CLS-18 activating a school year confirms copied teacher assignments and teachers keep Min klasse", async ({
    page,
    browser,
  }) => {
    const current = await activeYear();
    const schoolClass = await seedClass();
    const teacher = await seedTeacher();
    await assignTeacher(teacher.id, schoolClass.id, current.id);
    const next = await seedSchoolYear({ startsOn: "2031-08-01", endsOn: "2032-06-30" });

    try {
      const expected = await copyableAssignments(current.id);
      await page.goto(`/admin/skolear/${next.id}`);
      await page.locator("summary").filter({ hasText: "Innstillinger for skoleåret" }).click();
      await page
        .getByText("Aktivt skoleår", { exact: true })
        .locator("xpath=ancestor::div[.//*[@role='switch']][1]")
        .getByRole("switch")
        .click();
      await page.getByRole("button", { name: "Lagre endringer" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(new RegExp(`\\b${expected} lærertildeling`));
      await confirm.getByRole("button", { name: /^Aktiver/ }).click();

      await expect
        .poll(async () => {
          const { data } = await db().from("school_years").select("is_active").eq("id", next.id).single();
          return (data as { is_active: boolean } | null)?.is_active;
        })
        .toBe(true);
      const { data: copied } = await db()
        .from("class_teachers")
        .select("class_id")
        .eq("guardian_id", teacher.id)
        .eq("school_year_id", next.id);
      expect(copied).toEqual([{ class_id: schoolClass.id }]);

      const teacherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      await loginAs(teacherContext, teacher.email);
      const teacherPage = await teacherContext.newPage();
      await teacherPage.goto("/min-side");
      await expect(teacherPage.getByRole("heading", { name: "Min klasse" })).toBeVisible();
      await expect(teacherPage.getByText(schoolClass.name).first()).toBeVisible();
      await teacherContext.close();
    } finally {
      await setActiveYear(current.id);
    }
  });

  test("CLS-26 admin can open the class portal for any class", async ({ page }) => {
    const schoolClass = await seedClass();
    const response = await page.goto(`/min-side/klasse/${schoolClass.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: schoolClass.name }).first()).toBeVisible();
  });
});

import { expect, test } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  db,
  enroll,
  loginAs,
  pickOption,
  rowWith,
  seedAdmin,
  seedClass,
  seedFamily,
  seedTeacher,
  toast,
} from "./fixtures";

function osloDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(date);
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

async function seedFutureDay(yearId: string) {
  const date = osloDate(6);
  const { data, error } = await db()
    .from("school_days")
    .upsert({ school_year_id: yearId, date, cancelled: false, note: "ZZTEST" }, { onConflict: "school_year_id,date" })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, date };
}

async function absenceOf(guardianId: string, schoolDayId: string) {
  const { data, error } = await db()
    .from("teacher_absences")
    .select("notified, source, reason")
    .eq("guardian_id", guardianId)
    .eq("school_day_id", schoolDayId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

test.describe("teacher absence", () => {
  test("teacher reports absence, admin sees Mangler vikar and tracks notice", async ({ page, context }) => {
    const year = await activeYear();
    const day = await seedFutureDay(year.id);
    const schoolClass = await seedClass();
    const family = await seedFamily();
    await enroll(family.students[0].id, schoolClass.id, year.id);
    const teacher = await seedTeacher();
    const other = await seedTeacher();
    await assignTeacher(teacher.id, schoolClass.id, year.id);

    await loginAs(context, teacher.email);
    await page.goto("/min-side");
    await page.getByRole("button", { name: "Meld fravær" }).click();
    const dialog = page.getByRole("dialog", { name: "Jeg kan ikke komme" });
    await dialog.getByRole("radio", { name: dayLabel(day.date) }).check();
    await dialog.getByLabel("Grunn (valgfritt)").fill("Syk");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(toast(page, "Fraværet er meldt")).toBeVisible();
    await expect.poll(() => absenceOf(teacher.id, day.id)).toEqual({ notified: true, source: "laerer", reason: "Syk" });
    await expect(page.getByRole("region", { name: "Mitt fravær" })).toContainText("Syk");

    const admin = await seedAdmin();
    await loginAs(context, admin.email);
    await page.goto(`/admin/dagsplan?dag=${day.id}`);
    const away = page.getByRole("region", { name: /Lærere borte/ });
    const row = away.locator("li").filter({ hasText: teacher.name });
    await expect(row).toContainText("Varslet");
    await expect(row).toContainText("Meldt av læreren · Syk");
    await expect(row).toContainText("mangler vikar");
    await expect(page.getByText("Mangler vikar").first()).toBeVisible();

    await row.getByRole("button", { name: `Handlinger for ${teacher.name}` }).click();
    await page.getByRole("menuitem", { name: "Merk som ikke varslet" }).click();
    await expect.poll(async () => (await absenceOf(teacher.id, day.id))?.notified).toBe(false);

    await away.getByRole("button", { name: "Registrer fravær" }).click();
    const register = page.getByRole("dialog", { name: "Lærer borte" });
    await pickOption(page, register, "Lærer", other.name);
    await register.getByRole("radio", { name: "Ikke varslet" }).check();
    await register.getByRole("button", { name: "Lagre" }).click();
    await expect(away.locator("li").filter({ hasText: other.name })).toContainText("Ikke varslet");
    await expect.poll(() => absenceOf(other.id, day.id)).toEqual({ notified: false, source: "admin", reason: null });

    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Mangler vikar/ })).toBeVisible();

    await page.goto("/admin/laerere");
    await expect(rowWith(page, teacher.name)).toContainText("Borte 1 gang");
    await expect(rowWith(page, teacher.name)).toContainText("1 ikke varslet");
  });
});

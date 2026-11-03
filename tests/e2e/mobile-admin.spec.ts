import { expect, test, type Page } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  db,
  enroll,
  loginAs,
  seedAdmin,
  seedClass,
  seedFamily,
  seedTeacher,
  uid,
  type SchoolYear,
  type SeededClass,
  type SeededFamily,
  type SeededGuardian,
} from "./fixtures";

let admin: Awaited<ReturnType<typeof seedAdmin>>;
let year: SchoolYear;
let schoolClass: SeededClass;
let family: SeededFamily;
let teacher: SeededGuardian;
let days: { id: string; date: string }[];

function futureSunday(offsetWeeks: number) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

async function expectNoOverflow(page: Page, label: string) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    clipped: Array.from(document.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[role=combobox]")).flatMap((control) => {
      const bounds = control.getBoundingClientRect();
      if (!control.checkVisibility() || bounds.width <= 1 || bounds.height <= 1 || (bounds.left >= -1 && bounds.right <= innerWidth + 1)) return [];
      let parent = control.parentElement;
      while (parent) {
        if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth) return [];
        parent = parent.parentElement;
      }
      return [{ label: control.getAttribute("aria-label") ?? control.textContent?.trim().slice(0, 80), left: Math.round(bounds.left), right: Math.round(bounds.right) }];
    }),
  }));
  if (layout.overflow || layout.clipped.length > 0) {
    await page.screenshot({ path: test.info().outputPath(`${label.replace(/[^a-z0-9]/gi, "-")}-overflow.png`), animations: "disabled" });
  }
  expect(layout.overflow, `${label} has horizontal page overflow`).toBe(false);
  expect(layout.clipped, `${label} has controls clipped by the viewport`).toEqual([]);
}

test.beforeAll(async () => {
  year = await activeYear();
  admin = await seedAdmin();
  schoolClass = await seedClass();
  family = await seedFamily({ students: [{ firstName: `ZZTEST Amira ${uid()}`, lastName: "AbdulrahmanSolbergAbdullahHassan" }] });
  teacher = await seedTeacher();
  await enroll(family.students[0].id, schoolClass.id, year.id);
  await assignTeacher(teacher.id, schoolClass.id, year.id);
  const { data, error } = await db().from("school_days").upsert(
    [0, 1].map((week) => ({ school_year_id: year.id, date: futureSunday(week), cancelled: false, note: "ZZTEST" })),
    { onConflict: "school_year_id,date" },
  ).select("id, date");
  if (error || !data) throw error ?? new Error("School dates were not created");
  days = [...data].sort((left, right) => left.date.localeCompare(right.date));
  const cleared = await db().from("lessons").delete().eq("class_id", schoolClass.id).in("school_day_id", days.map((day) => day.id));
  if (cleared.error) throw cleared.error;
  const lessons = await db().from("lessons").insert(days.flatMap((day) => [1, 2].map((position) => ({
    class_id: schoolClass.id, school_day_id: day.id, start_position: position, end_position: position,
    teacher_guardian_id: teacher.id, subject: position === 1 ? "Islam" : "Arabisk",
  }))));
  if (lessons.error) throw lessons.error;
});

test("admin routes remain readable on a 360px phone", async ({ page, context }) => {
  test.setTimeout(240_000);
  await loginAs(context, admin.email);
  await page.setViewportSize({ width: 360, height: 800 });
  const routes = [
    "/admin", "/admin/dagsplan", "/admin/elever", "/admin/elever/ny",
    `/admin/elever/${family.students[0].id}`,
    "/admin/familier", `/admin/familier/${family.id}`, `/admin/familier/${family.id}/rediger`,
    "/admin/register", "/admin/klasser", "/admin/klasser/ny", `/admin/klasser/${schoolClass.id}`,
    "/admin/laerere", "/admin/betaling", "/admin/betaling/oppfolging", "/admin/betaling/avdrag",
    "/admin/betaling/logg", "/admin/betaling/rabatter", "/admin/betaling/sadaqa",
    "/admin/betaling/avstemming", "/admin/betaling/dobbeltforinger",
    "/admin/beskjeder", "/admin/beskjeder/epost", "/admin/beskjeder/epost?fane=ko",
    "/admin/aktiviteter", "/admin/aktiviteter/ny", "/admin/sfo", "/admin/sfo/ny", "/admin/sfo/allergier",
    "/admin/skolear", "/admin/skolear/ny", `/admin/skolear/${year.id}`, `/admin/skolear/${year.id}/rollover`,
    "/admin/brukere", "/admin/konto", "/admin/revisjon", "/admin/innstillinger",
  ];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of routes) {
    await test.step(route, async () => {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Hovednavigasjon", exact: true })).toBeVisible();
      await expectNoOverflow(page, route);
      expect(errors, `${route} browser errors`).toEqual([]);
    });
  }
});

test("phone tasks retain student identity, class context and accessible payment tools", async ({ page, context }) => {
  test.setTimeout(180_000);
  await loginAs(context, admin.email);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin/elever");
  await page.getByRole("button", { name: "Søk", exact: true }).click();
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: "Søk", exact: true }).fill(family.students[0].firstName);
  const result = palette.getByRole("option").filter({ hasText: family.students[0].name });
  await expect(result).toContainText(schoolClass.name);
  await result.click();
  await expect(page).toHaveURL(`/admin/elever/${family.students[0].id}`);
  const contact = page.locator(`a[href="tel:${family.guardians[0].phone}"]`).first();
  await expect(contact).toBeInViewport();
  const payment = page.getByRole("heading", { name: "Betaling", exact: true }).first();
  expect((await contact.boundingBox())!.y).toBeLessThan((await payment.boundingBox())!.y);
  await expectNoOverflow(page, "student-360");
  await page.screenshot({ path: "test-results/mobile-admin-student-360.png", animations: "disabled" });

  await page.goto(`/admin/familier?q=${encodeURIComponent(family.students[0].firstName)}`);
  const familyLink = page.locator(`a[href="/admin/familier/${family.id}"]`).first();
  await expect(familyLink).toContainText(family.students[0].name);
  expect((await familyLink.innerText()).indexOf(family.students[0].name)).toBeLessThan((await familyLink.innerText()).indexOf(family.displayName));
  await familyLink.click();
  const familyChildren = page.getByRole("region", { name: "Barn (1)", exact: true });
  const familyParents = page.getByRole("region", { name: "Foresatte", exact: true });
  const familyPayment = page.getByRole("region", { name: /^Betalingsstatus / });
  await expect(familyChildren).toContainText(family.students[0].name);
  await expect(familyParents.locator(`a[href="tel:${family.guardians[0].phone}"]`)).toBeVisible();
  expect((await familyChildren.boundingBox())!.y).toBeLessThan((await familyParents.boundingBox())!.y);
  expect((await familyParents.boundingBox())!.y).toBeLessThan((await familyPayment.boundingBox())!.y);
  expect((await familyPayment.boundingBox())!.y).toBeLessThan((await page.getByRole("region", { name: /^Økonomi / }).boundingBox())!.y);
  await expect(page.getByRole("link", { name: "Rediger familie", exact: true })).toHaveCount(0);
  const familyActions = page.getByRole("button", { name: "Familiehandlinger", exact: true });
  await familyActions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rediger familie", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(familyActions).toBeFocused();
  await expectNoOverflow(page, "family-info-first-360");
  await page.screenshot({ path: "test-results/mobile-admin-family-info-first-360.png", animations: "disabled", fullPage: true });
  await familyActions.click();
  await page.getByRole("menuitem", { name: "Rediger familie", exact: true }).click();
  await expect(page).toHaveURL(`/admin/familier/${family.id}/rediger`);

  await page.goto("/admin/betaling");
  const finance = page.getByRole("navigation", { name: "Betaling", exact: true });
  await expect(finance.getByRole("link", { name: "Oppfølging", exact: true })).toBeVisible();
  const tools = finance.getByRole("button", { name: "Flere betalingsverktøy", exact: true });
  await tools.focus();
  await page.keyboard.press("Enter");
  const log = page.getByRole("menuitem", { name: "Betalingslogg", exact: true });
  await expect(log).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await expect(log).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/admin/betaling/logg");
  await expectNoOverflow(page, "finance-360");

  await page.goto(`/admin/klasser/${schoolClass.id}`);
  const classNavigation = page.getByRole("navigation", { name: "Klassevisning", exact: true });
  await expect(classNavigation.getByRole("link", { name: "Oversikt", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(teacher.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Klasseinfo", exact: true })).toContainText("Kapasitet");
  await expectNoOverflow(page, "class-360");

  await page.goto(`/admin/dagsplan?dag=${days[0].id}`);
  const attendance = page.getByRole("region", { name: "Oppmøte", exact: true });
  const classes = attendance.getByRole("navigation", { name: "Klasse", exact: true });
  await classes.getByRole("link", { name: schoolClass.name, exact: true }).click();
  await expect(classes.getByRole("link", { name: schoolClass.name, exact: true })).toHaveAttribute("aria-current", "page");
  const lesson = attendance.getByRole("navigation", { name: "Time", exact: true }).getByRole("link", { name: /^2\. time/ });
  await lesson.click();
  await expect(lesson).toHaveAttribute("aria-current", "page");
  await expect(attendance.getByRole("button", { name: "Vis", exact: true })).toHaveCount(0);
  await expect(attendance.getByRole("region", { name: schoolClass.name, exact: true })).toContainText(family.students[0].name);
  await expectNoOverflow(page, "attendance-360");
  await page.screenshot({ path: "test-results/mobile-admin-dagplan-360.png", animations: "disabled" });

  for (const width of [390, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [`/admin/elever/${family.students[0].id}`, `/admin/klasser/${schoolClass.id}`, "/admin/betaling"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectNoOverflow(page, `${width}-${route}`);
    }
  }
});

test("teacher reports two dates on a phone and admin finds both in planning", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(context, teacher.email);
  await page.goto("/min-side");
  await page.getByRole("button", { name: "Meld fravær", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Jeg kan ikke komme", exact: true });
  for (const day of days) await dialog.getByRole("checkbox", { name: dayLabel(day.date), exact: true }).check();
  await dialog.getByLabel("Grunn (valgfritt)").fill("ZZTEST Borte begge søndager");
  await dialog.getByRole("button", { name: "Se gjennom 2 datoer", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => {
    const result = await db().from("teacher_absences").select("school_day_id").eq("guardian_id", teacher.id).in("school_day_id", days.map((day) => day.id));
    if (result.error) throw result.error;
    return result.data?.length;
  }).toBe(2);

  await loginAs(context, admin.email);
  await page.goto("/admin/dagsplan?visning=planlegging");
  const planning = page.getByRole("region", { name: "Kommende lærerfravær", exact: true });
  for (const day of days) {
    const date = planning.locator("details").filter({ has: page.locator("summary").filter({ hasText: dayLabel(day.date) }) });
    await expect(date).toContainText(teacher.name);
    await expect(date).toContainText(schoolClass.name);
    await expect(date).toContainText("mangler vikar");
  }
  await expectNoOverflow(page, "planning-390");
  await page.screenshot({ path: "test-results/mobile-admin-planning-390.png", animations: "disabled" });
});

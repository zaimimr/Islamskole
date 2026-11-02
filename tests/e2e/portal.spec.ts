import { expect, test } from "playwright/test";
import {
  activeYear,
  enroll,
  loginAs,
  markAttendance,
  schoolDaysOf,
  seedClass,
  seedFamily,
  seedNote,
  seedSchoolDays,
  uid,
  zzEmail,
} from "./fixtures";

async function seedPortalWorld(options: { childEmail?: string } = {}) {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{ childEmail: options.childEmail ?? null }] });
  const student = family.students[0];
  await enroll(student.id, schoolClass.id, year.id, 300000);
  const days = await seedSchoolDays(year, 3);
  await markAttendance(student.id, days[0].id, "til_stede");
  await markAttendance(student.id, days[1].id, "fravaer");
  const olderNote = `ZZTEST lekse eldre ${uid()}`;
  const newerNote = `ZZTEST lekse nyere ${uid()}`;
  await seedNote(schoolClass.id, days[0].id, olderNote);
  await seedNote(schoolClass.id, days[2].id, newerNote);
  return { year, schoolClass, family, student, days, olderNote, newerNote };
}

test.describe("Min side for parents and students", () => {
  test("NEW-PARENT-YEAR child page shows every school day in Oppmøte and all notes in Ukenotater", async ({ page, context }) => {
    const world = await seedPortalWorld();
    await loginAs(context, world.family.guardians[0].email);
    await page.goto(`/min-side/barn/${world.student.id}`);

    const attendance = page.getByRole("region", { name: "Oppmøte" });
    await expect(attendance).toBeVisible();
    const allDays = (await schoolDaysOf(world.year.id)).filter((day) => !day.cancelled);
    for (const day of allDays) {
      await expect(attendance.locator(`[data-date="${day.date}"]`)).toHaveCount(1);
    }
    await expect(attendance.locator(`[data-date="${world.days[0].date}"]`)).toContainText("Møtt");
    await expect(attendance.locator(`[data-date="${world.days[1].date}"]`)).toContainText("Ikke meldt fravær");
    await expect(attendance.locator(`[data-date="${world.days[2].date}"]`)).toContainText("Ikke registrert");

    const notes = page.getByRole("region", { name: "Ukenotater" });
    await expect(notes).toBeVisible();
    await expect(notes.getByText(world.newerNote, { exact: true })).toBeVisible();
    await expect(notes.getByText(world.olderNote, { exact: true })).toBeVisible();
    await expect(notes.locator("[data-date]").first()).toHaveAttribute("data-date", world.days[2].date);
  });

  test("NEW-STUDENT-LOGIN student sees Min skole with own notes and attendance and no payment info", async ({ page, context }) => {
    const childEmail = zzEmail("elev");
    const world = await seedPortalWorld({ childEmail });
    await loginAs(context, childEmail);
    await page.goto("/min-side");

    await expect(page.getByRole("heading", { name: "Min skole" })).toBeVisible();
    await expect(page.getByText(world.schoolClass.name).first()).toBeVisible();
    await expect(page.getByText(world.newerNote, { exact: true })).toBeVisible();
    const attendance = page.getByRole("region", { name: "Oppmøte" });
    await expect(attendance.locator(`[data-date="${world.days[0].date}"]`)).toContainText("Møtt");
    await expect(page.locator("main")).not.toContainText(/Gjenstår|Alt er betalt|betaling/i);
  });

  test("SEC-03 parent cannot open another family's child", async ({ page, context }) => {
    const mine = await seedPortalWorld();
    const other = await seedPortalWorld();
    await loginAs(context, mine.family.guardians[0].email);
    const own = await page.goto(`/min-side/barn/${mine.student.id}`);
    expect(own?.status()).toBe(200);
    const response = await page.goto(`/min-side/barn/${other.student.id}`);
    expect(response?.status()).toBe(404);
  });
});

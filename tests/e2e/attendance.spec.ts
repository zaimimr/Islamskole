import { expect, test } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  db,
  enroll,
  loginAs,
  pickOption,
  seedAdmin,
  seedClass,
  seedFamily,
  seedSchoolDays,
  seedTeacher,
} from "./fixtures";

async function attendance(studentId: string, dayId: string) {
  const { data, error } = await db().from("attendance")
    .select("lesson_id, status, inherited_from_lesson_id")
    .eq("student_id", studentId).eq("school_day_id", dayId);
  if (error) throw error;
  return data ?? [];
}

test("admin takes attendance across classes and teachers correct later lessons", async ({ page, context }) => {
  const year = await activeYear();
  const [day, nextDay] = await seedSchoolDays(year, 2);
  const firstClass = await seedClass();
  const secondClass = await seedClass();
  const emptyClass = await seedClass();
  const family = await seedFamily({ students: [{}, {}] });
  const [firstChild, secondChild] = family.students;
  await enroll(firstChild.id, firstClass.id, year.id);
  await enroll(secondChild.id, secondClass.id, year.id);
  const teacher = await seedTeacher();
  await assignTeacher(teacher.id, firstClass.id, year.id);
  const { error: deleteError } = await db().from("lessons").delete()
    .eq("school_day_id", day.id).in("class_id", [firstClass.id, secondClass.id]);
  if (deleteError) throw deleteError;
  const { data: lessons, error } = await db().from("lessons").insert(
    [firstClass, secondClass, emptyClass].flatMap((row) => [1, 2, 3].map((position) => ({
      class_id: row.id,
      school_day_id: day.id,
      start_position: position,
      end_position: position,
      subject: ["Islam", "Koran", "Arabisk"][position - 1],
    }))),
  ).select("id, class_id, start_position");
  if (error || !lessons) throw error ?? new Error("Missing lessons");
  const firstLessons = lessons.filter((row) => row.class_id === firstClass.id)
    .sort((left, right) => left.start_position - right.start_position);

  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto(`/admin/dagsplan?dag=${day.id}`);
  await expect(page.getByRole("table", { name: "Dagsplan" })).toContainText(firstClass.name);
  await expect(page.getByRole("table", { name: "Dagsplan" })).not.toContainText(emptyClass.name);
  await page.getByRole("link", { name: "Oppmøte", exact: true }).click();
  const overview = page.getByRole("region", { name: "Oppmøte", exact: true });
  const firstRoster = overview.locator("details").filter({ hasText: firstClass.name });
  const secondRoster = overview.locator("details").filter({ hasText: secondClass.name });
  await expect(firstRoster).toContainText(firstChild.name);
  await expect(secondRoster).toContainText(secondChild.name);
  await expect(overview).not.toContainText(emptyClass.name);
  await page.screenshot({ path: "test-results/attendance-desktop.png", fullPage: true });
  await firstRoster.getByRole("button", { name: "Alle møtt", exact: true }).click();
  await expect.poll(async () => (await attendance(firstChild.id, day.id)).map((row) => row.status)).toEqual([
    "til_stede", "til_stede", "til_stede",
  ]);
  expect(await attendance(secondChild.id, day.id)).toHaveLength(0);
  await secondRoster.getByRole("button", { name: "Alle møtt", exact: true }).click();
  await expect.poll(async () => (await attendance(secondChild.id, day.id)).length).toBe(3);

  await pickOption(page, overview, "Time", "Time 2 · 11:00-12:00");
  await overview.getByRole("button", { name: "Vis", exact: true }).click();
  await expect(firstRoster.getByRole("button", { name: "Møtt", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/attendance-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Neste skoledag" }).click();
  await expect(page).toHaveURL(new RegExp(`dag=${nextDay.id}.*visning=oppmote`));
  await expect(page.getByRole("link", { name: "Oppmøte", exact: true })).toHaveAttribute("aria-current", "page");

  await loginAs(context, teacher.email);
  await page.goto(`/min-side/klasse/${firstClass.id}?dag=${day.id}&time=${firstLessons[1].id}`);
  const roster = page.getByRole("region", { name: "Oppmøte", exact: true });
  await roster.getByRole("button", { name: "Ugyldig fravær", exact: true }).click();
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[2].id)?.status).toBe("fravaer");
  await page.goto(`/min-side/klasse/${firstClass.id}?dag=${day.id}&time=${firstLessons[0].id}`);
  await roster.getByRole("button", { name: "Forsinket", exact: true }).click();
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[0].id)?.status).toBe("sent");
  expect((await attendance(firstChild.id, day.id)).find((row) => row.lesson_id === firstLessons[1].id)?.status).toBe("fravaer");
  expect((await attendance(firstChild.id, day.id)).find((row) => row.lesson_id === firstLessons[2].id)?.status).toBe("fravaer");
});

test("admin sees attendance totals per class", async ({ page, context }) => {
  const year = await activeYear();
  const [first, second] = await seedSchoolDays(year, 2);
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{}, {}] });
  for (const student of family.students) await enroll(student.id, schoolClass.id, year.id);
  const [one, two] = family.students;
  const { error } = await db().from("attendance").insert([
    { student_id: one.id, school_day_id: first.id, status: "til_stede" },
    { student_id: one.id, school_day_id: second.id, status: "sent" },
    { student_id: two.id, school_day_id: first.id, status: "meldt_fravaer" },
    { student_id: two.id, school_day_id: second.id, status: "fravaer" },
  ]);
  if (error) throw error;

  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/dagsplan");
  await page.getByRole("link", { name: "Totalt", exact: true }).click();
  const row = page.getByRole("row", { name: new RegExp(schoolClass.name) });
  await expect(row.getByRole("cell")).toHaveText(["1", "1", "1", "1"]);
  await expect(page.getByRole("row", { name: /Totalt/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/attendance-totals-mobile.png", fullPage: true });
});

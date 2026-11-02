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
  seedSchoolDays,
  seedTeacher,
} from "./fixtures";

async function chooseStatus(page: Page, studentName: string, status: string) {
  await page.getByRole("button", { name: `Oppmøte for ${studentName}`, exact: true }).click();
  await page.getByRole("menuitem", { name: status, exact: true }).click();
}

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
  const overview = page.getByRole("region", { name: "Oppmøte", exact: true });
  await overview.getByRole("button", { name: "Vis alle elevlister", exact: true }).click();
  const firstRoster = overview.getByRole("region", { name: firstClass.name, exact: true });
  const secondRoster = overview.getByRole("region", { name: secondClass.name, exact: true });
  await expect(firstRoster).toContainText(firstChild.name);
  await expect(secondRoster).toContainText(secondChild.name);
  await expect(overview).not.toContainText(emptyClass.name);
  await firstRoster.getByRole("button", { name: "Merk 1 uregistrert som møtt", exact: true }).click();
  await expect.poll(async () => (await attendance(firstChild.id, day.id)).map((row) => row.status)).toEqual([
    "til_stede", "til_stede", "til_stede",
  ]);
  expect(await attendance(secondChild.id, day.id)).toHaveLength(0);
  const firstStatus = firstRoster.getByRole("button", { name: `Oppmøte for ${firstChild.name}`, exact: true });
  await chooseStatus(page, firstChild.name, "Ikke meldt fravær");
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[0].id)?.status).toBe("fravaer");
  await chooseStatus(page, firstChild.name, "Forsinket");
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[0].id)?.status).toBe("sent");
  await expect(firstStatus).toContainText("Forsinket");
  await chooseStatus(page, firstChild.name, "Møtt");
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[0].id)?.status).toBe("til_stede");
  await page.reload();
  await overview.getByRole("button", { name: "Vis alle elevlister", exact: true }).click();
  await expect(firstStatus).toContainText("Møtt");
  await expect(firstRoster).toContainText("1 møtt");
  await secondRoster.getByRole("button", { name: "Merk 1 uregistrert som møtt", exact: true }).click();
  await expect.poll(async () => (await attendance(secondChild.id, day.id)).length).toBe(3);
  await expect(secondRoster.getByRole("button", { name: `Oppmøte for ${secondChild.name}`, exact: true })).toContainText("Møtt");

  const secondLesson = overview.getByRole("navigation", { name: "Time", exact: true }).getByRole("link", { name: /^2\. time/ });
  await secondLesson.click();
  await expect(secondLesson).toHaveAttribute("aria-current", "page");
  await expect(firstStatus).toContainText("Møtt");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Neste skoledag" }).click();
  await expect(page).toHaveURL(new RegExp(`dag=${nextDay.id}.*visning=oppmote`));
  await expect(page.getByRole("link", { name: "Oppmøte", exact: true })).toHaveAttribute("aria-current", "page");

  await loginAs(context, teacher.email);
  await page.goto(`/min-side/klasse/${firstClass.id}?dag=${day.id}&time=${firstLessons[1].id}`);
  await chooseStatus(page, firstChild.name, "Ikke meldt fravær");
  await expect.poll(async () => (await attendance(firstChild.id, day.id))
    .find((row) => row.lesson_id === firstLessons[2].id)?.status).toBe("fravaer");
  await page.goto(`/min-side/klasse/${firstClass.id}?dag=${day.id}&time=${firstLessons[0].id}`);
  await chooseStatus(page, firstChild.name, "Forsinket");
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
  await page.goto(`/admin/dagsplan?dag=${first.id}&visning=oppmote`);
  await page.getByRole("link", { name: "Rapporter", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`dag=${first.id}.*visning=totalt`));
  const row = page.getByRole("row", { name: new RegExp(schoolClass.name) });
  await expect(row.getByRole("cell")).toHaveText(["1", "0", "1", "0", "0"]);
  await page.getByRole("link", { name: "Neste skoledag" }).click();
  await expect(row.getByRole("cell")).toHaveText(["0", "1", "0", "1", "0"]);
  await page.getByRole("link", { name: "Hele året", exact: true }).click();
  const report = page.locator(`#klasse-${schoolClass.id}`);
  await expect(report.locator("summary")).toContainText("50 %");
  for (const label of ["1 møtt", "1 forsinket", "1 meldt fravær", "1 ikke meldt fravær"]) {
    await expect(report.locator("summary")).toContainText(label);
  }
  await expect(page.getByRole("row")).toHaveCount(0);
  await report.locator("summary").click();
  await expect(report).toContainText(`${one.name}100 %`);
  await expect(report).toContainText(`${two.name}0 %`);
  const csv = await (await page.request.get("/api/export/oppmote")).text();
  expect(csv).toContain(`${schoolClass.name};${one.name};100;1;1;0;0;2`);
  expect(csv).toContain(`${schoolClass.name};Hele klassen;50;1;1;1;1;4`);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("bulk present preserves staff-reported absence without a note and late arrivals", async ({ page, context }) => {
  const year = await activeYear();
  const [day] = await seedSchoolDays(year, 1);
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{}, {}, {}] });
  for (const child of family.students) await enroll(child.id, schoolClass.id, year.id);
  const cleared = await db().from("lessons").delete().eq("class_id", schoolClass.id).eq("school_day_id", day.id);
  if (cleared.error) throw cleared.error;
  const lessons = await db().from("lessons").insert([1, 2, 3].map((position) => ({
    class_id: schoolClass.id, school_day_id: day.id, start_position: position, end_position: position, subject: "Islam",
  })));
  if (lessons.error) throw lessons.error;
  const [reported, late, unrecorded] = family.students;
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/dagsplan?dag=${day.id}&klasse=${schoolClass.id}`);
  const roster = page.getByRole("region", { name: schoolClass.name, exact: true });
  await chooseStatus(page, reported.name, "Meldt fravær");
  await roster.getByRole("textbox").fill("Foresatt meldte fra via SMS");
  await roster.getByRole("button", { name: "Lagre meldt fravær", exact: true }).click();
  await expect(roster.getByRole("button", { name: `Oppmøte for ${reported.name}`, exact: true })).toContainText("Meldt fravær");
  await chooseStatus(page, reported.name, "Meldt fravær");
  await roster.getByRole("textbox").fill("");
  await roster.getByRole("button", { name: "Lagre meldt fravær", exact: true }).click();
  await chooseStatus(page, late.name, "Forsinket");
  await roster.getByRole("button", { name: "Merk 1 uregistrert som møtt", exact: true }).click();
  await expect.poll(async () => (await attendance(unrecorded.id, day.id)).map((row) => row.status)).toEqual(["til_stede", "til_stede", "til_stede"]);
  expect((await attendance(reported.id, day.id)).map((row) => row.status)).toEqual(["meldt_fravaer", "meldt_fravaer", "meldt_fravaer"]);
  expect((await attendance(late.id, day.id)).map((row) => row.status)).toEqual(["sent", "sent", "sent"]);
  const report = await db().from("absence_reports").select("source, reason, reported_by").eq("student_id", reported.id).eq("school_day_id", day.id).is("withdrawn_at", null).single();
  if (report.error) throw report.error;
  expect(report.data).toEqual({ source: "laerer", reason: null, reported_by: admin.id });
});

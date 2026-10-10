import { expect, test } from "playwright/test";
import { activeYear, assignTeacher, db, enroll, loginAs, seedClass, seedFamily, seedNote, seedSchoolDays, seedSchoolYear, seedTeacher, zzEmail } from "./fixtures";
import { weekStartOf } from "../../src/lib/semester-plan";

test("shared goals, year reuse, private uploads and substitute handover work across staff and family views", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{ childEmail: zzEmail("materials-student") }] });
  const teacher = await seedTeacher();
  const substitute = await seedTeacher();
  await enroll(family.students[0].id, schoolClass.id, year.id);
  await assignTeacher(teacher.id, schoolClass.id, year.id);
  const days = await seedSchoolDays(year, 2);
  const { data: lessons, error: lessonError } = await db().from("lessons").select("id").eq("class_id", schoolClass.id).eq("school_day_id", days[1].id).order("start_position");
  if (lessonError) throw lessonError;
  const lesson = lessons[0];
  expect(lesson).toBeTruthy();
  await seedNote(schoolClass.id, days[0].id, "ZZTEST Previous homework for the substitute");
  const { error: planError } = await db().from("class_week_plans").insert({
    class_id: schoolClass.id, school_year_id: year.id, week_start: weekStartOf(days[1].date),
    title: "ZZTEST Reading lesson", goals: "ZZTEST Read confidently", description: "ZZTEST Guided reading",
  });
  if (planError) throw planError;
  await loginAs(context, teacher.email);
  const classUrl = `/min-side/klasse/${schoolClass.id}?dag=${days[1].id}&time=${lesson.id}`;
  await page.goto(classUrl);
  await expect(page.getByText("ZZTEST Read confidently").first()).toBeVisible();
  await page.getByLabel("Beskjed til lærere og vikarer").fill("ZZTEST Staff handover only");
  await page.getByRole("button", { name: "Lagre vikarbeskjed", exact: true }).click();
  await expect(page.getByText("Vikarbeskjed lagret", { exact: true })).toBeVisible();
  const materials = page.getByRole("region", { name: "Undervisningsmateriell", exact: true });
  await materials.getByRole("button", { name: "Legg til materiell" }).click();
  await materials.getByLabel("Tittel", { exact: true }).fill("ZZTEST Lesson link");
  await materials.getByRole("textbox", { name: "Lenke", exact: true }).fill("https://example.org/lesson");
  await materials.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(materials.getByRole("link", { name: "ZZTEST Lesson link" })).toBeVisible();
  await materials.getByRole("button", { name: "Legg til materiell" }).click();
  await materials.getByLabel("Tittel", { exact: true }).fill("ZZTEST Private reading PDF");
  await materials.getByLabel("Fil", { exact: true }).check();
  await materials.getByLabel("PDF, bilde eller lyd (maks 20 MB)").setInputFiles({
    name: "reading.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nZZTEST private lesson\n%%EOF"),
  });
  await materials.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(materials.getByRole("link", { name: "ZZTEST Private reading PDF" })).toBeVisible();
  const { data: file, error: fileError } = await db().from("lesson_materials").select("id, file_path").eq("class_id", schoolClass.id).eq("kind", "file").single();
  if (fileError) throw fileError;

  const { error: substituteError } = await db().from("lessons").update({ teacher_guardian_id: substitute.id, is_substitute: true, is_override: true }).eq("id", lesson.id);
  if (substituteError) throw substituteError;
  await loginAs(context, substitute.email);
  await page.goto(classUrl);
  await expect(page.getByLabel("Beskjed til lærere og vikarer")).toHaveValue("ZZTEST Staff handover only");
  await expect(page.getByText("ZZTEST Read confidently").first()).toBeVisible();
  await expect(page.getByText("ZZTEST Previous homework for the substitute", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ZZTEST Private reading PDF" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/substitute-handover-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/substitute-handover-mobile.png", fullPage: true });

  await loginAs(context, family.guardians[0].email);
  await page.goto(`/min-side/barn/${family.students[0].id}`);
  await expect(page.getByRole("link", { name: "ZZTEST Private reading PDF" })).toBeVisible();
  await expect(page.getByText("Vikaroverlevering")).toHaveCount(0);
  await expect(page.getByText("ZZTEST Staff handover only")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Legg til materiell" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "ZZTEST Private reading PDF" }).click();
  expect((await download).suggestedFilename()).toBe("reading.pdf");

  await loginAs(context, family.students[0].childEmail!);
  await page.goto("/en/min-side");
  await expect(page.getByRole("link", { name: "ZZTEST Private reading PDF" })).toBeVisible();
  await expect(page.getByText("ZZTEST Staff handover only")).toHaveCount(0);
  const unrelated = await seedFamily();
  await loginAs(context, unrelated.guardians[0].email);
  expect((await page.request.get(`/api/lesson-materials/${file.id}`)).status()).toBe(404);
  await context.clearCookies();
  expect((await page.request.get(`/api/lesson-materials/${file.id}`)).status()).toBe(404);

  await loginAs(context, teacher.email);
  await page.goto(classUrl);
  await materials.getByRole("button", { name: "Fjern materiell: ZZTEST Private reading PDF", exact: true }).click();
  await expect(materials.getByRole("link", { name: "ZZTEST Private reading PDF" })).toHaveCount(0);
  const previousYear = await seedSchoolYear({ startsOn: "2024-08-01", endsOn: "2025-06-30" });
  const previousDays = await seedSchoolDays(previousYear, 1);
  const { error: previousPlanError } = await db().from("class_week_plans").insert({
    class_id: schoolClass.id, school_year_id: previousYear.id, week_start: weekStartOf(previousDays[0].date),
    title: "ZZTEST Reused topic", goals: "ZZTEST Reused goals", completed_at: new Date().toISOString(),
  });
  if (previousPlanError) throw previousPlanError;
  await page.reload();
  await page.getByRole("button", { name: "Gjenbruk undervisningsplan", exact: true }).click();
  await expect.poll(async () => (await db().from("class_week_plans").select("id").eq("class_id", schoolClass.id).eq("school_year_id", year.id).eq("title", "ZZTEST Reused topic")).data?.length).toBe(1);
  const { data: copied } = await db().from("class_week_plans").select("goals, completed_at").eq("class_id", schoolClass.id).eq("school_year_id", year.id).eq("title", "ZZTEST Reused topic").single();
  expect(copied).toMatchObject({ goals: "ZZTEST Reused goals", completed_at: null });
  const past = page.locator("summary").filter({ hasText: /tidligere uker|tidligere uke/ });
  if (await past.count()) await past.first().click();
  await page.getByRole("button", { name: "Merk som gjennomført: ZZTEST Reused topic", exact: true }).click();
  await expect.poll(async () => (await db().from("class_week_plans").select("completed_at").eq("class_id", schoolClass.id).eq("school_year_id", year.id).eq("title", "ZZTEST Reused topic").single()).data?.completed_at).toBeTruthy();
});

import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { activeYear, assignTeacher, db, enroll, loginAs, seedAdmin, seedClass, seedFamily, seedTeacher, uid, zzEmail } from "./fixtures";

async function capture(page: Page, name: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

async function world() {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const childEmail = zzEmail("progress-child");
  const family = await seedFamily({ guardians: [{}, {}], students: [{ childEmail }, {}] });
  const student = family.students[0];
  const teacher = await seedTeacher();
  for (const child of family.students) await enroll(child.id, schoolClass.id, year.id);
  await assignTeacher(teacher.id, schoolClass.id, year.id);
  return { schoolClass, family, student, teacher, childEmail };
}

test("teachers record dated Quran progress that the family and child can read", async ({ page, context }) => {
  const { schoolClass, family, student, teacher, childEmail } = await world();
  await loginAs(context, teacher.email);
  await page.goto(`/min-side/klasse/${schoolClass.id}`);
  await page.getByRole("region", { name: "Læringsutvikling" }).getByRole("link", { name: student.name, exact: true }).click();
  await expect(page.getByText("Legg til elevens første læringsmål.")).toBeVisible();
  await page.getByRole("button", { name: "Nytt læringsmål" }).click();
  await expect(page.getByLabel("Læringsmål", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nytt læringsmål" })).toBeFocused();
  await page.getByRole("button", { name: "Nytt læringsmål" }).click();
  const title = `Lese Al-Fatiha ${uid()}`;
  await page.getByLabel("Læringsmål", { exact: true }).fill(title);
  await page.getByLabel("Surah", { exact: true }).fill("Al-Fatiha");
  await page.getByLabel("Ayah fra").fill("7");
  await page.getByLabel("Ayah til").fill("1");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Ayah til må være minst like høy");
  await page.getByLabel("Ayah fra").fill("1");
  await page.getByLabel("Ayah til").fill("7");
  await page.getByLabel("Tilbakemelding fra lærer").fill("Les rolig, én ayah om gangen.");
  await page.getByLabel("Neste øvingsmål").fill("Øv på de tre første ayahene hjemme.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await capture(page, "progress-form-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, "progress-form-mobile");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  const goal = page.getByRole("article", { name: title });
  await expect(goal.getByText("Øver", { exact: true })).toBeVisible();
  await goal.getByRole("button", { name: "Registrer utvikling" }).click();
  await expect(page.getByLabel("Status", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(goal.getByRole("button", { name: "Registrer utvikling" })).toBeFocused();
  await goal.getByRole("button", { name: "Registrer utvikling" }).click();
  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "Mestret", exact: true }).click();
  await page.getByLabel("Tilbakemelding fra lærer").fill("God uttale. <script>alert('test')</script>");
  await page.getByLabel("Neste øvingsmål").fill("Repeter hele surahen på søndag.");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.getByRole("button", { name: "Lagre utvikling" })).toHaveCount(0);
  await expect(goal.locator("header").getByText("Mestret", { exact: true })).toBeVisible();
  await expect(goal.getByRole("button", { name: "Registrer utvikling" })).toBeFocused();
  await expect(goal.locator("script")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("button", { name: "Nytt læringsmål" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Nytt læringsmål" })).toHaveCSS("opacity", "1");
  await capture(page, "progress-teacher-desktop");

  await loginAs(context, family.guardians[0].email);
  await page.goto(`/min-side/barn/${student.id}`);
  await expect(goal.getByText("Repeter hele surahen på søndag.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nytt læringsmål" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrer utvikling" })).toHaveCount(0);
  await goal.getByRole("button", { name: "Tidligere utvikling" }).click();
  await expect(goal.getByRole("listitem")).toHaveCount(2);
  await expect(goal.getByRole("listitem").last()).toContainText("Øver");
  await expect(goal.getByRole("listitem").first()).toContainText("Mestret");
  await expect(goal.getByRole("listitem").first().locator("time")).toHaveAttribute("datetime", /T/);
  await expect(goal.getByText(teacher.name, { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, "progress-parent-mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  await capture(page, "progress-parent-desktop");

  await loginAs(context, family.guardians[1].email);
  await page.goto(`/min-side/barn/${student.id}`);
  await expect(goal.locator("header").getByText("Mestret", { exact: true })).toBeVisible();
  await page.goto(`/min-side/barn/${family.students[1].id}`);
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(page.getByText("Læreren har ikke registrert læringsmål ennå.")).toBeVisible();
  await loginAs(context, childEmail);
  await page.goto("/en/min-side");
  await expect(page.getByRole("heading", { name: "Learning progress", exact: true })).toBeVisible();
  await expect(goal.locator("header").getByText("Achieved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record progress" })).toHaveCount(0);

  const otherFamily = await seedFamily();
  await loginAs(context, otherFamily.guardians[0].email);
  const response = await page.goto(`/min-side/barn/${student.id}`);
  expect(response?.status()).toBe(404);
  const otherTeacher = await seedTeacher();
  await loginAs(context, otherTeacher.email);
  await page.goto(`/min-side/klasse/${schoolClass.id}/elev/${student.id}`);
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
});

test("admin records Arabic milestones and concurrent updates keep the newer feedback", async ({ page, context }) => {
  const { schoolClass, student, teacher } = await world();
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto(`/admin/elever/${student.id}`);
  await page.getByRole("button", { name: "Nytt læringsmål" }).click();
  await page.getByLabel("Fag", { exact: true }).click();
  await page.getByRole("option", { name: "Arabisk", exact: true }).click();
  await expect(page.getByLabel("Surah", { exact: true })).toHaveCount(0);
  const title = `Arabiske bokstaver ${uid()}`;
  await page.getByLabel("Læringsmål", { exact: true }).fill(title);
  await page.getByLabel("Neste øvingsmål").fill("Skriv alif og ba.");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await loginAs(context, teacher.email);
  const path = `/min-side/klasse/${schoolClass.id}/elev/${student.id}`;
  await page.goto(path);
  const second = await context.newPage();
  await second.goto(path);
  for (const target of [page, second]) await target.getByRole("button", { name: "Registrer utvikling" }).click();
  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "Trenger repetisjon", exact: true }).click();
  await page.getByLabel("Tilbakemelding fra lærer").fill("Øv videre på forskjellen mellom bokstavene.");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.getByRole("button", { name: "Lagre utvikling" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: title }).locator("header").getByText("Trenger repetisjon", { exact: true })).toBeVisible();
  await second.getByLabel("Tilbakemelding fra lærer").fill("Stale feedback");
  await second.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(second.locator("form").getByRole("alert")).toContainText("En annen lærer har registrert ny utvikling");
  await second.getByRole("button", { name: "Hent siste utvikling" }).click();
  await expect(second.getByText("Øv videre på forskjellen mellom bokstavene.", { exact: true })).toBeVisible();
  await expect(second.getByRole("button", { name: "Lagre utvikling" })).toHaveCount(0);
  await second.close();

  const unenrolled = await seedFamily();
  await loginAs(context, admin.email);
  await page.goto(`/admin/elever/${unenrolled.students[0].id}`);
  await page.getByRole("button", { name: "Nytt læringsmål" }).click();
  await page.getByLabel("Fag", { exact: true }).click();
  await page.getByRole("option", { name: "Islamkunnskap", exact: true }).click();
  const unenrolledTitle = `Bønnens rekkefølge ${uid()}`;
  await page.getByLabel("Læringsmål", { exact: true }).fill(unenrolledTitle);
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.getByRole("heading", { name: unenrolledTitle })).toBeVisible();
  await page.getByRole("button", { name: "Registrer utvikling" }).click();
  await page.getByLabel("Tilbakemelding fra lærer").fill("Kan rekkefølgen.");
  await page.getByRole("button", { name: "Lagre utvikling" }).click();
  await expect(page.getByText("Kan rekkefølgen.", { exact: true })).toBeVisible();
});

test("families can load older goals and dated history", async ({ page, context }) => {
  const { family, student, teacher } = await world();
  const goals = Array.from({ length: 22 }, (_, index) => ({
    id: randomUUID(), student_id: student.id, subject: "islam", title: `Praksismål ${index}`,
    status: "practising", updated_by_name: teacher.name, updated_at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  }));
  const inserted = await db().from("learning_goals").insert(goals);
  if (inserted.error) throw inserted.error;
  const updates = Array.from({ length: 22 }, (_, index) => ({
    id: randomUUID(), goal_id: goals[21].id, student_id: student.id, status: "practising", teacher_name: teacher.name,
    feedback: `Tilbakemelding ${index}`, created_at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  }));
  const history = await db().from("learning_progress_updates").insert(updates);
  if (history.error) throw history.error;
  await loginAs(context, family.guardians[0].email);
  await page.goto(`/min-side/barn/${student.id}`);
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("button", { name: "Vis flere læringsmål" }).click();
  await expect(page.getByRole("article")).toHaveCount(22);
  const goal = page.getByRole("article", { name: "Praksismål 21", exact: true });
  await goal.getByRole("button", { name: "Tidligere utvikling" }).click();
  await expect(goal.getByRole("listitem")).toHaveCount(20);
  await goal.getByRole("button", { name: "Vis flere oppdateringer" }).click();
  await expect(goal.getByRole("listitem")).toHaveCount(22);
  await expect(goal.getByText("Tilbakemelding 0", { exact: true })).toBeVisible();
});

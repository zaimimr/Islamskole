import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import { OUTBOX_DIR } from "./env";
import { activeYear, assignTeacher, db, enroll, loginAs, seedAdmin, seedClass, seedFamily, seedTeacher, uid } from "./fixtures";

function emailsWithSubject(subject: string) {
  if (!fs.existsSync(OUTBOX_DIR)) return [];
  return fs.readdirSync(OUTBOX_DIR).map((name) => JSON.parse(fs.readFileSync(path.join(OUTBOX_DIR, name), "utf8"))).filter((email) => email.subject === subject);
}

test("a teacher sends one email per guardian, siblings share acknowledgement and unrelated parents have no access", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const teacher = await seedTeacher();
  const family = await seedFamily({ guardians: [{}, {}], students: [{}, {}] });
  const otherFamily = await seedFamily();
  await assignTeacher(teacher.id, schoolClass.id, year.id);
  for (const student of family.students) await enroll(student.id, schoolClass.id, year.id);
  await loginAs(context, teacher.email);
  await page.goto("/min-side/beskjeder");
  await page.getByRole("button", { name: "Ny beskjed" }).click();
  await expect(page.getByLabel("Mottakere")).toContainText(schoolClass.name);
  const title = `ZZTEST Bok ${uid()}`;
  const body = "Ta med boken på søndag.\n<script>alert('hei')</script>";
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Beskjed", { exact: true }).fill(body);
  await expect(page.getByLabel("Send på e-post")).toBeChecked();
  await page.getByLabel("Be om bekreftelse fra familien").check();
  await page.getByRole("button", { name: "Se gjennom" }).click();
  await expect(page.getByText("1 familie · 2 e-postadresser", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publiser og send", exact: true })).toBeEnabled();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("button", { name: "Publiser og send", exact: true })).toHaveCSS("opacity", "1");
  fs.writeFileSync("test-results/announcements-button-style.json", JSON.stringify(await page.getByRole("button", { name: "Publiser og send", exact: true }).evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color, opacity: getComputedStyle(button).opacity }))));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/announcements-composer-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/announcements-composer-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Publiser og send" }).click();
  await expect(page).toHaveURL(/\/min-side\/beskjeder\/[\w-]+$/);
  const id = page.url().split("/").at(-1)!;
  await expect.poll(() => emailsWithSubject(title).length).toBe(2);
  for (const email of emailsWithSubject(title)) {
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain(body);
    expect(email.links[0]).toContain(`/min-side/beskjeder/${id}`);
  }
  await expect.poll(async () => {
    const { data, error } = await db().from("announcement_deliveries").select("status").eq("announcement_id", id);
    if (error) throw error;
    return data?.map((row) => row.status);
  }).toEqual(["sent", "sent"]);

  await loginAs(context, family.guardians[0].email);
  await page.goto("/min-side");
  await expect(page.getByRole("link", { name: "1 beskjed må bekreftes" })).toBeVisible();
  await page.goto(`/min-side/beskjeder/${id}`);
  await expect(page.getByRole("button", { name: "Ny beskjed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Jeg har lest og forstått" })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/announcements-parent-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Jeg har lest og forstått" }).click();
  await expect(page.getByText("Bekreftet", { exact: true })).toBeVisible();
  await loginAs(context, family.guardians[1].email);
  await page.goto(`/min-side/beskjeder/${id}`);
  await expect(page.getByText("Bekreftet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jeg har lest og forstått" })).toHaveCount(0);
  await page.goto("/min-side");
  await expect(page.getByRole("link", { name: "1 beskjed må bekreftes" })).toHaveCount(0);

  await loginAs(context, otherFamily.guardians[0].email);
  await page.goto(`/min-side/beskjeder/${id}`);
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await loginAs(context, teacher.email);
  await page.goto(`/min-side/beskjeder/${id}`);
  await expect(page.getByText("1 av 1 familier har bekreftet")).toBeVisible();
});

test("an admin publishes school-wide without email and the recipient views work on mobile and in English", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily();
  await enroll(family.students[0].id, schoolClass.id, year.id);
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/beskjeder");
  await page.getByRole("button", { name: "Ny beskjed" }).click();
  await expect(page.getByLabel("Mottakere")).toContainText("Hele skolen");
  const title = `ZZTEST Praktisk ${uid()}`;
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Beskjed", { exact: true }).fill("Vi møtes ved hovedinngangen.");
  await page.getByLabel("Send på e-post").uncheck();
  await page.getByRole("button", { name: "Se gjennom" }).click();
  await page.getByRole("button", { name: "Publiser i portalen" }).click();
  await expect(page).toHaveURL(/\/admin\/beskjeder\/[\w-]+$/);
  const id = page.url().split("/").at(-1)!;
  const { data, error } = await db().from("announcement_deliveries").select("id").eq("announcement_id", id);
  if (error) throw error;
  expect(data).toHaveLength(0);
  expect(emailsWithSubject(title)).toHaveLength(0);
  await expect(page.getByText("Kun portal", { exact: true }).first()).toBeVisible();

  await loginAs(context, family.guardians[0].email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/min-side/beskjeder/${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: "Announcements", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "I have read and understood" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a sender sees failed delivery and retries without changing acknowledgement", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily();
  await enroll(family.students[0].id, schoolClass.id, year.id);
  const admin = await seedAdmin();
  const id = randomUUID();
  const title = `ZZTEST Retry ${uid()}`;
  const announcement = await db().from("school_announcements").insert({
    id, school_year_id: year.id, class_id: schoolClass.id, class_name_no: schoolClass.name,
    class_name_en: schoolClass.name, title, body: "Husk boken.", email_enabled: true,
    requires_acknowledgement: true, created_by: admin.id,
  });
  if (announcement.error) throw announcement.error;
  const recipient = await db().from("announcement_families").insert({
    announcement_id: id, family_id: family.id, family_name: family.displayName, acknowledged_at: new Date().toISOString(),
  });
  if (recipient.error) throw recipient.error;
  const delivery = await db().from("announcement_deliveries").insert({
    announcement_id: id, email: family.guardians[0].email, family_ids: [family.id],
    language: "no", status: "failed", attempts: 1, error: "ZZTEST provider failure",
  });
  if (delivery.error) throw delivery.error;
  await loginAs(context, admin.email);
  await page.goto(`/admin/beskjeder/${id}`);
  await expect(page.getByText("Sending feilet", { exact: true })).toBeVisible();
  await expect(page.getByText("1 av 1 familier har bekreftet")).toBeVisible();
  await page.screenshot({ path: "test-results/announcements-delivery-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Prøv e-post på nytt" }).click();
  await expect.poll(() => emailsWithSubject(title).length).toBe(1);
  await page.getByRole("button", { name: "Oppdater status" }).click();
  await expect(page.getByText("Sendt", { exact: true })).toBeVisible();
  await expect(page.getByText("1 av 1 familier har bekreftet")).toBeVisible();
});

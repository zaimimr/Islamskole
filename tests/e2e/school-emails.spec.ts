import fs from "node:fs";
import path from "node:path";
import { expect, test } from "playwright/test";
import { OUTBOX_DIR } from "./env";
import { activeYear, db, enroll, loginAs, seedAdmin, seedClass, seedFamily, zzEmail } from "./fixtures";

function emails(email: string, subject: string) {
  if (!fs.existsSync(OUTBOX_DIR)) return [];
  return fs.readdirSync(OUTBOX_DIR).filter((name) => name.endsWith(".json")).map((name) =>
    JSON.parse(fs.readFileSync(path.join(OUTBOX_DIR, name), "utf8")),
  ).filter((message) => message.to === email && message.subject === subject);
}

test("signup confirmation and role-specific welcome are deduplicated, escaped and visible with first-use guidance", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const studentEmail = zzEmail("onboarding-student");
  const family = await seedFamily({ guardians: [{}, {}], students: [
    { firstName: "ZZTEST <script>example</script>", childEmail: studentEmail }, {},
  ] });
  const guardian = family.guardians[0];
  const optedOut = family.guardians[1];
  const { error: optError } = await db().from("family_guardians").update({ receives_communication: false })
    .eq("family_id", family.id).eq("guardian_id", optedOut.id);
  if (optError) throw optError;
  const { data: payment, error: paymentError } = await db().from("payments").insert({
    reference: `ZZTEST onboarding ${family.id}`, school_year_id: year.id, amount: 20000, status: "opprettet", method: "vipps",
  }).select("id").single();
  if (paymentError) throw paymentError;
  const { error: appError } = await db().from("student_applications").insert(family.students.map((student) => ({
    family_id: family.id, payment_id: payment.id, child_first_name: student.firstName, child_last_name: student.lastName,
    child_email: student.childEmail, status: "ny",
  })));
  if (appError) throw appError;
  expect((await page.request.get("/api/cron/school-emails")).status()).toBe(401);
  const run = () => page.request.get("/api/cron/school-emails", { headers: { authorization: "Bearer test" } });
  expect((await run()).ok()).toBe(true);
  expect(emails(guardian.email, "Vi har mottatt påmeldingen")).toHaveLength(1);
  expect(emails(optedOut.email, "Vi har mottatt påmeldingen")).toHaveLength(0);
  const confirmation = emails(studentEmail, "Vi har mottatt påmeldingen")[0];
  expect(confirmation.text).not.toContain(family.students[1].firstName);
  expect(confirmation.html).toContain("&lt;script&gt;");
  expect(confirmation.html).not.toContain("<script>");
  expect(confirmation.links).toHaveLength(0);

  for (const student of family.students) await enroll(student.id, schoolClass.id, year.id);
  expect((await run()).ok()).toBe(true);
  const subject = "Velkommen til Min side på Islamskole Bærum";
  expect(emails(guardian.email, subject)).toHaveLength(1);
  expect(emails(studentEmail, subject)).toHaveLength(1);
  expect(emails(optedOut.email, subject)).toHaveLength(0);
  expect(emails(guardian.email, subject)[0].text).toContain("Økonomi");
  expect(emails(studentEmail, subject)[0].text).not.toContain("Økonomi");
  expect(emails(studentEmail, subject)[0].links[0]).toMatch(/\/no\/min-side\/logg-inn$/);
  await run();
  expect(emails(guardian.email, subject)).toHaveLength(1);

  await loginAs(context, guardian.email);
  await page.goto("/min-side");
  const guide = page.getByRole("region", { name: "Slik bruker du Min side" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("link", { name: "Økonomi", exact: true })).toHaveAttribute("href", "/min-side/okonomi");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/onboarding-parent-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/onboarding-parent-desktop.png", fullPage: true });
  await guide.getByRole("button", { name: "Jeg er klar" }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(guide).toHaveCount(0);

  await loginAs(context, studentEmail);
  await page.goto("/en/min-side");
  const studentGuide = page.getByRole("region", { name: "Getting started with Min side" });
  await expect(studentGuide).toBeVisible();
  await expect(studentGuide.getByRole("link", { name: "Payments" })).toHaveCount(0);
  await expect(studentGuide.getByText("See your goals, teacher feedback and what to practise next.")).toBeVisible();
  await studentGuide.getByRole("button", { name: "I'm ready" }).click();
  await page.reload();
  await expect(studentGuide).toHaveCount(0);
});

test("installment schedule, payment link and overdue reminder reach parents with retryable delivery and admin status", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{ childEmail: zzEmail("installment-student") }] });
  const student = family.students[0];
  const guardian = family.guardians[0];
  await enroll(student.id, schoolClass.id, year.id);
  const { error: languageError } = await db().from("families").update({ preferred_language: "en" }).eq("id", family.id);
  if (languageError) throw languageError;
  const { data: plan, error: planError } = await db().from("payment_plans").insert({
    family_id: family.id, school_year_id: year.id, plan_type: "semester", created_by: "ZZTEST",
  }).select("id").single();
  if (planError) throw planError;
  const dueDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const { data: payment, error: paymentError } = await db().from("payments").insert({
    reference: `ZZTEST installment onboarding ${family.id}`, school_year_id: year.id, amount: 50000, status: "opprettet", method: "vipps",
  }).select("id").single();
  if (paymentError) throw paymentError;
  const { data: installment, error: installmentError } = await db().from("installments").insert({
    plan_id: plan.id, student_id: student.id, school_year_id: year.id, due_date: dueDate, amount: 50000,
    status: "sendt", payment_id: payment.id,
  }).select("id").single();
  if (installmentError) throw installmentError;
  const run = () => page.request.get("/api/cron/school-emails", { headers: { authorization: "Bearer test" } });
  expect((await run()).ok()).toBe(true);
  expect(emails(guardian.email, "Your school fee installment plan")).toHaveLength(1);
  expect(emails(guardian.email, "Your next school fee installment")[0].links[0]).toContain(`/api/vipps/pay/${payment.id}?locale=en`);
  expect(emails(guardian.email, "Reminder: school fee installment")).toHaveLength(1);
  expect(emails(student.childEmail!, "Your school fee installment plan")).toHaveLength(0);
  const { data: sent } = await db().from("installments").select("reminder_sent_at").eq("id", installment.id).single();
  expect(sent?.reminder_sent_at).toBeTruthy();
  await run();
  expect(emails(guardian.email, "Reminder: school fee installment")).toHaveLength(1);

  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/beskjeder/epost");
  await expect(page.getByRole("heading", { name: "E-postutsending" })).toBeVisible();
  await expect(page.getByText(guardian.email, { exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/email-delivery-mobile.png", fullPage: true });
  const { data: delivery, error } = await db().from("school_email_deliveries").select("id")
    .eq("family_id", family.id).eq("kind", "plan_confirmed").single();
  if (error) throw error;
  const { error: failError } = await db().from("school_email_deliveries").update({ status: "failed", attempts: 5 }).eq("id", delivery.id);
  if (failError) throw failError;
  await page.reload();
  await page.getByRole("button", { name: "Prøv igjen", exact: true }).click();
  await expect.poll(async () => (await db().from("school_email_deliveries").select("status").eq("id", delivery.id).single()).data?.status).toBe("sent");

  await loginAs(context, guardian.email);
  await page.goto("/admin/beskjeder/epost");
  await expect(page.getByRole("heading", { name: /Email delivery|E-postutsending/ })).toHaveCount(0);
});

test("queued reminders recheck authorization and grouped family balances at delivery", async ({ page }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({ students: [{}, {}] });
  for (const student of family.students) await enroll(student.id, schoolClass.id, year.id, 10000);
  const dueDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const { data: payments, error } = await db().from("payments").insert([
    { reference: `ZZTEST grouped reminder ${family.id}`, school_year_id: year.id, amount: 20000, due_date: dueDate, status: "opprettet", method: "vipps" },
    { reference: `ZZTEST authorized reminder ${family.id}`, student_id: family.students[0].id, school_year_id: year.id, amount: 10000, due_date: dueDate, status: "autorisert", method: "vipps" },
  ]).select("id, student_id");
  if (error) throw error;
  const grouped = payments.find((row) => !row.student_id)!;
  const authorized = payments.find((row) => row.student_id)!;
  const { error: targetsError } = await db().from("payment_targets").insert(family.students.map((student) => ({
    payment_id: grouped.id, student_id: student.id, amount: 10000,
  })));
  if (targetsError) throw targetsError;
  const { error: queueError } = await db().from("school_email_deliveries").insert({
    kind: "payment_reminder", entity_id: authorized.id, family_id: family.id, email: family.guardians[0].email,
  });
  if (queueError) throw queueError;
  expect((await page.request.get("/api/cron/school-emails", { headers: { authorization: "Bearer test" } })).ok()).toBe(true);
  const reminders = emails(family.guardians[0].email, "Påminnelse om ubetalt skoleavgift");
  expect(reminders).toHaveLength(1);
  for (const student of family.students) expect(reminders[0].text).toContain(student.firstName);
  expect(reminders[0].text).toMatch(/200/);
  const { data: stale } = await db().from("school_email_deliveries").select("status").eq("entity_id", authorized.id).single();
  expect(stale?.status).toBe("skipped");
});

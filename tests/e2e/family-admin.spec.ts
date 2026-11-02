import { expect, test, type Page } from "playwright/test";
import {
  activeYear,
  confirmIfAsked,
  db,
  enroll,
  loginAs,
  pickOption,
  seedAdmin,
  seedClass,
  seedFamily,
  seedPayment,
  zzEmail,
} from "./fixtures";

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function guardianBlock(page: Page, email: string) {
  return page
    .locator("li, article, section, div")
    .filter({ hasText: email })
    .filter({ has: page.getByRole("button", { name: "Fjern foresatt" }) })
    .last();
}

test.describe("families and students", () => {
  test.beforeEach(async ({ context }) => {
    const admin = await seedAdmin();
    await loginAs(context, admin.email);
  });

  test("FAM-06 Fjern foresatt removes a guardian from the family", async ({ page }) => {
    const family = await seedFamily({ guardians: [{}, {}] });
    const [, second] = family.guardians;
    await page.goto(`/admin/familier/${family.id}`);
    await guardianBlock(page, second.email).getByRole("button", { name: "Fjern foresatt" }).click();
    await confirmIfAsked(page, /^Fjern/);
    await expect
      .poll(async () => (await rows(db().from("family_guardians").select("guardian_id").eq("family_id", family.id))).length)
      .toBe(1);
    expect(await rows(db().from("guardians").select("id").eq("id", second.id))).toHaveLength(0);
    expect(
      await rows(db().from("student_guardians").select("guardian_id").eq("student_id", family.students[0].id).eq("guardian_id", second.id)),
    ).toHaveLength(0);
  });

  test("FAM-10 Slå sammen med annen familie moves children and merges same-email guardians", async ({ page }) => {
    const sharedEmail = zzEmail("felles");
    const keep = await seedFamily({ guardians: [{ email: sharedEmail }] });
    const merge = await seedFamily({ guardians: [{ email: sharedEmail.toUpperCase() }, {}] });
    await page.goto(`/admin/familier/${keep.id}`);
    await page.getByRole("button", { name: "Slå sammen med annen familie" }).click();
    const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
    await pickOption(page, dialog, "Familie", merge.displayName);
    await dialog.getByRole("button", { name: "Slå sammen" }).click();

    await expect.poll(async () => (await rows(db().from("families").select("id").eq("id", merge.id))).length).toBe(0);
    const studentFamilies = await rows(db().from("students").select("family_id").eq("id", merge.students[0].id));
    expect(studentFamilies).toEqual([{ family_id: keep.id }]);
    expect(await rows(db().from("guardians").select("id").ilike("email", sharedEmail))).toHaveLength(1);
    expect(await rows(db().from("family_guardians").select("guardian_id").eq("family_id", keep.id))).toHaveLength(2);
  });

  test("FAM-11 Flytt til annen familie moves the student and swaps guardians", async ({ page }) => {
    const from = await seedFamily();
    const to = await seedFamily();
    const student = from.students[0];
    await page.goto(`/admin/elever/${student.id}`);
    await page.getByText("Elevopplysninger", { exact: true }).click();
    await page.getByRole("button", { name: "Flytt til annen familie" }).click();
    const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
    await pickOption(page, dialog, "Familie", to.displayName);
    await dialog.getByRole("button", { name: "Flytt" }).click();

    await expect
      .poll(async () => (await rows(db().from("students").select("family_id").eq("id", student.id)))[0])
      .toEqual({ family_id: to.id });
    const links = await rows(db().from("student_guardians").select("guardian_id").eq("student_id", student.id));
    expect(links.map((link: { guardian_id: string }) => link.guardian_id).sort()).toEqual(to.guardians.map((g) => g.id).sort());
  });

  test("FAM-24 Elevens e-post (innlogging) edits child_email", async ({ page }) => {
    const family = await seedFamily();
    const student = family.students[0];
    const email = zzEmail("elevlogin");
    await page.goto(`/admin/elever/${student.id}`);
    await page.getByText("Elevopplysninger", { exact: true }).click();
    await page.getByLabel("Elevens e-post (innlogging)").fill(email);
    await page.getByRole("button", { name: "Lagre endringer" }).click();
    await expect
      .poll(async () => (await rows(db().from("students").select("child_email").eq("id", student.id)))[0])
      .toEqual({ child_email: email });
  });

  test("FAM-13 deleting a student with payments is refused", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const family = await seedFamily();
    const student = family.students[0];
    await enroll(student.id, schoolClass.id, year.id);
    await seedPayment(student.id, year.id, 100000);

    await page.goto(`/admin/elever/${student.id}`);
    await expect(page.getByRole("heading", { name: "Eleven slutter" })).toBeVisible();
    const deleteButton = page.getByRole("button", { name: "Slett elev" });
    if (await deleteButton.count()) {
      await deleteButton.click();
      await confirmIfAsked(page, /^Slett/);
    }
    await expect(page.getByText("Eleven har betalinger og kan ikke slettes").first()).toBeVisible();
    expect(await rows(db().from("students").select("id").eq("id", student.id))).toHaveLength(1);
  });

  test("FAM-14 Eleven har sluttet shows the outstanding amount and Gi fritak", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const family = await seedFamily();
    const student = family.students[0];
    await enroll(student.id, schoolClass.id, year.id, 300000);

    await page.goto(`/admin/elever/${student.id}`);
    await page.getByRole("button", { name: "Eleven har sluttet" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eleven har sluttet" }).click();
    await expect
      .poll(async () => (await rows(db().from("enrollments").select("status").eq("student_id", student.id)))[0])
      .toEqual({ status: "avsluttet" });

    await page.reload();
    const panel = page.locator("main");
    await expect(panel).toContainText(/Utestående/);
    await expect(panel).toContainText(/3\s?000 kr/);
    await expect(panel.getByRole("button", { name: "Gi fritak" }).or(panel.getByRole("link", { name: "Gi fritak" }))).toBeVisible();
  });

  test("FAM-PAY-HISTORY family page shows payment history per child", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const family = await seedFamily({
      students: [{ firstName: "ZZTEST Betalt" }, { firstName: "ZZTEST Venter" }],
    });
    const [paid, waiting] = family.students;
    await enroll(paid.id, schoolClass.id, year.id);
    await enroll(waiting.id, schoolClass.id, year.id);
    await seedPayment(paid.id, year.id, 100000);
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { data: open, error } = await db()
      .from("payments")
      .insert({
        student_id: waiting.id,
        school_year_id: year.id,
        reference: `ZZTEST-open-${Date.now()}`,
        amount: 150000,
        status: "opprettet",
        method: "vipps",
        due_date: due,
        request_sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: targetError } = await db()
      .from("payment_targets")
      .insert({ payment_id: open!.id, student_id: waiting.id, amount: 150000 });
    if (targetError) throw new Error(targetError.message);

    await page.goto(`/admin/familier/${family.id}`);
    await expect(page.getByRole("heading", { name: /^Betalingshistorikk/ })).toBeVisible();
    const history = page.getByRole("region", { name: /^Betalingshistorikk/ });
    const paidSection = history.getByRole("row").filter({ hasText: "ZZTEST Betalt" });
    await expect(paidSection).toContainText("Betalt");
    await expect(paidSection).toContainText(/1\s?000 kr/);
    const waitingSection = history.getByRole("row").filter({ hasText: "ZZTEST Venter" });
    await expect(waitingSection).toContainText("Ikke betalt");
    await expect(waitingSection).toContainText(/frist/);
  });

  test("FAM-PAY-HISTORY-SHARED one Vipps payment for several children is one marked row", async ({ page }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const family = await seedFamily({
      students: [{ firstName: "ZZTEST Eldst" }, { firstName: "ZZTEST Yngst" }],
    });
    const [first, second] = family.students;
    await enroll(first.id, schoolClass.id, year.id);
    await enroll(second.id, schoolClass.id, year.id);
    const { data: shared, error } = await db()
      .from("payments")
      .insert({
        student_id: first.id,
        school_year_id: year.id,
        reference: `ZZTEST-shared-${Date.now()}`,
        amount: 400000,
        status: "opprettet",
        method: "vipps",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: targetError } = await db().from("payment_targets").insert([
      { payment_id: shared!.id, student_id: first.id, amount: 200000 },
      { payment_id: shared!.id, student_id: second.id, amount: 200000 },
    ]);
    if (targetError) throw new Error(targetError.message);

    await page.goto(`/admin/familier/${family.id}`);
    const history = page.getByRole("region", { name: /^Betalingshistorikk/ });
    const row = history.getByRole("row").filter({ hasText: "Samlet" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("ZZTEST Eldst");
    await expect(row).toContainText("ZZTEST Yngst");
    await expect(row).toContainText(/4\s?000 kr/);
  });
});

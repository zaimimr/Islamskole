import { expect, test } from "playwright/test";
import { readFile } from "node:fs/promises";
import { activeYear, db, enroll, loginAs, seedAdmin, seedClass, seedFamily, uid } from "./fixtures";

test("full names and typos find applications, students, families and payments", async ({ page, context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  const family = await seedFamily({ students: [{ firstName: "ZZTEST Amira", lastName: "Solberg" }] });
  const payment = await db().from("payments").insert({ reference: `ZZTEST-SEARCH-${family.id}`, amount: 200000 }).select("id").single();
  if (payment.error) throw new Error(payment.error.message);
  const application = await db().from("student_applications").insert({
    family_id: family.id,
    child_first_name: "ZZTEST Amira",
    child_last_name: "Solberg",
    status: "ny",
    terms_accepted: true,
    payment_id: payment.data.id,
  }).select("id").single();
  if (application.error) throw new Error(application.error.message);

  await page.goto("/admin/register?q=Amira%20Jensen");
  const applicationSearch = page.getByRole("searchbox", { name: "Søk i innmeldinger" });
  const applicationRow = page.getByRole("button", { name: "Flere valg for ZZTEST Amira Solberg" });
  await expect(applicationRow).not.toBeVisible();
  await applicationSearch.fill("Amira Solberg");
  await page.waitForURL((url) => url.searchParams.get("q") === "Amira Solberg");
  await expect(applicationRow).toBeVisible();
  await applicationSearch.fill("  solberg   AMRIA ");
  await page.waitForURL((url) => url.searchParams.get("q") === "solberg   AMRIA");
  await expect(applicationRow).toBeVisible();
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Eksporter/ }).click(),
  ]);
  expect(download[0].suggestedFilename()).toBe("applications.csv");
  const downloadPath = await download[0].path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!, "utf8")).toContain("Solberg");

  await page.goto("/admin/elever?q=solberg%20amria&year=alle");
  const studentLink = page.locator(`a[href^="/admin/elever/${family.students[0].id}"]`).first();
  await expect(studentLink).toBeVisible();
  await studentLink.click();
  await page.getByRole("link", { name: "Tilbake til elever", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/elever\?q=solberg(?:%20|\+)amria&year=alle/);
  await page.goto("/admin/familier");
  await page.getByRole("searchbox", { name: "Søk etter elev, foresatt eller familie" }).fill("Solbrexg Amira");
  await expect(page.locator(`a[href="/admin/familier/${family.id}"]`).first()).toBeVisible();
  await page.goto("/admin/betaling/logg?q=solberg%20amria");
  await page.getByText("Referanse og hendelser", { exact: true }).click();
  await expect(page.getByText(`ZZTEST-SEARCH-${family.id}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Søk etter elev/ }).click();
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: "Søk", exact: true }).fill("Solberg Amria");
  await expect(palette.getByText("ZZTEST Amira Solberg", { exact: true })).toBeVisible();
});

test("mobile student lookup distinguishes first names and puts parent contact before payments", async ({ page, context }) => {
  const year = await activeYear();
  const firstClass = await seedClass();
  const secondClass = await seedClass();
  const firstName = `ZZTEST Amira ${uid()}`;
  const first = await seedFamily({ students: [{ firstName, lastName: "Solberg", birthDate: "2017-03-14" }] });
  const second = await seedFamily({ students: [{ firstName, lastName: "Hansen", birthDate: "2015-03-14" }] });
  await enroll(first.students[0].id, firstClass.id, year.id);
  await enroll(second.students[0].id, secondClass.id, year.id);
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/elever");
  const navigation = page.getByRole("navigation", { name: "Hovednavigasjon" });
  await expect(navigation.getByRole("link", { name: "Dagplan" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Elever" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Søk", exact: true }).click();
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: "Søk", exact: true }).fill(firstName);
  const firstHit = palette.getByRole("option").filter({ hasText: first.students[0].name });
  const secondHit = palette.getByRole("option").filter({ hasText: second.students[0].name });
  await expect(firstHit).toContainText(firstClass.name);
  await expect(secondHit).toContainText(secondClass.name);
  await expect(palette.getByRole("option").first()).toContainText(/Solberg|Hansen/);
  await firstHit.click();
  await expect(page).toHaveURL(`/admin/elever/${first.students[0].id}`);
  const contact = page.locator('a[href^="tel:"]').first();
  await expect(contact).toBeVisible();
  const paymentHeading = page.getByRole("heading", { name: "Betaling", exact: true }).first();
  expect((await contact.boundingBox())!.y).toBeLessThan((await paymentHeading.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await navigation.getByRole("button", { name: "Åpne administrasjonsmenyen" }).click();
  await expect(page.getByRole("navigation", { name: "Administrasjon", exact: true }).getByRole("link", { name: "Betaling", exact: true })).toBeVisible();
});

test("user and teacher application search ignores accents and accepts typos", async ({ page, context }) => {
  const name = "ZZTEST Åse Sæther";
  const admin = await seedAdmin({ fullName: name });
  await loginAs(context, admin.email);
  const application = await db().from("teacher_applications").insert({
    full_name: name,
    email: "zztest-search-teacher@zztest.local",
    status: "ny",
  });
  if (application.error) throw new Error(application.error.message);
  await page.goto("/admin/brukere");
  await page.getByRole("searchbox", { name: "Søk etter bruker" }).fill("Saehter Ase");
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.goto("/admin/laerere?tab=soknader&q=Saehter%20Ase");
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

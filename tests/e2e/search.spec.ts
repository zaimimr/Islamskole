import { expect, test } from "playwright/test";
import { readFile } from "node:fs/promises";
import { db, loginAs, seedAdmin, seedFamily } from "./fixtures";

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
  await expect(page.locator(`a[href="/admin/elever/${family.students[0].id}"]`).first()).toBeVisible();
  await page.goto("/admin/familier");
  await page.getByRole("searchbox", { name: "Finn familie, foresatt eller barn" }).fill("Solbrexg Amira");
  await expect(page.locator(`a[href="/admin/familier/${family.id}"]`).first()).toBeVisible();
  await page.goto("/admin/betaling/logg?q=solberg%20amria");
  await page.getByText("Referanse og hendelser", { exact: true }).click();
  await expect(page.getByText(`ZZTEST-SEARCH-${family.id}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Søk etter familie/ }).click();
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: "Søk", exact: true }).fill("Solberg Amria");
  await expect(palette.getByText("ZZTEST Amira Solberg", { exact: true })).toBeVisible();
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

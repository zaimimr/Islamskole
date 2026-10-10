import { expect, test } from "playwright/test";
import path from "node:path";
import { db, loginAs, seedAdmin } from "./fixtures";

test("DNB imports bank sheets with their accounts and deduplicates a text export", async ({ page, context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  try {
    await page.goto("/admin/betaling/avstemming");
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({ path: ".impeccable/review/import-desktop.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".impeccable/review/import-mobile.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator("#import-source")).toHaveCount(0);
    await expect(page.locator("#import-account")).toHaveCount(0);
    await page.locator("#import-file").setInputFiles(path.resolve("tests/fixtures/dnb-workbook.xlsx"));
    await expect(page.getByRole("button", { name: "Importer 3 transaksjoner", exact: true })).toBeEnabled();
    await expect(page.getByText("DNB · 2 kontoer", { exact: true })).toBeVisible();
    const { count: beforeImport } = await db().from("import_batches").select("id", { count: "exact", head: true }).eq("created_by", admin.email);
    expect(beforeImport).toBe(0);
    await page.screenshot({ path: ".impeccable/review/import-preview-desktop.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".impeccable/review/import-preview-mobile.png", fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByText("Rader som ikke kan importeres (1)", { exact: true }).click();
    await expect(page.getByText(/Linje 5: ugyldig dato/)).toBeVisible();
    await page.getByRole("button", { name: "Importer 3 transaksjoner", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Importen er fullført" })).toBeVisible();
    await page.screenshot({ path: ".impeccable/review/import-result-mobile.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: ".impeccable/review/import-result-desktop.png", fullPage: true, animations: "disabled" });

    const { data: batch, error } = await db().from("import_batches")
      .select("id, source, account, row_count, inserted_count, skipped_count, errors")
      .eq("created_by", admin.email).single();
    expect(error).toBeNull();
    expect(batch).toMatchObject({ source: "dnb", account: null, row_count: 3, inserted_count: 3, skipped_count: 1 });
    expect(batch?.errors).toHaveLength(1);
    const { data: rows, error: rowsError } = await db().from("external_transactions")
      .select("source, account, amount, message, reference, suggested_status")
      .eq("import_batch_id", batch!.id).order("booked_on");
    expect(rowsError).toBeNull();
    expect(rows).toEqual([
      { source: "dnb", account: "12345678901", amount: 250000, message: "VIPPS MOBILEPAY AS", reference: null, suggested_status: "ignorert" },
      { source: "dnb", account: "98765432109", amount: -7550, message: "Husleie", reference: null, suggested_status: "ignorert" },
      { source: "dnb", account: "12345678901", amount: 20000, message: "Giro skolepenger · 1234", reference: "1234", suggested_status: null },
    ]);

    await page.getByRole("button", { name: "Importer en fil til", exact: true }).click();
    await page.locator("#import-file").setInputFiles(path.resolve("tests/fixtures/dnb-kontoinfo.txt"));
    await page.getByRole("button", { name: "Importer 1 transaksjon", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Importen er fullført" })).toBeVisible();
    const result = page.getByRole("status");
    await expect(result.getByText("Nye transaksjoner", { exact: true }).locator("+ dd")).toHaveText("0");
    await expect(result.getByText("Fantes fra før", { exact: true }).locator("+ dd")).toHaveText("1");
    const { data: duplicateBatch } = await db().from("import_batches")
      .select("inserted_count, duplicate_count").eq("created_by", admin.email)
      .order("created_at", { ascending: false }).limit(1).single();
    expect(duplicateBatch).toMatchObject({ inserted_count: 0, duplicate_count: 1 });
    await page.getByRole("button", { name: "Historikk", exact: true }).click();
    await expect(page.getByText("dnb-workbook.xlsx", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hent fra Vipps", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hent transaksjoner", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeFocused();
  } finally {
    const { data: batches } = await db().from("import_batches").select("id").eq("created_by", admin.email);
    const ids = (batches ?? []).map((batch) => batch.id);
    if (ids.length > 0) {
      const transactions = await db().from("external_transactions").delete().in("import_batch_id", ids);
      expect(transactions.error).toBeNull();
      const imports = await db().from("import_batches").delete().in("id", ids);
      expect(imports.error).toBeNull();
    }
  }
});

test("statement preview asks for a missing account and recovers from invalid input", async ({ page, context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/betaling/avstemming");
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await page.locator("#import-file").setInputFiles({
    name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from("Dato;Inn på konto\n01.09.2026;200\n"),
  });
  await expect(page.getByRole("textbox", { name: "Kontonummer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importer fil", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Kontonummer", exact: true }).fill("123");
  await page.getByRole("button", { name: "Les filen", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Kontonummeret må ha 11 siffer.");
  await page.getByRole("textbox", { name: "Kontonummer", exact: true }).fill("1234.56.78901");
  await page.getByRole("button", { name: "Les filen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Importer 1 transaksjon", exact: true })).toBeEnabled();
  await expect(page.locator("#import-account")).toHaveCount(0);
  const { count } = await db().from("import_batches").select("id", { count: "exact", head: true }).eq("created_by", admin.email);
  expect(count).toBe(0);
});

test("unrecognized files can be replaced with a detected Vipps export", async ({ page, context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/betaling/avstemming");
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await page.locator("#import-file").setInputFiles({
    name: "names.txt", mimeType: "text/plain", buffer: Buffer.from("Navn;Telefon\nSkole;123\n"),
  });
  await expect(page.getByRole("alert")).toContainText("Fant ingen transaksjonstabell");
  await page.locator("#import-file").setInputFiles(path.resolve("tests/fixtures/vipps-portal-export.csv"));
  await expect(page.getByRole("button", { name: "Importer 4 transaksjoner", exact: true })).toBeEnabled();
  await expect(page.getByText("Vipps · 3 salgssteder", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

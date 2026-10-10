import { expect, test } from "playwright/test";
import path from "node:path";
import { db, loginAs, seedAdmin } from "./fixtures";

test("DNB imports bank sheets with their accounts and deduplicates a text export", async ({ page, context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  try {
    await page.goto("/admin/betaling/avstemming");
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await page.locator("#import-source").click();
    await page.getByRole("option", { name: "DNB", exact: true }).click();
    await page.locator("#import-account").fill("");
    await page.locator("#import-file").setInputFiles(path.resolve("tests/fixtures/dnb-workbook.xlsx"));
    await page.getByRole("button", { name: "Last opp", exact: true }).click();
    await expect(page.getByText("3 nye av 3 transaksjoner", { exact: true })).toBeVisible();
    await expect(page.getByText("1 linjer kunne ikke leses", { exact: true })).toBeVisible();

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

    await page.locator("#import-file").setInputFiles(path.resolve("tests/fixtures/dnb-kontoinfo.txt"));
    await page.getByRole("button", { name: "Last opp", exact: true }).click();
    await expect(page.getByText("0 nye av 1 transaksjoner", { exact: true })).toBeVisible();
    await expect(page.getByText("1 fantes fra før", { exact: true }).first()).toBeVisible();
    const { data: duplicateBatch } = await db().from("import_batches")
      .select("inserted_count, duplicate_count").eq("created_by", admin.email)
      .order("created_at", { ascending: false }).limit(1).single();
    expect(duplicateBatch).toMatchObject({ inserted_count: 0, duplicate_count: 1 });
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

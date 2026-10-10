import { expect, test } from "playwright/test";
import fs from "node:fs";
import {
  activeYear,
  db,
  enroll,
  loginAs,
  pickOption,
  seedAdmin,
  seedClass,
  seedFamily,
  seedPayment,
  uid,
} from "./fixtures";

async function rows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

test.beforeEach(async ({ context }) => {
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
});

test("merge a paid application into a placed child after reviewing the balance", async ({
  page,
}) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({
    students: [{ firstName: "ZZTEST Samme", lastName: "Barn" }],
  });
  const child = family.students[0];
  await enroll(child.id, schoolClass.id, year.id, 500000);
  const payment = (
    await rows(
      db()
        .from("payments")
        .insert({
          reference: `ZZTEST-MERGE-${uid()}`,
          amount: 200000,
          captured_amount: 200000,
          status: "fanget",
          method: "kontant",
          school_year_id: year.id,
        })
        .select("id"),
    )
  )[0];
  const application = (
    await rows(
      db()
        .from("student_applications")
        .insert({
          family_id: family.id,
          child_first_name: child.firstName,
          child_last_name: child.lastName,
          child_birth_date: "2017-03-14",
          status: "ny",
          terms_accepted: true,
          payment_id: payment.id,
        })
        .select("id"),
    )
  )[0];
  await page.goto(`/admin/familier/${family.id}`);
  await page
    .getByRole("button", { name: "Slå sammen barn", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await pickOption(
    page,
    dialog,
    "Elev som beholdes",
    `${child.name} Registrert`,
  );
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await pickOption(
    page,
    dialog,
    "Duplikat som slås inn",
    `${child.name} Innmelding`,
  );
  await dialog.getByRole("button", { name: "Vis forhåndsvisning" }).click();
  await expect(dialog.getByText("3 000 kr", { exact: true })).toBeVisible();
  expect(
    await rows(
      db()
        .from("payment_allocations")
        .select("id")
        .eq("payment_id", payment.id),
    ),
  ).toHaveLength(0);
  fs.mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/child-merge-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: ".impeccable/review/child-merge-mobile.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Bekreft sammenslåing" }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await rows(
            db()
              .from("student_balances")
              .select("paid,remaining")
              .eq("student_id", child.id)
              .eq("school_year_id", year.id),
          )
        )[0],
    )
    .toEqual({ paid: 200000, remaining: 300000 });
  const merged = await rows(
    db()
      .from("student_applications")
      .select("status,merged_into_student_id")
      .eq("id", application.id),
  );
  expect(merged).toEqual([
    { status: "arkivert", merged_into_student_id: child.id },
  ]);
  expect(
    await rows(
      db().from("enrollments").select("class_id").eq("student_id", child.id),
    ),
  ).toEqual([{ class_id: schoolClass.id }]);
  await expect(page.getByRole("heading", { name: "Barn (1)" })).toBeVisible();
});

test("merge students keeps one tuition claim and both payments", async ({
  page,
}) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const family = await seedFamily({
    students: [
      { firstName: "ZZTEST Behold", lastName: "Barn" },
      { firstName: "ZZTEST Duplikat", lastName: "Barn" },
    ],
  });
  const [keep, source] = family.students;
  await enroll(keep.id, schoolClass.id, year.id, 500000);
  await rows(
    db()
      .from("student_fees")
      .insert({
        student_id: source.id,
        school_year_id: year.id,
        amount: 500000,
      })
      .select("id"),
  );
  const payment = await seedPayment(source.id, year.id, 200000);
  await page.goto(`/admin/familier/${family.id}`);
  await page
    .getByRole("button", { name: "Slå sammen barn", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await pickOption(page, dialog, "Elev som beholdes", keep.name);
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await pickOption(page, dialog, "Duplikat som slås inn", source.name);
  await dialog.getByRole("button", { name: "Vis forhåndsvisning" }).click();
  await expect(dialog.getByText("3 000 kr", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Bekreft sammenslåing" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await rows(db().from("students").select("id").eq("id", source.id)),
  ).toHaveLength(0);
  expect(
    await rows(
      db().from("student_fees").select("amount").eq("student_id", keep.id),
    ),
  ).toEqual([{ amount: 500000 }]);
  expect(
    await rows(db().from("payments").select("student_id").eq("id", payment)),
  ).toEqual([{ student_id: keep.id }]);
});

import { expect, test } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
import { activeYear, db, enroll, loginAs, pickOption, seedAdmin, seedClass, seedFamily, uid } from "./fixtures";
import { assertLocal, localSupabase } from "./env";

async function classState(classId: string, yearId: string) {
  const [schoolClass, enrollments] = await Promise.all([
    db().from("classes").select("capacity").eq("id", classId).single(),
    db().from("enrollments").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("school_year_id", yearId).eq("status", "aktiv"),
  ]);
  if (schoolClass.error || enrollments.error) throw schoolClass.error ?? enrollments.error;
  return { capacity: schoolClass.data.capacity, enrolled: enrollments.count };
}

test("admin expands full classes while placing, transferring and admitting a child on a phone", async ({ page, context }) => {
  test.setTimeout(150_000);
  const year = await activeYear();
  const source = await seedClass();
  const destination = await seedClass();
  const existing = await seedFamily({ students: [{}, {}] });
  await enroll(existing.students[0].id, source.id, year.id);
  await enroll(existing.students[1].id, destination.id, year.id);
  const capacities = await db().from("classes").update({ capacity: 1 }).in("id", [source.id, destination.id]);
  if (capacities.error) throw capacities.error;
  const family = await seedFamily();
  const student = family.students[0];
  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/admin/elever/${student.id}`);
  const placement = page.locator("section").filter({ has: page.getByRole("heading", { name: "Klasseplassering", exact: true }) });
  await placement.getByRole("button", { name: "Legg til plassering", exact: true }).click();
  await pickOption(page, placement, "Klasse", source.name);
  const newCapacity = placement.getByLabel("Ny kapasitet for klassen", { exact: true });
  await expect(newCapacity).toHaveValue("2");
  expect(await classState(source.id, year.id)).toEqual({ capacity: 1, enrolled: 1 });
  await placement.getByRole("button", { name: "Øk kapasitet og plasser", exact: true }).click();
  await expect.poll(() => classState(source.id, year.id)).toEqual({ capacity: 2, enrolled: 2 });

  await placement.getByRole("button", { name: "Bytt klasse", exact: true }).click();
  await pickOption(page, placement, "Ny klasse", destination.name);
  await expect(newCapacity).toHaveValue("2");
  expect(await classState(destination.id, year.id)).toEqual({ capacity: 1, enrolled: 1 });
  await placement.getByRole("button", { name: "Øk kapasitet og plasser", exact: true }).click();
  await expect.poll(() => classState(destination.id, year.id)).toEqual({ capacity: 2, enrolled: 2 });
  expect(await classState(source.id, year.id)).toEqual({ capacity: 2, enrolled: 1 });

  const applicationFamily = await seedFamily({ students: [] });
  const firstName = `ZZTEST Opptak ${uid()}`;
  const application = await db().from("student_applications").insert({
    family_id: applicationFamily.id,
    child_first_name: firstName,
    child_last_name: "Kapasitet",
    child_birth_date: "2017-03-14",
    desired_class: destination.name,
    status: "akseptert",
    terms_accepted: true,
  }).select("id").single();
  if (application.error) throw application.error;
  await page.goto(`/admin/register?status=alle&q=${encodeURIComponent(firstName)}`);
  await page.getByRole("button", { name: "Ta opp og plasser", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await pickOption(page, dialog, "Klasse", destination.name);
  await expect(dialog.getByLabel("Ny kapasitet for klassen", { exact: true })).toHaveValue("3");
  expect(await classState(destination.id, year.id)).toEqual({ capacity: 2, enrolled: 2 });
  await dialog.getByRole("button", { name: "Øk kapasitet og plasser", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => classState(destination.id, year.id)).toEqual({ capacity: 3, enrolled: 3 });
  const admitted = await db().from("students").select("id, family_id").eq("application_id", application.data.id).single();
  if (admitted.error) throw admitted.error;
  expect(admitted.data.family_id).toBe(applicationFamily.id);
  const enrollment = await db().from("enrollments").select("class_id, status").eq("student_id", admitted.data.id).eq("school_year_id", year.id).single();
  if (enrollment.error) throw enrollment.error;
  expect(enrollment.data).toEqual({ class_id: destination.id, status: "aktiv" });
});

test("simultaneous placements cannot both take the final class seat", async () => {
  const local = localSupabase();
  assertLocal(local);
  const year = await activeYear();
  const schoolClass = await seedClass();
  const capacity = await db().from("classes").update({ capacity: 1 }).eq("id", schoolClass.id);
  if (capacity.error) throw capacity.error;
  const family = await seedFamily({ students: [{}, {}] });
  const admin = await seedAdmin();
  const link = await db().auth.admin.generateLink({ type: "magiclink", email: admin.email });
  if (link.error) throw link.error;
  const client = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.verifyOtp({ email: admin.email, token: link.data.properties.email_otp, type: "magiclink" });
  if (session.error) throw session.error;
  const results = await Promise.all(family.students.map((child) => client.rpc("admin_place_student", {
    p_student: child.id, p_class: schoolClass.id, p_year: year.id,
  })));
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  const rejected = results.filter((result) => result.error);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].error?.message).toMatch(/full/i);
  expect(await classState(schoolClass.id, year.id)).toEqual({ capacity: 1, enrolled: 1 });
});

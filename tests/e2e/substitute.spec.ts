import { expect, test } from "playwright/test";
import {
  activeYear,
  assignTeacher,
  db,
  enroll,
  loginAs,
  pickOption,
  seedAdmin,
  seedClass,
  seedFamily,
  seedTeacher,
  uid,
} from "./fixtures";

function osloToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

async function seedToday(yearId: string) {
  const { data, error } = await db()
    .from("school_days")
    .upsert({ school_year_id: yearId, date: osloToday(), cancelled: false }, { onConflict: "school_year_id,date" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function attendanceOf(studentId: string, schoolDayId: string) {
  const { data, error } = await db()
    .from("attendance")
    .select("status")
    .eq("student_id", studentId)
    .eq("school_day_id", schoolDayId)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

async function seedClassWithStudent(yearId: string) {
  const schoolClass = await seedClass();
  const family = await seedFamily();
  const student = family.students[0];
  await enroll(student.id, schoolClass.id, yearId);
  return { schoolClass, student };
}

test.describe("substitutes and admin in class portal", () => {
  test("teacher makes themself substitute, marks attendance, writes a note and ends access", async ({ page, context }) => {
    const year = await activeYear();
    const dayId = await seedToday(year.id);
    const own = await seedClassWithStudent(year.id);
    const other = await seedClassWithStudent(year.id);
    const teacher = await seedTeacher();
    await assignTeacher(teacher.id, own.schoolClass.id, year.id);

    await loginAs(context, teacher.email);
    const before = await page.goto(`/min-side/klasse/${other.schoolClass.id}`);
    expect(before?.status()).toBe(404);

    await page.goto("/min-side");
    const picker = page.locator("form").filter({ hasText: "Vikar i en annen klasse" });
    await pickOption(page, picker, "Klasse", other.schoolClass.name);
    await picker.getByRole("button", { name: "Bli vikar" }).click();

    await expect(page).toHaveURL(new RegExp(`/min-side/klasse/${other.schoolClass.id}`));
    await expect(page.getByText(/Du er vikar i denne klassen/)).toBeVisible();

    await page.goto(`/min-side/klasse/${other.schoolClass.id}?dag=${dayId}`);
    const group = page.getByRole("group", { name: `Oppmøte for ${other.student.name}` });
    await group.getByRole("button", { name: "Møtt" }).click();
    await expect.poll(() => attendanceOf(other.student.id, dayId)).toBe("til_stede");

    const homework = `ZZTEST vikarlekse ${uid()}`;
    await page.getByLabel("Lekse").fill(homework);
    await page.getByRole("button", { name: "Lagre notat", exact: true }).click();
    await expect(page.getByText(/Lagret/)).toBeVisible();

    await page.getByRole("button", { name: "Avslutt vikartilgang" }).click();
    await expect(page).toHaveURL(/\/min-side$/);
    const response = await page.goto(`/min-side/klasse/${other.schoolClass.id}`);
    expect(response?.status()).toBe(404);
  });

  test("admin opens any class from admin and marks attendance", async ({ page, context }) => {
    const year = await activeYear();
    const dayId = await seedToday(year.id);
    const { schoolClass, student } = await seedClassWithStudent(year.id);
    const admin = await seedAdmin();

    await loginAs(context, admin.email);
    await page.goto(`/admin/klasser/${schoolClass.id}`);
    await page.getByRole("link", { name: "Oppmøte og notater" }).click();
    await expect(page).toHaveURL(new RegExp(`/min-side/klasse/${schoolClass.id}`));

    await page.goto(`/min-side/klasse/${schoolClass.id}?dag=${dayId}`);
    const group = page.getByRole("group", { name: `Oppmøte for ${student.name}` });
    await group.getByRole("button", { name: "Forsinket" }).click();
    await expect.poll(() => attendanceOf(student.id, dayId)).toBe("sent");
    await expect(page.getByRole("link", { name: "Tilbake til klassen i admin" })).toBeVisible();
  });
});

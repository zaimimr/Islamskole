import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type BrowserContext, type Locator, type Page } from "playwright/test";
import { OUTBOX_DIR, STATE_FILE, assertLocal, localSupabase } from "./env";

const supabase = localSupabase();
assertLocal(supabase);

let serviceClient: SupabaseClient | null = null;

export function db(): SupabaseClient {
  serviceClient ??= createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data`);
  return result.data;
}

export function sql(statement: string): string {
  return execFileSync("psql", [supabase.dbUrl, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", statement], {
    encoding: "utf8",
  }).trim();
}

let counter = 0;
export function uid() {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function zzEmail(label: string) {
  return `zztest-${label}-${uid()}@zztest.local`;
}

export type SchoolYear = { id: string; label: string; starts_on: string | null; ends_on: string | null };

export async function activeYear(): Promise<SchoolYear> {
  const rows = must(
    await db().from("school_years").select("id, label, starts_on, ends_on").eq("is_active", true),
    "active school year",
  ) as SchoolYear[];
  if (rows.length !== 1) throw new Error(`Expected exactly one active school year, found ${rows.length}`);
  return rows[0];
}

export async function seedSchoolYear(options: { startsOn: string; endsOn: string }): Promise<SchoolYear> {
  return must(
    await db()
      .from("school_years")
      .insert({
        label: `ZZTEST ${uid()}`,
        starts_on: options.startsOn,
        ends_on: options.endsOn,
        is_active: false,
      })
      .select("id, label, starts_on, ends_on")
      .single(),
    "insert school year",
  ) as SchoolYear;
}

export async function setActiveYear(yearId: string) {
  must(await db().from("school_years").update({ is_active: false }).eq("is_active", true).neq("id", yearId).select("id"), "deactivate years");
  must(await db().from("school_years").update({ is_active: true }).eq("id", yearId).select("id"), "activate year");
}

export type SeededClass = { id: string; name: string; slug: string };

export async function seedClass(options: { price?: number } = {}): Promise<SeededClass> {
  const suffix = uid();
  const name = `ZZTEST Klasse ${suffix}`;
  const row = must(
    await db()
      .from("classes")
      .insert({
        slug: `zztest-${suffix}`,
        name_no: name,
        name_en: name,
        age_min: 4,
        age_max: 16,
        capacity: 30,
        published: false,
        price: options.price ?? 300000,
      })
      .select("id, slug")
      .single(),
    "insert class",
  ) as { id: string; slug: string };
  return { id: row.id, slug: row.slug, name };
}

export type SeededGuardian = { id: string; firstName: string; lastName: string; email: string; phone: string; name: string };
export type SeededStudent = { id: string; firstName: string; lastName: string; name: string; childEmail: string | null };
export type SeededFamily = { id: string; displayName: string; guardians: SeededGuardian[]; students: SeededStudent[] };

type GuardianInput = { firstName?: string; lastName?: string; email?: string; phone?: string; isTeacher?: boolean };
type StudentInput = { firstName?: string; lastName?: string; birthDate?: string; childEmail?: string | null };

export async function seedGuardian(input: GuardianInput = {}): Promise<SeededGuardian> {
  const suffix = uid();
  const firstName = input.firstName ?? `ZZTEST Foresatt ${suffix}`;
  const lastName = input.lastName ?? "ZZTEST";
  const email = input.email ?? zzEmail("foresatt");
  const phone = input.phone ?? `9${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = must(
    await db()
      .from("guardians")
      .insert({ first_name: firstName, last_name: lastName, email, phone, is_teacher: input.isTeacher ?? false })
      .select("id")
      .single(),
    "insert guardian",
  ) as { id: string };
  return { id: row.id, firstName, lastName, email, phone, name: `${firstName} ${lastName}` };
}

export async function seedFamily(
  options: { guardians?: GuardianInput[]; students?: StudentInput[]; displayName?: string } = {},
): Promise<SeededFamily> {
  const displayName = options.displayName ?? `ZZTEST Familie ${uid()}`;
  const family = must(
    await db().from("families").insert({ display_name: displayName, origin: "manual" }).select("id").single(),
    "insert family",
  ) as { id: string };

  const guardians: SeededGuardian[] = [];
  for (const [index, input] of (options.guardians ?? [{}]).entries()) {
    const guardian = await seedGuardian(input);
    must(
      await db()
        .from("family_guardians")
        .insert({
          family_id: family.id,
          guardian_id: guardian.id,
          relationship_label: index === 0 ? "mor" : "far",
          is_primary_contact: index === 0,
          is_billing_contact: index === 0,
          sort_order: index,
        })
        .select("family_id"),
      "insert family guardian",
    );
    guardians.push(guardian);
  }

  const students: SeededStudent[] = [];
  for (const input of options.students ?? [{}]) {
    students.push(await seedStudent(family.id, input));
  }

  return { id: family.id, displayName, guardians, students };
}

export async function seedStudent(familyId: string, input: StudentInput = {}): Promise<SeededStudent> {
  const suffix = uid();
  const firstName = input.firstName ?? `ZZTEST Elev ${suffix}`;
  const lastName = input.lastName ?? "ZZTEST";
  const row = must(
    await db()
      .from("students")
      .insert({
        family_id: familyId,
        child_first_name: firstName,
        child_last_name: lastName,
        child_birth_date: input.birthDate ?? "2017-03-14",
        child_email: input.childEmail ?? null,
      })
      .select("id")
      .single(),
    "insert student",
  ) as { id: string };
  return { id: row.id, firstName, lastName, name: `${firstName} ${lastName}`, childEmail: input.childEmail ?? null };
}

export async function enroll(studentId: string, classId: string, yearId: string, fee = 300000) {
  must(
    await db()
      .from("enrollments")
      .insert({ student_id: studentId, class_id: classId, school_year_id: yearId, status: "aktiv", price_snapshot: fee })
      .select("id"),
    "insert enrollment",
  );
  must(
    await db()
      .from("student_fees")
      .upsert({ student_id: studentId, school_year_id: yearId, amount: fee }, { onConflict: "student_id,school_year_id" })
      .select("id"),
    "insert student fee",
  );
}

export async function assignTeacher(guardianId: string, classId: string, yearId: string) {
  must(await db().from("guardians").update({ is_teacher: true }).eq("id", guardianId).select("id"), "mark teacher");
  must(
    await db()
      .from("class_teachers")
      .upsert({ guardian_id: guardianId, class_id: classId, school_year_id: yearId }, { onConflict: "class_id,guardian_id,school_year_id" })
      .select("class_id"),
    "insert class teacher",
  );
}

export async function seedTeacher(input: GuardianInput = {}) {
  return seedGuardian({ firstName: `ZZTEST Lærer ${uid()}`, email: zzEmail("laerer"), ...input, isTeacher: true });
}

export async function seedPayment(studentId: string, yearId: string, amount: number) {
  const payment = must(
    await db()
      .from("payments")
      .insert({
        student_id: studentId,
        school_year_id: yearId,
        reference: `ZZTEST-${uid()}`,
        amount,
        status: "fanget",
        method: "kontant",
        paid_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        authorized_amount: amount,
        captured_amount: amount,
        payer_name: "ZZTEST Betaler",
      })
      .select("id")
      .single(),
    "insert payment",
  ) as { id: string };
  must(
    await db()
      .from("payment_allocations")
      .insert({ payment_id: payment.id, student_id: studentId, school_year_id: yearId, amount })
      .select("id"),
    "insert allocation",
  );
  return payment.id;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export type SchoolDay = { id: string; date: string };

export async function seedSchoolDays(year: SchoolYear, count: number): Promise<SchoolDay[]> {
  const start = year.starts_on ?? `${new Date().getUTCFullYear()}-08-01`;
  const startDow = new Date(`${start}T12:00:00Z`).getUTCDay();
  const firstSunday = addDays(start, (7 - startDow) % 7);
  const days: SchoolDay[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = addDays(firstSunday, 7 * (index + 1));
    const existing = must(
      await db().from("school_days").select("id").eq("school_year_id", year.id).eq("date", date),
      "find school day",
    ) as { id: string }[];
    if (existing.length) {
      days.push({ id: existing[0].id, date });
      continue;
    }
    const row = must(
      await db()
        .from("school_days")
        .insert({ school_year_id: year.id, date, note: "ZZTEST" })
        .select("id")
        .single(),
      "insert school day",
    ) as { id: string };
    days.push({ id: row.id, date });
  }
  return days;
}

export async function schoolDaysOf(yearId: string): Promise<{ id: string; date: string; cancelled: boolean }[]> {
  return must(
    await db().from("school_days").select("id, date, cancelled").eq("school_year_id", yearId).order("date"),
    "school days",
  ) as { id: string; date: string; cancelled: boolean }[];
}

export async function markAttendance(studentId: string, schoolDayId: string, status: string) {
  must(
    await db()
      .from("attendance")
      .upsert({ student_id: studentId, school_day_id: schoolDayId, status }, { onConflict: "student_id,lesson_id" })
      .select("student_id"),
    "insert attendance",
  );
}

export async function seedNote(classId: string, schoolDayId: string, homework: string) {
  must(
    await db()
      .from("class_notes")
      .insert({ class_id: classId, school_day_id: schoolDayId, homework, summary: `${homework} oppsummering` })
      .select("id"),
    "insert class note",
  );
}

export async function findAuthUser(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === target);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function ensureAuthUser(email: string, options: { admin?: boolean; fullName?: string } = {}) {
  let user = await findAuthUser(email);
  if (!user) {
    const { data, error } = await db().auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: options.admin ? "admin" : "member" },
      user_metadata: { full_name: options.fullName ?? "ZZTEST Bruker" },
    });
    if (error) throw error;
    user = data.user;
  }
  if (options.admin) {
    must(
      await db()
        .from("profiles")
        .upsert({ id: user.id, role: "admin", full_name: options.fullName ?? "ZZTEST Admin" })
        .select("id"),
      "admin profile",
    );
  }
  return user;
}

export async function seedAdmin(options: { email?: string; fullName?: string } = {}) {
  const email = options.email ?? zzEmail("admin");
  const fullName = options.fullName ?? `ZZTEST Admin ${uid()}`;
  const user = await ensureAuthUser(email, { admin: true, fullName });
  return { id: user.id, email, fullName };
}

export async function profileRole(email: string) {
  const user = await findAuthUser(email);
  if (!user) return null;
  const { data } = await db().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}

const CHUNK_SIZE = 3180;

export async function loginAs(context: BrowserContext, email: string) {
  await ensureAuthUser(email);
  const link = await db().auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const client = createClient(supabase.url, supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await client.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: "magiclink" });
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("no session");
  const session = verified.data.session;
  const payload = {
    access_token: session.access_token,
    token_type: "bearer",
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  };
  const value = "base64-" + Buffer.from(JSON.stringify(payload)).toString("base64url");
  const name = `sb-${new URL(supabase.url).hostname.split(".")[0]}-auth-token`;
  const base = { domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const };
  await context.clearCookies();
  if (value.length <= CHUNK_SIZE) {
    await context.addCookies([{ ...base, name, value }]);
    return;
  }
  const cookies = [];
  for (let index = 0; index * CHUNK_SIZE < value.length; index += 1) {
    cookies.push({ ...base, name: `${name}.${index}`, value: value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE) });
  }
  await context.addCookies(cookies);
}

export async function resetLoginThrottle() {
  sql("delete from public.portal_login_throttle");
}

export type OutboxMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  links: string[];
  file: string;
  mtimeMs: number;
};

function recipients(message: { to: string | string[] }) {
  return (Array.isArray(message.to) ? message.to : [message.to]).map((value) => value.toLowerCase());
}

export function readOutbox(email: string, since = 0): OutboxMessage | null {
  if (!fs.existsSync(OUTBOX_DIR)) return null;
  const target = email.toLowerCase();
  const messages: OutboxMessage[] = [];
  for (const file of fs.readdirSync(OUTBOX_DIR)) {
    if (!file.endsWith(".json")) continue;
    const full = path.join(OUTBOX_DIR, file);
    const mtimeMs = fs.statSync(full).mtimeMs;
    if (mtimeMs < since) continue;
    let parsed: Omit<OutboxMessage, "file" | "mtimeMs">;
    try {
      parsed = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!recipients(parsed).some((value) => value.includes(target))) continue;
    const links =
      parsed.links?.length
        ? parsed.links
        : [...(parsed.html ?? "").matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    messages.push({ ...parsed, links, file: full, mtimeMs });
  }
  messages.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return messages[0] ?? null;
}

export function loginLinkIn(message: OutboxMessage | null) {
  return message?.links.find((link) => link.includes("/min-side/auth/bekreft")) ?? null;
}

export async function waitForLoginLink(email: string, since: number) {
  await expect
    .poll(() => loginLinkIn(readOutbox(email, since)), {
      message: `login link email for ${email}`,
      timeout: 20_000,
    })
    .not.toBeNull();
  return loginLinkIn(readOutbox(email, since)) as string;
}

export function clearOutbox() {
  fs.rmSync(OUTBOX_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

export async function requestLoginLink(page: Page, email: string, loginPath = "/min-side/logg-inn") {
  await resetLoginThrottle();
  await page.goto(loginPath);
  await expect(page.getByRole("button", { name: /Send innloggingslenke|Send (sign-in|login) link/i })).toBeVisible();
  await page.waitForTimeout(2_300);
  await page.getByLabel(/^(E-post|Email)/).fill(email);
  await page.getByRole("button", { name: /Send innloggingslenke|Send (sign-in|login) link/i }).click();
}

export function rowWith(page: Page, text: string, container = "li") {
  return page.locator(container).filter({ hasText: text }).last();
}

export async function rowAction(page: Page, row: Locator, name: string | RegExp) {
  await row.waitFor();
  const direct = row.getByRole("button", { name, exact: typeof name === "string" });
  if (await direct.count()) {
    await direct.first().click();
    return;
  }
  await row.getByRole("button", { name: /^Flere valg/ }).first().click();
  await page.getByRole("menuitem", { name }).click();
}

export async function hasRowAction(page: Page, row: Locator, name: string) {
  await row.waitFor();
  if (await row.getByRole("button", { name, exact: true }).count()) return true;
  const menu = row.getByRole("button", { name: /^Flere valg/ });
  if (!(await menu.count())) return false;
  await menu.first().click();
  const openMenu = page.locator('[role="menu"][data-open]').last();
  await openMenu.waitFor();
  const found = (await openMenu.getByRole("menuitem", { name, exact: true }).count()) > 0;
  await page.keyboard.press("Escape");
  return found;
}

export async function confirmIfAsked(page: Page, name: RegExp) {
  const dialog = page.getByRole("alertdialog");
  try {
    await dialog.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }
  await dialog.getByRole("button", { name }).click();
}

export async function pickOption(page: Page, scope: Locator, label: string | RegExp, option: string) {
  const box = scope.getByRole("combobox", { name: label });
  await box.click();
  if (await box.evaluate((element) => element.tagName === "INPUT")) await box.fill(option);
  await page.getByRole("option", { name: option }).click();
}

export function toast(page: Page, text: string | RegExp) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}

const CLEANUP_SQL = `
begin;
create temp table zz_years on commit drop as
  select id from public.school_years where label like 'ZZTEST%';
create temp table zz_classes on commit drop as
  select id from public.classes where name_no like 'ZZTEST%' or slug like 'zztest%';
create temp table zz_guardians on commit drop as
  select id from public.guardians
  where lower(coalesce(email, '')) like '%@zztest.local'
     or coalesce(first_name, '') like 'ZZTEST%'
     or coalesce(last_name, '') like 'ZZTEST%';
create temp table zz_families on commit drop as
  select id from public.families where coalesce(display_name, '') like 'ZZTEST%'
  union select family_id from public.family_guardians where guardian_id in (select id from zz_guardians);
create temp table zz_students on commit drop as
  select id from public.students
  where coalesce(child_first_name, '') like 'ZZTEST%'
     or coalesce(child_last_name, '') like 'ZZTEST%'
     or lower(coalesce(child_email, '')) like '%@zztest.local'
     or family_id in (select id from zz_families);
create temp table zz_payments on commit drop as
  select id from public.payments
  where student_id in (select id from zz_students)
     or reference like 'ZZTEST%'
     or lower(coalesce(payer_email, '')) like '%@zztest.local'
     or id in (select payment_id from public.payment_allocations where student_id in (select id from zz_students));
delete from public.school_announcements where class_id in (select id from zz_classes) or school_year_id in (select id from zz_years) or created_by in (select id from auth.users where lower(email) like '%@zztest.local');
delete from public.refunds where payment_id in (select id from zz_payments) or student_id in (select id from zz_students);
delete from public.sadaqa_gifts where source_payment_id in (select id from zz_payments) or family_id in (select id from zz_families);
delete from public.payment_allocations where payment_id in (select id from zz_payments) or student_id in (select id from zz_students);
delete from public.payment_targets where payment_id in (select id from zz_payments) or student_id in (select id from zz_students);
delete from public.installments where student_id in (select id from zz_students) or payment_id in (select id from zz_payments);
delete from public.payment_plans where family_id in (select id from zz_families) or school_year_id in (select id from zz_years);
update public.student_applications set payment_id = null where payment_id in (select id from zz_payments);
delete from public.payments where id in (select id from zz_payments);
delete from public.student_fee_adjustments where student_id in (select id from zz_students) or school_year_id in (select id from zz_years);
delete from public.student_fees where student_id in (select id from zz_students) or school_year_id in (select id from zz_years);
delete from public.learning_goals where student_id in (select id from zz_students);
delete from public.absence_reports where student_id in (select id from zz_students);
delete from public.attendance where student_id in (select id from zz_students);
delete from public.class_notes where class_id in (select id from zz_classes);
delete from public.enrollments where student_id in (select id from zz_students) or class_id in (select id from zz_classes);
delete from public.student_guardians where student_id in (select id from zz_students);
update public.student_applications set merged_into_student_id = null where merged_into_student_id in (select id from zz_students);
delete from public.students where id in (select id from zz_students);
delete from public.student_applications
  where family_id in (select id from zz_families)
     or coalesce(child_first_name, '') like 'ZZTEST%'
     or lower(coalesce(mother_email, '')) like '%@zztest.local'
     or lower(coalesce(father_email, '')) like '%@zztest.local';
delete from public.family_data_reviews where family_id in (select id from zz_families);
delete from public.family_guardians where family_id in (select id from zz_families) or guardian_id in (select id from zz_guardians);
delete from public.families where id in (select id from zz_families);
delete from public.class_teachers where guardian_id in (select id from zz_guardians) or class_id in (select id from zz_classes) or school_year_id in (select id from zz_years);
delete from public.guardians where id in (select id from zz_guardians);
delete from public.teacher_applications where lower(email) like '%@zztest.local' or full_name like 'ZZTEST%';
delete from public.classes where id in (select id from zz_classes);
delete from public.attendance where school_day_id in (select id from public.school_days where note = 'ZZTEST' or school_year_id in (select id from zz_years));
delete from public.class_notes where school_day_id in (select id from public.school_days where note = 'ZZTEST' or school_year_id in (select id from zz_years));
delete from public.school_days where note = 'ZZTEST' or school_year_id in (select id from zz_years);
delete from public.school_years where id in (select id from zz_years) and not is_active;
alter table public.profiles disable trigger user;
delete from auth.users where lower(coalesce(email, '')) like '%@zztest.local';
alter table public.profiles enable trigger user;
commit;
`;

export function cleanupTestData() {
  sql(CLEANUP_SQL);
}

type E2EState = { originalActiveYearId: string | null; createdActiveYearId: string | null };

export function writeState(state: E2EState) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

export function readState(): E2EState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as E2EState;
  } catch {
    return null;
  }
}

export async function restoreActiveYear() {
  const state = readState();
  const active = must(await db().from("school_years").select("id, label").eq("is_active", true), "active years") as {
    id: string;
    label: string;
  }[];
  const onTestYear = active.length !== 1 || active[0].label.startsWith("ZZTEST");
  const target = state?.originalActiveYearId ?? state?.createdActiveYearId ?? null;
  if (onTestYear && target) await setActiveYear(target);
}

import { expect, test } from "playwright/test";
import { BASE_URL } from "./env";
import {
  activeYear,
  enroll,
  loginAs,
  readOutbox,
  requestLoginLink,
  seedAdmin,
  seedClass,
  seedFamily,
  seedTeacher,
  waitForLoginLink,
  zzEmail,
} from "./fixtures";

test.describe("magic link only login", () => {
  test("AUTH-17 /login redirects to Min side login and keeps next", async ({ page }) => {
    await page.goto("/login?next=%2Fadmin%2Fklasser");
    await expect(page).toHaveURL(/\/min-side\/logg-inn/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/klasser");
  });

  test("AUTH-17 /login/nytt-passord redirects to Min side login and keeps next", async ({ page }) => {
    await page.goto("/login/nytt-passord?next=%2Fadmin");
    await expect(page).toHaveURL(/\/min-side\/logg-inn/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
  });

  test("AUTH-18 signed out /admin ends on Min side login with next", async ({ page }) => {
    await page.goto("/admin/familier");
    await expect(page).toHaveURL(/\/min-side\/logg-inn/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/familier");
  });

  test("AUTH-17 no password field on any login page", async ({ page, context }) => {
    for (const path of ["/login", "/login/nytt-passord", "/min-side/logg-inn", "/en/min-side/logg-inn"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /Send innloggingslenke|Send (sign-in|login) link/i })).toBeVisible();
      await expect(page.locator('input[type="password"]'), path).toHaveCount(0);
    }
    const admin = await seedAdmin();
    await loginAs(context, admin.email);
    await page.goto("/admin/konto");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("AUTH-01 login page has one E-post field, the send button and a short intro", async ({ page }) => {
    await page.goto("/min-side/logg-inn");
    await expect(page.getByLabel(/^E-post/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send innloggingslenke" })).toBeVisible();
    await expect(page.locator("main")).toContainText(/innloggingslenke/i);
  });
});

test.describe("who gets a login link", () => {
  test("AUTH-17 admin email gets a login link", async ({ page }) => {
    const admin = await seedAdmin();
    const since = Date.now();
    await requestLoginLink(page, admin.email);
    await expect(page.getByText("Sjekk e-posten din")).toBeVisible();
    const link = await waitForLoginLink(admin.email, since);
    expect(link).toContain(`${BASE_URL}/min-side/auth/bekreft?`);
    expect(new URL(link).searchParams.get("token_hash")).toBeTruthy();
    expect(new URL(link).searchParams.get("type")).toBe("magiclink");
  });

  test("AUTH-01 guardian email gets a login link", async ({ page }) => {
    const family = await seedFamily();
    const since = Date.now();
    await requestLoginLink(page, family.guardians[0].email);
    await expect(page.getByText("Sjekk e-posten din")).toBeVisible();
    await waitForLoginLink(family.guardians[0].email, since);
  });

  test("AUTH-01 teacher without a family gets a login link", async ({ page }) => {
    const teacher = await seedTeacher();
    const since = Date.now();
    await requestLoginLink(page, teacher.email);
    await expect(page.getByText("Sjekk e-posten din")).toBeVisible();
    await waitForLoginLink(teacher.email, since);
  });

  test("NEW-STUDENT-LOGIN student child_email gets a login link", async ({ page }) => {
    const childEmail = zzEmail("elev");
    await seedFamily({ students: [{ childEmail }] });
    const since = Date.now();
    await requestLoginLink(page, childEmail);
    await expect(page.getByText("Sjekk e-posten din")).toBeVisible();
    await waitForLoginLink(childEmail, since);
  });

  test("SEC-10 unknown email gets the same message and no email", async ({ page }) => {
    const unknown = zzEmail("ukjent");
    const since = Date.now();
    await requestLoginLink(page, unknown);
    await expect(page.getByText("Sjekk e-posten din")).toBeVisible();
    await page.waitForTimeout(4_000);
    expect(readOutbox(unknown, since)).toBeNull();
  });
});

test.describe("following the link", () => {
  test("AUTH-17 admin lands on Dagplan", async ({ page, browser }) => {
    const admin = await seedAdmin();
    const since = Date.now();
    await requestLoginLink(page, admin.email);
    const link = await waitForLoginLink(admin.email, since);
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const tab = await fresh.newPage();
    await tab.goto(link);
    await expect(tab).toHaveURL(`${BASE_URL}/admin/dagsplan`);
    await fresh.close();
  });

  test("AUTH-01 parent lands on /min-side", async ({ page, browser }) => {
    const family = await seedFamily();
    const email = family.guardians[0].email;
    const since = Date.now();
    await requestLoginLink(page, email);
    const link = await waitForLoginLink(email, since);
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const tab = await fresh.newPage();
    await tab.goto(link);
    await expect(tab).toHaveURL(`${BASE_URL}/min-side`);
    await fresh.close();
  });

  test("AUTH-11 deep link next survives the round trip", async ({ page, browser }) => {
    const year = await activeYear();
    const schoolClass = await seedClass();
    const family = await seedFamily();
    await enroll(family.students[0].id, schoolClass.id, year.id);
    const email = family.guardians[0].email;
    const target = `/min-side/barn/${family.students[0].id}`;
    const since = Date.now();
    await requestLoginLink(page, email, `/min-side/logg-inn?next=${encodeURIComponent(target)}`);
    const link = await waitForLoginLink(email, since);
    expect(new URL(link).searchParams.get("next")).toBe(target);
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const tab = await fresh.newPage();
    await tab.goto(link);
    await expect(tab).toHaveURL(`${BASE_URL}${target}`);
    await fresh.close();
  });

  test("AUTH-11 unsafe next is ignored", async ({ page, browser }) => {
    const family = await seedFamily();
    const email = family.guardians[0].email;
    const since = Date.now();
    await requestLoginLink(page, email, `/min-side/logg-inn?next=${encodeURIComponent("//evil.example/x")}`);
    const link = await waitForLoginLink(email, since);
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const tab = await fresh.newPage();
    await tab.goto(link);
    await expect(tab).toHaveURL(`${BASE_URL}/min-side`);
    await fresh.close();
  });

  test("AUTH-10 link requested in English stays English", async ({ page, browser }) => {
    const family = await seedFamily();
    const email = family.guardians[0].email;
    const since = Date.now();
    await requestLoginLink(page, email, "/en/min-side/logg-inn");
    const link = await waitForLoginLink(email, since);
    expect(link.startsWith(`${BASE_URL}/en/min-side/auth/bekreft?`)).toBe(true);
    const fresh = await browser.newContext({ baseURL: BASE_URL });
    const tab = await fresh.newPage();
    await tab.goto(link);
    await expect(tab).toHaveURL(`${BASE_URL}/en/min-side`);
    await fresh.close();
  });
});

test.describe("links between admin and Min side", () => {
  test("AUTH-12 admin shell shows Min side for an admin who is also a guardian", async ({ page, context }) => {
    const email = zzEmail("admin-foresatt");
    await seedFamily({ guardians: [{ email }] });
    await seedAdmin({ email });
    await loginAs(context, email);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "Min side" }).first()).toBeVisible();
  });

  test("AUTH-12 Min side shows Administrasjon for admins", async ({ page, context }) => {
    const email = zzEmail("admin-foresatt");
    await seedFamily({ guardians: [{ email }] });
    await seedAdmin({ email });
    await loginAs(context, email);
    await page.goto("/min-side");
    await expect(page.getByRole("link", { name: /Administrasjon/ }).first()).toBeVisible();
  });
});

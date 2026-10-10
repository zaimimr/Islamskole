import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";
import {
  activeYear, db, enroll, ensureAuthUser, loginAs, rowAction, rowWith,
  seedAdmin, seedClass, seedFamily, sql, toast,
} from "./fixtures";

const ownerEmail = "zaim.imran@gmail.com";
const captureDir = path.join(process.cwd(), ".impeccable/review/impersonation");

async function capture(page: Page, name: string) {
  fs.mkdirSync(captureDir, { recursive: true });
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  const menu = page.getByRole("menu");
  if (await menu.count()) await expect(menu).toHaveCSS("opacity", "1");
  await page.screenshot({ path: path.join(captureDir, `${name}.png`), fullPage: true });
}

async function impersonate(page: Page, email: string) {
  await page.goto("/admin/brukere?rolle=alle");
  await page.getByRole("searchbox", { name: "Søk etter bruker" }).fill(email);
  await rowAction(page, rowWith(page, email), "Bruk som denne brukeren");
  await expect(page.getByRole("complementary", { name: "Brukerbytte" })).toContainText(email);
}

test.beforeAll(async () => {
  const owner = await ensureAuthUser(ownerEmail, { fullName: "Local developer" });
  const { error } = await db().from("profiles").update({ role: "developer" }).eq("id", owner.id);
  if (error) throw error;
});

test("developer acts as a guardian, respects family boundaries, audits writes and restores original session", async ({ page, context }) => {
  const family = await seedFamily();
  const otherFamily = await seedFamily();
  const schoolClass = await seedClass();
  const year = await activeYear();
  await enroll(family.students[0].id, schoolClass.id, year.id, 300000);
  await enroll(otherFamily.students[0].id, schoolClass.id, year.id, 300000);
  const target = await ensureAuthUser(family.guardians[0].email);
  await loginAs(context, ownerEmail);
  const original = (await context.cookies()).filter(({ name }) => name.startsWith("sb-"));
  await page.goto("/admin/brukere?rolle=alle");
  await page.getByRole("searchbox", { name: "Søk etter bruker" }).fill(target.email!);
  await rowWith(page, target.email!).getByRole("button", { name: `Flere valg for ${target.email}` }).click();
  await expect(page.getByRole("menuitem", { name: "Bruk som denne brukeren" })).toBeVisible();
  await capture(page, "developer-menu-desktop");
  await page.getByRole("menuitem", { name: "Bruk som denne brukeren" }).click();
  await expect(page.getByRole("complementary", { name: "Brukerbytte" })).toContainText(target.email!);
  const scopedCookies = (await context.cookies()).filter(({ name }) => name.startsWith("islamskole-impersonation"));
  expect(scopedCookies.length).toBeGreaterThan(1);
  expect(scopedCookies.every(({ httpOnly, sameSite }) => httpOnly && sameSite === "Lax")).toBe(true);
  expect((await context.cookies()).filter(({ name }) => name.startsWith("sb-")).map(({ name, value }) => ({ name, value })))
    .toEqual(original.map(({ name, value }) => ({ name, value })));

  await page.goto("/admin/brukere");
  await expect(page).toHaveURL(/\/min-side$/);
  await expect(page.getByRole("heading", { name: "Brukere og tilganger" })).toHaveCount(0);
  await page.goto(`/min-side/barn/${otherFamily.students[0].id}`);
  await expect(page.getByRole("heading", { name: otherFamily.students[0].name })).toHaveCount(0);
  await page.goto("/min-side/familie");
  await expect(page.getByTestId("family-child")).toContainText(family.students[0].name);
  await page.getByRole("button", { name: "Endre adresse" }).click();
  await page.getByLabel("Gateadresse").fill("ZZTEST Utviklergata 12");
  await page.getByLabel("Postnummer").fill("1350");
  await page.getByLabel("Poststed").fill("Lommedalen");
  await page.getByRole("button", { name: "Lagre", exact: true }).first().click();
  await expect(toast(page, "Adressen er lagret.")).toBeVisible();
  const audit = await db().from("audit_log").select("actor_email, metadata").eq("entity_id", family.id).eq("action", "portal.family.address").single();
  expect(audit.error).toBeNull();
  expect(audit.data?.actor_email).toBe(ownerEmail);
  expect(audit.data?.metadata.impersonated_user_id).toBe(target.id);
  expect(audit.data?.metadata.impersonated_email).toBe(target.email);
  await page.setViewportSize({ width: 1280, height: 900 });
  await capture(page, "guardian-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, "guardian-mobile");
  await page.goto("/en/min-side/familie");
  await expect(page.getByRole("button", { name: "Return to my account" })).toBeVisible();
  await page.getByRole("button", { name: "Return to my account" }).click();
  await expect(page).toHaveURL(/\/admin\/brukere$/);
  await expect(page.getByRole("complementary", { name: "Brukerbytte" })).toHaveCount(0);
  expect((await context.cookies()).filter(({ name }) => name.startsWith("islamskole-impersonation"))).toHaveLength(0);
  await expect.poll(async () => (await db().from("audit_log").select("id").eq("entity_id", target.id).eq("action", "user.impersonation_ended")).data?.length).toBe(1);
});

test("ordinary admin cannot use copied impersonation cookies or see the developer action", async ({ page, context, browser }) => {
  const family = await seedFamily();
  const target = await ensureAuthUser(family.guardians[0].email);
  await loginAs(context, ownerEmail);
  await impersonate(page, target.email!);
  const cookies = (await context.cookies()).filter(({ name }) => name.startsWith("islamskole-impersonation"));
  const ordinary = await seedAdmin();
  const other = await browser.newContext();
  await loginAs(other, ordinary.email);
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3100/admin/brukere?rolle=alle");
  await otherPage.getByRole("searchbox", { name: "Søk etter bruker" }).fill(target.email!);
  await rowWith(otherPage, target.email!).getByRole("button", { name: `Flere valg for ${target.email}` }).click();
  await expect(otherPage.getByRole("menuitem", { name: "Bruk som denne brukeren" })).toHaveCount(0);
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".next/dev/server/server-reference-manifest.json"), "utf8"));
  const actionId = Object.entries(manifest.node).find(([, entry]) => (entry as { exportedName?: string }).exportedName === "startImpersonation")?.[0];
  expect(actionId).toBeTruthy();
  const attempt = await other.request.post("http://localhost:3100/admin/brukere", {
    headers: { "Next-Action": actionId!, "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:3100" },
    data: JSON.stringify([target.id]),
  });
  expect(await attempt.text()).toContain("Bare utvikleren kan bytte bruker.");
  expect((await other.cookies()).some(({ name }) => name === "islamskole-impersonation")).toBe(false);
  await other.addCookies(cookies);
  await otherPage.goto("http://localhost:3100/min-side/familie");
  await expect(otherPage).toHaveURL(/logg-inn/);
  await expect(otherPage.getByTestId("family-child")).toHaveCount(0);
  await expect(otherPage.getByRole("complementary", { name: "Brukerbytte" })).toContainText("Brukerbyttet er avsluttet");
  await other.close();
  const otherOwnerSession = await browser.newContext();
  await loginAs(otherOwnerSession, ownerEmail);
  await otherOwnerSession.addCookies(cookies);
  const otherOwnerPage = await otherOwnerSession.newPage();
  await otherOwnerPage.goto("http://localhost:3100/min-side/familie");
  await expect(otherOwnerPage).toHaveURL(/logg-inn/);
  await expect(otherOwnerPage.getByTestId("family-child")).toHaveCount(0);
  await otherOwnerSession.close();
  await page.getByRole("button", { name: "Tilbake til min konto" }).click();
});

test("expiry fails closed, keeps the return control and preserves the real user's other sessions", async ({ page, context, browser }) => {
  const family = await seedFamily();
  const target = await ensureAuthUser(family.guardians[0].email);
  const realUser = await browser.newContext();
  await loginAs(realUser, target.email!);
  const realSessionCount = Number(sql(`select count(*) from auth.sessions where user_id = '${target.id}'`));
  expect(realSessionCount).toBeGreaterThan(0);
  const realPage = await realUser.newPage();
  await loginAs(context, ownerEmail);
  await impersonate(page, target.email!);
  const id = (await context.cookies()).find(({ name }) => name === "islamskole-impersonation")!.value;
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const startedAt = new Date(Date.now() - 3600000).toISOString();
  const { error } = await db().from("developer_impersonations").update({ started_at: startedAt, expires_at: expiredAt }).eq("id", id);
  if (error) throw error;
  await page.goto("/min-side/familie");
  await expect(page).toHaveURL(/logg-inn/);
  await expect(page.getByRole("complementary", { name: "Brukerbytte" })).toContainText("Brukerbyttet er avsluttet");
  await page.getByRole("button", { name: "Tilbake til min konto" }).click();
  await expect(page).toHaveURL(/\/admin\/brukere$/);
  expect(Number(sql(`select count(*) from auth.sessions where user_id = '${target.id}'`))).toBe(realSessionCount);
  await realPage.goto("http://localhost:3100/min-side/familie");
  await expect(realPage.getByRole("heading", { name: "Min familie", exact: true })).toBeVisible();
  await realUser.close();
});

test("admin impersonation audits server actions and cannot start another impersonation", async ({ page, context }) => {
  const target = await seedAdmin();
  const another = await seedAdmin();
  await loginAs(context, ownerEmail);
  await impersonate(page, target.email);
  await page.goto("/admin/brukere?rolle=alle");
  await page.getByRole("searchbox", { name: "Søk etter bruker" }).fill(another.email);
  const row = rowWith(page, another.email);
  await row.getByRole("button", { name: `Flere valg for ${another.email}` }).click();
  await expect(page.getByRole("menuitem", { name: "Bruk som denne brukeren" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Gjør til lærer" }).click();
  await expect.poll(async () => (await db().from("audit_log").select("actor_email, metadata").eq("action", "teacher.registered").contains("metadata", { from_user: another.id })).data?.map((row) => ({ actor: row.actor_email, target: row.metadata.impersonated_user_id })))
    .toEqual([{ actor: ownerEmail, target: target.id }]);
  await page.goto("/admin/aktiviteter/ny");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Last opp bilde" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "test.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64"),
  });
  await expect(toast(page, "Bilde lastet opp")).toBeVisible();
  const url = await page.locator('input[name="image_url"]').inputValue();
  const objectPath = new URL(url).pathname.split("/object/public/media/")[1];
  expect(objectPath).toBeTruthy();
  const { error: cleanupError } = await db().storage.from("media").remove([objectPath]);
  expect(cleanupError).toBeNull();
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".next/dev/server/server-reference-manifest.json"), "utf8"));
  const mediaActionId = Object.entries(manifest.node).find(([, entry]) => (entry as { exportedName?: string }).exportedName === "createMediaUpload")?.[0];
  expect(mediaActionId).toBeTruthy();
  await page.getByRole("button", { name: "Tilbake til min konto" }).click();
  await expect(page).toHaveURL(/\/admin\/brukere$/);
  const family = await seedFamily();
  await ensureAuthUser(family.guardians[0].email);
  await impersonate(page, family.guardians[0].email);
  const denied = await context.request.post("http://localhost:3100/admin/aktiviteter/ny", {
    headers: { "Next-Action": mediaActionId!, "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:3100" },
    data: JSON.stringify(["d4000000-0000-4000-8000-000000000041.png"]),
  });
  const response = await denied.text();
  expect(response).toContain('"ok":false');
  expect(response).not.toContain('"token":');
  await page.getByRole("button", { name: "Tilbake til min konto" }).click();
  await expect(page).toHaveURL(/\/admin\/brukere$/);
});

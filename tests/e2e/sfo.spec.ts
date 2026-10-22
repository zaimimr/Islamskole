import { expect, test } from "playwright/test";
import { activeYear, db, enroll, grantRole, loginAs, seedAdmin, seedClass, seedFamily, seedGuardian } from "./fixtures";

function osloDate(days: number) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test("SFO staff publish a paid trip, parents sign up with health check, cash is registered and cancellation refunds", async ({ page, context }) => {
  const year = await activeYear();
  const schoolClass = await seedClass();
  const { error: classError } = await db().from("classes").update({ published: true }).eq("id", schoolClass.id);
  if (classError) throw classError;
  const family = await seedFamily({ students: [{}, {}] });
  for (const student of family.students) await enroll(student.id, schoolClass.id, year.id);
  const { error: healthError } = await db().from("students").update({ allergies: "ZZTEST Nøtter", health_updated_at: null }).eq("id", family.students[0].id);
  if (healthError) throw healthError;
  const staff = await seedGuardian();
  await grantRole(staff.id, "sfo");
  const title = `ZZTEST Tur ${Date.now()}`;

  await loginAs(context, staff.email);
  await page.goto("/admin/elever");
  await expect(page).toHaveURL(/\/admin\/sfo$/);
  await page.getByRole("link", { name: "Ny SFO-aktivitet" }).click();
  await page.getByRole("button", { name: "Publiser", exact: true }).click();
  await expect(page.getByText("Skriv en tittel")).toBeVisible();
  await expect(page.getByText("Velg dato")).toBeVisible();
  await expect(page.getByLabel("Tittel")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Tittel").fill(title);
  await expect(page.getByText("Skriv en tittel")).toHaveCount(0);
  await page.getByLabel("Dato").fill(osloDate(3));
  await page.getByLabel("Svarfrist").fill(osloDate(5));
  await expect(page.getByText("Må være før eller på datoen")).toBeVisible();
  await page.getByLabel("Dato").fill(osloDate(7));
  await page.getByLabel("Svarfrist").fill(osloDate(3));
  await page.getByLabel("Sted", { exact: true }).fill("ZZTEST Fornebu");
  await page.getByLabel("Maks plasser", { exact: true }).fill("1");
  await page.getByLabel("Pris (kr)", { exact: true }).fill("150");
  await page.getByLabel(schoolClass.name, { exact: true }).check();
  await page.getByLabel("Krever samtykke", { exact: true }).uncheck();
  await page.getByLabel("Vis på nettsiden", { exact: true }).check();
  await page.getByRole("button", { name: "Publiser", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sfo\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Publisert", { exact: true })).toBeVisible();
  const activityId = page.url().split("/").pop()!;
  const { count: invitations } = await db().from("school_email_deliveries").select("id", { count: "exact", head: true }).eq("kind", "activity_consent").eq("entity_id", activityId);
  expect(invitations).toBeGreaterThan(0);

  await page.goto("/aktiviteter");
  const card = page.getByRole("article").filter({ hasText: title });
  await expect(card.getByText("150 kr · 1 plass igjen")).toBeVisible();
  await expect(card.getByRole("link", { name: "Meld på" })).toHaveAttribute("href", /\/min-side\/logg-inn\?next=/);

  await loginAs(context, family.guardians[0].email);
  await page.goto(`/min-side/barn/${family.students[0].id}`);
  const activities = page.getByRole("region", { name: "Aktiviteter og samtykke", exact: true });
  const item = activities.getByRole("article").filter({ hasText: title });
  await expect(item.getByText("ZZTEST Fornebu", { exact: false })).toBeVisible();
  await item.getByRole("button", { name: "Deltar", exact: true }).click();
  await expect(item.getByText("Stemmer dette?")).toBeVisible();
  await expect(item.getByText("Allergier: ZZTEST Nøtter")).toBeVisible();
  await item.getByRole("button", { name: "Ja, deltar", exact: true }).click();
  await expect(item.getByRole("status")).toHaveText("Svar lagret");
  await expect(item.getByRole("button", { name: "Deltar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await item.getByRole("button", { name: /Betal 150/ }).click();
  await expect(item.getByText("Kunne ikke starte Vipps. Prøv igjen senere.")).toBeVisible();
  const { count: openPayments } = await db().from("activity_payment_targets").select("payment_id", { count: "exact", head: true }).eq("activity_id", activityId);
  expect(openPayments).toBe(0);

  await page.goto(`/min-side/barn/${family.students[1].id}`);
  const sibling = activities.getByRole("article").filter({ hasText: title });
  await expect(sibling.getByText("Fullt", { exact: true })).toBeVisible();
  await expect(sibling.getByRole("button", { name: "Deltar", exact: true })).toBeDisabled();

  await loginAs(context, staff.email);
  await page.goto(`/admin/sfo/${activityId}`);
  const roster = page.getByRole("region", { name: "Deltakere" });
  await expect(roster.getByText("Deltar: 1 / 1 · Deltar ikke: 0")).toBeVisible();
  await expect(roster.getByText("ZZTEST Nøtter", { exact: false })).toHaveCount(1);
  const payments = page.getByRole("region", { name: "Betaling" });
  await expect(payments.getByText("Mangler: 1")).toBeVisible();
  await payments.getByRole("button", { name: "Registrer kontant" }).click();
  await expect(payments.getByRole("status")).toHaveText("Kontant registrert");
  await expect(payments.getByText("Mangler: 0")).toBeVisible();

  const admin = await seedAdmin();
  await loginAs(context, admin.email);
  await page.goto("/admin/aktiviteter");
  await expect(page.getByRole("region", { name: "Kommende og uten dato" }).getByRole("listitem").filter({ hasText: title }).getByRole("link", { name: "Åpne" })).toHaveAttribute("href", `/admin/sfo/${activityId}`);
  await page.goto("/admin/betaling/sadaqa?kilde=aktivitet");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await loginAs(context, staff.email);
  await page.goto(`/admin/sfo/${activityId}`);
  await page.getByRole("button", { name: "Avlys aktivitet" }).click();
  await page.getByLabel("Full", { exact: true }).check();
  await page.getByRole("button", { name: "Avlys og varsle påmeldte" }).click();
  await expect(page.getByText("Avlyst", { exact: true })).toBeVisible();
  const { data: deliveries, error: deliveryError } = await db().from("school_email_deliveries").select("email").eq("kind", "activity_cancelled").eq("entity_id", activityId);
  if (deliveryError) throw deliveryError;
  expect(deliveries.map((row) => row.email)).toContain(family.guardians[0].email.toLowerCase());

  await loginAs(context, admin.email);
  await page.goto(`/admin/sfo/${activityId}`);
  await expect(page.getByRole("region", { name: "Tilbakebetaling" }).getByText("Betalt 150 kr · Tilbake 150 kr")).toBeVisible();
});

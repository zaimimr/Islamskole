import { addCalendarDays } from "../src/lib/dates.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { onboardingGuide, schoolEmailContent } from "../src/lib/school-emails/content.ts";

test("parent onboarding explains passwordless access and family tasks in both languages", () => {
  for (const locale of ["no", "en"]) {
    const guide = onboardingGuide(locale, "parent");
    assert.equal(guide.items.length, 6);
    assert.match(guide.login, locale === "en" ? /do not need a password/ : /trenger ikke passord/);
    assert.ok(guide.items.some((item) => item.href === "/min-side/okonomi"));
    assert.ok(guide.items.some((item) => item.href === "/min-side/familie"));
    assert.ok(guide.items.some((item) => /consent|samtykke/.test(item.text)));
  }
});

test("student onboarding contains learning tasks without parent payment or consent controls", () => {
  for (const locale of ["no", "en"]) {
    const guide = onboardingGuide(locale, "student");
    assert.equal(guide.items.length, 3);
    assert.ok(guide.items.every((item) => !/okonomi|familie|beskjeder/.test(item.href)));
    assert.match(guide.login, /e-post|email/);
  }
});

test("signup confirmation does not promise admission, successful payment or immediate portal access", () => {
  for (const kind of ["signup_parent", "signup_student"]) {
    for (const locale of ["no", "en"]) {
      const email = schoolEmailContent({ kind, locale, names: ["Amina", "Yusuf"] });
      assert.match(email.intro, /Amina, Yusuf/);
      assert.match(email.intro, /ikke en bekreftelse|does not confirm/);
      assert.equal(email.href, null);
      assert.match(email.note, /tilgangen er klar|access is ready/);
    }
  }
});

test("parent and student welcome emails link to the passwordless login page", () => {
  for (const kind of ["welcome_parent", "welcome_student"]) {
    const email = schoolEmailContent({ kind, locale: "no", names: ["Amina"] });
    assert.equal(email.href, "/min-side/logg-inn");
    assert.match(email.intro, /Amina/);
    assert.match(email.intro, /trenger ikke passord/);
    assert.equal(email.rows.length, kind === "welcome_parent" ? 6 : 3);
  }
});

test("installment confirmation lists the agreed dates and amounts without inventing a payment outcome", () => {
  const email = schoolEmailContent({ kind: "plan_confirmed", locale: "en", names: ["Amina"], schedule: [
    { date: "15 October 2026", amount: "500 kr" }, { date: "15 November 2026", amount: "700 kr" },
  ] });
  assert.deepEqual(email.rows, [["15 October 2026", "500 kr"], ["15 November 2026", "700 kr"]]);
  assert.equal(email.href, "/min-side/okonomi");
  assert.match(email.intro, /before each due date/);
});

test("installment notices use the existing payment checkout and preserve locale", () => {
  for (const locale of ["no", "en"]) {
    for (const kind of ["installment_due", "installment_reminder"]) {
      const email = schoolEmailContent({ kind, locale, names: ["Amina"], amount: "500 kr", dueDate: "15 October", paymentId: "payment-id" });
      assert.equal(email.href, `/api/vipps/pay/payment-id?locale=${locale}`);
      assert.equal(email.rows[0][1], "500 kr");
      assert.equal(email.rows[1][1], "15 October");
      if (kind === "installment_reminder") assert.match(email.subject, /Reminder|Påminnelse/);
    }
  }
});

test("general payment reminders link to family economy and show amount and due date", () => {
  const email = schoolEmailContent({ kind: "payment_reminder", locale: "no", names: ["Amina"], amount: "900 kr", dueDate: "15. oktober" });
  assert.equal(email.href, "/min-side/okonomi");
  assert.deepEqual(email.rows, [["Beløp", "900 kr"], ["Betalingsfrist", "15. oktober"]]);
});

test("payment deadlines cross month and year boundaries safely", () => {
  assert.equal(addCalendarDays("2026-12-25", 14), "2027-01-08");
  assert.equal(addCalendarDays("2028-02-20", 14), "2028-03-05");
});

test("SFO activity emails cover change, reminders and refunds", () => {
  const base = { locale: "no", names: ["Ali"], activitySfo: true, activityTitle: "Tur", activityDate: "1. november 2026", activityDeadline: "28. oktober 2026", activityStudentId: "s1", activityTime: "10:00–12:00", activityLocation: "Fornebu" };
  const changed = schoolEmailContent({ ...base, kind: "activity_changed", activityPrevious: "31. oktober 2026" });
  assert.equal(changed.subject, "Endring i aktivitet");
  assert.deepEqual(changed.rows.at(-1), ["Før", "31. oktober 2026"]);
  assert.equal(changed.href, "/min-side/barn/s1#activities");
  const payment = schoolEmailContent({ ...base, kind: "activity_payment_reminder", amount: "150 kr", dueDate: "30. oktober 2026" });
  assert.deepEqual(payment.rows[0], ["Beløp", "150 kr"]);
  const reminder = schoolEmailContent({ ...base, kind: "activity_respond_reminder", activityNeedsConsent: false });
  assert.equal(reminder.subject, "Påminnelse om påmelding");
  assert.doesNotMatch(reminder.intro, /samtykke/);
  const consent = schoolEmailContent({ ...base, kind: "activity_consent", activityNeedsConsent: true, locale: "en" });
  assert.equal(consent.subject, "New activity");
  assert.match(consent.intro, /consent/);
  const cancelled = schoolEmailContent({ ...base, kind: "activity_cancelled", activityRefund: "" });
  assert.deepEqual(cancelled.rows.at(-1), ["Tilbakebetaling per barn", "Ingen"]);
  const classCancelled = schoolEmailContent({ ...base, activitySfo: false, kind: "activity_cancelled" });
  assert.equal(classCancelled.subject, "Skoleaktivitet avlyst");
});

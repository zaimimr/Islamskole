import assert from "node:assert/strict";
import test from "node:test";
import {
  autoRequestDue,
  describeRequest,
  latestRequestByStudent,
  nextAutoStep,
  planBulkRequests,
  supersedeAction,
  uncoveredRemaining,
  reminderDue,
  splitAcross,
} from "../src/lib/payment-request-state.ts";
import { allocatePayment } from "../src/lib/payment-ledger.ts";

const request = (overrides = {}) => ({
  paymentId: "p1",
  amount: 500000,
  status: "opprettet",
  sentAt: "2026-11-01T10:00:00Z",
  lastSentAt: "2026-11-01T10:00:00Z",
  dueDate: "2026-11-15",
  reminderCount: 0,
  studentIds: ["s1"],
  fromPlan: false,
  sent: true,
  ...overrides,
});

const owing = { owed: 500000, paid: 0, remaining: 500000 };

test("paid and exempt children never look like they owe", () => {
  assert.equal(describeRequest({ owed: 0, paid: 0, remaining: 0 }, null, "2026-11-01").kind, "fritatt");
  assert.equal(describeRequest({ owed: 500000, paid: 500000, remaining: 0 }, request(), "2026-11-01").kind, "betalt");
});

test("expired request reads as not paid with a resend path", () => {
  const view = describeRequest(owing, request({ status: "avbrutt" }), "2026-11-02");
  assert.equal(view.label, "Utløpt, ikke betalt");
  assert.equal(view.kind, "utlopt");
});

test("request past its due date is overdue", () => {
  assert.equal(describeRequest(owing, request(), "2026-11-20").kind, "forfalt");
  assert.equal(describeRequest(owing, request(), "2026-11-10").kind, "sendt");
});

test("partial payment without request shows amount of total", () => {
  const view = describeRequest({ owed: 500000, paid: 200000, remaining: 300000 }, null, "2026-11-01");
  assert.equal(view.kind, "delvis");
  assert.match(view.label, /2\s000 av 5\s000 kr/);
});

test("latest request wins per student", () => {
  const map = latestRequestByStudent([
    request({ paymentId: "old", sentAt: "2026-10-01T00:00:00Z" }),
    request({ paymentId: "new", sentAt: "2026-10-20T00:00:00Z" }),
  ]);
  assert.equal(map.get("s1").paymentId, "new");
});

test("automatic krav waits until the lead window opens", () => {
  assert.deepEqual(autoRequestDue(["2026-12-15"], "2026-11-01", "2026-11-15"), {
    send: false,
    dueDate: "2026-12-15",
  });
  assert.deepEqual(autoRequestDue(["2026-11-10"], "2026-11-01", "2026-11-15"), {
    send: true,
    dueDate: "2026-11-10",
  });
  assert.deepEqual(autoRequestDue([null], "2026-11-01", "2026-11-15"), { send: true, dueDate: null });
});

test("family amount is split without exceeding any child's balance", () => {
  assert.deepEqual(
    splitAcross(400000, [
      { studentId: "a", remaining: 300000 },
      { studentId: "b", remaining: 300000 },
    ]),
    [
      { studentId: "a", amount: 300000 },
      { studentId: "b", amount: 100000 },
    ],
  );
});

test("reminders respect interval and cap", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  assert.equal(reminderDue(request(), now, 7, 3), true);
  assert.equal(reminderDue(request(), now, 10, 3), false);
  assert.equal(reminderDue(request({ reminderCount: 3 }), now, 7, 3), false);
  assert.equal(reminderDue(request({ status: "autorisert" }), now, 7, 3), false);
});

test("next automatic step", () => {
  const base = {
    enabled: true,
    paused: false,
    onPlan: false,
    remaining: 500000,
    request: null,
    reminderDays: 7,
    maxReminders: 3,
    firstDueDate: "2026-12-15",
    leadDays: 14,
  };
  assert.equal(nextAutoStep(base, "2026-11-01"), "Krav 1. des");
  assert.equal(nextAutoStep({ ...base, paused: true }, "2026-11-01"), "Pause");
  assert.equal(nextAutoStep({ ...base, enabled: false }, "2026-11-01"), null);
  assert.equal(nextAutoStep({ ...base, request: request() }, "2026-11-01"), "Påminnelse 8. nov");
  assert.equal(nextAutoStep({ ...base, request: request({ reminderCount: 3 }) }, "2026-11-01"), "Ingen flere påminnelser");
  assert.equal(nextAutoStep({ ...base, remaining: 0 }, "2026-11-01"), null);
});

test("allocatePayment calls the rpc bound to the client", async () => {
  const client = {
    rest: { ok: true },
    async rpc(name, args) {
      assert.equal(this.rest.ok, true);
      assert.equal(name, "replace_payment_allocations");
      assert.equal(args.p_payment_id, "p1");
      return { data: 2, error: null };
    },
  };
  assert.equal(await allocatePayment(client, "p1"), 2);
});

test("allocatePayment surfaces rpc errors", async () => {
  const client = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  await assert.rejects(allocatePayment(client, "p1"), /boom/);
});

const member = (overrides = {}) => ({
  studentId: "s1",
  familyId: "f1",
  active: true,
  paused: false,
  onPlan: false,
  remaining: 500000,
  request: null,
  ...overrides,
});

const bulkOptions = { now: new Date("2026-11-03T10:00:00Z"), reminderDays: 7 };

test("bulk krav skips paused, plan, inactive and in-flight families", () => {
  const plan = planBulkRequests(
    [
      member({ studentId: "a1", familyId: "fa" }),
      member({ studentId: "a2", familyId: "fa" }),
      member({ studentId: "p1", familyId: "fp", paused: true }),
      member({ studentId: "o1", familyId: "fo", onPlan: true }),
      member({ studentId: "i1", familyId: "fi", active: false }),
      member({ studentId: "w1", familyId: "fw", request: request({ paymentId: "w", status: "autorisert" }) }),
      member({ studentId: "z1", familyId: "fz", remaining: 0 }),
    ],
    bulkOptions,
  );
  assert.deepEqual(plan.create, [["a1", "a2"]]);
  assert.deepEqual(plan.resend, []);
  assert.equal(plan.skipped, 3);
});

test("bulk krav bills siblings the open krav does not cover", () => {
  const plan = planBulkRequests(
    [
      member({ studentId: "z1", familyId: "fr", request: request({ paymentId: "x" }) }),
      member({ studentId: "z2", familyId: "fr" }),
      member({ studentId: "z3", familyId: "fr" }),
    ],
    bulkOptions,
  );
  assert.deepEqual(plan.create, [["z2", "z3"]]);
  assert.deepEqual(plan.resend, []);
});

test("bulk reminders only for krav past the reminder interval or expired", () => {
  const old = { sentAt: "2026-10-20T10:00:00Z", lastSentAt: "2026-10-20T10:00:00Z" };
  const plan = planBulkRequests(
    [
      member({ studentId: "a1", familyId: "fa", request: request({ paymentId: "recent" }) }),
      member({ studentId: "b1", familyId: "fb", request: request({ paymentId: "due", ...old }) }),
      member({ studentId: "c1", familyId: "fc", request: request({ paymentId: "exp", status: "avbrutt" }) }),
      member({ studentId: "d1", familyId: "fd", onPlan: true, request: request({ paymentId: "plan", ...old }) }),
    ],
    bulkOptions,
  );
  assert.deepEqual(plan.resend.sort(), ["due", "exp", "plan"]);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.skipped, 1);
});

test("after sending, nothing is left to bulk send", () => {
  const plan = planBulkRequests(
    [
      member({ studentId: "a1", familyId: "fa", request: request({ paymentId: "x", lastSentAt: "2026-11-03T09:00:00Z" }) }),
      member({ studentId: "a2", familyId: "fa", request: request({ paymentId: "x", lastSentAt: "2026-11-03T09:00:00Z" }) }),
    ],
    bulkOptions,
  );
  assert.deepEqual(plan, { create: [], resend: [], skipped: 1 });
});

test("uncovered amount counts only children without a krav", () => {
  assert.equal(
    uncoveredRemaining([
      { remaining: 300000, request: request() },
      { remaining: 300000, request: null },
      { remaining: 300000, request: null },
    ]),
    600000,
  );
});

test("krav label shows the krav amount and reminders", () => {
  const view = describeRequest(
    { owed: 900000, paid: 0, remaining: 900000 },
    request({ amount: 150000 }),
    "2026-11-02",
  );
  assert.match(view.label, /^Krav 1.500 kr sendt/);
  const reminded = describeRequest(owing, request({ reminderCount: 1 }), "2026-11-02");
  assert.match(reminded.label, /^Påminnelse sendt/);
});

test("a parent-started payment that was never emailed shows as a link, not a sent krav", () => {
  const view = describeRequest(owing, request({ sent: false }), "2026-11-02");
  assert.equal(view.kind, "lenke");
  assert.match(view.label, /^Lenke laget/);
});

test("a replaced krav is only voided when Vipps confirms nothing is paid", () => {
  assert.equal(supersedeAction(null), "keep");
  assert.equal(supersedeAction({ state: "AUTHORIZED", capturedAmount: 0 }), "keep");
  assert.equal(supersedeAction({ state: "CAPTURED", capturedAmount: 500000 }), "keep");
  assert.equal(supersedeAction({ state: "TERMINATED", capturedAmount: 100 }), "keep");
  assert.equal(supersedeAction({ state: "CREATED", capturedAmount: 0 }), "cancel");
  assert.equal(supersedeAction({ state: "EXPIRED", capturedAmount: 0 }), "void");
  assert.equal(supersedeAction({ state: "ABORTED", capturedAmount: 0 }), "void");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseDayStatus,
  findDoubleBookings,
  joinTeacherNames,
  lessonTitle,
  mergeWithNext,
  needsSubstitute,
  planCells,
  slotRangeLabel,
  slotRangeTimes,
  splitPlan,
  statusByDay,
  validatePlans,
  validateSlots,
} from "../src/lib/lessons.ts";

const SLOTS = [
  { position: 1, label: "Time 1", starts_at: "10:00:00", ends_at: "11:00:00" },
  { position: 2, label: "Time 2", starts_at: "11:00:00", ends_at: "12:00:00" },
  { position: 3, label: "Time 3", starts_at: "13:00:00", ends_at: "14:00:00" },
];

const plan = (start, end, subject = null, teacher = null) => ({
  start_position: start,
  end_position: end,
  subject,
  teacher_guardian_id: teacher,
});

test("default slots are valid", () => {
  assert.equal(validateSlots(SLOTS), null);
});

test("slots must end after they start and not overlap the previous one", () => {
  assert.match(validateSlots([{ label: "Time 1", starts_at: "11:00", ends_at: "10:00" }]), /slutte etter/);
  assert.match(
    validateSlots([
      { label: "Time 1", starts_at: "10:00", ends_at: "11:30" },
      { label: "Time 2", starts_at: "11:00", ends_at: "12:00" },
    ]),
    /før forrige time/,
  );
  assert.match(validateSlots([{ label: " ", starts_at: "10:00", ends_at: "11:00" }]), /mangler navn/);
  assert.match(validateSlots([]), /minst én time/);
});

test("plans may not overlap or leave the day", () => {
  assert.equal(validatePlans([plan(1, 1), plan(2, 3)], 3), null);
  assert.match(validatePlans([plan(1, 2), plan(2, 3)], 3), /overlapper/);
  assert.match(validatePlans([plan(3, 4)], 3), /innenfor/);
  assert.match(validatePlans([plan(2, 1)], 3), /slutte før/);
});

test("plan cells cover every slot once", () => {
  const cells = planCells([plan(2, 3, "Koran")], 3);
  assert.deepEqual(
    cells.map((cell) => (cell.kind === "plan" ? `plan:${cell.plan.subject}` : `empty:${cell.position}`)),
    ["empty:1", "plan:Koran"],
  );
});

test("merging joins a plan with the next adjacent plan", () => {
  const merged = mergeWithNext([plan(1, 1, "Islam", "t1"), plan(2, 2, "Koran"), plan(3, 3, "Arabisk")], 0);
  assert.deepEqual(merged, [plan(1, 2, "Islam", "t1"), plan(3, 3, "Arabisk")]);
  assert.equal(mergeWithNext([plan(1, 1), plan(3, 3)], 0), null);
  assert.equal(mergeWithNext([plan(1, 1)], 0), null);
});

test("splitting turns a merged plan into single slots", () => {
  assert.deepEqual(splitPlan([plan(1, 3, "Islam", "t1")], 0), [
    plan(1, 1, "Islam", "t1"),
    plan(2, 2, "Islam", "t1"),
    plan(3, 3, "Islam", "t1"),
  ]);
  assert.deepEqual(splitPlan([plan(2, 2)], 0), [plan(2, 2)]);
});

test("slot labels and times follow the range", () => {
  assert.equal(slotRangeLabel(SLOTS, plan(1, 1)), "Time 1");
  assert.equal(slotRangeLabel(SLOTS, plan(2, 3)), "Time 2 + Time 3");
  assert.equal(slotRangeTimes(SLOTS, plan(2, 3)), "11:00-14:00");
  assert.equal(slotRangeTimes(SLOTS, plan(4, 4)), "");
});

test("double booking finds a teacher in two classes at the same time", () => {
  const lessons = [
    { id: "a", school_day_id: "d", start_position: 1, end_position: 2, teacher_guardian_id: "t1", cancelled: false },
    { id: "b", school_day_id: "d", start_position: 2, end_position: 2, teacher_guardian_id: "t1", cancelled: false },
    { id: "c", school_day_id: "d", start_position: 3, end_position: 3, teacher_guardian_id: "t1", cancelled: false },
    { id: "e", school_day_id: "d", start_position: 1, end_position: 1, teacher_guardian_id: "t2", cancelled: false },
    { id: "f", school_day_id: "d", start_position: 1, end_position: 1, teacher_guardian_id: "t2", cancelled: true },
    { id: "g", school_day_id: "x", start_position: 1, end_position: 1, teacher_guardian_id: "t1", cancelled: false },
  ];
  assert.deepEqual([...findDoubleBookings(lessons)].sort(), ["a", "b"]);
});

test("double booking counts co-teachers", () => {
  const lessons = [
    { id: "a", school_day_id: "d", start_position: 1, end_position: 1, teacher_guardian_id: "t1", co_teacher_guardian_id: "t3", cancelled: false },
    { id: "b", school_day_id: "d", start_position: 1, end_position: 1, teacher_guardian_id: "t2", co_teacher_guardian_id: null, cancelled: false },
    { id: "c", school_day_id: "d", start_position: 1, end_position: 1, teacher_guardian_id: null, co_teacher_guardian_id: "t3", cancelled: false },
  ];
  assert.deepEqual([...findDoubleBookings(lessons)].sort(), ["a", "c"]);
});

test("teacher names are joined with og", () => {
  assert.equal(joinTeacherNames(["Sidra Khan", "Nitasha X"]), "Sidra Khan og Nitasha X");
  assert.equal(joinTeacherNames(["Sidra Khan", null]), "Sidra Khan");
  assert.equal(joinTeacherNames([null, undefined]), null);
  assert.equal(joinTeacherNames(["A", "B"], "en"), "A and B");
});

test("a day counts as absent when any lesson was missed", () => {
  assert.equal(collapseDayStatus([]), null);
  assert.equal(collapseDayStatus(["til_stede", "til_stede"]), "til_stede");
  assert.equal(collapseDayStatus(["til_stede", "sent"]), "sent");
  assert.equal(collapseDayStatus(["meldt_fravaer", "meldt_fravaer"]), "meldt_fravaer");
  assert.equal(collapseDayStatus(["til_stede", "fravaer", "meldt_fravaer"]), "fravaer");
});

test("statusByDay groups lesson rows per date", () => {
  const map = statusByDay([
    { date: "2026-10-04", status: "til_stede" },
    { date: "2026-10-04", status: "sent" },
    { date: "2026-10-11", status: "meldt_fravaer" },
    { date: null, status: "fravaer" },
  ]);
  assert.deepEqual([...map], [
    ["2026-10-04", "sent"],
    ["2026-10-11", "meldt_fravaer"],
  ]);
});

test("lesson titles read like Time 1 - Islam", () => {
  assert.equal(lessonTitle({ ...plan(1, 1), subject: "Islam" }, SLOTS, "Hele dagen"), "Time 1 - Islam");
  assert.equal(lessonTitle({ ...plan(2, 3), subject: "Koran" }, SLOTS, "Hele dagen"), "Time 2 + Time 3 - Koran");
  assert.equal(lessonTitle(plan(1, 3), SLOTS, "Hele dagen"), "Hele dagen");
  assert.equal(lessonTitle(plan(2, 2), SLOTS, "Hele dagen"), "Time 2");
});

test("needsSubstitute flags lessons whose teachers are all away", () => {
  const away = new Set(["a"]);
  assert.equal(needsSubstitute({ teacher_guardian_id: "a", co_teacher_guardian_id: null, cancelled: false }, away), true);
  assert.equal(needsSubstitute({ teacher_guardian_id: "a", co_teacher_guardian_id: "b", cancelled: false }, away), false);
  assert.equal(needsSubstitute({ teacher_guardian_id: "a", co_teacher_guardian_id: null, cancelled: true }, away), false);
  assert.equal(needsSubstitute({ teacher_guardian_id: "c", co_teacher_guardian_id: null, cancelled: false }, away), false);
  assert.equal(needsSubstitute({ teacher_guardian_id: null, co_teacher_guardian_id: null, cancelled: false }, away, ["a"]), true);
  assert.equal(needsSubstitute({ teacher_guardian_id: null, co_teacher_guardian_id: null, cancelled: false }, away, ["a", "b"]), false);
  assert.equal(needsSubstitute({ teacher_guardian_id: null, co_teacher_guardian_id: null, cancelled: false }, away), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  copyableEntries,
  entriesByWeek,
  focusWeek,
  isSafeLink,
  isoWeekNumber,
  planWeeks,
  previousWeek,
  weekPhase,
  weekStartOf,
} from "../src/lib/semester-plan.ts";

const entry = (week, title, start = null, sort = 0) => ({
  id: `${week}-${title}`,
  class_id: "c",
  school_year_id: "y",
  week_start: week,
  start_position: start,
  end_position: start,
  subject: null,
  title,
  description: null,
  resource_url: null,
  sort_order: sort,
  updated_at: "",
});

test("weeks start on Monday, also for a Sunday school day", () => {
  assert.equal(weekStartOf("2026-10-04"), "2026-09-28");
  assert.equal(weekStartOf("2026-10-03"), "2026-09-28");
  assert.equal(weekStartOf("2026-09-28"), "2026-09-28");
  assert.equal(weekStartOf("2027-01-02"), "2026-12-28");
});

test("ISO week numbers follow the Norwegian calendar", () => {
  assert.equal(isoWeekNumber("2026-10-04"), 40);
  assert.equal(isoWeekNumber("2027-01-01"), 53);
  assert.equal(isoWeekNumber("2027-01-04"), 1);
});

test("school days group into weeks, cancelled days are skipped and planned weeks stay", () => {
  const weeks = planWeeks(
    [
      { date: "2026-10-04" },
      { date: "2026-10-03" },
      { date: "2026-10-11", cancelled: true },
      { date: "2026-10-18" },
    ],
    [entry("2026-10-05", "Bønn")],
  );
  assert.deepEqual(weeks, [
    { weekStart: "2026-09-28", dates: ["2026-10-03", "2026-10-04"] },
    { weekStart: "2026-10-05", dates: [] },
    { weekStart: "2026-10-12", dates: ["2026-10-18"] },
  ]);
});

test("the current week is highlighted, else the next school week", () => {
  const weeks = planWeeks([{ date: "2026-09-27" }, { date: "2026-10-11" }]);
  assert.equal(weekPhase("2026-09-21", "2026-10-01"), "past");
  assert.equal(weekPhase("2026-09-28", "2026-10-04"), "current");
  assert.equal(weekPhase("2026-10-05", "2026-10-01"), "upcoming");
  assert.equal(focusWeek(weeks, "2026-10-01"), "2026-10-05");
  assert.equal(focusWeek(weeks, "2026-12-01"), null);
});

test("entries sort general first, then by slot and order", () => {
  const grouped = entriesByWeek([
    entry("2026-09-28", "Koran", 2),
    entry("2026-09-28", "Felles", null),
    entry("2026-09-28", "Islam", 1, 1),
    entry("2026-09-28", "Arabisk", 1, 0),
  ]);
  assert.deepEqual(grouped.get("2026-09-28").map((row) => row.title), ["Felles", "Arabisk", "Islam", "Koran"]);
});

test("copying a week skips topics the target already has", () => {
  const copies = copyableEntries(
    [entry("a", "Bønn", 1), entry("a", "Wudu", 2)],
    [entry("b", " bønn ", 1)],
  );
  assert.deepEqual(copies.map((row) => row.title), ["Wudu"]);
  assert.equal("id" in copies[0], false);
});

test("previous week is the closest earlier planned week", () => {
  const weeks = planWeeks([{ date: "2026-09-27" }, { date: "2026-10-11" }]);
  assert.equal(previousWeek(weeks, "2026-10-05"), "2026-09-21");
  assert.equal(previousWeek(weeks, "2026-09-21"), null);
});

test("only http and https links are shown", () => {
  assert.equal(isSafeLink("https://quran.com/1"), true);
  assert.equal(isSafeLink("javascript:alert(1)"), false);
  assert.equal(isSafeLink("not a url"), false);
  assert.equal(isSafeLink(null), false);
});

test("copied topics keep learning goals and reset coverage", () => {
  const source = { ...entry("2026-10-05", "Reading"), goals: "Read confidently", completed_at: "2026-10-11" };
  const [copy] = copyableEntries([source], []);
  assert.equal(copy.goals, "Read confidently");
  assert.equal(copy.completed_at, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { learningGoalSchema, progressUpdateSchema } from "../src/lib/learning-progress/schema.ts";

const id = "f3000000-0000-4000-8000-000000000051";
const goal = { id, studentId: id, classId: id, subject: "quran", title: " Al-Fatiha ", surah: " Al-Fatiha ", ayahFrom: 1, ayahTo: 7, status: "practising", feedback: "  ", nextTarget: " Øv rolig " };

test("learning goals trim written text and preserve a Quran reference", () => {
  const value = learningGoalSchema.parse(goal);
  assert.equal(value.title, "Al-Fatiha");
  assert.equal(value.surah, "Al-Fatiha");
  assert.equal(value.feedback, null);
  assert.equal(value.nextTarget, "Øv rolig");
});

test("a teacher may record a whole surah or a goal with no Quran reference", () => {
  for (const value of [
    { ...goal, ayahFrom: null, ayahTo: null },
    { ...goal, surah: null, ayahFrom: null, ayahTo: null },
    { ...goal, subject: "arabic", surah: null, ayahFrom: null, ayahTo: null },
    { ...goal, subject: "islam", surah: null, ayahFrom: null, ayahTo: null },
  ]) assert.equal(learningGoalSchema.safeParse(value).success, true);
});

test("Quran references must have both ayah bounds, a surah and ascending positive integers", () => {
  for (const value of [
    { ...goal, ayahFrom: null }, { ...goal, ayahTo: null }, { ...goal, surah: null },
    { ...goal, ayahFrom: 8 }, { ...goal, ayahFrom: 0 }, { ...goal, ayahTo: 2.5 },
    { ...goal, subject: "arabic" }, { ...goal, subject: "islam" },
  ]) assert.equal(learningGoalSchema.safeParse(value).success, false);
});

test("goals reject grades, blank or oversized text and malformed identities", () => {
  for (const value of [
    { ...goal, status: "A" }, { ...goal, title: " " }, { ...goal, title: "x".repeat(201) },
    { ...goal, feedback: "x".repeat(2001) }, { ...goal, nextTarget: "x".repeat(1001) },
    { ...goal, id: "bad" }, { ...goal, subject: "math" },
  ]) assert.equal(learningGoalSchema.safeParse(value).success, false);
});

test("progress updates require the version the teacher was viewing", () => {
  const update = { id, goalId: id, expectedUpdateId: id, status: "needs_revision", feedback: null, nextTarget: null };
  assert.equal(progressUpdateSchema.safeParse(update).success, true);
  assert.equal(progressUpdateSchema.safeParse({ ...update, expectedUpdateId: null }).success, false);
  assert.equal(progressUpdateSchema.safeParse({ ...update, status: "grade-5" }).success, false);
});

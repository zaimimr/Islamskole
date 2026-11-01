import assert from "node:assert/strict";
import test from "node:test";
import {
  capTargetsAtRemaining,
  mapInChunks,
  vippsIdempotencyKey,
} from "../src/lib/payment-integrity.ts";

test("family targets are capped at what each child still owes", () => {
  const capped = capTargetsAtRemaining(
    [
      { studentId: "a", amount: 500000 },
      { studentId: "b", amount: 200000 },
      { studentId: "c", amount: 100000 },
    ],
    new Map([
      ["a", 300000],
      ["b", 0],
    ]),
  );
  assert.deepEqual(capped, [{ studentId: "a", amount: 300000 }]);
});

test("refund keys differ per refund group even for the same amount", () => {
  const first = vippsIdempotencyKey("refund", "isk-ref", 50000, "group-1");
  const second = vippsIdempotencyKey("refund", "isk-ref", 50000, "group-2");
  const retry = vippsIdempotencyKey("refund", "isk-ref", 50000, "group-1");
  assert.notEqual(first, second);
  assert.equal(first, retry);
  assert.equal(
    vippsIdempotencyKey("capture", "isk-ref", 50000),
    vippsIdempotencyKey("capture", "isk-ref", 50000, undefined),
  );
});

test("mapInChunks keeps order and limits concurrency", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapInChunks([1, 2, 3, 4, 5], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

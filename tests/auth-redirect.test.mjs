import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostLoginPath, safeNextPath } from "../src/lib/auth-redirect.ts";

test("safeNextPath keeps local paths with query strings", () => {
  assert.equal(safeNextPath("/min-side/barn/abc"), "/min-side/barn/abc");
  assert.equal(safeNextPath("/admin/klasser?visning=alle"), "/admin/klasser?visning=alle");
  assert.equal(safeNextPath("/en/min-side"), "/en/min-side");
});

test("safeNextPath rejects anything that can leave the site", () => {
  for (const value of [
    null,
    undefined,
    "",
    "min-side",
    "//evil.example/x",
    "/\\evil.example",
    "https://evil.example/admin",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    " /admin",
  ]) {
    assert.equal(safeNextPath(value), null, String(value));
  }
});

test("safeNextPath does not send people back to the login pages", () => {
  assert.equal(safeNextPath("/min-side/logg-inn"), null);
  assert.equal(safeNextPath("/en/min-side/logg-inn?next=/admin"), null);
  assert.equal(safeNextPath("/min-side/auth/bekreft?token_hash=x"), null);
  assert.equal(safeNextPath("/login"), null);
});

test("resolvePostLoginPath prefers a safe next", () => {
  assert.equal(
    resolvePostLoginPath({ next: "/min-side/barn/abc", isAdmin: true, locale: "no" }),
    "/min-side/barn/abc",
  );
  assert.equal(
    resolvePostLoginPath({ next: "/admin/familier", isAdmin: false, locale: "no" }),
    "/admin/familier",
  );
});

test("resolvePostLoginPath sends admins to Dagplan and everyone else to Min side", () => {
  assert.equal(resolvePostLoginPath({ next: null, isAdmin: true, locale: "no" }), "/admin/dagsplan");
  assert.equal(resolvePostLoginPath({ next: null, isAdmin: true, locale: "en" }), "/admin/dagsplan");
  assert.equal(resolvePostLoginPath({ next: null, isAdmin: false, locale: "no" }), "/min-side");
  assert.equal(resolvePostLoginPath({ next: null, isAdmin: false, locale: "en" }), "/en/min-side");
});

test("resolvePostLoginPath ignores an unsafe next", () => {
  assert.equal(
    resolvePostLoginPath({ next: "//evil.example", isAdmin: false, locale: "en" }),
    "/en/min-side",
  );
  assert.equal(
    resolvePostLoginPath({ next: "https://evil.example", isAdmin: true, locale: "no" }),
    "/admin/dagsplan",
  );
});

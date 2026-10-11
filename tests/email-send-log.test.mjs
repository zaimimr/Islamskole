import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("@/") ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });

const { sendLoginLinkEmail, sendAnnouncementEmails } = await import("../src/lib/email.ts");
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let logs;
let providerCalls;
let providerResponse;
let providerThrows;
let logFails;
let completionFails;

test.beforeEach(() => {
  logs = [];
  providerCalls = 0;
  providerResponse = { id: "provider-message" };
  providerThrows = false;
  logFails = false;
  completionFails = false;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://email-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.RESEND_API_KEY = "re_test_dummy";
  delete process.env.EMAIL_OUTBOX_DIR;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "email-test.supabase.co") {
      assert.equal(url.pathname, "/rest/v1/email_send_logs");
      const body = JSON.parse(init.body);
      if (init.method === "POST") {
        if (logFails) return Response.json({ code: "42501", message: "Log unavailable" }, { status: 403 });
        logs.push(...body);
        return new Response(null, { status: 201 });
      }
      assert.equal(init.method, "PATCH");
      if (completionFails) return Response.json({ code: "42501", message: "Log unavailable" }, { status: 403 });
      const id = url.searchParams.get("id").slice(3);
      const row = logs.find((log) => log.id === id);
      assert.ok(row);
      Object.assign(row, body);
      return new Response(null, { status: 204 });
    }
    assert.equal(url.hostname, "api.resend.com");
    providerCalls += 1;
    if (providerThrows) throw new Error("Provider unavailable");
    return Response.json(providerResponse, { status: providerResponse.error ? 400 : 200 });
  };
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "EMAIL_OUTBOX_DIR"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

const login = () => sendLoginLinkEmail({ to: " Parent@zztest.local ", url: "https://example.org/auth?token_hash=private-token", lang: "no" });
const announcements = () => sendAnnouncementEmails(["one", "two"].map((name) => ({
  to: `${name}@zztest.local`, lang: "no", title: `Notice ${name}`, body: "Private message", url: "https://example.org/notice", requiresAcknowledgement: false,
})), "test-batch");

test("login links record recipient, subject, completion and provider ID without credentials or contents", async () => {
  assert.equal(await login(), true);
  assert.equal(providerCalls, 1);
  assert.deepEqual(logs[0].recipients, ["parent@zztest.local"]);
  assert.equal(logs[0].status, "sent");
  assert.equal(logs[0].provider_id, "provider-message");
  assert.ok(logs[0].completed_at);
  assert.match(logs[0].subject, /Logg inn på Min side/);
  assert.doesNotMatch(JSON.stringify(logs), /token_hash|private-token|https:|html|Private message/);
});

test("a rejected provider request is recorded as failed", async () => {
  providerResponse = { error: true, name: "validation_error", message: "Invalid message" };
  assert.equal(await login(), false);
  assert.equal(logs[0].status, "failed");
});

test("provider exceptions finish the log without claiming success", async () => {
  providerThrows = true;
  assert.equal(await login(), false);
  assert.equal(logs[0].status, "failed");
});

test("missing provider configuration is recorded without sending", async () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(await login(), false);
  assert.equal(providerCalls, 0);
  assert.equal(logs[0].status, "disabled");
});

test("email is not sent if the log cannot be created", async () => {
  logFails = true;
  assert.equal(await login(), false);
  assert.equal(providerCalls, 0);
  assert.equal(logs.length, 0);
});

test("a completion logging failure keeps provider success to avoid sending again", async () => {
  completionFails = true;
  assert.equal(await login(), true);
  assert.equal(providerCalls, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].completed_at, undefined);
});

test("partial announcement batches log each recipient's result", async () => {
  providerResponse = { data: [{ id: "one" }], errors: [{ index: 1, message: "Invalid recipient" }] };
  assert.deepEqual(await announcements(), [true, false]);
  assert.deepEqual(logs.map((log) => log.status), ["sent", "failed"]);
  assert.deepEqual(logs.map((log) => log.subject), ["Notice one", "Notice two"]);
});

test("announcement provider failure finishes every log", async () => {
  providerThrows = true;
  assert.deepEqual(await announcements(), [false, false]);
  assert.deepEqual(logs.map((log) => log.status), ["failed", "failed"]);
});

test("local outbox delivery is recorded as a test transport", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "school-email-log-"));
  try {
    process.env.EMAIL_OUTBOX_DIR = directory;
    assert.equal(await login(), true);
    assert.equal(logs[0].transport, "outbox");
    assert.equal(logs[0].status, "sent");
    assert.equal(providerCalls, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

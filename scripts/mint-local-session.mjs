import { createClient } from "@supabase/supabase-js";

const url = "http://127.0.0.1:54321";
const service = process.env.SERVICE_KEY;
const anon = process.env.ANON_KEY;
const email = "test-admin@islamskole.no";

const admin = createClient(url, service);
const { data: existing } = await admin.auth.admin.listUsers();
let user = existing.users.find((u) => u.email === email);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (error) throw error;
  user = data.user;
}
const { data: guardianId, error: guardianError } = await admin.rpc("ensure_guardian_for_email", { p_email: email, p_name: "Test Admin" });
if (guardianError) throw guardianError;
await admin.from("person_roles").upsert({ guardian_id: guardianId, role_key: "admin", granted_by: "system" }, { onConflict: "guardian_id,role_key", ignoreDuplicates: true });

const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkError) throw linkError;

const client = createClient(url, anon);
const { data: session, error: otpError } = await client.auth.verifyOtp({
  email,
  token: link.properties.email_otp,
  type: "magiclink",
});
if (otpError) throw otpError;

const payload = {
  access_token: session.session.access_token,
  token_type: "bearer",
  expires_in: session.session.expires_in,
  expires_at: session.session.expires_at,
  refresh_token: session.session.refresh_token,
  user: session.session.user,
};
const value = "base64-" + Buffer.from(JSON.stringify(payload)).toString("base64url");
console.log(value);

// End-to-end online sign-up flow on an isolated local D1 emulator; never reads or writes remote databases.
// Client signs up → cannot sign in yet ("waiting") → admin Sign-ups tab (count, approve) →
// customer + KDOOR code + portal sign-in with the password the client chose; reject path too.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd(), dir = resolve(".admin-local", `signup-flow-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = resolve(dir, "wrangler.json"), state = resolve(dir, "state");
const origin = "http://localhost:8790";
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
source.main = resolve(".open-next/worker.js");
source.assets.directory = resolve(".open-next/assets");
source.d1_databases = source.d1_databases.map((d) => ({
  ...d,
  database_id: d.binding === "ADMIN_DB" ? "00000000-0000-0000-0000-000000000001" : d.database_id,
  ...(d.binding === "ADMIN_DB" ? { migrations_dir: resolve("migrations/admin") } : {}),
}));
writeFileSync(config, JSON.stringify(source));
const password = randomBytes(24).toString("base64url"), salt = randomBytes(16).toString("hex");
writeFileSync(resolve(dir, ".dev.vars"),
  `ADMIN_ORIGIN="${origin}"\nADMIN_LOCAL_DEV="true"\nLOCAL_ADMIN_EMAIL="local-admin@example.test"\nLOCAL_ADMIN_HASH="${salt}:${scryptSync(password, salt, 64).toString("hex")}"\nADMIN_CSRF_SECRET="${randomBytes(32).toString("hex")}"\n`,
  { mode: 0o600 });
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", XDG_CONFIG_HOME: resolve(dir, "config"), WRANGLER_LOG_PATH: resolve(dir, "logs"), WRANGLER_REGISTRY_PATH: resolve(dir, "registry") };
const cli = (args) => {
  const r = spawnSync("npx", ["wrangler", ...args, "--config", config, "--persist-to", state], { encoding: "utf8", env, cwd: root });
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return r.stdout;
};
cli(["d1", "migrations", "apply", "ADMIN_DB", "--local"]);
const uid = randomUUID();
cli(["d1", "execute", "ADMIN_DB", "--local", "--command", `INSERT INTO admin_users VALUES ('${uid}','Local admin','local-admin@example.test','owner','2026-01-01','2026-01-01')`]);
let logs = "";
const server = spawn("npx", ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", "8790", "--config", config, "--persist-to", state],
  { env, cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const authorization = "Basic " + Buffer.from(`local-admin@example.test:${password}`).toString("base64");
const retry = async (fn) => { try { return await fn(); } catch (e) { if (!/other side closed|EPIPE|ECONNRESET/.test(String(e?.cause ?? e))) throw e; await new Promise((r) => setTimeout(r, 1000)); return fn(); } };
const get = (path, auth = true) => retry(() => fetch(origin + path, { headers: auth ? { authorization } : {}, redirect: "manual" }));
const post = (path, values) => retry(() => fetch(origin + path, {
  method: "POST", redirect: "manual", body: new URLSearchParams(values),
  headers: { authorization, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
}));
const api = (path, body) => retry(() => fetch(origin + path, { method: "POST", headers: { Origin: origin, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) }));
const token = (html) => { const m = html.match(/name="csrf" value="([^"]+)"/); assert.ok(m, "CSRF token present"); return m[1]; };
const sqlRows = (command) => JSON.parse(cli(["d1", "execute", "ADMIN_DB", "--local", "--json", "--command", command]))[0].results;
const steps = [];
const step = (name) => { steps.push(name); console.log("✓ " + name); };
const signupForm = (values) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return form;
};
const maria = {
  full_name: "Maria Santos", company_name: "Maria's Online Shop", mobile: "0918 555 1234", email: "Maria@Example.test",
  password: "maria-pass-123", confirm_password: "maria-pass-123", consent: "1",
};
const login = (identifier, pw) => retry(() => fetch(origin + "/api/customer/login", {
  method: "POST", redirect: "manual", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ identifier, password: pw }),
}));

try {
  for (let n = 0; n < 80; n++) {
    try { await fetch(origin + "/admin/dashboard"); break; } catch { if (n === 79) throw new Error(logs); await new Promise((r) => setTimeout(r, 500)); }
  }

  // 1. Public page and guard rails.
  let res = await get("/customer/signup", false);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Create your account/);
  res = await get("/customer/login", false);
  assert.match(await res.text(), /href="\/customer\/signup"/);
  step("Sign-up page loads and the sign-in page links to it");

  res = await api("/api/customer/signup", signupForm({ ...maria, website: "http://spam.example" }));
  assert.equal(res.status, 400, "honeypot refused");
  res = await api("/api/customer/signup", signupForm({ ...maria, mobile: "12345" }));
  assert.equal(res.status, 400); assert.match((await res.json()).error, /valid PH mobile/);
  res = await api("/api/customer/signup", signupForm({ ...maria, confirm_password: "other-pass-123" }));
  assert.equal(res.status, 400); assert.match((await res.json()).error, /do not match/);
  res = await api("/api/customer/signup", signupForm({ ...maria, password: "short", confirm_password: "short" }));
  assert.equal(res.status, 400); assert.match((await res.json()).error, /at least 8/);
  res = await api("/api/customer/signup", signupForm({ ...maria, consent: "" }));
  assert.equal(res.status, 400);
  res = await retry(() => fetch(origin + "/api/customer/signup", { method: "POST", headers: { Origin: "https://evil.example" }, body: signupForm(maria) }));
  assert.equal(res.status, 403, "other-site post refused");
  assert.equal(sqlRows("SELECT COUNT(*) AS n FROM customer_signups")[0].n, 0);
  step("Bad mobile, mismatched or short password, no consent, bots and other sites are refused");

  // 2. A good sign-up is saved as waiting, not as a customer.
  res = await api("/api/customer/signup", signupForm(maria));
  assert.equal(res.status, 200, await res.clone().text());
  const [saved] = sqlRows("SELECT * FROM customer_signups");
  assert.equal(saved.status, "New"); assert.equal(saved.mobile, "09185551234"); assert.equal(saved.email, "maria@example.test");
  assert.ok(!String(saved.password_hash).includes("maria"), "password is hashed");
  assert.equal(sqlRows("SELECT COUNT(*) AS n FROM customers")[0].n, 0);
  assert.equal(sqlRows("SELECT COUNT(*) AS n FROM customer_accounts")[0].n, 0);
  res = await api("/api/customer/signup", signupForm(maria));
  assert.equal(res.status, 409); assert.match((await res.json()).error, /already have your sign-up/);
  step("Sign-up saved as waiting (password hashed, no customer yet); a second one is refused");

  // 3. Signing in before approval says "waiting", only with the right password.
  res = await login("0918 555 1234", maria.password);
  assert.equal(res.headers.get("location"), origin + "/customer/login?error=pending");
  res = await login("maria@example.test", "wrong-password");
  assert.equal(res.headers.get("location"), origin + "/customer/login?error=1");
  res = await get("/customer/login?error=pending", false);
  assert.match(await res.text(), /still waiting for approval/);
  step("Sign-in before approval shows 'waiting for approval' (wrong password still just 'invalid')");

  // 4. Admin sees it in Bookings → Sign-ups with a count and approves it.
  res = await get("/admin/bookings?count=1");
  assert.equal((await res.json()).signups, 1);
  res = await get("/admin/bookings?status=Signups");
  let html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Maria Santos/); assert.match(html, /customer\/signup/); assert.match(html, /Sign-ups <span class="nav-count">1/);
  res = await get(`/admin/bookings?signup=${saved.id}`);
  html = await res.text();
  assert.match(html, /New client, not in Customers yet/); assert.match(html, /Approve → create customer/);
  res = await get("/admin/customers");
  assert.match(await res.text(), /Sign-ups &amp; sign-up link/);
  res = await post("/admin/bookings", { csrf: token(html), action: "signup_approve", signup_id: saved.id, customer_id: "new" });
  assert.equal(res.status, 303, await res.clone().text());
  const [customer] = sqlRows("SELECT * FROM customers");
  assert.match(customer.customer_code, /^KDOOR-\d{4}$/);
  assert.equal(customer.mobile, "09185551234"); assert.equal(customer.company_name, "Maria's Online Shop");
  assert.match(customer.notes, /Signed up online/);
  const [account] = sqlRows("SELECT * FROM customer_accounts");
  assert.equal(account.customer_id, customer.id); assert.equal(account.password_state, "active"); assert.equal(account.login_mobile, "09185551234");
  assert.equal(sqlRows("SELECT status FROM customer_signups")[0].status, "Approved");
  res = await get(`/admin/bookings?signup=${saved.id}&done=approved`);
  html = await res.text();
  assert.match(html, new RegExp(`Your cargo code: ${customer.customer_code}`));
  step(`Admin approves: customer ${customer.customer_code} + portal sign-in created, message ready to copy`);

  // 5. The client signs in with the password they chose, by mobile or email.
  res = await login("09185551234", maria.password);
  assert.equal(res.headers.get("location"), origin + "/customer");
  const cookie = res.headers.get("set-cookie").split(";")[0];
  res = await retry(() => fetch(origin + "/customer", { headers: { cookie }, redirect: "manual" }));
  assert.equal(res.status, 200);
  assert.match(await res.text(), new RegExp(customer.customer_code));
  res = await login("maria@example.test", maria.password);
  assert.equal(res.headers.get("location"), origin + "/customer");
  res = await api("/api/customer/signup", signupForm({ ...maria, email: "other@example.test" }));
  assert.equal(res.status, 409); assert.match((await res.json()).error, /already have a KargoDoor account/);
  step("Client signs in with their own password (mobile or email); signing up again says 'already have an account'");

  // 6. Reject path, and linking a sign-up to a customer Em already has.
  const now = new Date().toISOString(), existingId = randomUUID();
  cli(["d1", "execute", "ADMIN_DB", "--local", "--command", `INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES ('${existingId}','KDOOR-0042','Pedro Reyes','+63 917 222 3333','${now}','${now}')`]);
  res = await api("/api/customer/signup", signupForm({ ...maria, full_name: "Pedro Reyes", mobile: "09172223333", email: "pedro@example.test", company_name: "" }));
  assert.equal(res.status, 200);
  res = await api("/api/customer/signup", signupForm({ ...maria, full_name: "Fake Person", mobile: "09170000000", email: "fake@example.test" }));
  assert.equal(res.status, 200);
  const pedro = sqlRows("SELECT id FROM customer_signups WHERE email = 'pedro@example.test'")[0];
  const fake = sqlRows("SELECT id FROM customer_signups WHERE email = 'fake@example.test'")[0];
  html = await (await get(`/admin/bookings?signup=${pedro.id}`)).text();
  assert.match(html, /Already a customer: KDOOR-0042 Pedro Reyes/);
  res = await post("/admin/bookings", { csrf: token(html), action: "signup_approve", signup_id: pedro.id, customer_id: existingId });
  assert.equal(res.status, 303);
  assert.equal(sqlRows("SELECT COUNT(*) AS n FROM customers")[0].n, 2, "no duplicate customer");
  assert.equal(sqlRows(`SELECT COUNT(*) AS n FROM customer_accounts WHERE customer_id = '${existingId}'`)[0].n, 1);
  html = await (await get(`/admin/bookings?signup=${fake.id}`)).text();
  res = await post("/admin/bookings", { csrf: token(html), action: "signup_reject", signup_id: fake.id, reason: "Fake number" });
  assert.equal(res.status, 303);
  res = await post("/admin/bookings", { csrf: token(html), action: "signup_approve", signup_id: fake.id, customer_id: "new" });
  assert.notEqual(res.status, 303, "already reviewed");
  res = await login("fake@example.test", maria.password);
  assert.equal(res.headers.get("location"), origin + "/customer/login?error=declined");
  res = await get("/admin/bookings?count=1");
  assert.equal((await res.json()).signups, 0);
  step("Existing customer gets a sign-in (no duplicate); rejected sign-up is told to message us; count back to 0");

  console.log(`\nSign-up flow end-to-end passed: ${steps.length} steps. All operations were local.`);
  if (process.env.KEEP_SERVER) { writeFileSync(resolve(dir, "admin-password"), password, { mode: 0o600 }); console.log(`READY ${origin} ${dir}`); await new Promise(() => {}); }
} catch (error) {
  console.error(error);
  console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

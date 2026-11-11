import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { sendLoginCode, verifyLoginCode } from "../lib/customer/login-code";
import { customerSession } from "../lib/customer/security";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const f of ["0001_phase1.sql", "0008_customer_accounts.sql", "0009_customer_account_password_state.sql", "0027_customer_portal_mobile_login.sql", "0043_customer_email_verification.sql", "0045_customer_login_codes.sql"])
    sql.exec(readFileSync(`migrations/admin/${f}`, "utf8"));
  const cust = (id: string, email: string | null) => sql.prepare("INSERT INTO customers (id,customer_code,full_name,company_name,mobile,email,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, `KDOOR-${id}`, "Juan Dela Cruz", null, "09171234567", email, null, null, "2026-01-01", "2026-01-01");
  const acct = (id: string, customer: string, login: string, mobile: string | null, enabled = 1) => sql.prepare("INSERT INTO customer_accounts (id,customer_id,login_email,login_mobile,password_hash,password_salt,password_algorithm,password_n,password_r,password_p,password_key_length,enabled,created_at,updated_at,password_state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, customer, login, mobile, "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, enabled, "2026-01-01", "2026-01-01", "active");
  cust("c1", "Juan@Example.test"); acct("a1", "c1", "juan@example.test", null);
  cust("c2", "maria@example.test"); acct("a2", "c2", "mobile-9181234567-c2@portal.kargodoor.internal", "09181234567");
  cust("c3", "off@example.test"); acct("a3", "c3", "off@example.test", null, 0);
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first() { return sql.prepare(query).get(...(values as never[])) ?? null; },
        async run() { return { meta: sql.prepare(query).run(...(values as never[])) }; },
      };
    },
  } as unknown as D1Database;
  const sent: { to: string; text: string }[] = [];
  const send = async (m: { to: string; text: string }) => { sent.push(m); };
  return { sql, db, sent, send };
}
const codeOf = (t: string) => /code is: (\d{6})/.exec(t)![1];

test("email code signs an existing customer in and verifies their email", async () => {
  const { db, sql, sent, send } = fixture();
  const t0 = new Date("2026-11-10T08:00:00Z");
  assert.equal(await sendLoginCode(db, " JUAN@example.test ", send, t0), "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "juan@example.test");
  const code = codeOf(sent[0].text);
  const bad = code === "000000" ? "000001" : "000000";
  assert.deepEqual(await verifyLoginCode(db, "juan@example.test", bad, t0), { ok: false, reason: "wrong" });
  const ok = await verifyLoginCode(db, "juan@example.test", code, t0);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  const session = await customerSession(db, ok.session.token, t0);
  assert.equal(session?.customer_id, "c1");
  assert.ok((sql.prepare("SELECT email_verified_at FROM customers WHERE id='c1'").get() as { email_verified_at: string }).email_verified_at);
  assert.deepEqual(await verifyLoginCode(db, "juan@example.test", code, t0), { ok: false, reason: "wrong" }, "code works once");
});

test("unknown, disabled and internal emails get no email but the same answer", async () => {
  const { db, sent, send } = fixture();
  assert.equal(await sendLoginCode(db, "nobody@example.test", send), "sent");
  assert.equal(await sendLoginCode(db, "off@example.test", send), "sent");
  assert.equal(await sendLoginCode(db, "mobile-9181234567-c2@portal.kargodoor.internal", send), "sent");
  assert.equal(sent.length, 0);
});

test("mobile-login accounts can use the customer's email", async () => {
  const { db, sent, send } = fixture();
  await sendLoginCode(db, "maria@example.test", send);
  assert.equal(sent[0].to, "maria@example.test");
  const ok = await verifyLoginCode(db, "maria@example.test", codeOf(sent[0].text));
  assert.equal(ok.ok, true);
});

test("expiry, lockout and resend wait", async () => {
  const { db, sent, send } = fixture();
  const t0 = new Date("2026-11-10T08:00:00Z");
  await sendLoginCode(db, "juan@example.test", send, t0);
  assert.equal(await sendLoginCode(db, "juan@example.test", send, new Date(t0.getTime() + 20_000)), "wait");
  assert.deepEqual(await verifyLoginCode(db, "juan@example.test", codeOf(sent[0].text), new Date(t0.getTime() + 11 * 60_000)), { ok: false, reason: "expired" });
  const t1 = new Date(t0.getTime() + 12 * 60_000);
  await sendLoginCode(db, "juan@example.test", send, t1);
  const fresh = codeOf(sent[1].text), bad = fresh === "999999" ? "999998" : "999999";
  for (let i = 0; i < 4; i++) assert.equal((await verifyLoginCode(db, "juan@example.test", bad, t1)).ok, false);
  assert.deepEqual(await verifyLoginCode(db, "juan@example.test", bad, t1), { ok: false, reason: "locked" });
  assert.deepEqual(await verifyLoginCode(db, "juan@example.test", fresh, t1), { ok: false, reason: "locked" });
});

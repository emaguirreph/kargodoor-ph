import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { sendSignupCode, verifySignupCode } from "../lib/customer/signup-email";

const ID = "22222222-2222-4222-8222-222222222222";
function fixture(status = "New") {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0001_phase1.sql", "0044_customer_signups.sql", "0046_signup_email_codes.sql"]) sql.exec(readFileSync(`migrations/admin/${f}`, "utf8"));
  sql.prepare(`INSERT INTO customer_signups (id,full_name,mobile,email,address,password_hash,password_salt,password_n,password_r,password_p,password_key_length,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,32768,8,1,64,?,?,?)`).run(ID, "Juan Dela Cruz", "09171234567", "juan@example.test", "1 Rizal St, Malabon City", "a".repeat(64), "b".repeat(32), status, "2026-11-11", "2026-11-11");
  const db = { prepare(q: string) { let v: unknown[] = []; return {
    bind(...a: unknown[]) { v = a; return this; },
    async first() { return sql.prepare(q).get(...(v as never[])) ?? null; },
    async run() { return { meta: sql.prepare(q).run(...(v as never[])) }; } }; } } as unknown as D1Database;
  const sent: { to: string; text: string }[] = [];
  return { sql, db, sent, send: async (m: { to: string; text: string }) => { sent.push(m); } };
}
const codeOf = (t: string) => /code is: (\d{6})/.exec(t)![1];

test("sign-up code: wrong, then right marks the sign-up verified", async () => {
  const { db, sql, sent, send } = fixture();
  const t0 = new Date("2026-11-11T03:00:00Z");
  assert.equal(await sendSignupCode(db, ID, send, t0), "sent");
  assert.equal(sent[0].to, "juan@example.test");
  const code = codeOf(sent[0].text), bad = code === "000000" ? "000001" : "000000";
  assert.equal(await verifySignupCode(db, ID, bad, t0), "wrong");
  assert.equal(await verifySignupCode(db, ID, code, t0), "verified");
  assert.ok((sql.prepare("SELECT email_verified_at FROM customer_signups").get() as { email_verified_at: string }).email_verified_at);
  assert.equal(await sendSignupCode(db, ID, send, new Date(t0.getTime() + 120_000)), "verified");
});

test("sign-up code: wait, expiry, lock, send limit, bad ids", async () => {
  const { db, sent, send } = fixture();
  let t = new Date("2026-11-11T03:00:00Z");
  await sendSignupCode(db, ID, send, t);
  assert.equal(await sendSignupCode(db, ID, send, new Date(t.getTime() + 10_000)), "wait");
  assert.equal(await verifySignupCode(db, ID, codeOf(sent[0].text), new Date(t.getTime() + 31 * 60_000)), "expired");
  t = new Date(t.getTime() + 32 * 60_000);
  await sendSignupCode(db, ID, send, t);
  const fresh = codeOf(sent[1].text), bad = fresh === "999999" ? "999998" : "999999";
  for (let i = 0; i < 4; i++) assert.equal(await verifySignupCode(db, ID, bad, t), "wrong");
  assert.equal(await verifySignupCode(db, ID, bad, t), "locked");
  assert.equal(await verifySignupCode(db, ID, fresh, t), "locked");
  for (let i = 0; i < 3; i++) { t = new Date(t.getTime() + 61_000); assert.equal(await sendSignupCode(db, ID, send, t), "sent"); }
  t = new Date(t.getTime() + 61_000);
  assert.equal(await sendSignupCode(db, ID, send, t), "limit");
  assert.equal(await sendSignupCode(db, "nope", send, t), "none");
  assert.equal(await verifySignupCode(db, "nope", "123456", t), "none");
});

test("reviewed sign-ups get no new code", async () => {
  const { db, sent, send } = fixture("Approved");
  assert.equal(await sendSignupCode(db, ID, send), "none");
  assert.equal(sent.length, 0);
});

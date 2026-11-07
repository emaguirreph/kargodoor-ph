import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { checkEmailCode, confirmEmailLink, emailVerificationSection, readEmailVerification, resendSender, sendEmailCode, verificationEmail } from "../lib/admin/email-verification";

const ID = "11111111-1111-1111-1111-111111111111";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0043_customer_email_verification.sql", "utf8"));
  sql.prepare("INSERT INTO customers (id,customer_code,full_name,company_name,mobile,email,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(ID, "KDOOR-1234", "Juan Dela Cruz", null, "09123456789", "Juan@Example.test", null, null, "2026-01-01", "2026-01-01");
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
  return { sql, db };
}

function capture() {
  const sent: { to: string; text: string; subject: string }[] = [];
  return { sent, send: async (m: { to: string; text: string; subject: string; html: string }) => { sent.push(m); } };
}
const codeOf = (text: string) => /Messenger: (\d{6})/.exec(text)![1];
const linkOf = (text: string) => new URL(/(https:\/\/\S+\/verify-email\S+)/.exec(text)![1]);

test("send code, wrong tries, then the right code verifies the email", async () => {
  const { db } = fixture();
  const mail = capture();
  const t0 = new Date("2026-11-07T08:00:00Z");
  assert.equal((await readEmailVerification(db, ID)).verified, false);
  await sendEmailCode(db, ID, mail.send, t0);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, "juan@example.test");
  assert.match(mail.sent[0].text, /Thank you for trusting KargoDoorPH\.com!/);
  const code = codeOf(mail.sent[0].text);
  const wrong = code === "000000" ? "000001" : "000000";
  assert.equal(await checkEmailCode(db, ID, wrong, t0), "wrong");
  assert.equal(await checkEmailCode(db, ID, ` ${code.slice(0, 3)} ${code.slice(3)} `, t0), "verified");
  const v = await readEmailVerification(db, ID);
  assert.equal(v.verified, true);
  assert.equal(v.pendingSentAt, null);
  assert.equal(await checkEmailCode(db, ID, code, t0), "none", "a code works only once");
});

test("codes expire, lock after 5 wrong tries, and resend waits a minute", async () => {
  const { db } = fixture();
  const mail = capture();
  const t0 = new Date("2026-11-07T08:00:00Z");
  await sendEmailCode(db, ID, mail.send, t0);
  await assert.rejects(sendEmailCode(db, ID, mail.send, new Date(t0.getTime() + 30_000)), /Wait a minute/);
  const code = codeOf(mail.sent[0].text);
  assert.equal(await checkEmailCode(db, ID, code, new Date(t0.getTime() + 25 * 3_600_000)), "expired");

  const t1 = new Date(t0.getTime() + 26 * 3_600_000);
  await sendEmailCode(db, ID, mail.send, t1);
  const fresh = codeOf(mail.sent[1].text);
  const wrong = fresh === "999999" ? "999998" : "999999";
  for (let i = 0; i < 4; i++) assert.equal(await checkEmailCode(db, ID, wrong, t1), "wrong");
  assert.equal(await checkEmailCode(db, ID, wrong, t1), "locked");
  assert.equal(await checkEmailCode(db, ID, fresh, t1), "locked", "right code refused once locked");
});

test("changing the customer's email undoes verification", async () => {
  const { db, sql } = fixture();
  const mail = capture();
  const t0 = new Date("2026-11-07T08:00:00Z");
  await sendEmailCode(db, ID, mail.send, t0);
  assert.equal(await checkEmailCode(db, ID, codeOf(mail.sent[0].text), t0), "verified");
  sql.prepare("UPDATE customers SET email=? WHERE id=?").run("other@example.test", ID);
  assert.equal((await readEmailVerification(db, ID)).verified, false);
});

test("a failed send leaves no pending code; missing key gives a clear error", async () => {
  const { db } = fixture();
  await assert.rejects(sendEmailCode(db, ID, resendSender({}), new Date()), /RESEND_API_KEY/);
  assert.equal((await readEmailVerification(db, ID)).pendingSentAt, null);
});

test("Resend request shape and admin section", async () => {
  let body: Record<string, unknown> = {};
  let auth = "";
  const fake = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    auth = String((init.headers as Record<string, string>).Authorization);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  await resendSender({ RESEND_API_KEY: "re_test" }, fake)({ to: "a@b.test", ...verificationEmail("Juan", "123456", "https://kargodoorph.com/verify-email?c=x&t=y") });
  assert.equal(auth, "Bearer re_test");
  assert.deepEqual(body.to, ["a@b.test"]);
  assert.equal(body.from, "KargoDoorPH <verify@kargodoorph.com>");

  const html = emailVerificationSection({ email: "a@b.test", verified: false, verifiedAt: null, pendingSentAt: null, pendingExpiresAt: null }, { path: "/admin/customers", csrf: "x", customerId: ID, canWrite: true });
  assert.match(html, /Send verification code/);
  assert.doesNotMatch(html, /Check code/);
  const verified = emailVerificationSection({ email: "a@b.test", verified: true, verifiedAt: "2026-11-07T08:00:00Z", pendingSentAt: null, pendingExpiresAt: null }, { path: "/admin/customers", csrf: "x", customerId: ID, canWrite: true });
  assert.match(verified, /Verified/);
  assert.doesNotMatch(verified, /<form/);
});

test("customer taps the confirm link: verified automatically, link works once", async () => {
  const { db } = fixture();
  const mail = capture();
  const t0 = new Date("2026-11-07T08:00:00Z");
  await sendEmailCode(db, ID, mail.send, t0, "https://kargodoorph.com");
  const link = linkOf(mail.sent[0].text);
  assert.equal(link.origin + link.pathname, "https://kargodoorph.com/verify-email");
  assert.equal(link.searchParams.get("c"), ID);
  const token = link.searchParams.get("t")!;
  assert.equal(await confirmEmailLink(db, ID, token.slice(0, -2) + "zz", t0), "invalid");
  assert.equal(await confirmEmailLink(db, ID, token, new Date(t0.getTime() + 25 * 3_600_000)), "expired");
  assert.equal(await confirmEmailLink(db, ID, token, t0), "verified");
  assert.equal((await readEmailVerification(db, ID)).verified, true);
  assert.equal(await confirmEmailLink(db, ID, token, t0), "already");
  assert.equal(await confirmEmailLink(db, "not-an-id", token, t0), "invalid");
});

test("a newer email replaces the older link", async () => {
  const { db } = fixture();
  const mail = capture();
  const t0 = new Date("2026-11-07T08:00:00Z");
  await sendEmailCode(db, ID, mail.send, t0);
  const old = linkOf(mail.sent[0].text).searchParams.get("t")!;
  await sendEmailCode(db, ID, mail.send, new Date(t0.getTime() + 120_000));
  assert.equal(await confirmEmailLink(db, ID, old, t0), "invalid");
});

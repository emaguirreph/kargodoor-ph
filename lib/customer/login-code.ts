// Customer portal sign-in with a one-time code sent to the customer's email.
// Only existing, enabled portal accounts can get a code (no open sign-up here).
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import type { SendEmail } from "@/lib/admin/email-verification";
import { createCustomerSession, normalizeCustomerEmail } from "./security";

export const LOGIN_CODE_MINUTES = 10;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
const RESEND_WAIT_SECONDS = 60;
const INTERNAL_EMAIL = /@portal\.kargodoor\.internal$/i;

type Account = { id: string; customer_id: string; full_name: string; email: string; password_state: "temporary" | "active" };

const hash = (accountId: string, code: string) => createHash("sha256").update(`login:${accountId}:${code}`).digest("hex");

/** Finds the enabled portal account for an email: its login email, or the customer's email for mobile-login accounts. */
async function accountForEmail(db: D1Database, email: string) {
  if (!email.includes("@") || email.length > 320 || INTERNAL_EMAIL.test(email)) return null;
  return await db.prepare(`SELECT a.id,a.customer_id,c.full_name,a.password_state,
      CASE WHEN a.login_email=? THEN a.login_email ELSE lower(trim(c.email)) END AS email
    FROM customer_accounts a JOIN customers c ON c.id=a.customer_id
    WHERE a.enabled=1 AND (a.login_email=? OR lower(trim(c.email))=?)
    ORDER BY (a.login_email=?) DESC LIMIT 1`)
    .bind(email, email, email, email).first<Account>();
}

export function loginCodeEmail(name: string, code: string) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = `${code} is your KargoDoorPH sign-in code`;
  const text = [
    `Hi ${first},`,
    ``,
    `Your KargoDoorPH sign-in code is: ${code}`,
    ``,
    `Enter it on the sign-in page to open MY KargoDoorPH. The code expires in ${LOGIN_CODE_MINUTES} minutes and works only once.`,
    `If you did not try to sign in, you can ignore this email.`,
    ``,
    `Thank you for trusting KargoDoorPH.com! 💚 💙`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#0b1f45;line-height:1.5;max-width:520px">
<p>Hi ${first.replace(/[<>&"']/g, "")},</p>
<p>Your KargoDoorPH sign-in code is:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#003b9d;margin:8px 0 16px">${code}</p>
<p>Enter it on the sign-in page to open MY KargoDoorPH.</p>
<p style="color:#5a6a88;font-size:14px">The code expires in ${LOGIN_CODE_MINUTES} minutes and works only once. If you did not try to sign in, you can ignore this email.</p>
<p>Thank you for trusting KargoDoorPH.com! 💚 💙</p>
</div>`;
  return { subject, text, html };
}

/** Sends a code if the email has a portal account. Returns the same "sent" either way so emails can't be probed. */
export async function sendLoginCode(db: D1Database, rawEmail: string, send: SendEmail, now = new Date()): Promise<"sent" | "wait"> {
  const email = normalizeCustomerEmail(String(rawEmail ?? ""));
  const account = await accountForEmail(db, email);
  if (!account) return "sent";
  const last = await db.prepare("SELECT sent_at FROM customer_login_codes WHERE account_id=?").bind(account.id).first<{ sent_at: string }>();
  if (last && now.getTime() - Date.parse(last.sent_at) < RESEND_WAIT_SECONDS * 1000) return "wait";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(now.getTime() + LOGIN_CODE_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO customer_login_codes (account_id,email,code_hash,expires_at,attempts,sent_at) VALUES (?,?,?,?,0,?)
    ON CONFLICT(account_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at`)
    .bind(account.id, account.email, hash(account.id, code), expires, now.toISOString()).run();
  try {
    await send({ to: account.email, ...loginCodeEmail(account.full_name, code) });
  } catch (error) {
    await db.prepare("DELETE FROM customer_login_codes WHERE account_id=?").bind(account.id).run();
    throw error;
  }
  return "sent";
}

export type LoginCodeResult =
  | { ok: true; account: Account; session: { token: string; expires: string } }
  | { ok: false; reason: "wrong" | "expired" | "locked" };

/** Checks the code. On success: signs the customer in and marks their email verified. */
export async function verifyLoginCode(db: D1Database, rawEmail: string, typed: string, now = new Date()): Promise<LoginCodeResult> {
  const email = normalizeCustomerEmail(String(rawEmail ?? ""));
  const code = String(typed ?? "").replace(/\D/g, "");
  const account = await accountForEmail(db, email);
  const row = account
    ? await db.prepare("SELECT email,code_hash,expires_at,attempts FROM customer_login_codes WHERE account_id=?").bind(account.id)
      .first<{ email: string; code_hash: string; expires_at: string; attempts: number }>()
    : null;
  if (!account || !row || row.email !== email) return { ok: false, reason: "wrong" };
  if (Date.parse(row.expires_at) <= now.getTime()) return { ok: false, reason: "expired" };
  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  const expected = Buffer.from(row.code_hash, "hex"), actual = Buffer.from(hash(account.id, code), "hex");
  if (code.length !== 6 || !timingSafeEqual(expected, actual)) {
    await db.prepare("UPDATE customer_login_codes SET attempts=attempts+1 WHERE account_id=?").bind(account.id).run();
    return { ok: false, reason: row.attempts + 1 >= LOGIN_CODE_MAX_ATTEMPTS ? "locked" : "wrong" };
  }
  await db.prepare("DELETE FROM customer_login_codes WHERE account_id=?").bind(account.id).run();
  // Getting the code proves they own this email: mark it verified if it is the customer's email.
  const stamp = now.toISOString();
  await db.prepare("UPDATE customers SET email_verified_at=?,email_verified_address=? WHERE id=? AND lower(trim(email))=?")
    .bind(stamp, email, account.customer_id, email).run();
  return { ok: true, account, session: await createCustomerSession(db, account.id, now) };
}

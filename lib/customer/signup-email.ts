// Sign-up email check: a 6-digit code goes to the email the client typed on the
// sign-up form. Typing it back proves the email is theirs; admin sees "Email verified".
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import type { SendEmail } from "@/lib/admin/email-verification";

export const SIGNUP_CODE_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const RESEND_WAIT_SECONDS = 60;

const hash = (id: string, code: string) => createHash("sha256").update(`signup:${id}:${code}`).digest("hex");
const validId = (id: string) => /^[\da-f-]{36}$/i.test(id);

type Row = { id: string; full_name: string; email: string; status: string; email_verified_at: string | null; email_code_hash: string | null;
  email_code_expires_at: string | null; email_code_attempts: number; email_code_sent_at: string | null; email_code_sends: number };

const load = (db: D1Database, id: string) =>
  db.prepare("SELECT id,full_name,email,status,email_verified_at,email_code_hash,email_code_expires_at,email_code_attempts,email_code_sent_at,email_code_sends FROM customer_signups WHERE id=?")
    .bind(id).first<Row>();

export function signupCodeEmail(name: string, code: string) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = `${code} is your KargoDoorPH sign-up code`;
  const text = [
    `Hi ${first},`,
    ``,
    `Thank you for signing up with KargoDoorPH! Your code is: ${code}`,
    ``,
    `Type it on the sign-up page to confirm your email. The code expires in ${SIGNUP_CODE_MINUTES} minutes.`,
    `If you did not sign up, you can ignore this email.`,
    ``,
    `Thank you for trusting KargoDoorPH.com! 💚 💙`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#0b1f45;line-height:1.5;max-width:520px">
<p>Hi ${first.replace(/[<>&"']/g, "")},</p>
<p>Thank you for signing up with KargoDoorPH! Your code is:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#003b9d;margin:8px 0 16px">${code}</p>
<p>Type it on the sign-up page to confirm your email.</p>
<p style="color:#5a6a88;font-size:14px">The code expires in ${SIGNUP_CODE_MINUTES} minutes. If you did not sign up, you can ignore this email.</p>
<p>Thank you for trusting KargoDoorPH.com! 💚 💙</p>
</div>`;
  return { subject, text, html };
}

export type SignupSendResult = "sent" | "wait" | "limit" | "verified" | "none";

export async function sendSignupCode(db: D1Database, id: string, send: SendEmail, now = new Date()): Promise<SignupSendResult> {
  if (!validId(id)) return "none";
  const row = await load(db, id);
  if (!row || row.status !== "New") return "none";
  if (row.email_verified_at) return "verified";
  if (row.email_code_sent_at && now.getTime() - Date.parse(row.email_code_sent_at) < RESEND_WAIT_SECONDS * 1000) return "wait";
  if (Number(row.email_code_sends) >= MAX_SENDS) return "limit";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(now.getTime() + SIGNUP_CODE_MINUTES * 60_000).toISOString();
  await send({ to: row.email, ...signupCodeEmail(row.full_name, code) });
  await db.prepare("UPDATE customer_signups SET email_code_hash=?,email_code_expires_at=?,email_code_attempts=0,email_code_sent_at=?,email_code_sends=email_code_sends+1 WHERE id=?")
    .bind(hash(id, code), expires, now.toISOString(), id).run();
  return "sent";
}

export type SignupVerifyResult = "verified" | "wrong" | "expired" | "locked" | "none";

export async function verifySignupCode(db: D1Database, id: string, typed: string, now = new Date()): Promise<SignupVerifyResult> {
  if (!validId(id)) return "none";
  const row = await load(db, id);
  if (!row || row.status === "Rejected") return "none";
  if (row.email_verified_at) return "verified";
  if (!row.email_code_hash || !row.email_code_expires_at) return "none";
  if (Date.parse(row.email_code_expires_at) <= now.getTime()) return "expired";
  if (Number(row.email_code_attempts) >= MAX_ATTEMPTS) return "locked";
  const code = String(typed ?? "").replace(/\D/g, "");
  const expected = Buffer.from(row.email_code_hash, "hex"), actual = Buffer.from(hash(id, code), "hex");
  if (code.length !== 6 || !timingSafeEqual(expected, actual)) {
    await db.prepare("UPDATE customer_signups SET email_code_attempts=email_code_attempts+1 WHERE id=?").bind(id).run();
    return Number(row.email_code_attempts) + 1 >= MAX_ATTEMPTS ? "locked" : "wrong";
  }
  await db.prepare("UPDATE customer_signups SET email_verified_at=?,email_code_hash=NULL,email_code_expires_at=NULL,updated_at=? WHERE id=?")
    .bind(now.toISOString(), now.toISOString(), id).run();
  return "verified";
}

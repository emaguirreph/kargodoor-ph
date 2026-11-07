import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { normalizeCustomerEmail } from "@/lib/customer/security";
import { AdminError } from "./security";
import { esc, hidden } from "./ui";

/**
 * Email OTP for customers. One email carries a 6-digit code and a "Confirm my email" link.
 * It is sent automatically when a new customer with an email is saved (or by the admin button).
 * The customer taps the link (verified automatically) or sends the code on Messenger for the admin to type in.
 */

export const CODE_HOURS = 24;
export const MAX_ATTEMPTS = 5;
const RESEND_WAIT_SECONDS = 60;
const DEFAULT_FROM = "KargoDoorPH <verify@kargodoorph.com>";
const DEFAULT_ORIGIN = "https://kargodoorph.com";

export type EmailEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string; ADMIN_ORIGIN?: string };
export type SendEmail = (message: { to: string; subject: string; text: string; html: string }) => Promise<void>;

export type EmailVerification = {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
  pendingSentAt: string | null;
  pendingExpiresAt: string | null;
};

const hashCode = (customerId: string, code: string) =>
  createHash("sha256").update(`${customerId}:${code}`).digest("hex");
const hashToken = (token: string) => createHash("sha256").update(`link:${token}`).digest("hex");
const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

export const confirmLink = (origin: string | undefined, customerId: string, token: string) =>
  `${(origin || DEFAULT_ORIGIN).replace(/\/$/, "")}/verify-email?c=${encodeURIComponent(customerId)}&t=${encodeURIComponent(token)}`;

export function resendSender(env: EmailEnv, fetcher: typeof fetch = fetch): SendEmail {
  return async ({ to, subject, text, html }) => {
    if (!env.RESEND_API_KEY)
      throw new AdminError("Email sending is not set up yet. Add the RESEND_API_KEY secret in Cloudflare first.", 503);
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || DEFAULT_FROM, to: [to], subject, text, html }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new AdminError(`The email could not be sent (${response.status}). ${detail}`.trim(), 502);
    }
  };
}

export function verificationEmail(name: string, code: string, link: string) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = "Confirm your email for KargoDoorPH";
  const text = [
    `Hi ${first},`,
    ``,
    `Please confirm your email for your KargoDoorPH account by opening this link:`,
    link,
    ``,
    `Or send us this one-time code on Messenger: ${code}`,
    ``,
    `The link and code expire in ${CODE_HOURS} hours and work only once.`,
    `If you did not request this, you can ignore this email.`,
    ``,
    `Thank you for trusting KargoDoorPH.com! 💚 💙`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#0b1f45;line-height:1.5;max-width:520px">
<p>Hi ${esc(first)},</p>
<p>Please confirm your email for your KargoDoorPH account.</p>
<p style="margin:22px 0"><a href="${esc(link)}" style="background:#003b9d;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;display:inline-block">Confirm my email</a></p>
<p>Button not working? Send us this one-time code on Messenger:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:8px;color:#003b9d;margin:6px 0 18px">${esc(code)}</p>
<p style="color:#5a6a88;font-size:14px">The link and code expire in ${CODE_HOURS} hours and work only once. If you did not request this, you can ignore this email.</p>
<p>Thank you for trusting KargoDoorPH.com! 💚 💙</p>
</div>`;
  return { subject, text, html };
}

export async function readEmailVerification(db: D1Database, customerId: string): Promise<EmailVerification> {
  const row = await db
    .prepare(
      "SELECT c.email,c.email_verified_at,c.email_verified_address,k.sent_at,k.expires_at FROM customers c LEFT JOIN customer_email_codes k ON k.customer_id=c.id WHERE c.id=?",
    )
    .bind(customerId)
    .first<{ email: string | null; email_verified_at: string | null; email_verified_address: string | null; sent_at: string | null; expires_at: string | null }>();
  const email = normalizeCustomerEmail(String(row?.email ?? ""));
  const verified = Boolean(email && row?.email_verified_at && normalizeCustomerEmail(String(row.email_verified_address ?? "")) === email);
  return {
    email,
    verified,
    verifiedAt: verified ? row!.email_verified_at : null,
    pendingSentAt: row?.sent_at ?? null,
    pendingExpiresAt: row?.expires_at ?? null,
  };
}

export async function sendEmailCode(db: D1Database, customerId: string, send: SendEmail, now = new Date(), origin?: string) {
  const customer = await db.prepare("SELECT full_name,email FROM customers WHERE id=?").bind(customerId).first<{ full_name: string; email: string | null }>();
  if (!customer) throw new AdminError("Record not found.", 404);
  const email = normalizeCustomerEmail(String(customer.email ?? ""));
  if (!email) throw new AdminError("Add a valid email to this customer before sending a code.");
  const last = await db.prepare("SELECT sent_at FROM customer_email_codes WHERE customer_id=?").bind(customerId).first<{ sent_at: string }>();
  if (last && now.getTime() - Date.parse(last.sent_at) < RESEND_WAIT_SECONDS * 1000)
    throw new AdminError("A code was just sent. Wait a minute before sending another one.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(24).toString("base64url");
  const expires = new Date(now.getTime() + CODE_HOURS * 3_600_000).toISOString();
  await db
    .prepare(
      "INSERT INTO customer_email_codes (customer_id,email,code_hash,link_token_hash,expires_at,attempts,sent_at) VALUES (?,?,?,?,?,0,?) ON CONFLICT(customer_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,link_token_hash=excluded.link_token_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at",
    )
    .bind(customerId, email, hashCode(customerId, code), hashToken(token), expires, now.toISOString())
    .run();
  try {
    await send({ to: email, ...verificationEmail(customer.full_name, code, confirmLink(origin, customerId, token)) });
  } catch (error) {
    await db.prepare("DELETE FROM customer_email_codes WHERE customer_id=?").bind(customerId).run();
    throw error;
  }
  return { email };
}

export type CheckResult = "verified" | "wrong" | "expired" | "locked" | "none";

type PendingRow = { email: string; code_hash: string; link_token_hash: string; expires_at: string; attempts: number; current_email: string | null };

async function pending(db: D1Database, customerId: string) {
  const row = await db
    .prepare("SELECT k.email,k.code_hash,k.link_token_hash,k.expires_at,k.attempts,c.email AS current_email FROM customer_email_codes k JOIN customers c ON c.id=k.customer_id WHERE k.customer_id=?")
    .bind(customerId)
    .first<PendingRow>();
  if (row && normalizeCustomerEmail(String(row.current_email ?? "")) !== row.email) {
    await db.prepare("DELETE FROM customer_email_codes WHERE customer_id=?").bind(customerId).run();
    return null;
  }
  return row;
}

async function markVerified(db: D1Database, customerId: string, email: string, now: Date) {
  const stamp = now.toISOString();
  await db.prepare("UPDATE customers SET email_verified_at=?,email_verified_address=?,updated_at=? WHERE id=?").bind(stamp, email, stamp, customerId).run();
  await db.prepare("DELETE FROM customer_email_codes WHERE customer_id=?").bind(customerId).run();
}

/** Admin typed the code the customer sent on Messenger. */
export async function checkEmailCode(db: D1Database, customerId: string, typed: string, now = new Date()): Promise<CheckResult> {
  const code = String(typed ?? "").replace(/\D/g, "");
  const row = await pending(db, customerId);
  if (!row) return "none";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (code.length !== 6 || !sameHash(row.code_hash, hashCode(customerId, code))) {
    await db.prepare("UPDATE customer_email_codes SET attempts=attempts+1 WHERE customer_id=?").bind(customerId).run();
    return row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong";
  }
  await markVerified(db, customerId, row.email, now);
  return "verified";
}

/** Customer tapped "Confirm my email" in the email. */
export async function confirmEmailLink(db: D1Database, customerId: string, token: string, now = new Date()): Promise<"verified" | "already" | "invalid" | "expired"> {
  if (!/^[\da-f-]{36}$/i.test(customerId) || !/^[\w-]{20,64}$/.test(token)) return "invalid";
  const row = await pending(db, customerId);
  if (!row) return (await readEmailVerification(db, customerId)).verified ? "already" : "invalid";
  if (!sameHash(row.link_token_hash, hashToken(token))) return "invalid";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  await markVerified(db, customerId, row.email, now);
  return "verified";
}

const notices: Record<string, string> = {
  sent: "Email sent. The customer can tap Confirm my email, or send you the 6-digit code to type below.",
  autosent: "Verification email sent to the customer automatically.",
  autofail: "Customer saved, but the verification email could not be sent. Use Send verification code below.",
  verified: "Email verified. ✓",
  wrong: "That code doesn't match. Check it with the customer and try again.",
  expired: "That code has expired. Send a new one.",
  locked: "Too many wrong tries. Send a new code.",
  none: "No code is waiting for this customer. Send a code first.",
};

const manila = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "";

export function emailVerificationSection(v: EmailVerification, opts: { path: string; csrf: string; customerId: string; canWrite: boolean; outcome?: string | null; now?: Date }) {
  const now = opts.now ?? new Date();
  const notice = opts.outcome && notices[opts.outcome]
    ? `<p class="notice" role="status">${esc(notices[opts.outcome])}</p>`
    : "";
  const pending = !v.verified && v.pendingExpiresAt && Date.parse(v.pendingExpiresAt) > now.getTime();
  const status = !v.email
    ? `<span class="k-pill" data-k="gray">No email</span>`
    : v.verified
      ? `<span class="k-pill" data-k="green">Verified</span>`
      : pending
        ? `<span class="k-pill" data-k="amber">Waiting for customer</span>`
        : `<span class="k-pill" data-k="red">Not verified</span>`;
  const detail = !v.email
    ? "Add the customer's email above to send a verification code."
    : v.verified
      ? `${esc(v.email)} · verified ${esc(manila(v.verifiedAt))}`
      : pending
        ? `${esc(v.email)} · code sent ${esc(manila(v.pendingSentAt))}, expires ${esc(manila(v.pendingExpiresAt))}`
        : `${esc(v.email)} · not verified yet`;
  const form = (action: string, inner: string) =>
    `<form method="post" action="${esc(opts.path)}" class="email-otp-form">${hidden("csrf", opts.csrf)}${hidden("action", action)}${hidden("customer_id", opts.customerId)}${inner}</form>`;
  const actions = opts.canWrite && v.email && !v.verified
    ? `<div class="customer-portal-actions">${form("email_code_send", `<button>${pending ? "Send a new code" : "Send verification code"}</button>`)}${pending ? form("email_code_check", `<label>Code from customer <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required placeholder="123456" style="max-width:10em"></label><button>Check code</button>`) : ""}</div>`
    : "";
  return `
        <section class="customer-portal-access" id="email-verification">
          <div class="customer-portal-main">
            <h2>Email Verification</h2>
            ${notice}
            <p class="muted">${detail}</p>
            ${actions}
          </div>
          <dl class="customer-portal-status">
            <dt>Status</dt>
            <dd>${status}</dd>
          </dl>
        </section>`;
}

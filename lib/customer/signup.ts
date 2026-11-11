// Online sign-up for new clients. The client fills in their details and picks a
// password; nothing is live until an admin approves it in admin → Bookings → Sign-ups.
import type { D1Database } from "@cloudflare/workers-types";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizePhMobile } from "@/lib/booking-rules";
import { customerPasswordHash, normalizeCustomerEmail, verifyCustomerPassword, type CustomerAccount } from "./security";

export class SignupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const signupHeardFrom = ["Facebook", "TikTok", "Instagram", "Google", "Friend or referral", "Other"] as const;
/** Sign-ups one browser may send in 24 hours. */
const signupDailyLimit = 5;

const text = (max: number) => z.string().trim().max(max);

export const signupInput = z.object({
  fullName: text(160).min(2, "Please enter your full name."),
  companyName: text(160).optional().default(""),
  mobile: z.string().transform((value, ctx) => {
    const mobile = normalizePhMobile(value);
    if (!mobile) ctx.addIssue({ code: "custom", message: "Please enter a valid PH mobile number (09XX XXX XXXX)." });
    return mobile ?? "";
  }),
  email: text(254).transform((value) => normalizeCustomerEmail(value))
    .refine((value) => z.string().email().safeParse(value).success, "Please enter a valid email address."),
  // Not asked on the sign-up form any more (Em, 2026-11-11); still accepted if sent.
  address: text(400).optional().default(""),
  shipsWhat: text(300).optional().default(""),
  heardFrom: z.union([z.enum(signupHeardFrom), z.literal("")]).optional().default(""),
  referralCode: text(40).optional().default("").transform((value) => value.toUpperCase())
    .refine((value) => !value || /^[A-Z0-9-]{3,40}$/.test(value), "Please check the referral code."),
  password: z.string().min(8, "Your password needs at least 8 characters.").max(1024),
  confirmPassword: z.string(),
  consent: z.string().refine((value) => value === "1", "Please agree so we can contact you about your account."),
}).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "The two passwords do not match." });
export type SignupInput = z.infer<typeof signupInput>;

/** Hashed so the raw IP address is never stored. */
export const signupClientKey = (ip: string | null) => ip ? createHash("sha256").update(`kd-signup:${ip}`).digest("hex").slice(0, 32) : null;

const mobileMatchesCustomer = "replace(replace(replace(replace(replace(replace(c.mobile,' ',''),'-',''),'(',''),')',''),'+',''),'.','') IN (?,?,?)";
const mobileForms = (mobile: string) => [mobile, mobile.slice(1), `63${mobile.slice(1)}`];

/** True if a portal sign-in already uses this email or mobile number. */
export async function portalLoginTaken(db: D1Database, email: string, mobile: string) {
  return Boolean(await db.prepare(`SELECT a.id FROM customer_accounts a JOIN customers c ON c.id = a.customer_id
      WHERE a.login_email = ? OR a.login_mobile = ? OR ${mobileMatchesCustomer} LIMIT 1`)
    .bind(email, mobile, ...mobileForms(mobile)).first());
}

export function parseSignupForm(form: FormData) {
  // Bots fill every field; people never see this one.
  if (String(form.get("website") ?? "").trim()) throw new SignupError("We could not send your sign-up. Please message us on Messenger.");
  const value = (name: string) => String(form.get(name) ?? "");
  const parsed = signupInput.safeParse({
    fullName: value("full_name"), companyName: value("company_name"), mobile: value("mobile"), email: value("email"),
    address: value("address"), shipsWhat: value("ships_what"), heardFrom: value("heard_from"), referralCode: value("referral_code"),
    password: value("password"), confirmPassword: value("confirm_password"), consent: value("consent"),
  });
  if (!parsed.success) throw new SignupError(parsed.error.issues[0]?.message ?? "Please check your details.");
  return parsed.data;
}

export async function saveSignup(db: D1Database, input: SignupInput, ip: string | null) {
  const key = signupClientKey(ip);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [waiting, recent] = await Promise.all([
    db.prepare("SELECT 1 FROM customer_signups WHERE status = 'New' AND (mobile = ? OR email = ?) LIMIT 1").bind(input.mobile, input.email).first(),
    key ? db.prepare("SELECT COUNT(*) AS n FROM customer_signups WHERE client_key = ? AND created_at >= ?").bind(key, since).first<{ n: number }>() : null,
  ]);
  if (await portalLoginTaken(db, input.email, input.mobile))
    throw new SignupError("You already have a KargoDoor account. Please sign in, or message us on Messenger if you forgot your password.", 409);
  if (waiting) throw new SignupError("We already have your sign-up and we're checking it. We'll message you once it's approved.", 409);
  if (Number(recent?.n ?? 0) >= signupDailyLimit)
    throw new SignupError("Too many sign-ups from this device today. Please message us on Messenger.", 429);

  const salt = randomBytes(32).toString("hex");
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO customer_signups (id, full_name, company_name, mobile, email, address, ships_what, heard_from, referral_code,
      password_hash, password_salt, password_n, password_r, password_p, password_key_length, status, client_key, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,32768,8,1,64,'New',?,?,?)`)
    .bind(id, input.fullName, input.companyName || null, input.mobile, input.email, input.address, input.shipsWhat || null,
      input.heardFrom || null, input.referralCode || null, customerPasswordHash(input.password, salt), salt, key, now, now).run();
  return { id };
}

/**
 * When a sign-in fails: is this a sign-up that is still waiting or was not approved?
 * Only answered when the password matches, so nobody can check someone else's email.
 */
export async function signupStatusForLogin(db: D1Database, identifier: string, password: string): Promise<"pending" | "declined" | null> {
  const email = normalizeCustomerEmail(identifier);
  const mobile = normalizePhMobile(identifier);
  if (!email.includes("@") && !mobile) return null;
  const row = await db.prepare(`SELECT * FROM customer_signups WHERE status IN ('New','Rejected') AND ${email.includes("@") ? "email = ?" : "mobile = ?"}
      ORDER BY created_at DESC LIMIT 1`).bind(email.includes("@") ? email : mobile).first<Record<string, unknown>>();
  if (!row) return null;
  const account = { ...row, password_state: "active", enabled: 1 } as unknown as CustomerAccount;
  if (!verifyCustomerPassword(password, account)) return null;
  return row.status === "New" ? "pending" : "declined";
}

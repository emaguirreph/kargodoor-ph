import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";

export const customerSessionCookie = "kargodoor_customer_session";
const sessionSeconds = 60 * 60 * 24 * 7;

export type CustomerAccount = {
  id: string;
  customer_id: string;
  full_name: string;
  login_email: string;
  password_hash: string;
  password_salt: string;
  password_n: number;
  password_r: number;
  password_p: number;
  password_key_length: number;
  enabled: number;
  password_state: "temporary" | "active";
};

export const normalizeCustomerEmail = (email: string) => email.trim().toLowerCase();
export const hashSessionToken = (token: string) => createHash("sha256").update(token).digest("hex");

function scrypt(password: string, salt: string, n: number, r: number, p: number, keyLength: number) {
  if (!Number.isInteger(n) || n < 16_384 || n > 65_536 || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4 || !Number.isInteger(keyLength) || keyLength < 32 || keyLength > 128)
    throw new Error("Invalid password hash parameters.");
  return scryptSync(password, salt, keyLength, { N: n, r, p, maxmem: 128 * 1024 * 1024 });
}

export function verifyCustomerPassword(password: string, account: CustomerAccount) {
  try {
    const expected = Buffer.from(account.password_hash, "hex");
    const actual = scrypt(password, account.password_salt, Number(account.password_n), Number(account.password_r), Number(account.password_p), Number(account.password_key_length));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function customerPasswordHash(password: string, salt: string, n = 32_768, r = 8, p = 1, keyLength = 64) {
  return scrypt(password, salt, n, r, p, keyLength).toString("hex");
}

export async function loginCustomer(db: D1Database, email: string, password: string) {
  const account = await db.prepare(`SELECT a.*,c.full_name FROM customer_accounts a
    JOIN customers c ON c.id=a.customer_id WHERE a.login_email=? LIMIT 1`)
    .bind(normalizeCustomerEmail(email)).first<CustomerAccount>();
  if (!account || Number(account.enabled) !== 1 || !verifyCustomerPassword(password, account)) return null;
  return { account, session: await createCustomerSession(db, account.id) };
}

export async function createCustomerSession(db: D1Database, accountId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + sessionSeconds * 1000).toISOString();
  await db.prepare("INSERT INTO customer_sessions (id,customer_account_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(randomBytes(16).toString("hex"), accountId, hashSessionToken(token), now.toISOString(), expires).run();
  return { token, expires };
}

export async function customerSession(db: D1Database, token: string | undefined, now = new Date()) {
  if (!token || token.length > 512) return null;
  return await db.prepare(`SELECT a.id,a.customer_id,c.full_name,a.login_email,a.password_state
    FROM customer_sessions s JOIN customer_accounts a ON a.id=s.customer_account_id
    JOIN customers c ON c.id=a.customer_id
    WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1 LIMIT 1`)
    .bind(hashSessionToken(token), now.toISOString()).first<Pick<CustomerAccount, "id" | "customer_id" | "full_name" | "login_email" | "password_state">>();
}

export async function replaceCustomerPassword(db: D1Database, accountId: string, password: string) {
  const salt = randomBytes(32).toString("hex"), now = new Date().toISOString();
  await db.prepare("UPDATE customer_accounts SET password_hash=?,password_salt=?,password_algorithm='scrypt',password_n=32768,password_r=8,password_p=1,password_key_length=64,password_state='active',updated_at=? WHERE id=?")
    .bind(customerPasswordHash(password, salt), salt, now, accountId).run();
  await db.prepare("DELETE FROM customer_sessions WHERE customer_account_id=?").bind(accountId).run();
}

export async function deleteCustomerSession(db: D1Database, token: string | undefined) {
  if (!token || token.length > 512) return;
  await db.prepare("DELETE FROM customer_sessions WHERE token_hash=?").bind(hashSessionToken(token)).run();
}

export const customerSessionCookieValue = (token: string) =>
  `${customerSessionCookie}=${token}; Path=/customer; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Lax`;
export const clearCustomerSessionCookie = () =>
  `${customerSessionCookie}=; Path=/customer; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function requestCookie(request: Request, name: string) {
  const value = request.headers.get("cookie") ?? "";
  return value.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

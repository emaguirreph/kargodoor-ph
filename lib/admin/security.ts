import type { D1Database } from "@cloudflare/workers-types";
import {
  createHmac,
  timingSafeEqual,
  createPublicKey,
  verify,
  scryptSync,
} from "node:crypto";
export type AdminEnv = {
  ADMIN_DB: D1Database;
  ADMIN_ORIGIN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_CSRF_SECRET?: string;
  ADMIN_LOCAL_DEV?: string;
  LOCAL_ADMIN_EMAIL?: string;
  LOCAL_ADMIN_HASH?: string;
};
export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const secureHeaders = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
export function canonicalOrigin(env: AdminEnv) {
  if (!env.ADMIN_ORIGIN)
    throw new AdminError("Admin configuration is incomplete.", 503);
  const url = new URL(env.ADMIN_ORIGIN);
  if (
    url.origin !== env.ADMIN_ORIGIN ||
    (url.protocol !== "https:" &&
      !(
        env.ADMIN_LOCAL_DEV === "true" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new AdminError("Admin origin is invalid.", 503);
  return url.origin;
}
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function csrfToken(
  env: AdminEnv,
  user: string,
  path: string,
  expires = Math.floor(Date.now() / 1000) + 3600,
) {
  if (!env.ADMIN_CSRF_SECRET || env.ADMIN_CSRF_SECRET.length < 32)
    throw new AdminError("Admin security is not configured.", 503);
  return `${expires}.${createHmac("sha256", env.ADMIN_CSRF_SECRET).update(`${user}|${path}|${expires}`).digest("hex")}`;
}
export function checkCsrf(
  env: AdminEnv,
  user: string,
  path: string,
  token: string,
) {
  const expires = Number(token.split(".")[0]);
  if (
    !Number.isSafeInteger(expires) ||
    expires < Date.now() / 1000 ||
    expires > Date.now() / 1000 + 3605 ||
    !equal(token, csrfToken(env, user, path, expires))
  )
    throw new AdminError(
      "This form expired. Reload the page and try again.",
      403,
    );
}
type Key = {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
};
let cache: { domain: string; expires: number; keys: Key[] } | undefined;
export function validateJwt(
  token: string,
  keys: Key[],
  issuer: string,
  audience: string,
) {
  try {
    if (token.length > 16000) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const key = keys.find(
      (k) =>
        k.kid === header.kid && k.kty === "RSA" && (!k.use || k.use === "sig"),
    );
    if (
      header.alg !== "RS256" ||
      !key ||
      !verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(parts[2], "base64url"),
      )
    )
      throw new Error();
    const now = Date.now() / 1000;
    if (
      payload.iss !== issuer ||
      !Array.isArray(payload.aud) ||
      !payload.aud.includes(audience) ||
      typeof payload.exp !== "number" ||
      payload.exp <= now ||
      typeof payload.iat !== "number" ||
      payload.iat > now + 30 ||
      (payload.nbf !== undefined &&
        (typeof payload.nbf !== "number" || payload.nbf > now + 30)) ||
      typeof payload.email !== "string" ||
      !payload.email ||
      typeof payload.sub !== "string" ||
      !payload.sub
    )
      throw new Error();
    return payload.email.toLowerCase();
  } catch {
    throw new AdminError("Sign in through Cloudflare Access to continue.", 401);
  }
}
export async function authenticate(request: Request, env: AdminEnv) {
  const origin = canonicalOrigin(env);
  if (new URL(request.url).origin !== origin)
    throw new AdminError("Admin is unavailable on this address.", 403);
  if (!env.ADMIN_DB)
    throw new AdminError("Admin database is not configured.", 503);
  let email: string;
  // Explicit local-only password authentication. Production always validates Access JWTs.
  if (
    env.ADMIN_LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
  ) {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Basic ") || auth.length > 2048)
      throw new AdminError("Local admin sign-in required.", 401);
    const credentials = Buffer.from(auth.slice(6), "base64").toString();
    const colon = credentials.indexOf(":");
    const [salt, hash] = (env.LOCAL_ADMIN_HASH ?? "").split(":");
    if (
      !salt ||
      !hash ||
      colon < 0 ||
      !equal(
        scryptSync(credentials.slice(colon + 1), salt, 64).toString("hex"),
        hash,
      ) ||
      credentials.slice(0, colon).toLowerCase() !==
        env.LOCAL_ADMIN_EMAIL?.toLowerCase()
    )
      throw new AdminError("Local admin sign-in required.", 401);
    email = env.LOCAL_ADMIN_EMAIL!.toLowerCase();
  } else {
    const domain = env.ACCESS_TEAM_DOMAIN;
    if (
      !domain ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
      !env.ACCESS_AUD
    )
      throw new AdminError("Cloudflare Access is not configured.", 503);
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token)
      throw new AdminError(
        "Sign in through Cloudflare Access to continue.",
        401,
      );
    if (!cache || cache.domain !== domain || cache.expires < Date.now()) {
      const result = await fetch(`https://${domain}/cdn-cgi/access/certs`, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!result.ok)
        throw new AdminError(
          "Unable to verify sign-in. Please try again.",
          503,
        );
      const body = (await result.json()) as { keys: Key[] };
      if (!Array.isArray(body.keys))
        throw new AdminError("Unable to verify sign-in.", 503);
      cache = { domain, expires: Date.now() + 60000, keys: body.keys };
    }
    email = validateJwt(token, cache.keys, `https://${domain}`, env.ACCESS_AUD);
  }
  const user = await env.ADMIN_DB.prepare(
    "SELECT id, name, email, role FROM admin_users WHERE email = ? AND role IN ('admin','owner')",
  )
    .bind(email)
    .first<{ id: string; name: string; email: string; role: string }>();
  if (!user)
    throw new AdminError(
      "Your account is not authorized for KargoDoor Admin.",
      403,
    );
  return user;
}

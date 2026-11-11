import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { resendSender, type EmailEnv } from "@/lib/admin/email-verification";
import { sendLoginCode, verifyLoginCode } from "@/lib/customer/login-code";
import { customerSessionCookieValue } from "@/lib/customer/security";

export const runtime = "nodejs";

const go = (request: Request, query: Record<string, string>) =>
  Response.redirect(new URL(`/customer/login?${new URLSearchParams({ mode: "code", ...query })}`, request.url), 303);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).origin !== new URL(request.url).origin))
    return go(request, { error: "1" });
  if (Number(request.headers.get("content-length") ?? 0) > 5_000) return go(request, { error: "1" });
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  if (!email.includes("@")) return go(request, { error: "email" });
  const { env } = await getCloudflareContext();
  const db = env.ADMIN_DB as unknown as D1Database;
  try {
    if (form.get("action") === "verify") {
      const result = await verifyLoginCode(db, email, String(form.get("code") ?? ""));
      if (!result.ok) return go(request, { step: "code", email, error: result.reason });
      return new Response(null, { status: 303, headers: {
        Location: new URL("/customer", request.url).href,
        "Set-Cookie": customerSessionCookieValue(result.session.token),
        "Cache-Control": "no-store",
      } });
    }
    const sent = await sendLoginCode(db, email, resendSender(env as unknown as EmailEnv));
    return go(request, { step: "code", email, ...(sent === "wait" ? { notice: "wait" } : {}) });
  } catch (error) {
    console.error("Login code failed", error);
    return go(request, { error: "send", email });
  }
}

export const GET = (request: Request) => go(request, {});

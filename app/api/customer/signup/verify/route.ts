import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { resendSender, type EmailEnv } from "@/lib/admin/email-verification";
import { sendSignupCode, verifySignupCode } from "@/lib/customer/signup-email";
import { autoApproveSignup } from "@/lib/admin/signups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const messages: Record<string, string> = {
  wrong: "That code is not right. Please check your email and try again.",
  expired: "That code has expired. Tap “Send a new code”.",
  locked: "Too many wrong tries. Tap “Send a new code”.",
  none: "We could not find your sign-up. Please message us on Messenger.",
  wait: "A code was just sent. Please wait a minute before asking for another.",
  limit: "Too many codes sent. Please message us on Messenger.",
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== new URL(request.url).host))
    return json({ error: "Please use kargodoorph.com." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 2_000) return json({ error: "Request too long." }, 413);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const { env } = await getCloudflareContext();
  const db = (env as unknown as { ADMIN_DB: D1Database }).ADMIN_DB;
  try {
    if (form.get("action") === "resend") {
      const result = await sendSignupCode(db, id, resendSender(env as unknown as EmailEnv));
      return result === "sent" || result === "verified" ? json({ ok: true, result }) : json({ error: messages[result] }, 400);
    }
    const result = await verifySignupCode(db, id, String(form.get("code") ?? ""));
    if (result !== "verified") return json({ error: messages[result] }, 400);
    // Right code: approve right away unless it needs Em to look at it.
    const approved = await autoApproveSignup(db, id).then(Boolean).catch((error) => {
      console.error("Auto-approve failed", error instanceof Error ? error.message : error);
      return false;
    });
    return json({ ok: true, approved });
  } catch (error) {
    console.error("Sign-up code failed", error instanceof Error ? error.message : error);
    return json({ error: "We could not send the code right now. Please try again." }, 500);
  }
}

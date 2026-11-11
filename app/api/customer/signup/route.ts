import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { parseSignupForm, saveSignup, SignupError } from "@/lib/customer/signup";
import { sendSignupAlert } from "@/lib/leads/notify";
import { resendSender, type EmailEnv } from "@/lib/admin/email-verification";
import { sendSignupCode } from "@/lib/customer/signup-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== new URL(request.url).host))
      throw new SignupError("Sign-ups can only be sent from kargodoorph.com.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 20_000) throw new SignupError("Your sign-up is too long. Please shorten it.", 413);
    const { env, ctx } = await getCloudflareContext();
    const db = (env as unknown as { ADMIN_DB: D1Database }).ADMIN_DB;
    const input = parseSignupForm(await request.formData());
    const { id } = await saveSignup(db, input, request.headers.get("cf-connecting-ip"));
    ctx.waitUntil(sendSignupAlert((env as unknown as { LEAD_EMAIL?: Parameters<typeof sendSignupAlert>[0] }).LEAD_EMAIL, {
      fullName: input.fullName, mobile: input.mobile, email: input.email, address: input.address,
      shipsWhat: input.shipsWhat, heardFrom: input.heardFrom, referralCode: input.referralCode,
    }));
    // Send the 6-digit email code. If it can't go out, the sign-up is still saved.
    const codeSent = await sendSignupCode(db, id, resendSender(env as unknown as EmailEnv)).then((r) => r === "sent")
      .catch((error) => { console.error("Sign-up code email failed", error instanceof Error ? error.message : error); return false; });
    return json({ ok: true, id, codeSent, email: input.email });
  } catch (error) {
    if (error instanceof SignupError) return json({ error: error.message }, error.status);
    console.error("Customer sign-up failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Something went wrong on our side. Please try again or message us on Messenger." }, 500);
  }
}

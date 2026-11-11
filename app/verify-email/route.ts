import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { confirmEmailLink } from "@/lib/admin/email-verification";
import { esc } from "@/lib/admin/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function view(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · KargoDoorPH</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fc;font-family:Arial,sans-serif;color:#0b1f45;padding:16px;box-sizing:border-box}.card{background:#fff;border:1px solid #e1e8f3;border-radius:18px;box-shadow:0 18px 40px -26px rgba(0,40,120,.35);padding:32px 26px;max-width:440px;width:100%;box-sizing:border-box;text-align:center}img{height:56px}h1{color:#003b9d;font-size:1.5rem;margin:18px 0 10px}p{line-height:1.5;color:#3e4c68}button,a.btn{display:inline-block;margin-top:14px;background:#003b9d;color:#fff;border:0;border-radius:999px;padding:14px 28px;font-size:1rem;font-weight:700;text-decoration:none;cursor:pointer}</style></head>
<body><main class="card"><img src="/assets/kargodoor-logo-tagline-transparent.png" alt="KargoDoorPH">${body}<p style="margin-top:22px">Thank you for trusting KargoDoorPH.com! 💚 💙</p></main></body></html>`, { status, headers });
}

const params = (url: URL) => ({ c: url.searchParams.get("c") ?? "", t: url.searchParams.get("t") ?? "" });

// GET only shows a button: email scanners that open links must not verify by themselves.
export function GET(request: Request) {
  const { c, t } = params(new URL(request.url));
  if (!c || !t) return view("Link not valid", `<h1>Link not valid</h1><p>Please open the link from your KargoDoorPH email again.</p>`, 400);
  return view("Confirm your email", `<h1>Confirm your email</h1><p>Tap the button to confirm this email for your KargoDoorPH account.</p><form method="post" action="/verify-email?c=${encodeURIComponent(c)}&amp;t=${encodeURIComponent(t)}"><button type="submit">Confirm my email</button></form>`);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== "null" && new URL(origin).origin !== new URL(request.url).origin))
    return new Response("Invalid request origin.", { status: 403 });
  const { c, t } = params(new URL(request.url));
  const { env } = await getCloudflareContext();
  const result = await confirmEmailLink(env.ADMIN_DB as unknown as D1Database, c, t);
  if (result === "verified" || result === "already")
    return view("Email confirmed", `<h1>Email confirmed ✓</h1><p>Thank you! Your email is now verified. You can go back to Messenger and we'll send your warehouse address and Cargo Code.</p>`);
  if (result === "expired")
    return view("Link expired", `<h1>Link expired</h1><p>This link has expired. Message us on Messenger and we'll send you a new one.</p>`, 410);
  return view("Link not valid", `<h1>Link not valid</h1><p>This link was already used or replaced by a newer email. Message us on Messenger if you need a new one.</p>`, 400);
}

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { clearCustomerSessionCookie, customerSessionCookie, deleteCustomerSession, requestCookie } from "@/lib/customer/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).origin !== new URL(request.url).origin))
    return new Response("Invalid request origin.", { status: 403 });
  const { env } = await getCloudflareContext();
  await deleteCustomerSession(env.ADMIN_DB, requestCookie(request, customerSessionCookie));
  return new Response(null, { status: 303, headers: {
    Location: new URL("/customer/login", request.url).href,
    "Set-Cookie": clearCustomerSessionCookie(),
    "Cache-Control": "no-store",
  } });
}

export const GET = () => new Response("Method not allowed.", { status: 405, headers: { Allow: "POST" } });

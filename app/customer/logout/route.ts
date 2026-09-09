import { getCloudflareContext } from "@opennextjs/cloudflare";
import { clearCustomerSessionCookie, customerSessionCookie, deleteCustomerSession, requestCookie } from "@/lib/customer/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).origin !== new URL(request.url).origin))
    return new Response("Invalid request origin.", { status: 403 });
  const { env } = await getCloudflareContext();
  await deleteCustomerSession(env.ADMIN_DB, requestCookie(request, customerSessionCookie));
  const response = Response.redirect(new URL("/customer/login", request.url), 303);
  response.headers.set("Set-Cookie", clearCustomerSessionCookie());
  return response;
}

export const GET = () => new Response("Method not allowed.", { status: 405, headers: { Allow: "POST" } });

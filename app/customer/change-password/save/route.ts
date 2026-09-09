import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createCustomerSession, customerSession, customerSessionCookie, customerSessionCookieValue, replaceCustomerPassword, requestCookie } from "@/lib/customer/security";

export async function POST(request: Request) {
  const failure = () => Response.redirect(new URL("/customer/change-password", request.url), 303);
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
      return new Response("Invalid request origin.", { status: 403 });
    const { env } = await getCloudflareContext();
    const account = await customerSession(env.ADMIN_DB, requestCookie(request, customerSessionCookie));
    if (!account) return Response.redirect(new URL("/customer/login", request.url), 303);
    if (account.password_state !== "temporary") return Response.redirect(new URL("/customer", request.url), 303);
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirm_password") ?? "");
    if (password.length < 8 || password.length > 1024 || password !== confirmation) return failure();
    await replaceCustomerPassword(env.ADMIN_DB, account.id, password);
    const session = await createCustomerSession(env.ADMIN_DB, account.id);
    return new Response(null, { status: 303, headers: {
      Location: new URL("/customer", request.url).href,
      "Set-Cookie": customerSessionCookieValue(session.token),
      "Cache-Control": "no-store",
    } });
  } catch {
    return failure();
  }
}

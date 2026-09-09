import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerSessionCookieValue, loginCustomer, normalizeCustomerEmail } from "@/lib/customer/security";

export const runtime = "nodejs";

const failed = (request: Request) => Response.redirect(new URL("/customer/login?error=1", request.url), 303);

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).origin !== new URL(request.url).origin)) return failed(request);
    if (Number(request.headers.get("content-length") ?? 0) > 10_000) return failed(request);
    const form = await request.formData();
    const email = normalizeCustomerEmail(String(form.get("email") ?? ""));
    const password = String(form.get("password") ?? "");
    if (!email || email.length > 320 || !password || password.length > 1_024) return failed(request);
    const { env } = await getCloudflareContext();
    const login = await loginCustomer(env.ADMIN_DB, email, password);
    if (!login) return failed(request);
    const response = Response.redirect(new URL("/customer", request.url), 303);
    response.headers.set("Set-Cookie", customerSessionCookieValue(login.session.token));
    return response;
  } catch {
    return failed(request);
  }
}

export const GET = (request: Request) => failed(request);

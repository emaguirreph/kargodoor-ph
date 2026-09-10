import { getCloudflareContext } from "@opennextjs/cloudflare";
import { calculateAdminQuote } from "@/lib/admin/quotation-calculation";
import { AdminError, authenticate, canMutateAdmin, checkCsrf, secureHeaders, type AdminEnv } from "@/lib/admin/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
    checkCsrf(env, user.id, "/admin/quotations", request.headers.get("x-csrf-token") ?? "");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminError("Invalid calculation input.");
    return Response.json(calculateAdminQuote(body as Record<string, unknown>), { headers: secureHeaders });
  } catch (error) {
    const status = error instanceof AdminError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Invalid calculation input.";
    return Response.json({ error: message }, { status, headers: secureHeaders });
  }
}

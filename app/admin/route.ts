import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  AdminError,
  authenticate,
  secureHeaders,
  type AdminEnv,
} from "@/lib/admin/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { env } = await getCloudflareContext();
    await authenticate(request, env as unknown as AdminEnv);
    return new Response(null, {
      status: 307,
      headers: {
        ...secureHeaders,
        Location: new URL("/admin/dashboard", request.url).toString(),
      },
    });
  } catch (error) {
    const status = error instanceof AdminError ? error.status : 500;
    const message = error instanceof AdminError ? error.message : "Admin is unavailable.";
    return new Response(message, {
      status,
      headers: { ...secureHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export function POST() {
  return new Response("Method not allowed.", { status: 405, headers: secureHeaders });
}

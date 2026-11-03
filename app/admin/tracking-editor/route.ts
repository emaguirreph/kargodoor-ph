import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  AdminError,
  authenticate,
  secureHeaders,
  type AdminEnv,
} from "@/lib/admin/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The old Tracking editor wrote to a separate tracking database that the
// public Track page no longer reads. Customers see the Status and Tracking
// remarks saved in Edit shipment, so this address now opens Shipments.
export async function GET(request: Request) {
  try {
    const { env } = await getCloudflareContext();
    await authenticate(request, env as unknown as AdminEnv);
    return new Response(null, {
      status: 307,
      headers: {
        ...secureHeaders,
        Location: new URL("/admin/shipments", request.url).toString(),
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
  return new Response("The Tracking editor moved: update tracking in Shipments › Edit shipment.", {
    status: 410,
    headers: { ...secureHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

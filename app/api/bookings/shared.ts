import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { BookingError } from "@/lib/bookings-server";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function bookingEnv() {
  const { env, ctx } = await getCloudflareContext();
  return { db: (env as unknown as { ADMIN_DB: D1Database }).ADMIN_DB, env: env as unknown as Record<string, unknown>, ctx };
}

/** Same-site requests only: the chat on kargodoorph.com (or a local preview). */
export function sameSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export function failure(error: unknown, fallback: string) {
  if (error instanceof BookingError) return json({ error: error.message }, error.status);
  console.error(fallback, error instanceof Error ? error.message : "Unknown error");
  return json({ error: "Something went wrong on our side. Please try again or message us on Messenger." }, 500);
}

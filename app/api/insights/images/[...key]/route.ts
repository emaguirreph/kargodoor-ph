import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AdminEnv } from "@/lib/admin/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const objectKey = key.join("/");
  if (!/^[\da-f-]{36}$/i.test(objectKey)) return new Response("Not found", { status: 404 });
  const { env: cf } = await getCloudflareContext();
  const image = await (cf as unknown as AdminEnv).ADMIN_DB.prepare("SELECT data,mime_type FROM insight_images WHERE id=?").bind(objectKey).first<{ data: ArrayBuffer | number[]; mime_type: string }>();
  if (!image) return new Response("Not found", { status: 404 });
  // D1 returns a BLOB as an array of numbers: turn it back into bytes (otherwise the response is the
  // numbers as text, and blog covers and FB Posts images do not load).
  const bytes = image.data instanceof ArrayBuffer ? new Uint8Array(image.data) : Uint8Array.from(image.data);
  return new Response(bytes, { headers: {
    "Content-Type": image.mime_type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}

import { fbPostsCallback } from "@/lib/admin/fb-posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Facebook sends Em back here after "Connect Facebook" (Valid OAuth Redirect URI in the Meta app).
export const GET = (request: Request) => fbPostsCallback(request);

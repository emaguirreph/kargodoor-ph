import { fbPostsAdminPage } from "@/lib/admin/fb-posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => fbPostsAdminPage(request);
export const POST = (request: Request) => fbPostsAdminPage(request);

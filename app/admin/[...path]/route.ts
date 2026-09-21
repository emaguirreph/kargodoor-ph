import { handleAdmin } from "@/lib/admin/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const view = (request: Request) =>
  new URL(request.url).pathname === "/admin/leads" ? "leads" : undefined;
export const GET = (request: Request) => handleAdmin(request, view(request));
export const POST = (request: Request) => handleAdmin(request, view(request));

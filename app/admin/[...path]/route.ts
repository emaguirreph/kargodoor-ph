import { handleAdmin } from "@/lib/admin/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleAdmin(request);
export const POST = (request: Request) => handleAdmin(request);

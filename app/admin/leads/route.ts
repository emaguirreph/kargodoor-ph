import { leadsPage } from "@/lib/admin/leads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => leadsPage(request);
export const POST = (request: Request) => leadsPage(request);

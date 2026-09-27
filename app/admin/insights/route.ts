import { insightsAdminPage } from "@/lib/admin/insights";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => insightsAdminPage(request);
export const POST = (request: Request) => insightsAdminPage(request);

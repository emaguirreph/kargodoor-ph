import { handleBilling } from "@/lib/admin/billing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleBilling(request);
export const POST = (request: Request) => handleBilling(request);

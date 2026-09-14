import { ratesGuidePage } from "@/lib/admin/rates-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => ratesGuidePage(request);

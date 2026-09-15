import { freightCalculatorPage } from "@/lib/admin/freight-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => freightCalculatorPage(request);

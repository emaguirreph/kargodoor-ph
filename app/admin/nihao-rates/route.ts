import { niHaoRatesPage } from "@/lib/admin/nihao-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => niHaoRatesPage(request);

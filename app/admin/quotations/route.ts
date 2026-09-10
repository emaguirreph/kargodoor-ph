import { quotationsPage } from "@/lib/admin/quotations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) { return quotationsPage(request); }
export async function POST(request: Request) { return quotationsPage(request); }
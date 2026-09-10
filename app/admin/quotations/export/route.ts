import { quotationsPage } from "@/lib/admin/quotations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Customer-only printable export. Browsers can save this isolated document as PDF. */
export async function GET(request: Request) { return quotationsPage(new Request(request.url.replace("/export",""),request)); }
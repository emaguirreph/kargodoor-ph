import { bulkIntakePage } from "@/lib/admin/bulk-intake";
import { AdminError } from "@/lib/admin/security";
import { esc, page } from "@/lib/admin/ui";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await bulkIntakePage(request); } catch (error) { const err = error instanceof AdminError ? error : new AdminError("Bulk intake is unavailable.", 500); return page("Bulk Shipment Intake", `<p class="notice">${esc(err.message)}</p>`, "", err.status); } }
export async function POST(request: Request) { return GET(request); }

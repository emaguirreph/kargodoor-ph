import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerInvoicePdf, readInvoicePdfData } from "@/lib/admin/invoice-pdf";
import { customerSession, customerSessionCookie, requestCookie } from "@/lib/customer/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The customer's own bill or receipt PDF (sent bills only: Unpaid, Partial or Paid). */
export async function GET(request: Request) {
  const { env } = await getCloudflareContext();
  const db = env.ADMIN_DB as unknown as D1Database;
  const account = await customerSession(db, requestCookie(request, customerSessionCookie));
  if (!account) return Response.redirect(new URL("/customer/login", request.url), 303);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const invoice = /^[\da-f-]{36}$/i.test(id)
    ? await db.prepare("SELECT id FROM invoices WHERE id = ? AND customer_id = ? AND status IN ('Unpaid','Partial','Paid') AND archived_at IS NULL").bind(id, account.customer_id).first<{ id: string }>()
    : null;
  if (!invoice) return new Response("Bill not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const data = await readInvoicePdfData(db, invoice.id);
  const name = `KargoDoor-${String(data.invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
  return new Response(customerInvoicePdf(data) as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}

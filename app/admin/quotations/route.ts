import { getCloudflareContext } from "@opennextjs/cloudflare";
import { quotationsPage } from "@/lib/admin/quotations";
import { createShipmentFromApprovedQuotation } from "@/lib/admin/quotation-shipment";
import { AdminError, authenticate, canMutateAdmin, checkCsrf, csrfToken, type AdminEnv } from "@/lib/admin/security";
import { esc, page } from "@/lib/admin/ui";
export const runtime="nodejs";
export const dynamic="force-dynamic";

type Row = Record<string, unknown>;

export async function GET(request: Request) {
  const response = await quotationsPage(request);
  const quotationId = new URL(request.url).searchParams.get("id") ?? "";
  if (response.status !== 200 || !/^[\da-f-]{36}$/i.test(quotationId)) return response;

  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    if (!canMutateAdmin(user)) return response;
    const quote = await env.ADMIN_DB.prepare("SELECT status FROM quotations WHERE id = ?").bind(quotationId).first<Row>();
    if (quote?.status !== "Approved") return response;
    const shipment = await env.ADMIN_DB.prepare("SELECT id, tracking_number FROM shipments WHERE source_quotation_id = ?").bind(quotationId).first<Row>();
    const action = shipment
      ? `<section><p class="notice">Shipment started: <a href="/admin/shipments?id=${esc(shipment.id)}">${esc(shipment.tracking_number)}</a></p></section>`
      : `<section><h2>Start shipment</h2><p>Create an operational shipment from this approved quotation. It will begin as <strong>Pending Warehouse Receipt</strong>; no invoice will be created.</p><form method="post" class="actions"><input type="hidden" name="action" value="start_shipment"><input type="hidden" name="quotation_id" value="${esc(quotationId)}"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, "/admin/quotations"))}"><button>Start Shipment</button></form></section>`;
    const html = (await response.text()).replace('<article class="quotation-print">', `${action}<article class="quotation-print">`);
    return new Response(html, { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return quotationsPage(request);
  const form = await request.clone().formData();
  if (form.get("action") !== "start_shipment") return quotationsPage(request);
  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
    checkCsrf(env, user.id, "/admin/quotations", String(form.get("csrf") ?? ""));
    const result = await createShipmentFromApprovedQuotation(env.ADMIN_DB, user.id, String(form.get("quotation_id") ?? ""));
    return page("Shipment created", "", user.name, 303, { Location: `/admin/shipments?id=${result.shipmentId}&created_from_quotation=1` });
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("Unable to create shipment.", 500);
    return page("Quotation", `<p class="notice">${esc(err.message)}</p>`, "", err.status);
  }
}

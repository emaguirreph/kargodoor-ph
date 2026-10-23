import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Footer, Header } from "@/components/site-chrome";
import { ShipmentTable, type CustomerShipment } from "@/app/customer/page";
import { AdminError, authenticate, type AdminEnv } from "@/lib/admin/security";

export const dynamic = "force-dynamic";

export default async function CustomerPreview({ searchParams }: { searchParams: Promise<{ customer_id?: string }> }) {
  const { customer_id: customerId = "" } = await searchParams;
  if (!/^[\da-f-]{36}$/i.test(customerId)) throw new AdminError("Choose a valid customer to preview.");
  const { env: rawEnv } = await getCloudflareContext();
  const env = rawEnv as unknown as AdminEnv;
  await authenticate(new Request(`${env.ADMIN_ORIGIN}/admin/customer-preview`, { headers: await headers() }), env);
  const customer = await env.ADMIN_DB.prepare("SELECT id,full_name,customer_code FROM customers WHERE id=? AND archived_at IS NULL").bind(customerId).first<{ id: string; full_name: string; customer_code: string }>();
  if (!customer) throw new AdminError("Customer not found.", 404);
  const result = await env.ADMIN_DB.prepare(`SELECT s.id,s.tracking_number,CASE WHEN s.tracking_remarks LIKE 'Item: %' THEN substr(s.tracking_remarks, 7, instr(s.tracking_remarks || char(10), char(10)) - 7) ELSE COALESCE(NULLIF(json_extract(q.cargo_snapshot, '$.item'), ''), '—') END AS item,s.service_type,s.cbm,s.weight_kg,s.verified_cbm,s.verified_weight_kg,s.status,s.china_warehouse,s.warehouse_received_date,s.actual_arrival,s.shipping_charge,s.delivery_charge AS shipment_delivery_charge,i.delivery_charge AS invoice_delivery_charge,i.status AS invoice_status,i.total AS invoice_total,i.other_charge AS invoice_other_charge,COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND p.customer_id=s.customer_id),0) AS payments_total FROM shipments s LEFT JOIN quotations q ON q.id=s.source_quotation_id LEFT JOIN invoices i ON i.shipment_id=s.id AND i.customer_id=s.customer_id AND i.status != 'Void' WHERE s.customer_id=? ORDER BY s.created_at DESC`).bind(customer.id).all<CustomerShipment>();
  const shipments = result.results ?? [];
  const active = shipments.filter((shipment) => shipment.status !== "Delivered" && shipment.status !== "Cancelled");
  const history = shipments.filter((shipment) => shipment.status === "Delivered" || shipment.status === "Cancelled");
  return <div className="kd-site-shell"><Header/><main className="kd-customer-page"><section className="kd-customer-card"><p className="kd-customer-error"><strong>Admin preview only.</strong> This matches the customer dashboard. Customer actions are disabled.</p><a href={`/admin/customers?id=${encodeURIComponent(customer.id)}`}>← Back to customer</a></section><section className="kd-customer-card kd-customer-dashboard"><div className="kd-customer-dashboard-heading"><h1>MY KargoDoorPH</h1><p>Welcome, {customer.full_name}</p><p className="kd-customer-account-code">Account / Cargo Code: <strong>{customer.customer_code}</strong></p></div><section className="kd-customer-dashboard-section"><h2>My Shipments</h2><ShipmentTable shipments={active} emptyMessage="You have no active shipments." customer={customer}/></section><section className="kd-customer-dashboard-section"><h2>Shipment History</h2><ShipmentTable shipments={history} emptyMessage="No shipment history yet." customer={customer}/></section><div className="kd-customer-dashboard-actions"><span>CONTACT KARGODOOR</span><button type="button" disabled>CHANGE PASSWORD</button><button type="button" disabled>LOG OUT</button></div></section></main><Footer/></div>;
}

// Data for the MY KargoDoorPH customer portal. Everything is read from the same
// admin records (customers, shipments, invoices, payments, bookings, proofs),
// always limited to the logged-in customer's own rows.
import type { D1Database } from "@cloudflare/workers-types";
import { cargoCategory, cargoCategorySql, cargoItemSql } from "@/lib/admin/shipment-cargo";
import { arrivalWindow, arrivalWindowDone, formatArrivalWindow } from "@/lib/admin/arrival-window";

type Row = Record<string, unknown>;

export type PortalCustomer = {
  id: string; customer_code: string; full_name: string; company_name: string | null;
  mobile: string; email: string | null; address: string | null; created_at: string;
  login_email?: string | null;
};

export type PortalShipment = {
  id: string; trackingNumber: string; item: string | null; category: string | null;
  service: string; status: string; warehouse: string;
  receivedDate: string | null; arrivedDate: string | null; deliveredDate: string | null;
  declared: string | null; verified: string | null;
  freight: number; delivery: number;
  invoiceId: string | null; invoiceNumber: string | null; invoiceStatus: string | null;
  total: number; paid: number; balance: number;
  payment: "PAID" | "UNPAID" | "PARTIAL" | "BILL COMING";
  eta: string | null; etaSpan: string | null;
  active: boolean; inTransit: boolean;
  updatedAt: string;
};

export type PortalBill = {
  invoiceId: string; invoiceNumber: string; shipmentId: string; trackingNumber: string;
  status: string; issuedAt: string | null; total: number; paid: number; balance: number;
  proof: { status: string; uploadedAt: string } | null;
};

export type PortalBooking = { ref: string; status: string; service: string; item: string; createdAt: string };
export type PortalConcern = { topic: string; status: string; message: string; createdAt: string; trackingNumber: string | null; adminNote: string | null };

export type PortalData = {
  customer: PortalCustomer;
  shipments: PortalShipment[];
  bills: PortalBill[];
  bookings: PortalBooking[];
  concerns: PortalConcern[];
  referrals: number;
};

export const concernTopics = ["Shipment / tracking", "Billing / payment", "Warehouse / supplier", "Account", "Other"] as const;

/** Sea and air stages, in order, as the customer sees them. */
export const portalStages = (service: string) => [
  "China Warehouse", "China Port", service === "Air Freight" ? "Air Transit" : "Sea Transit",
  "Manila Port", "Gatepass", "Malabon Warehouse", "Delivered",
];

/** Index of the current stage (−1 = still waiting for the supplier). Older status names map to the closest stage. */
export function stageIndex(status: string) {
  const map: Record<string, number> = {
    "Awaiting Supplier Dispatch": -1, "Pending Warehouse Receipt": -1,
    "China Warehouse": 0, "Received at Warehouse": 0, "China Port": 1,
    "Sea Transit": 2, "Air Transit": 2, "In Transit": 2,
    "Manila Port": 3, "Arrived in Philippines": 3, Gatepass: 4,
    "Malabon Warehouse": 5, "Ready for Release": 5, Delivered: 6,
  };
  return map[status] ?? -1;
}

const inTransitStatuses = ["China Port", "Sea Transit", "Air Transit", "In Transit", "Manila Port", "Gatepass", "Arrived in Philippines"];

const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const cbmText = (value: unknown) => num(value) > 0 ? `${num(value).toLocaleString("en-PH", { maximumFractionDigits: 3 })} CBM` : null;
const kgText = (value: unknown) => num(value) > 0 ? `${num(value).toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg` : null;
const measure = (cbm: unknown, kg: unknown) => [cbmText(cbm), kgText(kg)].filter(Boolean).join(" · ") || null;

/** Bills the customer can see: sent (not Draft) and not voided. */
const visibleBill = (status: unknown) => ["Unpaid", "Partial", "Paid"].includes(String(status ?? ""));

export async function loadPortal(db: D1Database, customerId: string): Promise<PortalData | null> {
  const customer = await db.prepare(`SELECT c.id, c.customer_code, c.full_name, c.company_name, c.mobile, c.email, c.address, c.created_at,
      (SELECT a.login_email FROM customer_accounts a WHERE a.customer_id = c.id LIMIT 1) AS login_email
    FROM customers c WHERE c.id = ? AND c.archived_at IS NULL`).bind(customerId).first<PortalCustomer>();
  if (!customer) return null;

  const [shipmentRows, billRows, proofRows, bookingRows, concernRows, referralRow] = await Promise.all([
    db.prepare(`SELECT s.id, s.tracking_number, COALESCE(${cargoItemSql}, '') AS item, ${cargoCategorySql.item} AS category_item, ${cargoCategorySql.group} AS category_group,
        s.service_type, s.status, s.china_warehouse, s.cbm, s.weight_kg, s.verified_cbm, s.verified_weight_kg,
        s.warehouse_received_date, s.actual_arrival, s.delivered_date, s.shipping_charge, s.delivery_charge, s.updated_at,
        i.id AS invoice_id, i.invoice_number, i.status AS invoice_status, i.delivery_charge AS invoice_delivery_charge,
        i.total + i.other_charge AS invoice_total,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.customer_id = s.customer_id), 0) AS paid
      FROM shipments s
      LEFT JOIN quotations q ON q.id = s.source_quotation_id
      LEFT JOIN invoices i ON i.id = (SELECT i2.id FROM invoices i2 WHERE i2.shipment_id = s.id AND i2.customer_id = s.customer_id
        AND i2.status != 'Void' AND i2.archived_at IS NULL ORDER BY i2.created_at DESC LIMIT 1)
      WHERE s.customer_id = ? AND s.archived_at IS NULL
      ORDER BY s.created_at DESC`).bind(customerId).all<Row>(),
    db.prepare(`SELECT i.id, i.invoice_number, i.shipment_id, s.tracking_number, i.status, i.issued_at, i.created_at, i.total + i.other_charge AS total,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.customer_id = i.customer_id), 0) AS paid
      FROM invoices i JOIN shipments s ON s.id = i.shipment_id
      WHERE i.customer_id = ? AND i.status IN ('Unpaid','Partial','Paid') AND i.archived_at IS NULL AND s.archived_at IS NULL
      ORDER BY COALESCE(i.issued_at, i.created_at) DESC`).bind(customerId).all<Row>(),
    db.prepare(`SELECT invoice_id, shipment_id, status, uploaded_at FROM customer_payment_proofs
      WHERE customer_id = ? ORDER BY uploaded_at DESC`).bind(customerId).all<Row>(),
    db.prepare(`SELECT booking_ref, status, service_type, item_description, created_at FROM bookings
      WHERE customer_id = ? AND status = 'New' ORDER BY created_at DESC LIMIT 20`).bind(customerId).all<Row>(),
    db.prepare(`SELECT c.topic, c.status, c.message, c.created_at, c.admin_note, s.tracking_number FROM customer_concerns c
      LEFT JOIN shipments s ON s.id = c.shipment_id WHERE c.customer_id = ? ORDER BY c.created_at DESC LIMIT 20`).bind(customerId).all<Row>(),
    db.prepare("SELECT COUNT(*) AS n FROM customers WHERE upper(referral_code) = upper(?) AND id != ? AND archived_at IS NULL")
      .bind(customer.customer_code, customerId).first<{ n: number }>(),
  ]);

  const shipments: PortalShipment[] = shipmentRows.results.map((row) => {
    const invoiceStatus = str(row.invoice_status);
    const billed = visibleBill(invoiceStatus);
    const total = billed ? num(row.invoice_total) : num(row.shipping_charge) + num(row.delivery_charge);
    const paid = billed ? num(row.paid) : 0;
    const delivery = invoiceStatus && row.invoice_delivery_charge !== null ? num(row.invoice_delivery_charge) : num(row.delivery_charge);
    const status = String(row.status);
    const window = arrivalWindowDone(status) ? null : arrivalWindow(row.service_type, row.warehouse_received_date);
    return {
      id: String(row.id), trackingNumber: String(row.tracking_number), item: str(row.item),
      category: cargoCategory(row.category_item, row.category_group),
      service: String(row.service_type), status, warehouse: String(row.china_warehouse ?? ""),
      receivedDate: str(row.warehouse_received_date), arrivedDate: str(row.actual_arrival), deliveredDate: str(row.delivered_date),
      declared: measure(row.cbm, row.weight_kg), verified: measure(row.verified_cbm, row.verified_weight_kg),
      freight: num(row.shipping_charge), delivery,
      invoiceId: billed ? String(row.invoice_id) : null, invoiceNumber: billed ? str(row.invoice_number) : null, invoiceStatus,
      total, paid, balance: Math.max(0, total - paid),
      payment: !billed ? "BILL COMING" : invoiceStatus === "Paid" && paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
      eta: window ? formatArrivalWindow(window) : null, etaSpan: window ? window.span : null,
      active: status !== "Delivered" && status !== "Cancelled",
      inTransit: inTransitStatuses.includes(status),
      updatedAt: String(row.updated_at ?? ""),
    };
  });

  const latestProof = (invoiceId: string, shipmentId: string) => {
    const proof = proofRows.results.find((p) => p.invoice_id === invoiceId) ?? proofRows.results.find((p) => !p.invoice_id && p.shipment_id === shipmentId);
    return proof ? { status: String(proof.status), uploadedAt: String(proof.uploaded_at) } : null;
  };

  const bills: PortalBill[] = billRows.results.map((row) => {
    const total = num(row.total), paid = num(row.paid);
    return {
      invoiceId: String(row.id), invoiceNumber: String(row.invoice_number), shipmentId: String(row.shipment_id),
      trackingNumber: String(row.tracking_number), status: String(row.status) === "Paid" && paid >= total ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
      issuedAt: str(row.issued_at) ?? str(row.created_at), total, paid, balance: Math.max(0, total - paid),
      proof: latestProof(String(row.id), String(row.shipment_id)),
    };
  });

  return {
    customer, shipments, bills,
    bookings: bookingRows.results.map((row) => ({ ref: String(row.booking_ref), status: String(row.status), service: String(row.service_type), item: String(row.item_description), createdAt: String(row.created_at) })),
    concerns: concernRows.results.map((row) => ({ topic: String(row.topic), status: String(row.status), message: String(row.message), createdAt: String(row.created_at), trackingNumber: str(row.tracking_number), adminNote: str(row.admin_note) })),
    referrals: num(referralRow?.n),
  };
}

export const formatPeso = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(centavos / 100);

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 4, 2026" from a date or ISO timestamp. */
export function formatDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return "—";
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}
export const formatMonth = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(match[2]) - 1]} ${match[1]}` : "—";
};

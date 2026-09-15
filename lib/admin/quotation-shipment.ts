import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { generatedIdentifier } from "./data";
import { AdminError } from "./security";
import { warehouses } from "./validation";

type Row = Record<string, unknown>;

type CustomerSnapshot = {
  name?: unknown;
  company?: unknown;
  mobile?: unknown;
  email?: unknown;
  address?: unknown;
};

type CargoSnapshot = {
  cbm?: unknown;
  weight?: unknown;
  originWarehouse?: unknown;
};

export type ShipmentFromQuotation = {
  shipmentId: string;
  trackingNumber: string;
  customerId: string;
  customerCreated: boolean;
};

const isUuid = (value: string) => /^[\da-f-]{36}$/i.test(value);
const text = (value: unknown) => String(value ?? "").trim();

function savedSnapshot<T>(value: unknown, label: string): T {
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new AdminError(`This approved quotation has an invalid ${label} snapshot.`, 422);
  }
}

function requiredText(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new AdminError(`This approved quotation is missing ${label}.`, 422);
  return result;
}

function requiredNumber(value: unknown, label: string, maximum: number) {
  const result = Number(requiredText(value, label));
  if (!Number.isFinite(result) || result < 0 || result > maximum)
    throw new AdminError(`This approved quotation has an invalid ${label}.`, 422);
  return result;
}

async function customerForQuotation(
  db: D1Database,
  quote: Row,
  customer: CustomerSnapshot,
) {
  const linkedCustomerId = text(quote.customer_id);
  if (linkedCustomerId) {
    const linked = await db.prepare("SELECT id FROM customers WHERE id = ?").bind(linkedCustomerId).first<Row>();
    if (linked) return { customerId: String(linked.id), create: null };
  }

  const email = text(customer.email).toLowerCase();
  if (email) {
    const matches = (await db
      .prepare("SELECT id FROM customers WHERE lower(trim(email)) = ? ORDER BY id LIMIT 2")
      .bind(email)
      .all<Row>()).results;
    if (matches.length === 1) return { customerId: String(matches[0].id), create: null };
  }

  const mobile = requiredText(customer.mobile, "customer contact number");
  if (mobile.length < 5 || mobile.length > 40)
    throw new AdminError("This approved quotation has an invalid customer contact number.", 422);
  return {
    customerId: randomUUID(),
    create: {
      fullName: requiredText(customer.name, "customer name"),
      companyName: text(customer.company) || null,
      mobile,
      email: email || null,
      address: text(customer.address) || null,
    },
  };
}

export async function createShipmentFromApprovedQuotation(
  db: D1Database,
  adminUserId: string,
  quotationId: string,
  attempt = 0,
): Promise<ShipmentFromQuotation> {
  if (!isUuid(quotationId)) throw new AdminError("Invalid quotation ID.");
  const quote = await db.prepare("SELECT * FROM quotations WHERE id = ?").bind(quotationId).first<Row>();
  if (!quote) throw new AdminError("Quotation not found.", 404);
  if (quote.status !== "Approved")
    throw new AdminError("Only approved quotations can start a shipment.", 409);

  const existing = await db.prepare("SELECT tracking_number FROM shipments WHERE source_quotation_id = ?").bind(quotationId).first<Row>();
  if (existing)
    throw new AdminError(`A shipment already exists for this quotation (${String(existing.tracking_number)}).`, 409);

  const customerSnapshot = savedSnapshot<CustomerSnapshot>(quote.customer_snapshot, "customer");
  const cargoSnapshot = savedSnapshot<CargoSnapshot>(quote.cargo_snapshot, "cargo");
  const serviceType = requiredText(quote.freight_type, "freight type");
  if (serviceType !== "Sea Freight" && serviceType !== "Air Freight")
    throw new AdminError("This approved quotation has an invalid freight type.", 422);
  const chinaWarehouse = requiredText(cargoSnapshot.originWarehouse, "China warehouse");
  if (!warehouses.includes(chinaWarehouse as (typeof warehouses)[number]))
    throw new AdminError("This approved quotation has an invalid China warehouse.", 422);
  const cbm = requiredNumber(cargoSnapshot.cbm, "total CBM", 1000000);
  const weight = requiredNumber(cargoSnapshot.weight, "actual weight", 100000000);
  const finalAmount = Number(quote.final_amount);
  if (!Number.isSafeInteger(finalAmount) || finalAmount < 0)
    throw new AdminError("This approved quotation has an invalid saved final amount.", 422);

  const customer = await customerForQuotation(db, quote, customerSnapshot);
  const trackingNumber = await generatedIdentifier(db, "shipments", { service_type: serviceType });
  const customerCode = customer.create ? await generatedIdentifier(db, "customers", {}) : undefined;
  if (!trackingNumber || (customer.create && !customerCode))
    throw new AdminError("Unable to reserve an identifier. Please try again.", 409);

  const shipmentId = randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (customer.create) {
    statements.push(db.prepare(
      "INSERT INTO customers (id, customer_code, full_name, company_name, mobile, email, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
    ).bind(customer.customerId, customerCode!, customer.create.fullName, customer.create.companyName, customer.create.mobile, customer.create.email, customer.create.address, now, now));
  }
  statements.push(db.prepare(
    "INSERT INTO shipments (id, customer_id, source_quotation_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, estimated_arrival, actual_arrival, shipping_charge, delivery_charge, payment_status, nihao_cost, cargo_code, warehouse_received_date, departure_date, tracking_remarks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending Warehouse Receipt', NULL, NULL, ?, 0, 'Unpaid', NULL, NULL, NULL, NULL, NULL, ?, ?)",
  ).bind(shipmentId, customer.customerId, quotationId, trackingNumber, serviceType, chinaWarehouse, cbm, weight, finalAmount, now, now));
  statements.push(db.prepare(
    "INSERT INTO activity_log (id, admin_user_id, action, entity_type, entity_id, old_value, new_value, notes, created_at) VALUES (?, ?, 'create_from_approved_quotation', 'shipments', ?, NULL, ?, ?, ?)",
  ).bind(randomUUID(), adminUserId, shipmentId, JSON.stringify({
    source_quotation_id: quotationId,
    quotation_number: quote.quotation_number,
    tracking_number: trackingNumber,
    customer_id: customer.customerId,
    customer_created: Boolean(customer.create),
    status: "Pending Warehouse Receipt",
    payment_status: "Unpaid",
  }), `Created from approved quotation ${String(quote.quotation_number)}`, now));

  try {
    await db.batch(statements);
  } catch (error) {
    const duplicate = await db.prepare("SELECT tracking_number FROM shipments WHERE source_quotation_id = ?").bind(quotationId).first<Row>();
    if (duplicate)
      throw new AdminError(`A shipment already exists for this quotation (${String(duplicate.tracking_number)}).`, 409);
    if (String(error).includes("UNIQUE constraint") && attempt < 7)
      return createShipmentFromApprovedQuotation(db, adminUserId, quotationId, attempt + 1);
    throw error;
  }
  return { shipmentId, trackingNumber, customerId: customer.customerId, customerCreated: Boolean(customer.create) };
}

-- ADMIN_DB only. Add FCL as a shipment service while preserving shipment,
-- invoice, payment, and foreign-key relationships.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE shipments_fcl (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 source_quotation_id TEXT REFERENCES quotations(id) ON DELETE RESTRICT,
 tracking_number TEXT COLLATE NOCASE UNIQUE,
 service_type TEXT NOT NULL CHECK(service_type IN ('Sea Freight','Air Freight','FCL')),
 china_warehouse TEXT NOT NULL,
 cbm REAL NOT NULL CHECK(cbm >= 0 AND cbm <= 1000000),
 weight_kg REAL NOT NULL CHECK(weight_kg >= 0 AND weight_kg <= 100000000),
 status TEXT NOT NULL CHECK(status IN ('Awaiting Supplier Dispatch','Pending Warehouse Receipt','Received at Warehouse','In Transit','Arrived in Philippines','Ready for Release','Delivered','Cancelled')),
 estimated_arrival TEXT, actual_arrival TEXT,
 shipping_charge INTEGER NOT NULL CHECK(shipping_charge >= 0),
 delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('Unpaid','Partial','Paid')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 nihao_cost INTEGER CHECK(nihao_cost IS NULL OR (typeof(nihao_cost) = 'integer' AND nihao_cost BETWEEN 0 AND 100000000000)),
 cargo_code TEXT COLLATE NOCASE, warehouse_received_date TEXT, departure_date TEXT,
 tracking_remarks TEXT, supplier_waybill_number TEXT, supplier_courier TEXT,
 verified_cbm REAL CHECK(verified_cbm IS NULL OR (verified_cbm >= 0 AND verified_cbm <= 1000000)),
 verified_weight_kg REAL CHECK(verified_weight_kg IS NULL OR (verified_weight_kg >= 0 AND verified_weight_kg <= 100000000)), archived_at TEXT,
 UNIQUE(id, customer_id)
);
CREATE TABLE invoices_fcl (
 id TEXT PRIMARY KEY NOT NULL, invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, shipment_id TEXT NOT NULL UNIQUE,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 total INTEGER NOT NULL CHECK(total = subtotal + delivery_charge),
 status TEXT NOT NULL CHECK(status IN ('Draft','Unpaid','Partial','Paid','Void')),
 issued_at TEXT, due_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 other_charge INTEGER NOT NULL DEFAULT 0 CHECK(typeof(other_charge) = 'integer' AND other_charge BETWEEN 0 AND 100000000000), archived_at TEXT,
 UNIQUE(id, customer_id), FOREIGN KEY(shipment_id, customer_id) REFERENCES shipments_fcl(id, customer_id) ON DELETE RESTRICT
);
CREATE TABLE payments_fcl (
 id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK(amount > 0), payment_method TEXT NOT NULL, reference_number TEXT,
 payment_date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(invoice_id, customer_id) REFERENCES invoices_fcl(id, customer_id) ON DELETE RESTRICT
);
INSERT INTO shipments_fcl SELECT * FROM shipments;
INSERT INTO invoices_fcl SELECT * FROM invoices;
INSERT INTO payments_fcl SELECT * FROM payments;
DROP TABLE payments; DROP TABLE invoices; DROP TABLE shipments;
ALTER TABLE shipments_fcl RENAME TO shipments;
ALTER TABLE invoices_fcl RENAME TO invoices;
ALTER TABLE payments_fcl RENAME TO payments;
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_updated ON shipments(updated_at DESC, id);
CREATE UNIQUE INDEX idx_shipments_cargo_code ON shipments(cargo_code) WHERE cargo_code IS NOT NULL;
CREATE UNIQUE INDEX idx_shipments_source_quotation ON shipments(source_quotation_id) WHERE source_quotation_id IS NOT NULL;
CREATE INDEX idx_shipments_supplier_waybill ON shipments(supplier_waybill_number) WHERE supplier_waybill_number IS NOT NULL;
CREATE INDEX idx_shipments_active ON shipments(archived_at, updated_at DESC, id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_updated ON invoices(updated_at DESC, id);
CREATE INDEX idx_invoices_active ON invoices(archived_at, updated_at DESC, id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC, id);
PRAGMA foreign_key_check;

-- ADMIN_DB only. Link an operational shipment to its approved source quotation
-- and add the pre-receipt status without changing any existing records.
-- SQLite cannot extend the existing shipments status CHECK constraint in place,
-- so the shipment/invoice/payment foreign-key chain is rebuilt and copied intact.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE shipments_phase1 (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 source_quotation_id TEXT REFERENCES quotations(id) ON DELETE RESTRICT,
 tracking_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 service_type TEXT NOT NULL CHECK(service_type IN ('Sea Freight','Air Freight')),
 china_warehouse TEXT NOT NULL,
 cbm REAL NOT NULL CHECK(cbm >= 0 AND cbm <= 1000000),
 weight_kg REAL NOT NULL CHECK(weight_kg >= 0 AND weight_kg <= 100000000),
 status TEXT NOT NULL CHECK(status IN ('Pending Warehouse Receipt','Received at Warehouse','In Transit','Arrived in Philippines','Ready for Release','Delivered','Cancelled')),
 estimated_arrival TEXT,
 actual_arrival TEXT,
 shipping_charge INTEGER NOT NULL CHECK(shipping_charge >= 0),
 delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('Unpaid','Partial','Paid')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 nihao_cost INTEGER CHECK(nihao_cost IS NULL OR (typeof(nihao_cost) = 'integer' AND nihao_cost BETWEEN 0 AND 100000000000)),
 cargo_code TEXT COLLATE NOCASE,
 warehouse_received_date TEXT,
 departure_date TEXT,
 tracking_remarks TEXT,
 UNIQUE(id, customer_id)
);

CREATE TABLE invoices_phase1 (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 shipment_id TEXT NOT NULL UNIQUE,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0),
 delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 total INTEGER NOT NULL CHECK(total = subtotal + delivery_charge),
 status TEXT NOT NULL CHECK(status IN ('Draft','Unpaid','Partial','Paid','Void')),
 issued_at TEXT,
 due_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 other_charge INTEGER NOT NULL DEFAULT 0 CHECK(typeof(other_charge) = 'integer' AND other_charge BETWEEN 0 AND 100000000000),
 UNIQUE(id, customer_id),
 FOREIGN KEY(shipment_id, customer_id) REFERENCES shipments_phase1(id, customer_id) ON DELETE RESTRICT
);

CREATE TABLE payments_phase1 (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK(amount > 0),
 payment_method TEXT NOT NULL,
 reference_number TEXT,
 payment_date TEXT NOT NULL,
 notes TEXT,
 created_at TEXT NOT NULL,
 FOREIGN KEY(invoice_id, customer_id) REFERENCES invoices_phase1(id, customer_id) ON DELETE RESTRICT
);

INSERT INTO shipments_phase1 (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, estimated_arrival, actual_arrival, shipping_charge, delivery_charge, payment_status, created_at, updated_at, nihao_cost, cargo_code, warehouse_received_date, departure_date, tracking_remarks)
SELECT id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, estimated_arrival, actual_arrival, shipping_charge, delivery_charge, payment_status, created_at, updated_at, nihao_cost, cargo_code, warehouse_received_date, departure_date, tracking_remarks FROM shipments;

INSERT INTO invoices_phase1 (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, due_at, created_at, updated_at, other_charge)
SELECT id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, due_at, created_at, updated_at, other_charge FROM invoices;

INSERT INTO payments_phase1 (id, invoice_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at)
SELECT id, invoice_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at FROM payments;

DROP TABLE payments;
DROP TABLE invoices;
DROP TABLE shipments;

ALTER TABLE shipments_phase1 RENAME TO shipments;
ALTER TABLE invoices_phase1 RENAME TO invoices;
ALTER TABLE payments_phase1 RENAME TO payments;

CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_updated ON shipments(updated_at DESC, id);
CREATE UNIQUE INDEX idx_shipments_cargo_code ON shipments(cargo_code) WHERE cargo_code IS NOT NULL;
CREATE UNIQUE INDEX idx_shipments_source_quotation ON shipments(source_quotation_id) WHERE source_quotation_id IS NOT NULL;
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_updated ON invoices(updated_at DESC, id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC, id);

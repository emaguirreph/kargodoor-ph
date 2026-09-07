-- New ADMIN_DB only. Never apply this migration to TRACKING_DB.
CREATE TABLE customers (
 id TEXT PRIMARY KEY NOT NULL,
 customer_code TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(customer_code)) BETWEEN 1 AND 40),
 full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 160),
 company_name TEXT, mobile TEXT NOT NULL CHECK(length(trim(mobile)) BETWEEN 5 AND 40),
 email TEXT, address TEXT, notes TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE admin_users (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','disabled')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE shipments (
 id TEXT PRIMARY KEY NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 tracking_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 service_type TEXT NOT NULL CHECK(service_type IN ('Sea Freight','Air Freight')),
 china_warehouse TEXT NOT NULL,
 cbm REAL NOT NULL CHECK(cbm >= 0 AND cbm <= 1000000),
 weight_kg REAL NOT NULL CHECK(weight_kg >= 0 AND weight_kg <= 100000000),
 status TEXT NOT NULL CHECK(status IN ('Received at Warehouse','In Transit','Arrived in Philippines','Ready for Release','Delivered','Cancelled')),
 estimated_arrival TEXT, actual_arrival TEXT,
 shipping_charge INTEGER NOT NULL CHECK(shipping_charge >= 0),
 delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('Unpaid','Partial','Paid')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id, customer_id)
);
-- Monetary amounts are integer Philippine centavos in all four financial tables.
CREATE TABLE invoices (
 id TEXT PRIMARY KEY NOT NULL, invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 shipment_id TEXT NOT NULL UNIQUE,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 total INTEGER NOT NULL CHECK(total = subtotal + delivery_charge),
 status TEXT NOT NULL CHECK(status IN ('Draft','Unpaid','Partial','Paid','Void')),
 issued_at TEXT, due_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id, customer_id),
 FOREIGN KEY(shipment_id, customer_id) REFERENCES shipments(id, customer_id) ON DELETE RESTRICT
);
CREATE TABLE payments (
 id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK(amount > 0), payment_method TEXT NOT NULL,
 reference_number TEXT, payment_date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(invoice_id, customer_id) REFERENCES invoices(id, customer_id) ON DELETE RESTRICT
);
CREATE TABLE expenses (
 id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount > 0), expense_date TEXT NOT NULL,
 reference_number TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE activity_log (
 id TEXT PRIMARY KEY NOT NULL, admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 old_value TEXT CHECK(old_value IS NULL OR json_valid(old_value)),
 new_value TEXT CHECK(new_value IS NULL OR json_valid(new_value)), notes TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_activity_admin ON activity_log(admin_user_id);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id, created_at);
CREATE TRIGGER activity_log_no_update BEFORE UPDATE ON activity_log BEGIN SELECT RAISE(ABORT, 'Activity logs are immutable'); END;
CREATE TRIGGER activity_log_no_delete BEFORE DELETE ON activity_log BEGIN SELECT RAISE(ABORT, 'Activity logs are immutable'); END;

-- ADMIN_DB only. Let a shipment be invoiced again after its invoice is voided.
-- shipment_id was a column-level UNIQUE, which SQLite cannot drop, so the
-- invoice/payment FK chain is rebuilt. One active (non-Void, non-archived)
-- invoice per shipment is still enforced by a partial unique index.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE invoices_reissue (
 id TEXT PRIMARY KEY NOT NULL, invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, shipment_id TEXT NOT NULL,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), delivery_charge INTEGER NOT NULL CHECK(delivery_charge >= 0),
 total INTEGER NOT NULL CHECK(total = subtotal + delivery_charge),
 status TEXT NOT NULL CHECK(status IN ('Draft','Unpaid','Partial','Paid','Void')),
 issued_at TEXT, due_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 other_charge INTEGER NOT NULL DEFAULT 0 CHECK(typeof(other_charge) = 'integer' AND other_charge BETWEEN 0 AND 100000000000), archived_at TEXT,
 UNIQUE(id, customer_id), FOREIGN KEY(shipment_id, customer_id) REFERENCES shipments(id, customer_id) ON DELETE RESTRICT
);

CREATE TABLE payments_reissue (
 id TEXT PRIMARY KEY NOT NULL, invoice_id TEXT NOT NULL, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 amount INTEGER NOT NULL CHECK(amount > 0), payment_method TEXT NOT NULL, reference_number TEXT,
 payment_date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(invoice_id, customer_id) REFERENCES invoices_reissue(id, customer_id) ON DELETE RESTRICT
);

INSERT INTO invoices_reissue SELECT * FROM invoices;
INSERT INTO payments_reissue SELECT * FROM payments;
DROP TABLE payments; DROP TABLE invoices;
ALTER TABLE invoices_reissue RENAME TO invoices;
ALTER TABLE payments_reissue RENAME TO payments;
CREATE UNIQUE INDEX idx_invoices_active_shipment ON invoices(shipment_id) WHERE status != 'Void' AND archived_at IS NULL;
CREATE INDEX idx_invoices_shipment ON invoices(shipment_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_updated ON invoices(updated_at DESC, id);
CREATE INDEX idx_invoices_active ON invoices(archived_at, updated_at DESC, id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC, id);
PRAGMA foreign_key_check;

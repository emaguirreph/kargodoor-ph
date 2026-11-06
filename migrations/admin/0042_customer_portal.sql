-- ADMIN_DB only. New customer portal (Em, 2026-11-06): logged-in customers can
-- book a shipment, send a proof of payment for any of their bills, and send a
-- concern. Everything lands in admin → Bookings so nothing is missed.

-- Where a booking came from: the website chat, or the logged-in customer portal.
ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'chat' CHECK(source IN ('chat','portal'));

-- A portal proof belongs to a customer's bill, not always to a chat booking,
-- so booking_id becomes optional and the customer is saved on every proof.
CREATE TABLE customer_payment_proofs_new (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 source TEXT NOT NULL DEFAULT 'chat' CHECK(source IN ('chat','portal')),
 shipment_id TEXT NOT NULL,
 invoice_id TEXT,
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Accepted','Rejected')),
 file_name TEXT NOT NULL,
 file_mime TEXT NOT NULL CHECK(file_mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 1572864),
 file_data BLOB NOT NULL,
 payment_id TEXT,
 reviewed_by_admin_user_id TEXT,
 reviewed_at TEXT,
 uploaded_at TEXT NOT NULL,
 CHECK(booking_id IS NOT NULL OR customer_id IS NOT NULL)
);
INSERT INTO customer_payment_proofs_new (id, booking_id, customer_id, source, shipment_id, invoice_id, status, file_name, file_mime, file_size, file_data, payment_id, reviewed_by_admin_user_id, reviewed_at, uploaded_at)
  SELECT p.id, p.booking_id, (SELECT s.customer_id FROM shipments s WHERE s.id = p.shipment_id), 'chat', p.shipment_id, p.invoice_id, p.status, p.file_name, p.file_mime, p.file_size, p.file_data, p.payment_id, p.reviewed_by_admin_user_id, p.reviewed_at, p.uploaded_at
  FROM customer_payment_proofs p;
DROP TABLE customer_payment_proofs;
ALTER TABLE customer_payment_proofs_new RENAME TO customer_payment_proofs;
CREATE INDEX customer_payment_proofs_status ON customer_payment_proofs(status, uploaded_at);
CREATE INDEX customer_payment_proofs_customer ON customer_payment_proofs(customer_id, uploaded_at);

-- Concerns sent from the portal's Support page.
CREATE TABLE customer_concerns (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 topic TEXT NOT NULL CHECK(topic IN ('Shipment / tracking','Billing / payment','Warehouse / supplier','Account','Other')),
 shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
 message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 3 AND 2000),
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Done')),
 admin_note TEXT,
 resolved_by_admin_user_id TEXT,
 resolved_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX customer_concerns_status ON customer_concerns(status, created_at);
CREATE INDEX customer_concerns_customer ON customer_concerns(customer_id, created_at);

-- ADMIN_DB only. Shipment bookings sent from the website chat assistant.
-- A booking waits in admin → Bookings until an admin approves it (which
-- creates or reuses the customer and creates the shipment) or declines it.
CREATE TABLE bookings (
 id TEXT PRIMARY KEY NOT NULL,
 booking_ref TEXT NOT NULL COLLATE NOCASE UNIQUE,
 full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 160),
 phone TEXT NOT NULL CHECK(length(phone) BETWEEN 10 AND 13),
 email TEXT,
 service_type TEXT NOT NULL CHECK(service_type IN ('Sea Freight','Air Freight')),
 delivery_mode TEXT NOT NULL CHECK(delivery_mode IN ('Pickup','Delivery')),
 delivery_address TEXT,
 item_description TEXT NOT NULL,
 quantity_text TEXT NOT NULL,
 est_cbm REAL NOT NULL CHECK(est_cbm >= 0),
 est_weight_kg REAL NOT NULL CHECK(est_weight_kg > 0),
 item_value INTEGER,
 china_warehouse TEXT NOT NULL,
 supplier_contact TEXT NOT NULL,
 notes TEXT,
 estimate_amount INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Approved','Declined')),
 messenger_confirmed_at TEXT,
 approved_amount INTEGER,
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 shipment_id TEXT REFERENCES shipments(id) ON DELETE RESTRICT,
 decline_reason TEXT,
 blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
 client_key TEXT,
 reviewed_by_admin_user_id TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX bookings_status ON bookings(status, created_at);
CREATE INDEX bookings_phone ON bookings(phone, created_at);
CREATE INDEX bookings_client_key ON bookings(client_key, created_at);

-- Product photos (required) and an optional packing list / supplier invoice.
CREATE TABLE booking_files (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('photo','packing')),
 file_name TEXT NOT NULL,
 file_mime TEXT NOT NULL CHECK(file_mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 1572864),
 file_data BLOB NOT NULL,
 uploaded_at TEXT NOT NULL
);
CREATE INDEX booking_files_booking ON booking_files(booking_id);

-- Proof of payment a customer uploads from the chat. It waits under
-- Invoices & Payments until an admin records the payment (Accepted, and the
-- file is copied to that payment's proof) or rejects it.
CREATE TABLE customer_payment_proofs (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
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
 uploaded_at TEXT NOT NULL
);
CREATE INDEX customer_payment_proofs_status ON customer_payment_proofs(status, uploaded_at);

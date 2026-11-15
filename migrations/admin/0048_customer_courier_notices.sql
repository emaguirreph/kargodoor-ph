-- ADMIN_DB only. Courier details from the customer portal (Em, 2026-11-15):
-- once the supplier ships, the customer sends the courier name, tracking /
-- waybill number and (optional) a photo of the waybill. Each one shows as an
-- "Incoming" warning in admin (Bookings badge + Dashboard) so Em knows a
-- shipment is on its way to the China warehouse.
CREATE TABLE customer_courier_notices (
 id TEXT PRIMARY KEY NOT NULL,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 -- The shipment it belongs to, or NULL for a new order that is not booked yet.
 shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
 courier TEXT NOT NULL CHECK(length(trim(courier)) BETWEEN 2 AND 80),
 waybill_number TEXT NOT NULL CHECK(length(trim(waybill_number)) BETWEEN 3 AND 80),
 packages INTEGER CHECK(packages IS NULL OR packages BETWEEN 1 AND 999),
 item TEXT CHECK(item IS NULL OR length(item) <= 200),
 -- What the customer said about restricted items (Em, 2026-11-16: some items
 -- are only accepted at certain warehouses, and packages can be refused):
 -- none = no restricted items; asked = has some and already checked with us;
 -- not_asked = has some and did NOT check with us yet (red flag in admin).
 contents_check TEXT NOT NULL DEFAULT 'none' CHECK(contents_check IN ('none','asked','not_asked')),
 note TEXT CHECK(note IS NULL OR length(note) <= 500),
 file_name TEXT,
 file_mime TEXT CHECK(file_mime IS NULL OR file_mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size INTEGER CHECK(file_size IS NULL OR (file_size > 0 AND file_size <= 1572864)),
 file_data BLOB,
 -- New = Em has not seen it yet (counts as a warning). Noted = Em saw it and is
 -- watching for it. Arrived = the China warehouse received the boxes.
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Noted','Arrived')),
 admin_note TEXT CHECK(admin_note IS NULL OR length(admin_note) <= 500),
 reviewed_by_admin_user_id TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX customer_courier_notices_status ON customer_courier_notices(status, created_at);
CREATE INDEX customer_courier_notices_customer ON customer_courier_notices(customer_id, created_at);
CREATE INDEX customer_courier_notices_shipment ON customer_courier_notices(shipment_id);

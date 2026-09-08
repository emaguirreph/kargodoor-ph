-- Add public tracking fields to ADMIN_DB shipments.
-- ADMIN_DB becomes the single source of truth for shipments.
-- Do not apply this migration to TRACKING_DB.

ALTER TABLE shipments
ADD COLUMN cargo_code TEXT COLLATE NOCASE;

ALTER TABLE shipments
ADD COLUMN warehouse_received_date TEXT;

ALTER TABLE shipments
ADD COLUMN departure_date TEXT;

ALTER TABLE shipments
ADD COLUMN tracking_remarks TEXT;

CREATE UNIQUE INDEX idx_shipments_cargo_code
ON shipments(cargo_code)
WHERE cargo_code IS NOT NULL;

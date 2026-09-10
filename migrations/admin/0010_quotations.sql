-- Admin quotations. Apply only to ADMIN_DB; never to TRACKING_DB.
CREATE TABLE quotations (
 id TEXT PRIMARY KEY NOT NULL,
 quotation_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 status TEXT NOT NULL CHECK(status IN ('Draft','Sent','Approved','Revised','Cancelled')),
 freight_type TEXT NOT NULL CHECK(freight_type IN ('Sea Freight','Air Freight')),
 quotation_date TEXT NOT NULL,
 valid_until TEXT,
 prepared_by TEXT NOT NULL,
 customer_snapshot TEXT NOT NULL CHECK(json_valid(customer_snapshot)),
 cargo_snapshot TEXT NOT NULL CHECK(json_valid(cargo_snapshot)),
 pricing_snapshot TEXT NOT NULL CHECK(json_valid(pricing_snapshot)),
 calculated_amount INTEGER NOT NULL CHECK(calculated_amount >= 0),
 override_amount INTEGER CHECK(override_amount >= 0),
 override_reason TEXT,
 final_amount INTEGER NOT NULL CHECK(final_amount >= 0),
 backend_cost INTEGER, additional_cost INTEGER, delivery_cost INTEGER,
 notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((override_amount IS NULL AND override_reason IS NULL) OR (override_amount IS NOT NULL AND length(trim(override_reason)) > 0))
);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_date ON quotations(quotation_date);
CREATE TRIGGER quotations_no_delete BEFORE DELETE ON quotations BEGIN SELECT RAISE(ABORT,'Quotation history cannot be deleted'); END;
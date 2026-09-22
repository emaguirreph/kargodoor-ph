-- ADMIN_DB only. Preserve quotation history while allowing manual full-container quotes.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER IF EXISTS quotations_no_delete;
CREATE TABLE quotations_full_container (
 id TEXT PRIMARY KEY NOT NULL, quotation_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
 customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
 status TEXT NOT NULL CHECK(status IN ('Draft','Sent','Approved','Revised','Cancelled')),
 freight_type TEXT NOT NULL CHECK(freight_type IN ('Sea Freight','Air Freight','Full Container')),
 quotation_date TEXT NOT NULL, valid_until TEXT, prepared_by TEXT NOT NULL,
 customer_snapshot TEXT NOT NULL CHECK(json_valid(customer_snapshot)), cargo_snapshot TEXT NOT NULL CHECK(json_valid(cargo_snapshot)), pricing_snapshot TEXT NOT NULL CHECK(json_valid(pricing_snapshot)),
 calculated_amount INTEGER NOT NULL CHECK(calculated_amount >= 0), override_amount INTEGER CHECK(override_amount >= 0), override_reason TEXT, final_amount INTEGER NOT NULL CHECK(final_amount >= 0), backend_cost INTEGER, additional_cost INTEGER, delivery_cost INTEGER, notes TEXT,
 prepared_by_admin_user_id TEXT REFERENCES admin_users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
 CHECK((override_amount IS NULL AND override_reason IS NULL) OR (override_amount IS NOT NULL AND length(trim(override_reason)) > 0))
);
INSERT INTO quotations_full_container SELECT id,quotation_number,customer_id,status,freight_type,quotation_date,valid_until,prepared_by,customer_snapshot,cargo_snapshot,pricing_snapshot,calculated_amount,override_amount,override_reason,final_amount,backend_cost,additional_cost,delivery_cost,notes,prepared_by_admin_user_id,created_at,updated_at,archived_at FROM quotations;
DROP TABLE quotations;
ALTER TABLE quotations_full_container RENAME TO quotations;
CREATE INDEX idx_quotations_customer ON quotations(customer_id); CREATE INDEX idx_quotations_status ON quotations(status); CREATE INDEX idx_quotations_date ON quotations(quotation_date); CREATE INDEX idx_quotations_prepared_by_admin_user ON quotations(prepared_by_admin_user_id, updated_at DESC); CREATE INDEX idx_quotations_active ON quotations(archived_at, updated_at DESC, id);
CREATE TRIGGER quotations_no_delete BEFORE DELETE ON quotations BEGIN SELECT RAISE(ABORT,'Quotation history cannot be deleted'); END;
PRAGMA foreign_key_check;

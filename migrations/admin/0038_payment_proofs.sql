-- ADMIN_DB only. Proof of payment: the screenshot or PDF for a customer
-- payment (payments row) or an expense (expenses row). One file per record;
-- uploading again replaces it. Stored like shipment_nihao_details files
-- (PDF or photo, capped at 1.5 MB).
CREATE TABLE payment_proofs (
 entity_type TEXT NOT NULL CHECK(entity_type IN ('payment','expense')),
 entity_id TEXT NOT NULL,
 file_name TEXT NOT NULL,
 file_mime TEXT NOT NULL CHECK(file_mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 1572864),
 file_data BLOB NOT NULL,
 uploaded_by_admin_user_id TEXT,
 uploaded_at TEXT NOT NULL,
 PRIMARY KEY (entity_type, entity_id)
);

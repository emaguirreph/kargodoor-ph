-- ADMIN_DB only. Ni Hao's paper for a shipment (their SOA): the Ni Hao No.,
-- Doc No., date and Ni Hao's own tracking number, plus the file Ni Hao sent
-- (PDF or photo, stored like insight_images, capped at 1.5 MB). One row per
-- shipment. The amount, CBM and weight are not repeated here: they are the
-- shipment's Ni Hao freight cost and Verified CBM / weight.
CREATE TABLE shipment_nihao_details (
 shipment_id TEXT PRIMARY KEY NOT NULL,
 nihao_no TEXT,
 nihao_doc_no TEXT,
 nihao_date TEXT,
 nihao_tracking TEXT COLLATE NOCASE,
 file_name TEXT,
 file_mime TEXT CHECK(file_mime IS NULL OR file_mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size INTEGER CHECK(file_size IS NULL OR (file_size > 0 AND file_size <= 1572864)),
 file_data BLOB,
 file_uploaded_at TEXT,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_shipment_nihao_details_no ON shipment_nihao_details(nihao_no);
CREATE INDEX idx_shipment_nihao_details_tracking ON shipment_nihao_details(nihao_tracking);

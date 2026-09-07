-- ADMIN_DB only. Additive upgrade; existing unknown costs stay NULL.
ALTER TABLE shipments ADD COLUMN nihao_cost INTEGER
 CHECK(nihao_cost IS NULL OR (typeof(nihao_cost) = 'integer' AND nihao_cost BETWEEN 0 AND 100000000000));
CREATE INDEX idx_activity_chronology ON activity_log(created_at DESC, id);
CREATE INDEX idx_shipments_updated ON shipments(updated_at DESC, id);

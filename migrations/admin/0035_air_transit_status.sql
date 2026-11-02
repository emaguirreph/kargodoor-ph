-- ADMIN_DB only. Air Freight gets its own in-transit stage, Air Transit, in
-- place of Sea Transit. SQLite cannot change a CHECK constraint in place, so
-- status is rebuilt with the new list. Air Freight shipments already marked
-- Sea Transit move to Air Transit; every other status is kept as is.
ALTER TABLE shipments ADD COLUMN status_next TEXT NOT NULL DEFAULT 'Awaiting Supplier Dispatch' CHECK(status_next IN (
  'Awaiting Supplier Dispatch','Pending Warehouse Receipt','Received at Warehouse','In Transit','Arrived in Philippines','Ready for Release',
  'China Warehouse','China Port','Sea Transit','Air Transit','Manila Port','Gatepass','Malabon Warehouse','Delivered','Cancelled'
));
UPDATE shipments SET status_next = CASE
  WHEN service_type = 'Air Freight' AND status = 'Sea Transit' THEN 'Air Transit'
  ELSE status
END;
DROP INDEX idx_shipments_status;
ALTER TABLE shipments DROP COLUMN status;
ALTER TABLE shipments RENAME COLUMN status_next TO status;
CREATE INDEX idx_shipments_status ON shipments(status);

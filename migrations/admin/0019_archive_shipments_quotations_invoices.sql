-- Preserve shipment, quotation, and invoice history instead of deleting it.
-- Apply only to ADMIN_DB; never to TRACKING_DB.
ALTER TABLE shipments ADD COLUMN archived_at TEXT;
ALTER TABLE quotations ADD COLUMN archived_at TEXT;
ALTER TABLE invoices ADD COLUMN archived_at TEXT;

CREATE INDEX idx_shipments_active ON shipments(archived_at, updated_at DESC, id);
CREATE INDEX idx_quotations_active ON quotations(archived_at, updated_at DESC, id);
CREATE INDEX idx_invoices_active ON invoices(archived_at, updated_at DESC, id);

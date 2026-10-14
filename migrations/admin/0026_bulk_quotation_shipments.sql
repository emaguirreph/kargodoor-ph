-- A combined quotation may cover multiple physical packages. Keep all existing
-- quotation links, but permit more than one shipment to reference the same quote.
DROP INDEX IF EXISTS idx_shipments_source_quotation;
CREATE INDEX idx_shipments_source_quotation ON shipments(source_quotation_id) WHERE source_quotation_id IS NOT NULL;

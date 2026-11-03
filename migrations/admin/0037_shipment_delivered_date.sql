-- Date the cargo was delivered to (or picked up by) the customer.
-- actual_arrival stays the Malabon warehouse received date.
ALTER TABLE shipments ADD COLUMN delivered_date TEXT;

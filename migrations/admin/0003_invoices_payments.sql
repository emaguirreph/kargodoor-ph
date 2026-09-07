-- ADMIN_DB only. Phase 2B invoice/payment additions.
ALTER TABLE invoices ADD COLUMN other_charge INTEGER NOT NULL DEFAULT 0
 CHECK(typeof(other_charge) = 'integer' AND other_charge BETWEEN 0 AND 100000000000);

CREATE INDEX idx_invoices_updated ON invoices(updated_at DESC, id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC, id);

PRAGMA optimize;

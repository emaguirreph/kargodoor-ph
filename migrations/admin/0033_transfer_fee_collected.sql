-- Flat ₱30 transfer fee included in every new shipment's KargoDoor charge.
-- The customer sees one shipping fee; the admin labels this part the transfer fee.
-- New rows get 3000 centavos by default; shipments that existed before stay at 0.
ALTER TABLE shipments ADD COLUMN transfer_fee_collected INTEGER NOT NULL DEFAULT 3000 CHECK (transfer_fee_collected >= 0);
UPDATE shipments SET transfer_fee_collected = 0;

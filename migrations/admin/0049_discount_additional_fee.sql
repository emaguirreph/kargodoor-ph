-- Special discount: any % off the KargoDoor base fee (e.g. 10, 12.5, 20; Em 2026-11-17), shown on the invoice.
-- shipping_charge stays what the customer pays for freight AFTER the discount,
-- so totals, payments, margins and profit need no change. The fee before the
-- discount is shipping_charge + discount_amount.
ALTER TABLE shipments ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100);
ALTER TABLE shipments ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE invoices ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE invoices ADD COLUMN discount_reason TEXT;
-- Additional fee (e.g. Ni Hao's 100 RMB large-shipment fee passed on to the customer), typed in pesos
-- on the shipment. It becomes the invoice's other charge with its own label.
ALTER TABLE shipments ADD COLUMN additional_fee INTEGER NOT NULL DEFAULT 0 CHECK (additional_fee >= 0);
ALTER TABLE shipments ADD COLUMN additional_fee_label TEXT;
ALTER TABLE invoices ADD COLUMN other_charge_label TEXT;

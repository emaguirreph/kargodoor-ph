-- ADMIN_DB only. Hand-added shipments get a customer cargo description (shown
-- as the cargo, like a quotation's) and remember whether their KargoDoor
-- freight charge came from the rates ('rate') or was typed in ('manual').
-- Existing charges were all typed in or copied from a quotation, so they are
-- left NULL and treated as typed.
ALTER TABLE shipments ADD COLUMN cargo_description TEXT;
ALTER TABLE shipments ADD COLUMN shipping_charge_source TEXT CHECK(shipping_charge_source IS NULL OR shipping_charge_source IN ('rate','manual'));

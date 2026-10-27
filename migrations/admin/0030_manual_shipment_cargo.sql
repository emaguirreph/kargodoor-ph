-- ADMIN_DB only. Shipments added by hand (no source quotation) get their own
-- cargo item, category and piece count so the Ni Hao estimate and KargoDoor
-- freight can be calculated for them. Quotation-linked shipments keep reading
-- these from the quotation's cargo snapshot and leave the columns empty.
ALTER TABLE shipments ADD COLUMN cargo_item TEXT;
ALTER TABLE shipments ADD COLUMN cargo_category TEXT CHECK(cargo_category IS NULL OR cargo_category IN (
  'LOW VALUE GOODS','VOLUME GOODS','COMMODITIES','HIGH VALUE','SENSITIVE GOODS','MOBILE / COMPUTERS / TABLETS',
  'Ordinary Items','Liquid, Powder, Food, Computer Parts, Electronics','Medicine and Food Supplements','Mobile Phones','Tablets','Laptop Computers'
));
ALTER TABLE shipments ADD COLUMN cargo_quantity INTEGER CHECK(cargo_quantity IS NULL OR cargo_quantity >= 1);
-- Copy the "Item: ..." first line of existing hand-added shipments into the new
-- item column. The remarks themselves are not changed.
UPDATE shipments
SET cargo_item = trim(substr(tracking_remarks, 7, instr(tracking_remarks || char(10), char(10)) - 7))
WHERE source_quotation_id IS NULL AND tracking_remarks LIKE 'Item: %';
UPDATE shipments SET cargo_item = NULL WHERE cargo_item = '';

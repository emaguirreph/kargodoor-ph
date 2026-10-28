-- ADMIN_DB only. SENSITIVE GOODS is split into SENSITIVE - BATTERIES and
-- SENSITIVE - CHEMICALS, each with its own rate. SQLite cannot change a CHECK
-- constraint in place, so cargo_category is rebuilt with the new list. Any
-- existing SENSITIVE GOODS value moves to the category of its item.
ALTER TABLE shipments ADD COLUMN cargo_category_next TEXT CHECK(cargo_category_next IS NULL OR cargo_category_next IN (
  'LOW VALUE GOODS','VOLUME GOODS','COMMODITIES','HIGH VALUE','SENSITIVE - BATTERIES','SENSITIVE - CHEMICALS','MOBILE / COMPUTERS / TABLETS',
  'Ordinary Items','Liquid, Powder, Food, Computer Parts, Electronics','Medicine and Food Supplements','Mobile Phones','Tablets','Laptop Computers'
));
UPDATE shipments SET cargo_category_next = CASE
  WHEN cargo_category = 'SENSITIVE GOODS' AND cargo_item = 'Batteries' THEN 'SENSITIVE - BATTERIES'
  WHEN cargo_category = 'SENSITIVE GOODS' THEN 'SENSITIVE - CHEMICALS'
  ELSE cargo_category
END;
ALTER TABLE shipments DROP COLUMN cargo_category;
ALTER TABLE shipments RENAME COLUMN cargo_category_next TO cargo_category;
-- Saved quotations keep their category in the cargo snapshot.
UPDATE quotations SET cargo_snapshot = json_set(cargo_snapshot, '$.category',
  CASE WHEN json_extract(cargo_snapshot, '$.item') = 'Batteries' THEN 'SENSITIVE - BATTERIES' ELSE 'SENSITIVE - CHEMICALS' END)
WHERE json_valid(cargo_snapshot) AND json_extract(cargo_snapshot, '$.category') = 'SENSITIVE GOODS';

-- ADMIN_DB only. Track whether a Ni Hao cost is the system's estimate from the
-- Ni Hao rates or Ni Hao's actual quote typed in by an admin. Costs saved
-- before this migration were all typed in, so they count as actual.
ALTER TABLE shipments ADD COLUMN nihao_cost_source TEXT CHECK(nihao_cost_source IS NULL OR nihao_cost_source IN ('estimate','actual'));
ALTER TABLE quotations ADD COLUMN backend_cost_source TEXT CHECK(backend_cost_source IS NULL OR backend_cost_source IN ('estimate','actual'));
UPDATE shipments SET nihao_cost_source = 'actual' WHERE nihao_cost IS NOT NULL;
UPDATE quotations SET backend_cost_source = 'actual' WHERE backend_cost IS NOT NULL;

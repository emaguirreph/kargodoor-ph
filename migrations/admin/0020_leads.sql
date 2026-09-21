-- Website calculator leads belong only in ADMIN_DB.
CREATE TABLE leads (
  id TEXT PRIMARY KEY NOT NULL,
  lead_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 160),
  phone TEXT NOT NULL CHECK(length(trim(phone)) BETWEEN 5 AND 40),
  email TEXT,
  service_type TEXT NOT NULL CHECK(service_type IN ('Sea Freight','Air Freight')),
  cbm REAL NOT NULL CHECK(cbm > 0 AND cbm <= 1000000),
  weight_kg REAL NOT NULL CHECK(weight_kg > 0 AND weight_kg <= 100000000),
  density_kg_cbm REAL,
  estimated_rate INTEGER NOT NULL CHECK(estimated_rate >= 0),
  source TEXT NOT NULL DEFAULT 'Website Calculator',
  contacted_status TEXT NOT NULL DEFAULT 'No' CHECK(contacted_status IN ('No','Yes','Follow-up Needed')),
  sales_status TEXT NOT NULL DEFAULT 'New' CHECK(sales_status IN ('New','Contacted','Quotation Sent','Converted','Closed')),
  notes TEXT,
  consent INTEGER NOT NULL CHECK(consent IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_leads_sales_status ON leads(sales_status, created_at DESC);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

ALTER TABLE leads ADD COLUMN contact_method TEXT NOT NULL DEFAULT 'Not contacted' CHECK(contact_method IN ('Not contacted','Phone','Viber','WhatsApp','Email'));
ALTER TABLE leads ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'Active' CHECK(lead_status IN ('Active','Inactive'));
ALTER TABLE leads ADD COLUMN archived_at TEXT;
CREATE INDEX idx_leads_active ON leads(archived_at, lead_status, created_at DESC);

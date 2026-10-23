-- Customer email is optional for portal access. Store a normalized Philippine
-- mobile number when available so it can be used as the portal login.
ALTER TABLE customer_accounts ADD COLUMN login_mobile TEXT;

CREATE UNIQUE INDEX idx_customer_accounts_login_mobile
ON customer_accounts(login_mobile)
WHERE login_mobile IS NOT NULL;

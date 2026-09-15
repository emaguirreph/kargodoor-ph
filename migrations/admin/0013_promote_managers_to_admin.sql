-- ADMIN_DB only. Promote the approved KargoDoor managers to operational admins.
-- Admins can manage records; application authorization reserves deletion for the owner.
UPDATE admin_users
SET role = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE email IN (
  'archie.aguirre@gmail.com',
  'lapid.patrick@gmail.com',
  'keahreyes.inquiry@gmail.com'
)
  AND role <> 'owner';

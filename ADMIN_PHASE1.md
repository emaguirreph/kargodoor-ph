# KargoDoor Admin — foundation and Phase 2A

## Delivery status

Local implementation only. No push, deployment, remote migration, remote database creation, or production data change was performed.

Source: `emaguirreph/kargodoor-ph`, `main`, commit `1b69263d864812fc1a5f65814ef9103acda5a0ec` (Add shipment and warehouse dropdowns to admin). This revision was fetched from GitHub for this task. It supersedes the earlier Phase 1 baseline `ee40a0c`. The active Cloudflare deployment was not independently reverified in this turn; verify the deployed version and current `main` again before release.

This package carries forward the earlier Phase 1 foundation, with the original `0001_phase1.sql` migration unchanged. It adds Phase 2A: the operating dashboard, approved warehouses, Ni Hao costs, freight margin review, and searchable activity history.

## What works

| Route | Purpose |
| --- | --- |
| `/admin` | Existing tracking editor, unchanged, including shipment and warehouse dropdowns |
| `/admin/dashboard` | Customer/active-shipment counts, saved invoice/payment summaries, margin overview, recently updated shipments |
| `/admin/customers` | Create, edit, search, view customers; open or add their shipments |
| `/admin/shipments` | Create, edit, search and filter shipments linked to customers; warehouse, dimensions, dates, charges, costs and manually recorded payment status |
| `/admin/finance` | Freight charges, Ni Hao costs, calculated freight margin, missing-cost filter and pagination |
| `/admin/activity` | Search by code, admin or action; filter customers/shipments; see field changes and record-specific history |

Customer information is stored once and referenced by shipment, invoice and payment relationships. Customer names are read from the customer record, not copied into new shipment records.

Money uses integer Philippine centavos. Freight margin is **KargoDoor freight charge minus Ni Hao freight cost**. It excludes delivery charges and other expenses, so it is not net income. Unknown costs remain `NULL`; explicitly entered zero is a known cost. Summary totals exclude cancelled shipments and shipments without a recorded Ni Hao cost. Search filters narrow the rows, while the clearly labeled summary remains an overall total.

A customer or shipment save and its audit records run in one database batch transaction. Stale edits are rejected. Cost, charge, status, CBM and weight changes receive before-and-after audit entries. Database triggers prevent activity deletion and editing through ordinary database writes.

## Preservation

All existing public pages, assets, tracking API code and `app/admin/route.ts` remain byte-identical to the baseline. All existing Worker settings and the `TRACKING_DB` binding are preserved. Existing locked dependencies are unchanged; the two exact development dependencies from Phase 1 (`@cloudflare/workers-types` and `esbuild`) were carried forward.

The new admin code accesses only `ADMIN_DB`. There is no tracking synchronization, import, migration or write-through. The existing tracking editor continues to manage public tracking during this phase. Existing cargo codes such as `KDOOR-0001` are not automatically imported into the new database.

## Database model and migrations

Seven connected tables from Phase 1:

- `customers`
- `shipments` → customer
- `invoices` → shipment and matching customer
- `payments` → invoice and matching customer
- `expenses`
- `admin_users`
- `activity_log` → admin user

Composite foreign keys ensure that invoice/payment customer links cannot disagree. Deletions of referenced customers, shipments and admins are restricted.

`migrations/admin/0001_phase1.sql` creates the foundation. `0002_freight_cost.sql` adds nullable `shipments.nihao_cost` and indexes. It does not rebuild tables or overwrite existing values. If the original Phase 1 migration has already been applied using Wrangler, only migration 0002 should be pending. If tables were created manually, reconcile migration history first; do not blindly rerun 0001.

Both migrations were tested locally against Cloudflare's D1 emulator. The additive upgrade was also tested with populated Phase 1 data. No tables have been created remotely by this task.

## Required configuration

Preserved binding:

- `TRACKING_DB` → `kargodoor-tracking`, ID `2a224381-a6d9-40b0-9796-b05aad6f14ab`.

New binding:

- `ADMIN_DB` → separate D1 database, suggested name `kargodoor-admin-phase1`, migrations folder `migrations/admin`.
- `wrangler.jsonc` deliberately contains `REPLACE_WITH_NEW_ADMIN_D1_ID`. Never substitute the tracking database ID.

Production server variables:

- `ADMIN_ORIGIN`: `https://kargodoorph.com` (exact origin, no trailing slash).
- `ACCESS_TEAM_DOMAIN`: the actual Access team hostname ending in `.cloudflareaccess.com`.
- `ACCESS_AUD`: the audience tag for the Access application covering the new admin routes.
- `ADMIN_CSRF_SECRET`: a fresh random secret, at least 32 characters; store as a Worker secret, never in source control.

Do not enable `ADMIN_LOCAL_DEV` in production. Local username/hash variables are generated by the local setup tool and stay in ignored files.

New routes validate Access JWT signature, issuer, audience, expiration and identity, then require an enabled `owner` or `admin` entry in `admin_users`. Writes validate the request origin, form type/size, signed CSRF token and server-side field schema. Unknown admin subroutes also authenticate before returning 404. The existing `/admin` editor is preserved and continues to rely on its existing Cloudflare Access protection.

## Run locally

Requires Node.js 22.13 or newer and npm. Commands below are local; they do not deploy.

```sh
npm ci --ignore-scripts
npm run build:cloudflare
npm run admin:setup:local
npm run admin:dev
```

Open `http://localhost:8787/admin/dashboard`. The setup command prints a randomly generated temporary local password for `local-admin@example.test`; save it when shown. The secret itself is not stored in the application configuration, only a salted hash. The local environment binds to loopback and uses a local D1 emulator.

On later runs, keep the existing `.dev.vars` and `wrangler.admin-local.json`; rerun the build after code changes, then start `admin:dev`. If a local database already exists from Phase 1, apply pending migrations locally:

```sh
npx wrangler d1 migrations apply ADMIN_DB --local --config wrangler.admin-local.json
```

The setup utility intentionally refuses to overwrite `.dev.vars`. Local database state, credentials and test outputs are ignored by Git and excluded from the source ZIP. The new local database starts empty apart from the local admin account. Create a customer first, then their shipment. Public tracking is not seeded by setup; the separate automated integration test seeds its own isolated local tracking fixture.

## Validation

Completed successfully for this delivery:

- 11 tests covering field validation, monetary precision, foreign keys, transactional audit writes, immutability, stale edits, Access JWTs, admin allowlist, CSRF, additive migration, missing/zero/negative-margin costs, report filtering/pagination and escaping.
- Local Cloudflare Worker/D1 HTTP integration: new routes require authentication; customer/shipment create/edit/search/filter; warehouse/cost validation; cost summaries and audit history; invalid requests; duplicates and stale saves.
- Existing public route smoke checks and legacy shipment dropdown rendering.
- A separate local tracking record was verified unchanged after new admin writes.
- TypeScript, scoped ESLint and the OpenNext Cloudflare production build.
- Source preservation check for all existing public/tracking files, legacy editor, Worker settings, existing locked packages and tracking binding.

Reproduce:

```sh
npm run test:admin
npm run build:cloudflare
npm run test:admin:http
node scripts/check-admin-preservation.mjs
npx tsc --noEmit
```

The HTTP test uses port 8787, so stop `admin:dev` before running it. It generates its own isolated local databases and credentials and stops its test server afterward. The preservation script requires Git history containing the baseline commit; use the supplied patch in a repository checkout for that check.

Browser visual QA and real production Access login are not claimed as completed. Before release, review desktop/mobile layout and test the real approved and unapproved sign-in paths.

## Cloudflare release steps — pending explicit approval

Do not push to the connected GitHub branch without release approval: the existing integration may deploy on push. Do not publish a preview Worker or apply remote migrations without approval either.

After approval, first verify the current live commit and compare any upstream changes. Review the package on a branch away from automatic production deployments. Then:

1. Verify whether a separate admin database already exists. Reuse only the intended admin database; otherwise create a separate empty D1 database. Confirm its ID differs from `TRACKING_DB`.
2. Replace only the admin placeholder ID in the configuration. Review pending admin migrations and apply them only to `ADMIN_DB`. Preserve migration 0001 if already applied; add 0002. Never run the admin migrations against tracking.
3. Ensure Access covers both `/admin` and `/admin/*`. Preserve the working existing application/policies. Restrict access to the approved users, and configure the correct audience and team domain. Review alternate Worker URLs, which the new admin also rejects through canonical-origin enforcement.
4. Add the server variables/secret above. Provision only approved admin users using the included `scripts/admin-user.mjs`; inspect its usage first. Disable departed staff by setting their role to `disabled` rather than deleting audit identities.
5. Review desktop/mobile screens and real Access login behavior. Confirm the original tracking editor and public tracking still work. Review a concrete release diff, deployment target and rollback plan before publishing.
6. After the separately approved deployment, test the new dashboard, create/edit workflow and audit attribution. Keep `/admin` available for tracking during this phase.

Rollback should restore the previous Worker version while retaining the separate admin database. Do not delete the new database or reverse migrations merely to roll back the application. Keep any records entered after launch.

## Next controlled phase

Invoice creation from saved shipment charges, payment recording and derived payment status come next. The invoice/payment tables are foundational only in this delivery. Dashboard invoice/payment cards show stored records; manually changing a shipment's payment status does not create a payment or invoice. There is no PDF invoice generation, full bookkeeping, customer login/dashboard or public tracking synchronization in this phase.

When implementing invoices, define which charges become an issued invoice snapshot and prevent later shipment edits from silently changing issued totals. Payment entry should atomically record payment, invoice status, shipment payment status and audit history, with duplicate/overpayment controls. Review migration/synchronization separately before connecting public tracking to admin records.

## Reference documentation

Implementation checks used Cloudflare's official [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/), [migration reference](https://developers.cloudflare.com/d1/reference/migrations/), and [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) documentation.

## Exact file inventory

Modified existing files (5):

- `.gitignore`
- `cloudflare-env.d.ts`
- `package-lock.json`
- `package.json`
- `wrangler.jsonc`

Created files (22):

- `ADMIN_PHASE1.md`
- `app/admin/[...path]/route.ts`
- `app/admin/activity/route.ts`
- `app/admin/customers/route.ts`
- `app/admin/dashboard/route.ts`
- `app/admin/finance/route.ts`
- `app/admin/shipments/route.ts`
- `lib/admin/data.ts`
- `lib/admin/handler.ts`
- `lib/admin/reports.ts`
- `lib/admin/security.ts`
- `lib/admin/ui.ts`
- `lib/admin/validation.ts`
- `migrations/admin/0001_phase1.sql`
- `migrations/admin/0002_freight_cost.sql`
- `scripts/admin-dev.mjs`
- `scripts/admin-local.mjs`
- `scripts/admin-user.mjs`
- `scripts/check-admin-preservation.mjs`
- `scripts/test-admin-http.mjs`
- `scripts/test-admin.mjs`
- `tests/admin/core.test.ts`

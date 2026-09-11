import type { D1Database } from "@cloudflare/workers-types";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID, scryptSync } from "node:crypto";
import { quotationsPage } from "../../lib/admin/quotations";
import { csrfToken, type AdminEnv } from "../../lib/admin/security";

const email = "quotation-admin@example.test";
const password = "quotation-test-password";
const salt = "quotation-test-salt";
const hash = scryptSync(password, salt, 64).toString("hex");

function quotationDatabase() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0010_quotations.sql", "utf8"));

  const user = randomUUID();
  sql.prepare("INSERT INTO admin_users VALUES (?,?,?,?,?,?)").run(
    user,
    "Quotation Admin",
    email,
    "admin",
    "2026-01-01",
    "2026-01-01",
  );

  function prepare(query: string) {
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        args = values;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...(args as never[])) ?? null;
      },
      async all() {
        return { results: sql.prepare(query).all(...(args as never[])) };
      },
      async run() {
        return { meta: sql.prepare(query).run(...(args as never[])) };
      },
    };
  }

  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sql.exec("COMMIT");
        return out;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;

  const env: AdminEnv = {
    ADMIN_DB: db,
    ADMIN_ORIGIN: "http://localhost:3000",
    ADMIN_LOCAL_DEV: "true",
    LOCAL_ADMIN_EMAIL: email,
    LOCAL_ADMIN_HASH: `${salt}:${hash}`,
    ADMIN_CSRF_SECRET: "quotation-renderer-test-secret-1234567890",
  };

  return { sql, env, user };
}

function authHeaders() {
  return {
    authorization: `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
  };
}

const requiredSeaOutputs = [
  "Category",
  "Package Tier",
  "Actual Density (kg/CBM)",
  "CBM Price",
  "Density Rate / kg",
  "Fixed / Base Charge",
  "Density-Based Charge",
  "Density Rule Applies?",
  "Pricing Method",
  "Total Unit Amount",
];

function assertSeaPricingMarkup(html: string) {
  for (const name of ["item", "cbm", "weight", "units"]) {
    assert.match(html, new RegExp(`name="${name}"`), `Sea input ${name} should be present`);
  }

  for (const name of [
    "quantity",
    "unit_type",
    "length",
    "width",
    "height",
    "measurement_unit",
    "category",
  ]) {
    assert.doesNotMatch(
      html,
      new RegExp(`name="${name}"`),
      `Legacy Sea input ${name} must not be rendered`,
    );
  }

  for (const label of requiredSeaOutputs) {
    assert.ok(html.includes(label), `Missing Sea read-only output: ${label}`);
  }
}

test("Sea Freight Create renderer exposes only four editable pricing inputs", async () => {
  const { env } = quotationDatabase();
  const response = await quotationsPage(
    new Request("http://localhost:3000/admin/quotations?new=1", {
      headers: authHeaders(),
    }),
    env,
  );

  assert.equal(response.status, 200);
  const html = await response.text();

  assert.ok(html.includes("Create quotation"));
  assertSeaPricingMarkup(html);
});

test("Sea Freight Solar Panels persists exact pricing and Edit renderer stays clean", async () => {
  const { sql, env, user } = quotationDatabase();

  const form = new URLSearchParams({
    csrf: csrfToken(env, user, "/admin/quotations"),
    action: "save",
    freight_type: "Sea Freight",
    status: "Draft",
    quotation_date: "2026-09-11",
    customer_name: "Solar Test Customer",
    item: "Solar panels",
    cbm: "8.39",
    weight: "3400",
    units: "0",
  });

  const save = await quotationsPage(
    new Request("http://localhost:3000/admin/quotations", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    }),
    env,
  );

  assert.equal(save.status, 303);

  const row = sql
    .prepare(
      "SELECT id, cargo_snapshot, pricing_snapshot, calculated_amount, final_amount FROM quotations LIMIT 1",
    )
    .get() as {
      id: string;
      cargo_snapshot: string;
      pricing_snapshot: string;
      calculated_amount: number;
      final_amount: number;
    };

  assert.ok(row);
  const cargo = JSON.parse(row.cargo_snapshot);
  const pricing = JSON.parse(row.pricing_snapshot);

  assert.equal(cargo.item, "Solar panels");
  assert.equal(cargo.category, "COMMODITIES");
  assert.equal(cargo.cbm, 8.39);
  assert.equal(cargo.weight, 3400);
  assert.equal(cargo.units, 0);

  assert.equal(pricing.packageTier, "KD Standard");
  assert.ok(Math.abs(pricing.density - 405.24433849821216) < 0.000001);
  assert.equal(pricing.base, 79705);
  assert.equal(pricing.densityCharge, 74800);
  assert.equal(pricing.densityApplies, false);
  assert.equal(pricing.pricingMethod, "CBM-Based");
  assert.equal(pricing.final, 79705);

  assert.equal(row.calculated_amount, 7_970_500);
  assert.equal(row.final_amount, 7_970_500);

  const edit = await quotationsPage(
    new Request(`http://localhost:3000/admin/quotations?edit=${row.id}`, {
      headers: authHeaders(),
    }),
    env,
  );

  assert.equal(edit.status, 200);
  const html = await edit.text();

  assert.ok(html.includes("Edit quotation"));
  assertSeaPricingMarkup(html);

  const updateForm = new URLSearchParams({
    csrf: csrfToken(env, user, "/admin/quotations"),
    action: "update",
    quotation_id: row.id,
    freight_type: "Sea Freight",
    status: "Draft",
    quotation_date: "2026-09-11",
    customer_name: "Solar Test Customer",
    item: "Solar panels",
    cbm: "8.40",
    weight: "3400",
    units: "0",
  });

  const update = await quotationsPage(
    new Request("http://localhost:3000/admin/quotations", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: updateForm,
    }),
    env,
  );

  assert.equal(update.status, 303);

  const updated = sql
    .prepare(
      "SELECT cargo_snapshot, pricing_snapshot, calculated_amount, final_amount FROM quotations WHERE id=?",
    )
    .get(row.id) as {
      cargo_snapshot: string;
      pricing_snapshot: string;
      calculated_amount: number;
      final_amount: number;
    };

  const updatedCargo = JSON.parse(updated.cargo_snapshot);
  const updatedPricing = JSON.parse(updated.pricing_snapshot);

  assert.equal(updatedCargo.cbm, "8.40");
  assert.equal(updatedCargo.weight, "3400");
  assert.equal(updatedCargo.units, "0");
  assert.equal(updatedCargo.category, "COMMODITIES");

  assert.equal(updatedPricing.packageTier, "KD Standard");
  assert.ok(Math.abs(updatedPricing.density - 404.76190476190476) < 0.000001);
  assert.equal(updatedPricing.base, 79800);
  assert.equal(updatedPricing.densityCharge, 74800);
  assert.equal(updatedPricing.densityApplies, false);
  assert.equal(updatedPricing.pricingMethod, "CBM-Based");
  assert.equal(updatedPricing.final, 79800);

  assert.equal(updated.calculated_amount, 7_980_000);
  assert.equal(updated.final_amount, 7_980_000);
});

test("Air Freight Create renderer retains legacy Air pricing inputs", async () => {
  const { env } = quotationDatabase();
  const response = await quotationsPage(
    new Request(
      "http://localhost:3000/admin/quotations?new=1&freight=Air%20Freight",
      { headers: authHeaders() },
    ),
    env,
  );

  assert.equal(response.status, 200);
  const html = await response.text();

  for (const name of [
    "item",
    "quantity",
    "unit_type",
    "length",
    "width",
    "height",
    "measurement_unit",
    "cbm",
    "weight",
  ]) {
    assert.match(html, new RegExp(`name="${name}"`), `Air input ${name} should remain present`);
  }
});

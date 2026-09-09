import type { D1Database } from "@cloudflare/workers-types";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import {
  customerSchema,
  shipmentSchema,
  parseForm,
  parseExpenseForm,
} from "../../lib/admin/validation";
import { marginSummarySql, finance, activity, dashboard, saveStaffFollowUp } from "../../lib/admin/reports";
import { saveRecord } from "../../lib/admin/data";
import { createInvoice, issueInvoice, recordPayment } from "../../lib/admin/billing";
import {
  validateJwt,
  csrfToken,
  checkCsrf,
  canonicalOrigin,
  adminOriginAllowed,
  authenticate,
  type AdminEnv,
  canMutateAdmin,
  requireAdminMutation,
} from "../../lib/admin/security";
import { expensesPage, saveExpense, mutateExpense } from "../../lib/admin/expenses";
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0003_invoices_payments.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0004_public_tracking.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0005_expenses.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0006_admin_viewer_role.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0007_staff_follow_up.sql", "utf8"));
  const user = randomUUID();
  sql
    .prepare("INSERT INTO admin_users VALUES (?,?,?,?,?,?)")
    .run(
      user,
      "Admin",
      "admin@example.test",
      "admin",
      "2026-01-01",
      "2026-01-01",
    );
  function prepare(query: string) {
    let args: unknown[] = [];
    return {
      bind(...v: unknown[]) {
        args = v;
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
        for (const s of statements) out.push(await s.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sql, db, user };
}
const customer = customerSchema.parse({
  customer_code: "KD-001",
  full_name: "Test customer",
  company_name: "",
  mobile: "+639171234567",
  email: "",
  address: "",
  notes: "",
});
const shipmentInput = (id: string) =>
  ({
    customer_id: id,
    tracking_number: "KDOOR-0001",
    cargo_code: "",
    service_type: "Sea Freight",
    china_warehouse: "Guangzhou",
    warehouse_received_date: "",
    departure_date: "",
    cbm: "1.250",
    weight_kg: "425",
    status: "Received at Warehouse",
    estimated_arrival: "2026-10-01",
    actual_arrival: "",
    tracking_remarks: "",
    shipping_charge: "6500.25",
    nihao_cost: "",
    delivery_charge: "0",
    payment_status: "Unpaid",
  });
const shipment = (id: string) => shipmentSchema.parse(shipmentInput(id));
test("dashboard attention and shared follow-up note preserve role boundaries", async () => {
  const { sql, db, user } = database();
  const admin = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  let html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.match(html, /No items need attention/);
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", shipment(customerId), user, "", "");
  const invoiceId = randomUUID();
  sql.prepare(`INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,issued_at,due_at,created_at,updated_at,other_charge)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId, "INV-ATTN", customerId, shipmentId, 100000, 0, 100000, "Partial", "2026-09-01", "2026-09-15", "2026-09-01", "2026-09-01", 0);
  sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), invoiceId, customerId, 25000, "Cash", null, "2026-09-02", null, "2026-09-02");
  html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.match(html, /Needs Attention/);
  assert.match(html, /Unpaid invoices \(1\)/);
  assert.match(html, /₱750\.00/);
  assert.match(html, new RegExp(`/admin/invoices\\?id=${invoiceId}`));
  assert.match(html, /Shipments missing Nihao cost \(1\)/);
  assert.match(html, new RegExp(`/admin/shipments\\?id=${shipmentId}`));
  assert.match(html, /No follow-up note has been added/);
  await saveStaffFollowUp(db, "Call customer\nConfirm delivery", admin);
  await saveStaffFollowUp(db, "Updated priority", admin);
  await assert.rejects(saveStaffFollowUp(db, "x".repeat(4001), admin), /4,000/);
  assert.equal(sql.prepare("SELECT note FROM staff_follow_up WHERE id=1").get()!.note, "Updated priority");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_type='staff_follow_up'").get()!.n, 2);
  html = await (await dashboard(db, { ...admin, role: "viewer" }, "csrf", false)).text();
  assert.match(html, /Updated priority/);
  assert.ok(!html.includes("Save follow-up"));
  assert.ok(!html.includes("Shipments missing Nihao cost"));
});
test("required fields, dates, enum, numeric precision and overposting are validated", () => {
  assert.throws(() => customerSchema.parse({ ...customer, full_name: " " }));
  assert.throws(() =>
    parseForm("customers", new URLSearchParams("customer_code=X&role=owner")),
  );
  const form = new URLSearchParams("customer_code=A&customer_code=B");
  assert.throws(() => parseForm("customers", form));
  const {
    tracking_number: _trackingNumber,
    cargo_code: _cargoCode,
    ...shipmentFormInput
  } = shipmentInput(randomUUID());
  assert.equal(_trackingNumber, "KDOOR-0001");
  assert.equal(_cargoCode, "");
  const parsedShipmentForm = parseForm(
    "shipments",
    new URLSearchParams(Object.entries(shipmentFormInput)),
  );
  assert.equal("cargo_code" in parsedShipmentForm, false);
  assert.equal(shipment(randomUUID()).shipping_charge, 650025);
  for (const bad of ["-1", "Infinity", "NaN", "1e3", "2.0001", ""])
    assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), cbm: bad }).success, false);
  for (const bad of ["-1", "1.001", "", "NaN"])
    assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), shipping_charge: bad }).success, false);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), estimated_arrival: "2026-02-30" }).success, false);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), status: "bad" }).success, false);
});
test("customer and shipment writes create correct atomic immutable audit logs", async () => {
  const { sql, db, user } = database();
  const id = await saveRecord(db, "customers", customer, user, "", "");
  const c = sql.prepare("SELECT * FROM customers").get()!;
  await saveRecord(
    db,
    "customers",
    { ...customer, full_name: "Edited" },
    user,
    id,
    String(c.updated_at),
  );
  const sid = await saveRecord(db, "shipments", shipment(id), user, "", "");
  const s = sql.prepare("SELECT * FROM shipments").get()!;
  await saveRecord(
    db,
    "shipments",
    {
      ...shipment(id),
      status: "In Transit",
      cbm: 2,
      weight_kg: 500,
      shipping_charge: 700000,
    },
    user,
    sid,
    String(s.updated_at),
  );
  const logs = sql
    .prepare("SELECT * FROM activity_log ORDER BY created_at")
    .all();
  assert.equal(logs.length, 8);
  assert.deepEqual(
    logs
      .filter(x => String(x.action).startsWith("change_"))
      .map((x) => x.action)
      .sort(),
    [
      "change_cbm",
      "change_shipping_charge",
      "change_status",
      "change_weight_kg",
    ],
  );
  assert.equal(logs[0].admin_user_id, user);
  assert.equal(logs[0].old_value, null);
  assert.equal(
    JSON.parse(String(logs.find(x=>x.action === "update" && x.entity_type === "shipments")!.old_value)).status,
    "Received at Warehouse",
  );
  assert.equal(JSON.parse(String(logs.find(x=>x.action === "update" && x.entity_type === "shipments")!.new_value)).status, "In Transit");
  assert.throws(() => sql.exec("DELETE FROM activity_log"), /immutable/);
  assert.throws(
    () => sql.exec("UPDATE activity_log SET action='tamper'"),
    /immutable/,
  );
  await assert.rejects(
    saveRecord(db, "shipments", shipment(id), user, sid, String(s.updated_at)),
    /Another admin/,
  );
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n,
    8,
  );
});
test("duplicate, foreign-key and audit failure roll back entire write", async () => {
  const { sql, db, user } = database();
  await saveRecord(db, "customers", customer, user, "", "");
  await assert.rejects(
    saveRecord(db, "customers", customer, user, "", ""),
    /already exists/,
  );
  await assert.rejects(
    saveRecord(db, "shipments", shipment(randomUUID()), user, "", ""),
    /existing customer/,
  );
  await assert.rejects(
    saveRecord(
      db,
      "customers",
      { ...customer, customer_code: "OTHER" },
      randomUUID(),
      "",
      "",
    ),
  );
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customers").get()!.n, 1);
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n,
    1,
  );
});
test("one account number can own multiple shipments with unique tracking numbers", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KDOOR-0001" }, user, "", "");
  const sea = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-SEA-000001", cargo_code: null }, user, "", "");
  const air = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-AIR-000001", cargo_code: null, service_type: "Air Freight" }, user, "", "");
  assert.notEqual(sea, air);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM shipments WHERE customer_id = ?").get(customerId)!.n, 2);
  await assert.rejects(saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-SEA-000001", cargo_code: null }, user, "", ""), /tracking number already exists/);
});
test("new records receive sequential immutable account and tracking numbers", async () => {
  const { sql, db, user } = database();
  const { customer_code: _account, ...newCustomer } = customer;
  assert.equal(_account, "KD-001");
  const firstCustomer = await saveRecord(db, "customers", newCustomer, user, "", "");
  const secondCustomer = await saveRecord(db, "customers", { ...newCustomer, full_name: "Second customer", mobile: "+639171234568" }, user, "", "");
  assert.equal(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(firstCustomer)!.customer_code, "KDOOR0001");
  assert.equal(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(secondCustomer)!.customer_code, "KDOOR0002");
  const { tracking_number: _tracking, cargo_code: _cargo, ...newShipment } = shipment(firstCustomer);
  assert.equal(_tracking, "KDOOR-0001");
  assert.equal(_cargo, null);
  const seaOne = await saveRecord(db, "shipments", newShipment, user, "", "");
  const seaTwo = await saveRecord(db, "shipments", { ...newShipment, cargo_code: null }, user, "", "");
  const air = await saveRecord(db, "shipments", { ...newShipment, service_type: "Air Freight" }, user, "", "");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaOne)!.tracking_number, "KDSEA000001");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaTwo)!.tracking_number, "KDSEA000002");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(air)!.tracking_number, "KDAIR000001");
  const customerRow = sql.prepare("SELECT * FROM customers WHERE id=?").get(firstCustomer)!;
  await saveRecord(db, "customers", newCustomer, user, firstCustomer, String(customerRow.updated_at));
  assert.equal(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(firstCustomer)!.customer_code, "KDOOR0001");
  const shipmentRow = sql.prepare("SELECT * FROM shipments WHERE id=?").get(seaOne)!;
  await saveRecord(db, "shipments", newShipment, user, seaOne, String(shipmentRow.updated_at));
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaOne)!.tracking_number, "KDSEA000001");
});
test("legacy dashed identifiers advance the new no-dash sequences", async () => {
  const { sql, db, user } = database();
  const legacyCustomer = await saveRecord(db, "customers", { ...customer, customer_code: "KDOOR-0002" }, user, "", "");
  const { customer_code: _account, ...newCustomer } = customer;
  assert.equal(_account, "KD-001");
  const newCustomerId = await saveRecord(db, "customers", { ...newCustomer, full_name: "New customer", mobile: "+639171234568" }, user, "", "");
  assert.equal(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(newCustomerId)!.customer_code, "KDOOR0003");

  await saveRecord(db, "shipments", { ...shipment(legacyCustomer), tracking_number: "KD-SEA-000002", cargo_code: null }, user, "", "");
  await saveRecord(db, "shipments", { ...shipment(legacyCustomer), tracking_number: "KD-AIR-000002", cargo_code: null, service_type: "Air Freight" }, user, "", "");
  const { tracking_number: _tracking, ...newShipment } = shipment(newCustomerId);
  assert.equal(_tracking, "KDOOR-0001");
  const sea = await saveRecord(db, "shipments", newShipment, user, "", "");
  const air = await saveRecord(db, "shipments", { ...newShipment, service_type: "Air Freight" }, user, "", "");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(sea)!.tracking_number, "KDSEA000003");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(air)!.tracking_number, "KDAIR000003");
});
test("invoice and payment customer links cannot disagree and deletes are restricted", async () => {
  const { sql, db, user } = database();
  const a = await saveRecord(db, "customers", customer, user, "", "");
  const b = await saveRecord(
    db,
    "customers",
    { ...customer, customer_code: "B" },
    user,
    "",
    "",
  );
  const s = await saveRecord(db, "shipments", shipment(a), user, "", "");
  const insert = sql.prepare(
    "INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,created_at,updated_at) VALUES (?,?,?,?,100,0,100,'Unpaid','now','now')",
  );
  assert.throws(() => insert.run("i", "INV-1", b, s), /FOREIGN KEY/);
  insert.run("i", "INV-1", a, s);
  assert.throws(
    () =>
      sql
        .prepare(
          "INSERT INTO payments VALUES ('p','i',?,100,'Cash',NULL,'2026-01-01',NULL,'now')",
        )
        .run(b),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => sql.prepare("DELETE FROM customers WHERE id=?").run(a),
    /FOREIGN KEY/,
  );
});
test("CSRF is signed, expiring, user-bound and route-bound; origin fails closed", () => {
  const env = { ADMIN_CSRF_SECRET: "x".repeat(32) } as AdminEnv;
  const token = csrfToken(env, "u", "/admin/customers");
  checkCsrf(env, "u", "/admin/customers", token);
  for (const [u, p, t] of [
    ["other", "/admin/customers", token],
    ["u", "/admin/shipments", token],
    ["u", "/admin/customers", token + "x"],
    ["u", "/admin/customers", csrfToken(env, "u", "/admin/customers", 1)],
  ])
    assert.throws(() => checkCsrf(env, u, p, t));
  assert.throws(() =>
    canonicalOrigin({
      ...env,
      ADMIN_ORIGIN: "http://public.example.com",
      ADMIN_LOCAL_DEV: "true",
    }),
  );
});
test("admin production origin allows only KargoDoor apex and www hosts", () => {
  const env = { ADMIN_ORIGIN: "https://kargodoorph.com" } as AdminEnv;
  assert.equal(adminOriginAllowed(env, "https://kargodoorph.com"), true);
  assert.equal(adminOriginAllowed(env, "https://www.kargodoorph.com"), true);
  for (const origin of [
    "https://evil.test",
    "https://kargodoorph.com.evil.test",
    "http://kargodoorph.com",
    "https://admin.kargodoorph.com",
  ]) assert.equal(adminOriginAllowed(env, origin), false);
  const local = {
    ADMIN_ORIGIN: "http://localhost:8787",
    ADMIN_LOCAL_DEV: "true",
  } as AdminEnv;
  assert.equal(adminOriginAllowed(local, "http://localhost:8787"), true);
  assert.equal(adminOriginAllowed(local, "http://127.0.0.1:8787"), false);
});
test("viewer authorization is centralized and mutation attempts are forbidden", () => {
  assert.equal(canMutateAdmin({ role: "owner" }), true);
  assert.equal(canMutateAdmin({ role: "admin" }), true);
  assert.equal(canMutateAdmin({ role: "viewer" }), false);
  assert.throws(
    () => requireAdminMutation({ role: "viewer" }),
    (error: unknown) => error instanceof Error && error.message === "Viewer access is read-only." &&
      "status" in error && error.status === 403,
  );
});

test("viewer migration preserves users and seeds the exact approved role records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(`INSERT INTO admin_users VALUES
    ('existing-owner','Existing Owner','owner@example.test','owner','created-owner','updated-owner'),
    ('existing-admin','Existing Admin','archie.aguirre@gmail.com','admin','created-admin','updated-admin'),
    ('existing-disabled','Disabled','disabled@example.test','disabled','created-disabled','updated-disabled')`);
  sql.exec(`INSERT INTO activity_log VALUES
    ('log','existing-owner','create_customer','customers','customer',NULL,NULL,NULL,'then')`);
  sql.exec(readFileSync("migrations/admin/0006_admin_viewer_role.sql", "utf8"));
  const roles = sql.prepare("SELECT id,email,role,created_at FROM admin_users ORDER BY email").all();
  assert.ok(roles.some((row) => row.id === "existing-owner" && row.role === "owner" && row.created_at === "created-owner"));
  assert.ok(roles.some((row) => row.id === "existing-admin" && row.email === "archie.aguirre@gmail.com" && row.role === "admin" && row.created_at === "created-admin"));
  for (const [email, role] of [
    ["em.aguirreph@gmail.com", "owner"],
    ["lapid.patrick@gmail.com", "viewer"],
    ["keahreyes.inquiry@gmail.com", "viewer"],
  ]) assert.ok(roles.some((row) => row.email === email && row.role === role));
  assert.equal(sql.prepare("SELECT admin_user_id FROM activity_log").get()!.admin_user_id, "existing-owner");
  assert.throws(() => sql.exec("INSERT INTO admin_users VALUES ('x','X','x@example.test','other','x','x')"), /CHECK/);
});
test("JWT rejects forged, expired, wrong audience/issuer and missing identity tokens", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "test" } as {
    kid: string;
    kty: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://team.cloudflareaccess.com",
    aud: ["aud"],
    sub: "u",
    email: "ADMIN@example.test",
    iat: now,
    exp: now + 600,
  };
  const jwt = (p: object, alg = "RS256") => {
    const body = [{ alg, kid: "test" }, p]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".");
    return (
      body +
      "." +
      sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
    );
  };
  const check = (token: string) =>
    validateJwt(token, [key], payload.iss, "aud");
  assert.equal(check(jwt(payload)), "admin@example.test");
  for (const p of [
    { ...payload, exp: now - 1 },
    { ...payload, aud: ["other"] },
    { ...payload, iss: "https://evil.test" },
    { ...payload, sub: "" },
    { ...payload, email: null },
  ])
    assert.throws(() => check(jwt(p)));
  assert.throws(() => check(jwt(payload, "none")));
  assert.throws(() => check(jwt(payload).slice(0, -10) + "tampered"));
});
test("missing identity, unapproved identity and non-canonical host denied", async () => {
  const { db } = database();
  const env = {
    ADMIN_DB: db,
    ADMIN_ORIGIN: "https://kargodoorph.com",
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud",
  };
  await assert.rejects(
    authenticate(new Request("https://kargodoorph.com/admin"), env),
    /Sign in/,
  );
  await assert.rejects(
    authenticate(new Request("https://alternate.workers.dev/admin"), env),
    /address/,
  );
});
test("valid Access identity still requires an enabled admin database entry", async () => {
  const { sql, db } = database();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "allowlist" };
  const env = {
    ADMIN_DB: db,
    ADMIN_ORIGIN: "https://kargodoorph.com",
    ACCESS_TEAM_DOMAIN: "allowlist.cloudflareaccess.com",
    ACCESS_AUD: "admin-app",
  };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [key] });
  const request = (email: string, origin = env.ADMIN_ORIGIN) => {
    const now = Math.floor(Date.now() / 1000);
    const body = [
      { alg: "RS256", kid: "allowlist" },
      {
        iss: "https://allowlist.cloudflareaccess.com",
        aud: ["admin-app"],
        email,
        sub: "identity",
        iat: now,
        exp: now + 300,
      },
    ]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".");
    const token =
      body +
      "." +
      sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
    return new Request(origin + "/admin", {
      headers: { "cf-access-jwt-assertion": token },
    });
  };
  try {
    assert.equal(
      (await authenticate(request("admin@example.test"), env)).role,
      "admin",
    );
    assert.equal(
      (await authenticate(request("admin@example.test", "https://www.kargodoorph.com"), env)).role,
      "admin",
    );
    await assert.rejects(
      authenticate(request("customer@example.test"), env),
      /not authorized/,
    );
    sql.exec("UPDATE admin_users SET role='viewer'");
    assert.equal(
      (await authenticate(request("admin@example.test"), env)).role,
      "viewer",
    );
    sql.exec("UPDATE admin_users SET role='disabled'");
    await assert.rejects(
      authenticate(request("admin@example.test"), env),
      /not authorized/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("cost upgrade preserves existing shipments and distinguishes missing, zero and loss", async () => {
  const {sql,db,user} = database();
  const customerId = await saveRecord(db,"customers",customer,user,"","");
  const values = shipment(customerId);
  const id = await saveRecord(db,"shipments",values,user,"","");
  assert.equal(sql.prepare("SELECT nihao_cost FROM shipments").get()!.nihao_cost,null);
  let summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.costed,0);
  assert.equal(summary.margin,0);
  const row = sql.prepare("SELECT * FROM shipments").get()!;
  await saveRecord(db,"shipments",{...values,nihao_cost:0},user,id,String(row.updated_at));
  summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.costed,1);
  assert.equal(summary.margin,650025);
  const revision = sql.prepare("SELECT updated_at FROM shipments").get()!.updated_at;
  await saveRecord(db,"shipments",{...values,nihao_cost:700000},user,id,String(revision));
  summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.margin,-49975);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action='change_nihao_cost'").get()!.n,2);
  assert.throws(()=>sql.exec("UPDATE shipments SET nihao_cost=-1"),/CHECK/);
  assert.throws(()=>sql.exec("UPDATE shipments SET nihao_cost=0.5"),/CHECK/);
  sql.exec("UPDATE shipments SET status='Cancelled'");
  assert.equal(sql.prepare(marginSummarySql).get()!.costed,0);
});

test("second migration is additive for a populated Phase 1 database", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql","utf8"));
  sql.exec("INSERT INTO customers VALUES ('c','C-1','Existing customer',NULL,'12345',NULL,NULL,NULL,'then','then')");
  sql.exec("INSERT INTO shipments VALUES ('s','c','KDOOR-0001','Sea Freight','Guangzhou',1,100,'In Transit',NULL,NULL,10000,0,'Unpaid','then','then')");
  const before = sql.prepare("SELECT * FROM shipments").get()!;
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql","utf8"));
  const after = sql.prepare("SELECT * FROM shipments").get()!;
  assert.equal(after.nihao_cost,null);
  delete after.nihao_cost;
  assert.deepEqual(after,before);
  sql.close();
});

test("reports paginate, filter and escape stored customer and audit content", async () => {
  const {sql,db,user} = database();
  const cid = await saveRecord(db,"customers",{...customer,full_name:"<script>unsafe</script>"},user,"","");
  for(let i=0;i<27;i++) await saveRecord(db,"shipments",{...shipment(cid),tracking_number:`KDOOR-${String(i).padStart(4,"0")}`,nihao_cost:i===0 ? null : 500000},user,"","");
  const financeResponse = await finance(db,new URL("https://example.test/admin/finance"),"Admin");
  const html = await financeResponse.text();
  assert.ok(html.includes("Next"));
  assert.ok(html.includes("&lt;script&gt;unsafe"));
  assert.ok(!html.includes("<script>unsafe"));
  const filtered = await (await finance(db,new URL("https://example.test/admin/finance?missing=1"),"Admin")).text();
  assert.ok(filtered.includes("KDOOR-0000"));
  assert.ok(!filtered.includes("KDOOR-0001"));
  const log = await (await activity(db,new URL(`https://example.test/admin/activity?entity_type=customers&entity_id=${cid}`),"Admin")).text();
  assert.ok(log.includes("&lt;script&gt;unsafe"));
  assert.ok(!log.includes("<script>unsafe"));
  assert.equal(sql.prepare(marginSummarySql).get()!.margin,26*150025);
  await assert.rejects(activity(db,new URL("https://example.test/admin/activity?entity_type=users"),"Admin"),/Invalid/);
});

test("invoice snapshots connected records and supports partial and multiple payments", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 700000, delivery_charge: 5000 }, user, "", "");
  const invoiceId = await createInvoice(db, {
    shipment_id: shipmentId, delivery_charge: "100", other_charge: "50.25",
    status: "Unpaid", issued_at: "2026-09-07", due_at: "2026-09-30",
  }, user);
  const invoice = sql.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(invoice.customer_id, customerId);
  assert.equal(invoice.subtotal, 700000);
  assert.equal(invoice.delivery_charge, 10000);
  assert.equal(invoice.other_charge, 5025);
  assert.equal(Number(invoice.total) + Number(invoice.other_charge), 715025);
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Unpaid");
  await assert.rejects(createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user), /already has an invoice/);
  await recordPayment(db, { invoice_id: invoiceId, amount: "2000", payment_method: "Bank Transfer", reference_number: "REF-1", payment_date: "2026-09-10", notes: "First" }, user);
  let state = sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(state.status, "Partial");
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Partial");
  await recordPayment(db, { invoice_id: invoiceId, amount: "5150.25", payment_method: "GCash", reference_number: "REF-2", payment_date: "2026-09-11", notes: "Final" }, user);
  state = sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(state.status, "Paid");
  assert.equal(sql.prepare("SELECT SUM(amount) AS n FROM payments WHERE invoice_id=?").get(invoiceId)!.n, 715025);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM payments WHERE invoice_id=?").get(invoiceId)!.n, 2);
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Paid");
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-09-12", notes: "" }, user), /remaining balance|fully paid|changed/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_type IN ('invoices','payments')").get()!.n, 5);
});

test("draft invoices require issuing and reject invalid charges, dates and overpayments", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", shipment(customerId), user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-09-07", notes: "" }, user), /Issue/);
  await assert.rejects(issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "2026-09-01" }, user));
  await issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "2026-09-30" }, user);
  assert.equal(sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!.status, "Unpaid");
  await assert.rejects(issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "" }, user), /Only a Draft/);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "999999", payment_method: "Cash", reference_number: "", payment_date: "2026-09-10", notes: "" }, user), /exceed/);
  await assert.rejects(createInvoice(db, { shipment_id: crypto.randomUUID(), delivery_charge: "-1", other_charge: "0", status: "Unpaid", issued_at: "", due_at: "" }, user));
});

test("Phase 2B migration preserves populated Phase 2A invoice and payment records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql", "utf8"));
  sql.exec("INSERT INTO customers VALUES ('c','C-1','Existing',NULL,'12345',NULL,NULL,NULL,'then','then')");
  sql.exec("INSERT INTO shipments VALUES ('s','c','KDOOR-0001','Sea Freight','Guangzhou',1,1,'In Transit',NULL,NULL,10000,0,'Partial','then','then',NULL)");
  sql.exec("INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,created_at,updated_at) VALUES ('i','INV-1','c','s',10000,0,10000,'Partial','then','then')");
  sql.exec("INSERT INTO payments VALUES ('p','i','c',2500,'Cash','R','2026-01-01',NULL,'then')");
  sql.exec(readFileSync("migrations/admin/0003_invoices_payments.sql", "utf8"));
  assert.equal(sql.prepare("SELECT other_charge FROM invoices WHERE id='i'").get()!.other_charge, 0);
  assert.equal(sql.prepare("SELECT amount FROM payments WHERE id='p'").get()!.amount, 2500);
  sql.exec("PRAGMA optimize");
  const plan = sql.prepare("EXPLAIN QUERY PLAN SELECT * FROM invoices ORDER BY updated_at DESC,id LIMIT 25").all().map((r) => String(r.detail)).join(" ");
  assert.match(plan, /idx_invoices_updated/);
  sql.close();
});

const expenseInput = { expense_date: "2026-09-08", category: "Office / Rent", description: "Supplies <script>", amount: "123.45" };
test("expenses page and add form load; valid expense saves integer centavos and escapes list", async () => {
  const { db, sql } = database();
  const url = new URL("https://admin.test/admin/finance/expenses");
  const empty = await expensesPage(db, url, "Admin", "token");
  assert.equal(empty.status, 200);
  assert.match(await empty.text(), /No expenses found/);
  const form = await expensesPage(db, new URL(url + "?new=1"), "Admin", "token");
  assert.match(await form.text(), /name="csrf" value="token"/);
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  const row = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(row.amount, 12345);
  assert.equal(row.payee, null);
  assert.equal(row.reference_number, null);
  assert.equal(row.notes, null);
  assert.equal(row.payment_method, null);
  assert.equal(row.tracking_number, null);
  const html = await (await expensesPage(db, url, "Admin", "token")).text();
  assert.match(html, /123.45/);
  assert.match(html, /Supplies &lt;script&gt;/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n, 0);
});
for (const amount of ["0", "-1", "1.001"]) {
  test(`expense amount ${amount} rejected`, () => {
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, amount })));
  });
}
test("expense required fields and overposting rejected", () => {
  for (const field of ["expense_date", "category", "description", "amount"]) {
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, [field]: "" })));
  }
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, id: "overwrite" })));
  const repeated = new URLSearchParams(expenseInput);
  repeated.append("amount", "1");
  assert.throws(() => parseExpenseForm(repeated));
});

test("expense migration preserves existing records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.prepare("INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("existing", "Office", "Existing expense", 150, "2026-09-01", "REF", "Notes", "2026-09-01");
  sql.exec(readFileSync("migrations/admin/0005_expenses.sql", "utf8"));
  const row = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(row.amount, 150);
  assert.equal(row.reference_number, "REF");
  assert.equal(row.updated_at, row.created_at);
  assert.equal(row.payee, null);
  sql.close();
});


test("expense form has exact controlled dropdowns and no tracking field", async () => {
  const { db } = database();
  const response = await expensesPage(db, new URL("https://admin.test/admin/finance/expenses?new=1"), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /tracking_number|Tracking number/i);
  const categories = ["Freight / Ni Hao Cost", "Local Delivery / Trucking", "Marketing / Advertising",
    "Salaries / Wages", "Management / Administrative", "Office / Rent", "Website / Technology",
    "Permits / Government Fees", "Transportation / Fuel / Parking", "Supplies / Packaging",
    "Professional Fees", "Utilities", "Bank / Payment Fees", "Repairs / Maintenance",
    "Meals / Representation", "Taxes", "Miscellaneous"];
  const categorySelect = html.match(/<select name="category" required>([\s\S]*?)<\/select>/)![1];
  assert.deepEqual([...categorySelect.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]), categories.map((c) => [c, c]));
  const methods = ["Cash", "Bank Transfer", "GCash", "Credit Card", "Debit Card", "Check", "Other"];
  const paymentSelect = html.match(/<select name="payment_method">([\s\S]*?)<\/select>/)![1];
  assert.deepEqual([...paymentSelect.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]), methods.map((m) => [m, m]));
  for (const field of ["expense_date", "description", "amount"])
    assert.match(html, new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*required`));
  for (const field of ["payee", "reference_number", "notes"])
    assert.doesNotMatch(html.match(new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*>`))![0], /required/);
  for (const category of categories)
    assert.equal(parseExpenseForm(new URLSearchParams({ ...expenseInput, category })).category, category);
  for (const payment_method of methods)
    assert.equal(parseExpenseForm(new URLSearchParams({ ...expenseInput, payment_method })).payment_method, payment_method);
  for (const category of ["Office", "Arbitrary", "office / rent"])
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, category })));
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, payment_method: "Arbitrary" })));
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, tracking_number: "KDSEA000001" })));
});

test("historical expense categories display safely and stored tracking remains untouched", async () => {
  const { db, sql } = database();
  sql.prepare(`INSERT INTO expenses (id, category, description, amount, expense_date, created_at, updated_at, tracking_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("historical", "Old category <script>", "Old expense", 150, "2026-09-01", "then", "then", "HISTORICAL-TRACKING");
  const before = sql.prepare("SELECT * FROM expenses WHERE id='historical'").get();
  const schemaBefore = sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  const response = await expensesPage(db, new URL("https://admin.test/admin/finance/expenses"), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Old category &lt;script&gt;/);
  assert.doesNotMatch(html, /tracking_number|Tracking number|HISTORICAL-TRACKING/i);
  assert.deepEqual(sql.prepare("SELECT * FROM expenses WHERE id='historical'").get(), before);
  assert.deepEqual(sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(), schemaBefore);
});


test("expense edit preloads values, validates input and preserves immutable fields", async () => {
  const { db, sql } = database();
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, payee: "Old Payee", notes: "Old notes", payment_method: "GCash", reference_number: "REF" })));
  const original = sql.prepare("SELECT * FROM expenses").get()!;
  sql.prepare("UPDATE expenses SET tracking_number='KEEP' WHERE id=?").run(original.id as string);
  const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?edit=${original.id}`), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Edit Expense/);
  assert.match(html, /value="Office \/ Rent" selected/);
  assert.match(html, /value="GCash" selected/);
  for (const value of ["123.45", "Old Payee", "Old notes", "REF"]) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /tracking_number|Tracking number|created_at/);
  const edit = { ...expenseInput, action: "edit", id: String(original.id), revision: String(original.updated_at), amount: "0.30", description: "Changed" };
  for (const amount of ["0", "-1", "1.001"])
    await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, amount })));
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, category: "Old category" })));
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, created_at: "rewrite" })));
  assert.equal(await mutateExpense(db, new URLSearchParams(edit)), "updated");
  const saved = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(saved.id, original.id);
  assert.equal(saved.created_at, original.created_at);
  assert.equal(saved.tracking_number, "KEEP");
  assert.notEqual(saved.updated_at, original.updated_at);
  assert.equal(saved.amount, 30);
  assert.equal(saved.description, "Changed");
  await assert.rejects(mutateExpense(db, new URLSearchParams(edit)), /changed or no longer exists/);
});

test("expense deletion requires confirmation, preserves other rows and rejects stale confirmation", async () => {
  const { db, sql } = database();
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, description: "Keep this expense" })));
  const original = sql.prepare("SELECT * FROM expenses WHERE description=?").get(expenseInput.description)!;
  const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?delete=${original.id}`), "Admin", "token");
  const html = await response.text();
  assert.match(html, /Confirm Delete/);
  assert.match(html, /method="post"/);
  assert.match(html, /name="confirm" value="yes"/);
  assert.match(html, /2026-09-08/);
  assert.match(html, /Supplies &lt;script&gt;/);
  assert.match(html, /123.45/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n, 2);
  const deletion = { action: "delete", id: String(original.id), revision: String(original.updated_at) };
  await assert.rejects(mutateExpense(db, new URLSearchParams(deletion)), /Confirm/);
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...deletion, confirm: "yes", revision: "stale" })), /changed or no longer exists/);
  assert.equal(await mutateExpense(db, new URLSearchParams({ ...deletion, confirm: "yes" })), "deleted");
  const remaining = sql.prepare("SELECT * FROM expenses").all();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].description, "Keep this expense");
});

test("expense filters and search combine with exact integer totals and clear restores all rows", async () => {
  const { db } = database();
  const seed = [
    { expense_date: "2026-09-01", category: "Website / Technology", payment_method: "GCash", payee: "Alpha", description: "First item", amount: "0.10", reference_number: "REF-A", notes: "Subscription" },
    { expense_date: "2026-09-08", category: "Website / Technology", payment_method: "GCash", payee: "Beta", description: "Second item", amount: "0.20", reference_number: "REF-B", notes: "Hosting" },
    { expense_date: "2026-09-10", category: "Office / Rent", payment_method: "Cash", payee: "Gamma", description: "Third item", amount: "100.01", reference_number: "REF-C", notes: "Rent" },
  ];
  for (const row of seed) await saveExpense(db, parseExpenseForm(new URLSearchParams(row)));
  const cases: [string, number[], string][] = [
    ["", [0, 1, 2], "100.31"], ["from=2026-09-08", [1, 2], "100.21"],
    ["to=2026-09-08", [0, 1], "0.30"], ["from=2026-09-02&to=2026-09-09", [1], "0.20"],
    ["category=Website+%2F+Technology", [0, 1], "0.30"], ["payment_method=Cash", [2], "100.01"],
    ["q=ALPHA", [0], "0.10"], ["q=SECOND", [1], "0.20"], ["q=ref-c", [2], "100.01"],
    ["q=HOSTING", [1], "0.20"],
    ["from=2026-09-02&to=2026-09-09&category=Website+%2F+Technology&payment_method=GCash&q=hosting", [1], "0.20"],
    ["q=%27+OR+1%3D1--", [], "0.00"],
  ];
  for (const [query, expected, total] of cases) {
    const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?${query}`), "Admin", "token");
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const [i, row] of seed.entries()) assert.equal(html.includes(`<td>${row.description}</td>`), expected.includes(i), query);
    assert.ok(html.includes(`<strong>₱${total}</strong>`), query + " total");
    assert.match(html, /href="\/admin\/finance\/expenses">Clear Filters/);
  }
  for (const query of ["from=2026-02-30", "from=2026-09-10&to=2026-09-01", "category=arbitrary", "payment_method=arbitrary"])
    await assert.rejects(expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?${query}`), "Admin", "token"));
});

import "./finance.test";
import "./finance-phase4.test";
import "../messenger.test";

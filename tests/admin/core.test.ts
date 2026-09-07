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
} from "../../lib/admin/validation";
import { marginSummarySql, finance, activity } from "../../lib/admin/reports";
import { saveRecord } from "../../lib/admin/data";
import { createInvoice, issueInvoice, recordPayment } from "../../lib/admin/billing";
import {
  validateJwt,
  csrfToken,
  checkCsrf,
  canonicalOrigin,
  authenticate,
  type AdminEnv,
} from "../../lib/admin/security";
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0003_invoices_payments.sql", "utf8"));
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
const shipment = (id: string) =>
  shipmentSchema.parse({
    customer_id: id,
    tracking_number: "KDOOR-0001",
    service_type: "Sea Freight",
    china_warehouse: "Guangzhou",
    cbm: "1.250",
    weight_kg: "425",
    status: "Received at Warehouse",
    estimated_arrival: "2026-10-01",
    actual_arrival: "",
    shipping_charge: "6500.25",
    nihao_cost: "",
    delivery_charge: "0",
    payment_status: "Unpaid",
  });
test("required fields, dates, enum, numeric precision and overposting are validated", () => {
  assert.throws(() => customerSchema.parse({ ...customer, full_name: " " }));
  assert.throws(() =>
    parseForm("customers", new URLSearchParams("customer_code=X&role=owner")),
  );
  const form = new URLSearchParams("customer_code=A&customer_code=B");
  assert.throws(() => parseForm("customers", form));
  assert.equal(shipment(randomUUID()).shipping_charge, 650025);
  for (const bad of ["-1", "Infinity", "NaN", "1e3", "2.0001", ""])
    assert.throws(() => shipmentSchema.shape.cbm.parse(bad));
  for (const bad of ["-1", "1.001", "", "NaN"])
    assert.throws(() => shipmentSchema.shape.shipping_charge.parse(bad));
  assert.throws(() =>
    shipmentSchema.shape.estimated_arrival.parse("2026-02-30"),
  );
  assert.throws(() => shipmentSchema.shape.status.parse("bad"));
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
  const request = (email: string) => {
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
    return new Request(env.ADMIN_ORIGIN + "/admin", {
      headers: { "cf-access-jwt-assertion": token },
    });
  };
  try {
    assert.equal(
      (await authenticate(request("admin@example.test"), env)).role,
      "admin",
    );
    await assert.rejects(
      authenticate(request("customer@example.test"), env),
      /not authorized/,
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
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-09-12", notes: "" }, user), /remaining balance|changed/);
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

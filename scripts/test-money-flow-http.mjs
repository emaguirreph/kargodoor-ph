// End-to-end money flow on an isolated local D1 emulator; never reads or writes remote databases.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = process.cwd(),
  dir = resolve(".admin-local", `money-flow-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = resolve(dir, "wrangler.json"),
  state = resolve(dir, "state");
const origin = "http://localhost:8788";
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
source.main = resolve(".open-next/worker.js");
source.assets.directory = resolve(".open-next/assets");
source.d1_databases = source.d1_databases.map((d) => ({
  ...d,
  database_id:
    d.binding === "ADMIN_DB"
      ? "00000000-0000-0000-0000-000000000001"
      : d.database_id,
  ...(d.binding === "ADMIN_DB"
    ? { migrations_dir: resolve("migrations/admin") }
    : {}),
}));
writeFileSync(config, JSON.stringify(source));
const password = randomBytes(24).toString("base64url"),
  salt = randomBytes(16).toString("hex");
writeFileSync(
  resolve(dir, ".dev.vars"),
  `ADMIN_ORIGIN="${origin}"\nADMIN_LOCAL_DEV="true"\nLOCAL_ADMIN_EMAIL="local-admin@example.test"\nLOCAL_ADMIN_HASH="${salt}:${scryptSync(password, salt, 64).toString("hex")}"\nADMIN_CSRF_SECRET="${randomBytes(32).toString("hex")}"\n`,
  { mode: 0o600 },
);
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  XDG_CONFIG_HOME: resolve(dir, "config"),
  WRANGLER_LOG_PATH: resolve(dir, "logs"),
  WRANGLER_REGISTRY_PATH: resolve(dir, "registry"),
};
const cli = (args) => {
  const r = spawnSync(
    "npx",
    ["wrangler", ...args, "--config", config, "--persist-to", state],
    { encoding: "utf8", env, cwd: root },
  );
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return r.stdout;
};
cli(["d1", "migrations", "apply", "ADMIN_DB", "--local"]);
const uid = randomUUID();
cli([
  "d1",
  "execute",
  "ADMIN_DB",
  "--local",
  "--command",
    `INSERT INTO admin_users VALUES ('${uid}','Local admin','local-admin@example.test','owner','2026-01-01','2026-01-01')`,
]);
let logs = "";
const server = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8788",
    "--config",
    config,
    "--persist-to",
    state,
  ],
  { env, cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true },
);
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const authorization =
  "Basic " +
  Buffer.from(`local-admin@example.test:${password}`).toString("base64");
const get = (path, auth = true) =>
  fetch(origin + path, {
    headers: auth === "invalid"
      ? { authorization: "Basic invalid" }
      : auth ? { authorization } : {},
    redirect: "manual",
  });
const token = (html) => {
  const m = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(m, "CSRF token present");
  return m[1];
};
const revision = (html) => {
  const m = html.match(/name="revision" value="([^"]*)"/);
  assert.ok(m);
  return m[1];
};
const post = (path, values, extra = {}) =>
  fetch(origin + path, {
    method: "POST",
    headers: {
      authorization,
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extra,
    },
    body: new URLSearchParams(values),
    redirect: "manual",
  });
try {
  for (let n = 0; n < 80; n++) {
    try {
      await get("/admin/dashboard", false);
      break;
    } catch {
      if (n === 79) throw new Error(logs);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const sqlRows = (command) => JSON.parse(cli(["d1", "execute", "ADMIN_DB", "--local", "--json", "--command", command]))[0].results;
  const money = (html, label) => {
    const at = html.indexOf(label);
    assert.ok(at >= 0, `${label} shown`);
    return html.slice(at, at + 400).match(/₱[\d,]+\.\d\d/)[0];
  };
  const steps = [];
  const step = (name) => { steps.push(name); console.log("✓ " + name); };

  // 1. Opening cash.
  let html = await (await get("/admin/finance/cash?new=1")).text();
  let response = await post("/admin/finance/cash", { csrf: token(html), entry_type: "Opening Cash Balance", entry_date: "2026-11-01", customer_id: "", related_entry_id: "", amount: "25000", reference_number: "", notes: "Starting cash" });
  assert.equal(response.status, 303, await response.text());
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money we have now"), "₱25,000.00");
  step("Opening cash ₱25,000 shows as Money we have now");

  // 2. Customer and shipment (KD charge ₱3,420, no Ni Hao cost yet).
  html = await (await get("/admin/customers?new=1")).text();
  response = await post("/admin/customers", { csrf: token(html), id: "", revision: "", full_name: "Flow Test Customer", company_name: "", mobile: "+639171112222", email: "", address: "", notes: "" });
  assert.equal(response.status, 303, await response.text());
  const cid = new URL(response.headers.get("location"), origin).searchParams.get("id");
  html = await (await get(`/admin/shipments?new=1&customer_id=${cid}`)).text();
  const shipment = { csrf: token(html), id: "", revision: "", customer_id: cid, service_type: "Sea Freight", china_warehouse: "Guangzhou",
    cbm: "0.36", weight_kg: "80", status: "Malabon Warehouse", actual_arrival: "", shipping_charge: "3420", nihao_cost: "", delivery_charge: "0", payment_status: "Unpaid" };
  response = await post("/admin/shipments", shipment);
  assert.equal(response.status, 303, await response.text());
  const sid = new URL(response.headers.get("location"), origin).searchParams.get("id");
  const tracking = sqlRows(`SELECT tracking_number FROM shipments WHERE id='${sid}'`)[0].tracking_number;
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money coming in"), "₱3,420.00");
  step(`Shipment ${tracking} saved; ₱3,420 shows under Money coming in (still to bill)`);

  // 3. Ni Hao SOA arrives: enter the actual cost ₱2,805.
  html = await (await get(`/admin/shipments?id=${sid}&edit=1`)).text();
  response = await post("/admin/shipments", { ...shipment, id: sid, revision: revision(html), csrf: token(html), nihao_cost: "2805" });
  assert.equal(response.status, 303, await response.text());
  let row = sqlRows(`SELECT nihao_cost, nihao_cost_source, shipping_charge FROM shipments WHERE id='${sid}'`)[0];
  assert.deepEqual(row, { nihao_cost: 280500, nihao_cost_source: "actual", shipping_charge: 342000 });
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money going out"), "₱2,805.00");
  assert.equal(money(html, "Expected profit once billed"), "₱615.00");
  step("Ni Hao SOA ₱2,805 saved as Ni Hao actual; Going out ₱2,805; expected profit ₱615");

  // 4. Invoice from the shipment page link, saved as Draft.
  response = await get(`/admin/invoices?new=1&shipment_id=${sid}`);
  html = await response.text();
  response = await post("/admin/invoices", { csrf: token(html), action: "invoice", shipment_id: sid, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" });
  assert.equal(response.status, 303, await response.text());
  const invoiceUrl = response.headers.get("location");
  const iid = new URL(invoiceUrl, origin).searchParams.get("id");
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  response = await get(`/admin/invoices?new=1&shipment_id=${sid}`);
  assert.ok([302, 303, 307].includes(response.status) && response.headers.get("location").includes(iid), "shipment invoice link opens the existing invoice");
  step("Draft invoice created; shipment's invoice link opens the same invoice");

  // 5. Client pays in full on the Draft (auto-issues it).
  html = await (await get(invoiceUrl)).text();
  assert.ok(html.includes("3,420.00") && html.includes("Record payment"));
  response = await post("/admin/invoices", { csrf: token(html), action: "payment", invoice_id: iid, amount: "3420", payment_method: "GCash", reference_number: "GC-123", payment_date: "2026-11-02", notes: "" });
  assert.equal(response.status, 303, await response.text());
  row = sqlRows(`SELECT i.status, i.issued_at, s.payment_status FROM invoices i JOIN shipments s ON s.id=i.shipment_id WHERE i.id='${iid}'`)[0];
  assert.deepEqual(row, { status: "Paid", issued_at: "2026-11-02", payment_status: "Paid" });
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money we have now"), "₱28,420.00");
  assert.equal(money(html, "Money coming in"), "₱0.00");
  assert.equal(money(html, "Money going out"), "₱2,805.00");
  step("₱3,420 GCash payment: invoice auto-issued and Paid, shipment Paid, cash ₱28,420, coming in ₱0");

  // 6. Pay Ni Hao from the shipment page.
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.ok(html.includes("Mark Ni Hao paid"));
  const niHao = { csrf: token(html), action: "nihao_paid", id: sid, expense_date: "2026-11-02", amount: "2805", payment_method: "Bank Transfer", reference_number: "UB-777", notes: "SOA 9999" };
  response = await post("/admin/shipments", niHao);
  assert.equal(response.status, 303, await response.text());
  assert.equal((await post("/admin/shipments", niHao)).status, 409, "second Ni Hao payment refused");
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.ok(html.includes("<strong>Paid</strong> · ₱2,805.00"));
  const expenses = sqlRows(`SELECT category, amount, tracking_number FROM expenses`);
  assert.deepEqual(expenses, [{ category: "Freight / Ni Hao Cost", amount: 280500, tracking_number: tracking }]);
  step("Mark Ni Hao paid: one Freight / Ni Hao Cost expense ₱2,805 with the tracking no.; double payment refused");

  // 7. Final balance.
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money we have now"), "₱25,615.00");
  assert.equal(money(html, "Money going out"), "₱0.00");
  assert.equal(money(html, "Overall profit after expenses"), "₱615.00");
  step("Balance: cash ₱25,615 (25,000 + 3,420 − 2,805), going out ₱0, overall profit ₱615");

  // 8. Statement PDF and ledger CSV.
  response = await get(`/admin/shipments?id=${sid}&statement=pdf`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/pdf/);
  const pdf = Buffer.from(await response.arrayBuffer()).toString("latin1");
  for (const text of [tracking, "Flow Test Customer", "3,420.00", "2,805.00", "615.00"]) assert.ok(pdf.includes(text), `statement has ${text}`);
  response = await get("/admin/finance/export?ledger=shipments");
  assert.equal(response.status, 200);
  const csv = await response.text();
  const line = csv.split(/\r?\n/).find((l) => l.includes(tracking));
  assert.ok(line, "ledger row present");
  for (const text of ["Flow Test Customer", "3420.00", "2805.00", "615.00"]) assert.ok(line.includes(text), `ledger row has ${text}: ${line}`);
  step("Shipment Statement PDF and Shipments Ledger CSV both show ₱3,420 billed, ₱2,805 Ni Hao, ₱615 profit");

  // 9. Audit trail.
  const actions = sqlRows(`SELECT action FROM activity_log ORDER BY created_at`).map((r) => r.action);
  for (const a of ["create_invoice", "record_payment", "nihao_paid"]) assert.ok(actions.some((x) => x.includes(a.replace("_", " ")) || x === a), `activity log has ${a}: ${actions}`);
  step("Activity Log records the invoice, payment and Ni Hao payment");

  console.log(`\nMoney flow end-to-end passed: ${steps.length} steps. All operations were local.`);
} catch (error) {
  console.error(error);
  console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

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
let get = (path, auth = true) =>
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
let post = (path, values, extra = {}) =>
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
  // The local dev server can drop the first connection after a CLI database
  // read; retry that request once (only when no response came back).
  const retry = async (fn) => { try { return await fn(); } catch (e) { if (!String(e?.cause ?? e).includes("other side closed")) throw e; await new Promise((r) => setTimeout(r, 1000)); return fn(); } };
  const get2 = get, post2 = post;
  get = (...a) => retry(() => get2(...a));
  post = (...a) => retry(() => post2(...a));
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
  let drafts = sqlRows(`SELECT id, status, total FROM invoices WHERE shipment_id='${sid}'`);
  assert.deepEqual(drafts.map((d) => [d.status, d.total]), [["Draft", 342000]], "Draft invoice made automatically");
  step(`Shipment ${tracking} saved at Malabon Warehouse; Draft invoice ₱3,420 made automatically; ₱3,420 under Money coming in`);

  // 3. Ni Hao SOA arrives: enter the actual cost ₱2,805.
  html = await (await get(`/admin/shipments?id=${sid}&edit=1`)).text();
  assert.ok(html.includes('name="payment_status" value="Unpaid"') && html.includes("Set automatically from the invoice"), "payment status is read-only");
  response = await post("/admin/shipments", { ...shipment, id: sid, revision: revision(html), csrf: token(html), nihao_cost: "2805", payment_status: "Paid" });
  assert.equal(response.status, 303, await response.text());
  let row = sqlRows(`SELECT nihao_cost, nihao_cost_source, shipping_charge FROM shipments WHERE id='${sid}'`)[0];
  assert.deepEqual(row, { nihao_cost: 280500, nihao_cost_source: "actual", shipping_charge: 342000 });
  assert.equal(sqlRows(`SELECT payment_status FROM shipments WHERE id='${sid}'`)[0].payment_status, "Unpaid", "typing Paid on the shipment form is ignored");
  assert.equal(sqlRows(`SELECT COUNT(*) AS n FROM invoices WHERE shipment_id='${sid}'`)[0].n, 1, "saving again does not make a second invoice");
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money going out"), "₱2,805.00");
  assert.equal(money(html, "Expected profit once billed"), "₱615.00");
  step("Ni Hao SOA ₱2,805 saved as Ni Hao actual; Going out ₱2,805; expected profit ₱615");

  // 4. The shipment page's invoice link opens the automatic Draft.
  const iid = drafts[0].id;
  const invoiceUrl = `/admin/invoices?id=${iid}`;
  response = await get(`/admin/invoices?new=1&shipment_id=${sid}`);
  assert.ok([302, 303, 307].includes(response.status) && response.headers.get("location").includes(iid), "shipment invoice link opens the existing invoice");
  step("Shipment's invoice link opens the automatic Draft; typing Paid on the shipment form is ignored");

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
  assert.ok(html.includes('name="paid_from"') && html.includes('name="transfer_fee"'));
  const niHao = { csrf: token(html), action: "nihao_paid", id: sid, expense_date: "2026-11-02", amount: "2805", paid_from: "UnionBank", transfer_fee: "10", reference_number: "UB-777", notes: "SOA 9999" };
  response = await post("/admin/shipments", niHao);
  assert.equal(response.status, 303, await response.text());
  assert.equal((await post("/admin/shipments", niHao)).status, 409, "second Ni Hao payment refused");
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.ok(html.includes("<strong>Paid</strong> · ₱2,805.00") && html.includes("+ ₱10.00 transfer fee"));
  const expenses = sqlRows(`SELECT category, payee, amount, payment_method, tracking_number FROM expenses ORDER BY amount DESC`);
  assert.deepEqual(expenses, [
    { category: "Freight / Ni Hao Cost", payee: "Ni Hao", amount: 280500, payment_method: "Bank Transfer", tracking_number: tracking },
    { category: "Bank / Payment Fees", payee: "UnionBank", amount: 1000, payment_method: "Bank Transfer", tracking_number: tracking },
  ]);
  step("Mark Ni Hao paid from UnionBank with ₱10 fee: ₱2,805 Ni Hao expense + ₱10 Bank / Payment Fees expense; double payment refused");

  // 7. Final balance.
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money we have now"), "₱25,605.00");
  assert.equal(money(html, "Money going out"), "₱0.00");
  assert.equal(money(html, "Overall profit after expenses"), "₱605.00");
  assert.ok(html.includes("Ni Hao is paid for every active shipment."));
  step("Balance: cash ₱25,605 (25,000 + 3,420 − 2,805 − 10 fee), going out ₱0, overall profit ₱605");

  // 8. Statement PDF and ledger CSV.
  response = await get(`/admin/shipments?id=${sid}&statement=pdf`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/pdf/);
  const pdf = Buffer.from(await response.arrayBuffer()).toString("latin1");
  for (const text of [tracking, "Flow Test Customer", "3,420.00", "2,805.00", "615.00", "Bank transfer fees", "605.00"]) assert.ok(pdf.includes(text), `statement has ${text}`);
  response = await get("/admin/finance/export?ledger=shipments");
  assert.equal(response.status, 200);
  const csv = await response.text();
  const line = csv.split(/\r?\n/).find((l) => l.includes(tracking));
  assert.ok(line, "ledger row present");
  for (const text of ["Flow Test Customer", "3420.00", "2805.00", "615.00", ",10.00,605.00"]) assert.ok(line.includes(text), `ledger row has ${text}: ${line}`);
  step("Statement PDF and Ledger CSV: ₱3,420 billed, ₱2,805 Ni Hao, ₱615 profit, ₱10 fee, ₱605 after fees");

  // 8b. The 4 Billing & Finance pages.
  html = await (await get("/admin/finance")).text();
  for (const t of ["Money Today", "Invoices &amp; Payments", "Reports &amp; BIR", "Ni Hao to Pay"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes("Finance Overview") && !html.includes("Cash Flow &amp; Customer Credits"));
  html = await (await get("/admin/finance/reports?preset=month")).text();
  for (const t of ["Downloads for your CPA", "Finance Overview", "Shipping Performance", "Monthly Summary"]) assert.ok(html.includes(t), t);
  html = await (await get("/admin/invoices")).text();
  assert.ok(html.includes("2026-11-02 · GCash") && !html.includes("Payments Received"), "payment date and method shown on the invoice row");
  html = await (await get("/admin/finance/expenses")).text();
  assert.ok(html.includes("Money In (not sales)") && html.includes("Starting cash"));
  step("4 pages: Money Today, Invoices & Payments (payment date + method on each row), Expenses (with money in), Reports & BIR (with downloads)");

  // 8c. A shipment not yet in the Philippines, paid from the shipment page.
  html = await (await get(`/admin/shipments?new=1&customer_id=${cid}`)).text();
  response = await post("/admin/shipments", { ...shipment, csrf: token(html), status: "China Warehouse", shipping_charge: "600", cbm: "0.05", weight_kg: "5" });
  assert.equal(response.status, 303, await response.text());
  const sid2 = new URL(response.headers.get("location"), origin).searchParams.get("id");
  assert.equal(sqlRows(`SELECT COUNT(*) AS n FROM invoices WHERE shipment_id='${sid2}'`)[0].n, 0, "not ready to bill yet, so no Draft");
  html = await (await get(`/admin/shipments?id=${sid2}`)).text();
  assert.ok(html.includes("Customer payment") && html.includes('value="600.00"'));
  response = await post("/admin/shipments", { csrf: token(html), action: "customer_paid", id: sid2, amount: "600", payment_method: "Cash", payment_date: "2026-11-02", reference_number: "", notes: "" });
  assert.equal(response.status, 303, await response.text());
  row = sqlRows(`SELECT i.status, i.issued_at, s.payment_status FROM invoices i JOIN shipments s ON s.id=i.shipment_id WHERE s.id='${sid2}'`)[0];
  assert.deepEqual(row, { status: "Paid", issued_at: "2026-11-02", payment_status: "Paid" });
  html = await (await get(response.headers.get("location"))).text();
  assert.ok(html.includes("<strong>Paid</strong> · ₱600.00"));
  html = await (await get("/admin/finance")).text();
  assert.equal(money(html, "Money we have now"), "₱26,205.00");
  step("Record payment on the shipment page (no invoice yet): invoice made, issued and Paid, shipment Paid, cash ₱26,205");

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

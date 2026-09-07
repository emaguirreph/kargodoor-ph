// Uses an isolated local D1 emulator; never reads or writes remote databases.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = process.cwd(),
  dir = resolve(".admin-local", `http-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = resolve(dir, "wrangler.json"),
  state = resolve(dir, "state");
const origin = "http://localhost:8787";
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
// A separate local tracking database proves admin writes do not touch tracking.
cli(["d1", "execute", "TRACKING_DB", "--local", "--command", `
 CREATE TABLE shipments (cargo_code TEXT PRIMARY KEY, freight_type TEXT, origin_warehouse TEXT, warehouse_received_date TEXT, departure_date TEXT, current_status TEXT, eta TEXT, remarks TEXT, last_updated TEXT);
 INSERT INTO shipments VALUES ('KDOOR-0001','Sea Freight','Guangzhou',NULL,NULL,'In Transit',NULL,'Tracking sentinel','2026-09-01');
`]);
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
    "8787",
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
    headers: auth ? { authorization } : {},
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
  for (const path of [
    "/admin/dashboard",
    "/admin/customers",
    "/admin/shipments",
    "/admin/unknown",
    "/admin/activity",
    "/admin/finance",
    "/admin/invoices",
  ])
    assert.equal((await get(path, false)).status, 401, path + " protected");
  const trackingBefore = await (await get("/api/track?code=KDOOR-0001", false)).json();
  assert.equal(trackingBefore.remarks, "Tracking sentinel");
  for (const path of ["/", "/how-it-works", "/services", "/rates-calculator", "/faq", "/contact-us", "/track"])
    assert.equal((await get(path, false)).status, 200, path + " public route works");
  const legacy = await (await get("/admin", false)).text();
  assert.ok(legacy.includes("Find an existing shipment") && legacy.includes("KDOOR-0001") && legacy.includes("Hong Kong"));
  let response = await get("/admin/dashboard");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Payments Received/);
  response = await get("/admin/customers?new=1");
  assert.equal(response.status, 200);
  let html = await response.text();
  const customer = {
    csrf: token(html),
    id: "",
    revision: "",
    customer_code: "HTTP-001",
    full_name: "HTTP Test Customer",
    company_name: "",
    mobile: "+639171234567",
    email: "",
    address: "",
    notes: "<script>alert(1)</script>",
  };
  assert.equal(
    (await post("/admin/customers", { ...customer, full_name: "" })).status,
    400,
  );
  assert.equal(
    (await post("/admin/customers", { ...customer, csrf: "forged" })).status,
    403,
  );
  assert.equal(
    (await post("/admin/customers", customer, { Origin: "https://evil.test" }))
      .status,
    403,
  );
  assert.equal(
    (await post("/admin/customers", customer, { Origin: "null" })).status,
    403,
  );
  response = await post("/admin/customers", customer);
  assert.equal(response.status, 303, await response.text());
  const customerUrl = response.headers.get("location"),
    id = new URL(customerUrl, origin).searchParams.get("id");
  html = await (await get(customerUrl)).text();
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert"));
  assert.equal((await post("/admin/customers", customer)).status, 409);
  html = await (await get(`/admin/customers?id=${id}&edit=1`)).text();
  const edit = {
    ...customer,
    id,
    revision: revision(html),
    csrf: token(html),
    full_name: "Updated customer",
  };
  assert.equal((await post("/admin/customers", edit)).status, 303);
  assert.equal(
    (await post("/admin/customers", { ...edit, full_name: "Stale overwrite" }))
      .status,
    409,
  );
  html = await (await get(`/admin/shipments?new=1&customer_id=${id}`)).text();
  assert.ok(html.includes("Updated customer"));
  const shipment = {
    csrf: token(html),
    id: "",
    revision: "",
    customer_id: id,
    tracking_number: "HTTP-SHIP-001",
    service_type: "Sea Freight",
    china_warehouse: "Guangzhou",
    cbm: "1.25",
    weight_kg: "425",
    status: "Received at Warehouse",
    estimated_arrival: "2026-10-01",
    actual_arrival: "",
    shipping_charge: "6500.25",
    nihao_cost: "5000.10",
    delivery_charge: "0",
    payment_status: "Unpaid",
  };
  assert.equal((await post("/admin/shipments", {...shipment, china_warehouse: "Invalid"})).status, 400);
  assert.equal((await post("/admin/shipments", {...shipment, nihao_cost: "-1"})).status, 400);
  response = await post("/admin/shipments", shipment);
  assert.equal(response.status, 303, await response.text());
  const sid = new URL(
    response.headers.get("location"),
    origin,
  ).searchParams.get("id");
  html = await (await get(`/admin/shipments?id=${sid}&edit=1`)).text();
  assert.ok(html.includes("6500.25"));
  const shipmentEdit = {
    ...shipment,
    id: sid,
    revision: revision(html),
    csrf: token(html),
    status: "In Transit",
    cbm: "2",
    weight_kg: "500",
    shipping_charge: "7000",
    nihao_cost: "5100.10",
  };
  assert.equal((await post("/admin/shipments", shipmentEdit)).status, 303);
  assert.ok(
    (
      await (await get("/admin/shipments?q=HTTP-SHIP&status=In+Transit")).text()
    ).includes("HTTP-SHIP-001"),
  );
  assert.ok(
    !(
      await (await get("/admin/shipments?q=HTTP-SHIP&status=Delivered")).text()
    ).includes("View <span"),
  );
  assert.ok(
    (await (await get("/admin/customers?q=Updated")).text()).includes(
      "HTTP-001",
    ),
  );
  html = await (await get(`/admin/invoices?new=1&shipment_id=${sid}`)).text();
  assert.ok(html.includes("Auto-filled from connected records"));
  assert.ok(html.includes("Updated customer") && html.includes("7,000.00"));
  const invoice = {
    csrf: token(html),
    action: "invoice",
    shipment_id: sid,
    delivery_charge: "250",
    other_charge: "75.50",
    status: "Unpaid",
    issued_at: "2026-09-07",
    due_at: "2026-09-30",
  };
  const missingShipment = await post("/admin/invoices", {...invoice, shipment_id: id});
  assert.equal(missingShipment.status, 404, await missingShipment.text());
  assert.equal((await post("/admin/invoices", {...invoice, issued_at: ""})).status, 400);
  response = await post("/admin/invoices", invoice);
  assert.equal(response.status, 303, await response.text());
  const invoiceUrl = response.headers.get("location"),
    invoiceId = new URL(invoiceUrl, origin).searchParams.get("id");
  html = await (await get(invoiceUrl)).text();
  assert.ok(html.includes("7,325.50"));
  assert.ok(html.includes("Updated customer") && html.includes("HTTP-SHIP-001"));
  assert.ok(html.includes("Record payment"));
  assert.equal((await post("/admin/invoices", invoice)).status, 409);
  const firstPayment = {
    csrf: token(html),
    action: "payment",
    invoice_id: invoiceId,
    amount: "2000",
    payment_method: "Bank Transfer",
    reference_number: "BANK-001",
    payment_date: "2026-09-08",
    notes: "Deposit",
  };
  assert.equal((await post("/admin/invoices", {...firstPayment, csrf: "forged"})).status, 403);
  assert.equal((await post("/admin/invoices", {...firstPayment, amount: "8000"})).status, 409);
  response = await post("/admin/invoices", firstPayment);
  assert.equal(response.status, 303, await response.text());
  html = await (await get(response.headers.get("location"))).text();
  assert.ok(html.includes("Partial") && html.includes("2,000.00") && html.includes("5,325.50"));
  assert.ok(html.includes("BANK-001"));
  const finalPayment = {
    ...firstPayment,
    csrf: token(html),
    amount: "5325.50",
    payment_method: "GCash",
    reference_number: "GCASH-002",
    payment_date: "2026-09-09",
    notes: "Balance",
  };
  response = await post("/admin/invoices", finalPayment);
  assert.equal(response.status, 303, await response.text());
  html = await (await get(response.headers.get("location"))).text();
  assert.ok(html.includes("Paid") && html.includes("7,325.50") && html.includes("₱0.00"));
  assert.ok(!html.includes("Record payment"));
  html = await (await get("/admin/invoices?q=HTTP-SHIP&status=Paid")).text();
  assert.ok(html.includes("HTTP-SHIP-001") && html.includes("Updated customer"));
  html = await (await get(`/admin/activity?entity_type=invoices&entity_id=${invoiceId}`)).text();
  assert.ok(html.includes("create invoice") && html.includes("change invoice status"));
  html = await (await get(`/admin/activity?entity_type=payments`)).text();
  assert.ok(html.includes("record payment"));
  html = await (await get(`/admin/shipments?id=${sid}`)).text();
  assert.ok(html.includes("Paid"));
  html = await (await get("/admin/finance")).text();
  assert.ok(html.includes("1,899.90"), "margin uses saved charges and costs");
  assert.ok(html.includes("HTTP-SHIP-001"));
  html = await (await get(`/admin/activity?entity_type=shipments&entity_id=${sid}`)).text();
  assert.ok(html.includes("change nihao cost"));
  assert.ok(html.includes("5,000.10") && html.includes("5,100.10"));
  assert.ok(!(await (await get("/admin/finance?missing=1")).text()).includes("HTTP-SHIP-001"));
  assert.equal((await get("/admin/activity?page=-1")).status, 400);
  assert.equal((await get("/admin/finance?page=no")).status, 400);
  assert.equal((await post("/admin/activity", {})).status, 405);
  assert.equal((await post("/admin/finance", {})).status, 405);
  assert.equal((await get("/admin/unknown")).status, 404);
  response = await get("/admin/dashboard");
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  const count = cli([
    "d1",
    "execute",
    "ADMIN_DB",
    "--local",
    "--json",
    "--command",
    "SELECT COUNT(*) AS n FROM activity_log",
  ]);
  assert.equal(JSON.parse(count)[0].results[0].n, 14);
  const tables = cli([
    "d1",
    "execute",
    "ADMIN_DB",
    "--local",
    "--json",
    "--command",
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customers','shipments','invoices','payments','expenses','admin_users','activity_log')",
  ]);
  assert.equal(JSON.parse(tables)[0].results.length, 7);
  assert.deepEqual(await (await get("/api/track?code=KDOOR-0001", false)).json(), trackingBefore);
  console.log(
    "HTTP integration passed: public routes and legacy editor preserved; tracking sentinel unchanged; customer/shipment/invoice/payment workflows; partial and multiple payments; balances and automatic statuses; search and activity; validation; CSRF; duplicates; stale edits; 14 audit records; 7 tables. All operations were local.",
  );
} catch (error) {
  console.error(error);
  console.error(logs.slice(-5000));
  process.exitCode = 1;
} finally {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
}

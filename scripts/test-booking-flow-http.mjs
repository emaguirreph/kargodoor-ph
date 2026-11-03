// End-to-end chat booking flow on an isolated local D1 emulator; never reads or writes remote databases.
// Book in the chat → admin Bookings (count, approve) → customer + shipment → arrival bill →
// customer uploads proof → admin records payment → customer downloads the paid invoice.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd(), dir = resolve(".admin-local", `booking-flow-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = resolve(dir, "wrangler.json"), state = resolve(dir, "state");
const origin = "http://localhost:8789";
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
source.main = resolve(".open-next/worker.js");
source.assets.directory = resolve(".open-next/assets");
source.d1_databases = source.d1_databases.map((d) => ({
  ...d,
  database_id: d.binding === "ADMIN_DB" ? "00000000-0000-0000-0000-000000000001" : d.database_id,
  ...(d.binding === "ADMIN_DB" ? { migrations_dir: resolve("migrations/admin") } : {}),
}));
writeFileSync(config, JSON.stringify(source));
const password = randomBytes(24).toString("base64url"), salt = randomBytes(16).toString("hex");
writeFileSync(resolve(dir, ".dev.vars"),
  `ADMIN_ORIGIN="${origin}"\nADMIN_LOCAL_DEV="true"\nLOCAL_ADMIN_EMAIL="local-admin@example.test"\nLOCAL_ADMIN_HASH="${salt}:${scryptSync(password, salt, 64).toString("hex")}"\nADMIN_CSRF_SECRET="${randomBytes(32).toString("hex")}"\n`,
  { mode: 0o600 });
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", XDG_CONFIG_HOME: resolve(dir, "config"), WRANGLER_LOG_PATH: resolve(dir, "logs"), WRANGLER_REGISTRY_PATH: resolve(dir, "registry") };
const cli = (args) => {
  const r = spawnSync("npx", ["wrangler", ...args, "--config", config, "--persist-to", state], { encoding: "utf8", env, cwd: root });
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return r.stdout;
};
cli(["d1", "migrations", "apply", "ADMIN_DB", "--local"]);
const uid = randomUUID();
cli(["d1", "execute", "ADMIN_DB", "--local", "--command", `INSERT INTO admin_users VALUES ('${uid}','Local admin','local-admin@example.test','owner','2026-01-01','2026-01-01')`]);
let logs = "";
const server = spawn("npx", ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", "8789", "--config", config, "--persist-to", state],
  { env, cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const authorization = "Basic " + Buffer.from(`local-admin@example.test:${password}`).toString("base64");
const retry = async (fn) => { try { return await fn(); } catch (e) { if (!String(e?.cause ?? e).includes("other side closed")) throw e; await new Promise((r) => setTimeout(r, 1000)); return fn(); } };
const get = (path, auth = true) => retry(() => fetch(origin + path, { headers: auth ? { authorization } : {}, redirect: "manual" }));
const post = (path, values) => retry(() => fetch(origin + path, {
  method: "POST", redirect: "manual", body: new URLSearchParams(values),
  headers: { authorization, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
}));
const api = (path, body) => retry(() => fetch(origin + path, { method: "POST", headers: { Origin: origin, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) }));
const token = (html) => { const m = html.match(/name="csrf" value="([^"]+)"/); assert.ok(m, "CSRF token present"); return m[1]; };
const sqlRows = (command) => JSON.parse(cli(["d1", "execute", "ADMIN_DB", "--local", "--json", "--command", command]))[0].results;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const steps = [];
const step = (name) => { steps.push(name); console.log("✓ " + name); };

const booking = {
  fullName: "Juan Dela Cruz", phone: "0917 123 4567", email: "juan@example.test", service: "sea", deliveryMode: "pickup", deliveryAddress: "",
  item: "Kitchen organizers", quantity: "20 boxes", cbm: 0.5, weight: 80, itemValue: 25000, warehouse: "Guangzhou", supplier: "Supplier Li · WeChat li88", notes: "", consent: true,
};
const bookingForm = (data, extra = {}) => {
  const form = new FormData();
  form.set("data", JSON.stringify(data));
  form.append("photos", new Blob([png], { type: "image/png" }), "item.png");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
};

try {
  for (let n = 0; n < 80; n++) {
    try { await fetch(origin + "/admin/dashboard"); break; } catch { if (n === 79) throw new Error(logs); await new Promise((r) => setTimeout(r, 500)); }
  }

  // 1. Guard rails on the public endpoint.
  let res = await api("/api/bookings", bookingForm(booking, { website: "http://spam.example" }));
  assert.equal(res.status, 400, "honeypot refused");
  res = await api("/api/bookings", bookingForm({ ...booking, phone: "12345" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /valid PH mobile/);
  const noPhoto = new FormData(); noPhoto.set("data", JSON.stringify(booking));
  res = await api("/api/bookings", noPhoto);
  assert.match((await res.json()).error, /at least 1 product photo/);
  res = await retry(() => fetch(origin + "/api/bookings", { method: "POST", headers: { Origin: "https://evil.example" }, body: bookingForm(booking) }));
  assert.equal(res.status, 403, "other sites refused");
  step("Honeypot, bad mobile number, missing photo and other-site posts are refused");

  // 2. A real booking.
  res = await api("/api/bookings", bookingForm(booking));
  assert.equal(res.status, 200, await res.clone().text());
  const made = await res.json();
  assert.equal(made.ref, "KD-BOOK-0001");
  assert.ok(made.estimate > 0);
  const saved = sqlRows("SELECT id, phone, status, estimate_amount FROM bookings")[0];
  assert.equal(saved.phone, "09171234567");
  assert.equal(sqlRows("SELECT COUNT(*) AS n FROM booking_files")[0].n, 1);
  step(`Booking ${made.ref} saved (phone stored as 09171234567, 1 photo, estimate ₱${made.estimate})`);

  // 3. Chat lookup needs the last 4 digits; no cargo code before approval.
  res = await api("/api/bookings/status", { ref: made.ref, last4: "0000" });
  assert.equal(res.status, 404);
  let status = await (await api("/api/bookings/status", { ref: made.ref, last4: "4567" })).json();
  assert.equal(status.status, "New");
  assert.equal(status.shipment, null, "no cargo code before approval");
  assert.equal(status.name, "Juan");
  step("Chat lookup: wrong last 4 digits refused; New booking shows no cargo code");

  // 4. Admin menu count + Bookings page.
  assert.deepEqual(await (await get("/admin/bookings?count=1")).json(), { bookings: 1, proofs: 0 });
  let html = await (await get("/admin/bookings")).text();
  assert.ok(html.includes(made.ref) && html.includes("Juan Dela Cruz"));
  html = await (await get("/admin/dashboard")).text();
  const nav = html.slice(html.indexOf("Customers &amp; Cargo"));
  const order = ["Bookings", "Leads", "Quotations", "Customers", "Shipments"].map((label) => nav.indexOf(`>${label}<`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `menu order ${order}`);
  assert.ok(html.includes("data-bookings-count") && html.includes("data-proofs-count"));
  step("Admin menu: Bookings, Leads, Quotations, Customers, Shipments; red Bookings count = 1");

  // 5. Review, confirm Messenger, calculate and approve.
  html = await (await get(`/admin/bookings?id=${saved.id}`)).text();
  assert.ok(html.includes(`/admin/bookings?file=`), "photo shown");
  res = await post("/admin/bookings", { csrf: token(html), id: saved.id, action: "messenger" });
  assert.equal(res.status, 303, await res.text());
  html = await (await get(`/admin/bookings?id=${saved.id}`)).text();
  const item = html.slice(html.indexOf('name="item" required')).match(/<option>([^<]+)<\/option>/)[1].replace(/&amp;/g, "&");
  html = await (await get(`/admin/bookings?id=${saved.id}&item=${encodeURIComponent(item)}&warehouse=Guangzhou&cbm=0.5&weight=80`)).text();
  assert.ok(html.includes('value="approve"'), "approve form shown after calculating");
  const approveForm = html.slice(html.indexOf('value="approve"') - 400);
  const hidden = Object.fromEntries([...approveForm.slice(0, approveForm.indexOf("</form>")).matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&")]));
  res = await post("/admin/bookings", { ...hidden, amount: "" });
  assert.equal(res.status, 303, await res.text());
  const approved = sqlRows(`SELECT b.status, b.approved_amount, b.messenger_confirmed_at, c.customer_code, s.tracking_number, s.status AS sstatus, s.shipping_charge, s.id AS sid
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN shipments s ON s.id=b.shipment_id`)[0];
  assert.equal(approved.status, "Approved");
  assert.ok(approved.messenger_confirmed_at);
  assert.match(approved.customer_code, /^KDOOR-\d{4}$/);
  assert.match(approved.tracking_number, /^KDSEA-/);
  assert.equal(approved.sstatus, "Awaiting Supplier Dispatch");
  assert.equal(approved.shipping_charge, approved.approved_amount);
  html = await (await get(`/admin/bookings?id=${saved.id}`)).text();
  assert.ok(html.includes(`Cargo code: ${approved.customer_code}`), "copy-ready Messenger message");
  assert.deepEqual(await (await get("/admin/bookings?count=1")).json(), { bookings: 0, proofs: 0 });
  step(`Approved: customer ${approved.customer_code} + shipment ${approved.tracking_number} (₱${approved.shipping_charge / 100}); Messenger message ready; count back to 0`);

  // 6. Chat shows the code; no bill yet so proof is refused.
  status = await (await api("/api/bookings/status", { ref: made.ref, last4: "4567" })).json();
  assert.equal(status.shipment.cargoCode, approved.customer_code);
  assert.equal(status.bill, null);
  let proof = new FormData(); proof.set("ref", made.ref); proof.set("last4", "4567"); proof.append("file", new Blob([png], { type: "image/png" }), "proof.png");
  res = await api("/api/bookings/proof", proof);
  assert.equal(res.status, 409);
  step("Chat shows the cargo code; proof upload waits until the bill is ready");

  // 7. Cargo arrives in Malabon → Draft bill made automatically.
  sqlRows(`UPDATE shipments SET status='Malabon Warehouse', cbm=0.6 WHERE id='${approved.sid}'`);
  html = await (await get(`/admin/shipments?id=${approved.sid}&edit=1`)).text();
  const revision = html.match(/name="revision" value="([^"]*)"/)[1];
  const saved2 = sqlRows(`SELECT customer_id, cargo_item, cargo_quantity, cargo_description FROM shipments WHERE id='${approved.sid}'`)[0];
  assert.ok(saved2.cargo_item, "item chosen at approval is on the shipment");
  res = await post("/admin/shipments", {
    csrf: token(html), id: approved.sid, revision, customer_id: saved2.customer_id, cargo_item: saved2.cargo_item, cargo_quantity: saved2.cargo_quantity ?? "", cargo_description: saved2.cargo_description ?? "", service_type: "Sea Freight", china_warehouse: "Guangzhou",
    cbm: "0.6", weight_kg: "80", status: "Malabon Warehouse", actual_arrival: "", shipping_charge: "", nihao_cost: "", delivery_charge: "0", payment_status: "Unpaid",
  });
  assert.equal(res.status, 303, await res.text());
  const invoice = sqlRows(`SELECT id, status, total FROM invoices WHERE shipment_id='${approved.sid}'`)[0];
  assert.equal(invoice?.status, "Draft", "Draft bill made on arrival");
  status = await (await api("/api/bookings/status", { ref: made.ref, last4: "4567" })).json();
  assert.equal(status.bill.total, invoice.total / 100);
  step(`Arrived in Malabon: Draft bill ₱${invoice.total / 100} shown in the chat`);

  // 8. Customer uploads proof → red count on Invoices & Payments → admin records payment.
  proof = new FormData(); proof.set("ref", made.ref); proof.set("last4", "4567"); proof.append("file", new Blob([png], { type: "image/png" }), "proof.png");
  res = await api("/api/bookings/proof", proof);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await (await get("/admin/bookings?count=1")).json(), { bookings: 0, proofs: 1 });
  html = await (await get("/admin/invoices")).text();
  assert.ok(html.includes(made.ref), "proof waiting on Invoices & Payments");
  html = await (await get(`/admin/bookings?id=${saved.id}`)).text();
  const proofId = html.match(/name="proof_id" value="([^"]+)"/)[1];
  res = await post("/admin/bookings", { csrf: token(html), id: saved.id, action: "accept_proof", proof_id: proofId, amount: String(invoice.total / 100), payment_date: "2026-11-03", reference_number: "UB-55" });
  assert.equal(res.status, 303, await res.text());
  const paid = sqlRows(`SELECT i.status, s.payment_status, (SELECT COUNT(*) FROM payment_proofs) AS proofs FROM invoices i JOIN shipments s ON s.id=i.shipment_id WHERE i.id='${invoice.id}'`)[0];
  assert.deepEqual(paid, { status: "Paid", payment_status: "Paid", proofs: 1 });
  assert.deepEqual(await (await get("/admin/bookings?count=1")).json(), { bookings: 0, proofs: 0 });
  step("Proof uploaded → red count on Invoices & Payments → Record payment: invoice Paid, shipment Paid, proof kept");

  // 9. Customer downloads the paid invoice.
  status = await (await api("/api/bookings/status", { ref: made.ref, last4: "4567" })).json();
  assert.equal(status.bill.status, "Paid");
  res = await api("/api/bookings/invoice", { ref: made.ref, last4: "4567" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/pdf/);
  const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF") && pdf.includes("Juan Dela Cruz"));
  res = await api("/api/bookings/invoice", { ref: made.ref, last4: "9999" });
  assert.equal(res.status, 404);
  step("Chat: bill Paid, paid invoice PDF downloads (only with the right last 4 digits)");

  // 10. Decline + block, and the daily limit.
  res = await api("/api/bookings", bookingForm({ ...booking, phone: "09998887777" }));
  const second = await res.json();
  const sid2 = sqlRows(`SELECT id FROM bookings WHERE booking_ref='${second.ref}'`)[0].id;
  html = await (await get(`/admin/bookings?id=${sid2}`)).text();
  res = await post("/admin/bookings", { csrf: token(html), id: sid2, action: "decline", reason: "Fake", block: "1" });
  assert.equal(res.status, 303);
  res = await api("/api/bookings", bookingForm({ ...booking, phone: "09998887777" }));
  assert.equal(res.status, 403, "blocked phone refused");
  for (let n = 0; n < 2; n++) assert.equal((await api("/api/bookings", bookingForm(booking))).status, 200);
  res = await api("/api/bookings", bookingForm(booking));
  assert.equal(res.status, 429, "4th booking in a day refused");
  step("Decline + block stops that phone; 4th booking from one phone in a day is refused");

  console.log(`\nBooking flow end-to-end passed: ${steps.length} steps. All operations were local.`);
  // KEEP_SERVER=1 leaves the local server running (for screenshots).
  if (process.env.KEEP_SERVER) { writeFileSync(resolve(dir, "admin-password"), password, { mode: 0o600 }); console.log(`READY ${origin} ${dir}`); await new Promise(() => {}); }
} catch (error) {
  console.error(error);
  console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

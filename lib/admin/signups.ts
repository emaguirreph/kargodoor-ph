// Admin side of online sign-ups (admin → Bookings → Sign-ups). Approve creates the
// customer (KDOOR code) and the portal sign-in with the password the client chose,
// or links the sign-in to a customer Em already has. Reject keeps a reason.
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { AdminError, csrfToken, type AdminEnv, type AdminUser } from "./security";
import { esc } from "./ui";
import { generatedIdentifier } from "./data";
import { copyButton, copyScript } from "./shipping-instructions";
import { normalizePhMobile } from "../booking-rules";
import { portalLoginTaken } from "../customer/signup";

type Row = Record<string, unknown>;
const path = "/admin/bookings";
export const signupLink = "https://kargodoorph.com/customer/signup";

const when = (value: unknown) => String(value ?? "").replace("T", " ").slice(0, 16);
const tag = (status: unknown) => {
  const s = String(status);
  const color = s === "New" ? "background:#fff3cd;color:#8a5a00" : s === "Approved" ? "background:#e3f5ea;color:#1d6b3a" : "background:#fde7e7;color:#a12626";
  return `<span class="booking-tag" style="${color}">${esc(s === "New" ? "To review" : s)}</span>`;
};
const csrf = (env: AdminEnv, user: AdminUser) => `<input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}">`;

export async function signupCount(db: D1Database) {
  // 0 if the sign-ups table is not there yet (migration 0044 not applied).
  const row = await db.prepare("SELECT COUNT(*) AS n FROM customer_signups WHERE status = 'New'").first<{ n: number }>().catch(() => null);
  return Number(row?.n ?? 0);
}

/** Customers Em already has with the same mobile (any format) or email, and whether they already sign in. */
async function matchingCustomers(db: D1Database, signup: Row) {
  const rows = (await db.prepare(`SELECT c.id, c.customer_code, c.full_name, c.mobile, c.email, a.id AS account_id
      FROM customers c LEFT JOIN customer_accounts a ON a.customer_id = c.id WHERE c.archived_at IS NULL`).all<Row>()).results;
  const email = String(signup.email ?? "").toLowerCase();
  return rows.filter((row) => normalizePhMobile(row.mobile) === signup.mobile || (email && String(row.email ?? "").trim().toLowerCase() === email));
}

export function approvedMessage(signup: Row, customerCode: string) {
  const name = String(signup.full_name).trim().split(/\s+/)[0];
  return [
    `Hi ${name}! 😊`,
    "",
    "Your KargoDoor account is approved ✅",
    "",
    `Your cargo code: ${customerCode}`,
    "Please ask your supplier to write this code on EVERY box.",
    "",
    "Sign in here: https://kargodoorph.com/customer/login",
    `Use your mobile number (${String(signup.mobile)}) or email (${String(signup.email)}) and the password you made when you signed up.`,
    "",
    "Inside you'll find our China warehouse addresses with your code, your shipments and your bills.",
    "",
    "Thank you for choosing KargoDoor PH! 🚚",
  ].join("\n");
}

export async function approveSignup(db: D1Database, user: AdminUser, id: string, form: FormData) {
  const signup = await db.prepare("SELECT * FROM customer_signups WHERE id = ?").bind(id).first<Row>();
  if (!signup) throw new AdminError("Sign-up not found.", 404);
  if (signup.status !== "New") throw new AdminError("This sign-up was already reviewed.", 409);
  if (await portalLoginTaken(db, String(signup.email), String(signup.mobile)))
    throw new AdminError("This email or mobile number already signs in to the customer portal. Reject this sign-up and tell the client to sign in, or reset their password on the customer page.", 409);
  const matches = await matchingCustomers(db, signup);
  const chosen = String(form.get("customer_id") ?? "new");
  const existing = chosen === "new" ? null : matches.find((row) => row.id === chosen) ?? null;
  if (chosen !== "new" && !existing) throw new AdminError("Choose one of the matching customers, or New customer.");
  if (existing?.account_id) throw new AdminError("That customer already has a portal sign-in.", 409);

  const now = new Date().toISOString();
  const customerId = existing ? String(existing.id) : randomUUID();
  const customerCode = existing ? String(existing.customer_code) : await generatedIdentifier(db, "customers", {});
  if (!customerCode) throw new AdminError("Unable to reserve a customer code. Please try again.", 409);
  const notes = [
    `Signed up online ${now.slice(0, 10)}.`,
    signup.ships_what ? `Plans to ship: ${String(signup.ships_what)}.` : "",
    signup.heard_from ? `Found us on: ${String(signup.heard_from)}.` : "",
  ].filter(Boolean).join(" ");
  const statements: D1PreparedStatement[] = [];
  if (!existing) {
    statements.push(db.prepare(`INSERT INTO customers (id, customer_code, full_name, company_name, mobile, email, address, notes, referral_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(customerId, customerCode, signup.full_name, signup.company_name ?? null, signup.mobile, signup.email, signup.address, notes,
        signup.referral_code && String(signup.referral_code).toUpperCase() !== customerCode ? signup.referral_code : null, now, now));
  }
  statements.push(db.prepare(`INSERT INTO customer_accounts (id, customer_id, login_email, login_mobile, password_hash, password_salt, password_algorithm,
      password_n, password_r, password_p, password_key_length, enabled, password_state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'scrypt', ?, ?, ?, ?, 1, 'active', ?, ?)`)
    .bind(randomUUID(), customerId, signup.email, signup.mobile, signup.password_hash, signup.password_salt,
      signup.password_n, signup.password_r, signup.password_p, signup.password_key_length, now, now));
  statements.push(db.prepare("UPDATE customer_signups SET status = 'Approved', customer_id = ?, reviewed_by_admin_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'New'")
    .bind(customerId, user.id, now, now, id));
  statements.push(db.prepare("INSERT INTO activity_log (id, admin_user_id, action, entity_type, entity_id, old_value, new_value, notes, created_at) VALUES (?, ?, 'approve_signup', 'customer_signups', ?, NULL, ?, ?, ?)")
    .bind(randomUUID(), user.id, id, JSON.stringify({ customer_code: customerCode, customer_created: !existing }), `Approved online sign-up of ${String(signup.full_name)}`, now));
  const result = await db.batch(statements);
  if (!result[statements.length - 2]?.meta.changes) throw new AdminError("This sign-up was already reviewed.", 409);
}

export async function rejectSignup(db: D1Database, user: AdminUser, id: string, form: FormData) {
  const now = new Date().toISOString();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300) || null;
  const result = await db.batch([
    db.prepare("UPDATE customer_signups SET status = 'Rejected', reject_reason = ?, reviewed_by_admin_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'New'")
      .bind(reason, user.id, now, now, id),
    db.prepare("INSERT INTO activity_log (id, admin_user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?, ?, 'reject_signup', 'customer_signups', ?, ?, ?)")
      .bind(randomUUID(), user.id, id, JSON.stringify({ reason }), now),
  ]);
  if (!result[0]?.meta.changes) throw new AdminError("This sign-up was already reviewed.", 409);
}

/** List of sign-ups (the "Sign-ups" tab), with the link to send to clients. */
export async function signupsList(db: D1Database, url: URL, tabs: string) {
  const show = ["New", "Approved", "Rejected"].includes(url.searchParams.get("show") ?? "") ? String(url.searchParams.get("show")) : "New";
  const rows = (await db.prepare(`SELECT s.id, s.full_name, s.company_name, s.mobile, s.email, s.address, s.ships_what, s.status, s.created_at, c.customer_code
      FROM customer_signups s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.status = ? ORDER BY s.created_at ${show === "New" ? "ASC" : "DESC"} LIMIT 200`)
    .bind(show).all<Row>().catch(() => ({ results: null as Row[] | null })));
  const list = rows.results;
  const button = (name: string, label: string) => `<a class="button${show === name ? "" : " secondary"}" href="${path}?status=Signups${name === "New" ? "" : `&show=${name}`}">${label}</a>`;
  return `<section>
    <p class="muted">Clients who signed up on the website. Check the details (call or message them if you're not sure), then approve to create their customer code and portal sign-in.</p>
    ${tabs}
    <div class="signup-link"><div><strong>Sign-up link to send to clients</strong><br><input id="signup-link" readonly value="${esc(signupLink)}"></div>${copyButton("signup-link", "Copy link")}</div>${copyScript()}
    <p class="actions">${button("New", "To review")} ${button("Approved", "Approved")} ${button("Rejected", "Rejected")}</p>
    ${list === null ? '<p class="notice">Sign-ups are not set up yet (database migration 0044 is not applied).</p>'
      : list.length ? `<div class="table"><table><thead><tr><th>Name</th><th>Mobile / email</th><th>Address</th><th>Plans to ship</th><th>Signed up</th><th>Status</th></tr></thead><tbody>
      ${list.map((row) => `<tr class="inv-row" data-href="${path}?signup=${esc(row.id)}" tabindex="0"><td><a href="${path}?signup=${esc(row.id)}"><strong>${esc(row.full_name)}</strong></a>${row.company_name ? `<br><small class="muted">${esc(row.company_name)}</small>` : ""}</td>
        <td>${esc(row.mobile)}<br><small class="muted">${esc(row.email)}</small></td><td><small>${esc(row.address)}</small></td><td><small>${esc(row.ships_what ?? "—")}</small></td>
        <td>${esc(when(row.created_at))}</td><td>${tag(row.status)}${row.customer_code ? `<br><small>${esc(row.customer_code)}</small>` : ""}</td></tr>`).join("")}
      </tbody></table></div><script src="/admin-row-link.js" defer></script>`
      : `<p class="muted">${show === "New" ? "No sign-ups to review. 🎉" : "None yet."}</p>`}
  </section>`;
}

/** One sign-up: details, matching customers, Approve / Reject, and the message to send after approval. */
export async function signupDetail(db: D1Database, env: AdminEnv, user: AdminUser, id: string, url: URL, canWrite: boolean) {
  const signup = await db.prepare(`SELECT s.*, c.customer_code FROM customer_signups s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`).bind(id).first<Row>();
  if (!signup) throw new AdminError("Sign-up not found.", 404);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [matches, taken, recent] = await Promise.all([
    matchingCustomers(db, signup),
    portalLoginTaken(db, String(signup.email), String(signup.mobile)),
    signup.client_key ? db.prepare("SELECT COUNT(*) AS n FROM customer_signups WHERE client_key = ? AND created_at >= ?").bind(signup.client_key, since).first<{ n: number }>() : null,
  ]);
  const done = url.searchParams.get("done");
  const detail = (label: string, value: unknown) => `<div><dt>${esc(label)}</dt><dd>${esc(value === null || value === undefined || value === "" ? "—" : value)}</dd></div>`;
  const flags: string[] = [];
  if (signup.status !== "New") { /* already reviewed: the flags below are only for deciding */ }
  else if (matches.length) flags.push(`<span class="booking-flag ok">👤 Already a customer: ${matches.map((row) => esc(`${row.customer_code} ${row.full_name}${row.account_id ? " (has a portal sign-in)" : ""}`)).join(", ")}</span>`);
  else flags.push(`<span class="booking-flag warn">🆕 New client, not in Customers yet</span>`);
  if (signup.status === "New" && taken) flags.push(`<span class="booking-flag bad">⚠️ This email or mobile already signs in to the portal</span>`);
  if (signup.status === "New" && Number(recent?.n ?? 0) > 1) flags.push(`<span class="booking-flag bad">⚠️ ${Number(recent?.n)} sign-ups from the same device in 24 hours</span>`);

  let html = `<section><div class="actions"><a class="button" href="${path}?status=Signups">← Back</a></div>
    ${done === "approved" ? '<p class="notice">Approved. The customer and their portal sign-in are created. Copy the message below and send it on Messenger or SMS.</p>' : done === "rejected" ? '<p class="notice">Sign-up rejected. If they try to sign in, they are told to message you on Messenger.</p>' : ""}
    <h2>Sign-up · ${esc(signup.full_name)} ${tag(signup.status)}</h2>
    ${flags.length ? `<p class="booking-flags">${flags.join("")}</p>` : ""}
    <dl class="booking-details">
      ${detail("Full name", signup.full_name)}${detail("Shop or business", signup.company_name)}
      ${detail("Mobile", signup.mobile)}${detail("Email", signup.email)}
      ${detail("Address", signup.address)}${detail("Plans to ship", signup.ships_what)}
      ${detail("Found us on", signup.heard_from)}${detail("Referral code", signup.referral_code)}
      ${detail("Signed up", when(signup.created_at))}${signup.reviewed_at ? detail("Reviewed", when(signup.reviewed_at)) : ""}
    </dl></section>`;

  if (signup.status === "New" && canWrite) {
    const linkable = matches.filter((row) => !row.account_id);
    const customerChoice = linkable.length
      ? `<label>Customer<select name="customer_id">${linkable.map((row) => `<option value="${esc(row.id)}">${esc(`${row.customer_code} · ${row.full_name}`)} (existing, add portal sign-in)</option>`).join("")}<option value="new">New customer (new KDOOR code)</option></select></label>`
      : `<input type="hidden" name="customer_id" value="new"><p class="muted">A new customer with a KDOOR code will be created, with a portal sign-in using the password they chose.</p>`;
    html += `<section class="booking-calc"><h2>✅ Approve</h2>
      <form method="post" class="grid">${csrf(env, user)}<input type="hidden" name="signup_id" value="${esc(id)}"><input type="hidden" name="action" value="signup_approve">
        ${customerChoice}
        <p class="actions" style="grid-column:1/-1"><button${taken ? " disabled" : ""}>✅ Approve → create customer + sign-in</button></p>
      </form></section>
      <section><h2>Reject</h2><form method="post" class="grid">${csrf(env, user)}<input type="hidden" name="signup_id" value="${esc(id)}"><input type="hidden" name="action" value="signup_reject">
        <label>Reason (for your records)<input name="reason" maxlength="300" placeholder="e.g. Fake number, duplicate, already a customer"></label>
        <p class="actions" style="grid-column:1/-1"><button class="secondary">✕ Reject sign-up</button></p></form></section>`;
  }
  if (signup.status === "Approved" && signup.customer_code) {
    html += `<section><h2>Approved</h2>
      <p>Customer <a href="/admin/customers?id=${esc(signup.customer_id)}">${esc(signup.customer_code)} · ${esc(signup.full_name)}</a> can now sign in to the portal.</p>
      <details class="customer-notification" open><summary>Message for the client (Messenger or SMS)</summary><textarea id="signup-message" style="min-height:280px;white-space:pre-wrap">${esc(approvedMessage(signup, String(signup.customer_code)))}</textarea><div class="actions">${copyButton("signup-message", "Copy message")}</div></details>${copyScript()}</section>`;
  }
  if (signup.status === "Rejected") html += `<section><h2>Rejected</h2><p>${esc(signup.reject_reason || "No reason saved.")}</p></section>`;
  return html;
}

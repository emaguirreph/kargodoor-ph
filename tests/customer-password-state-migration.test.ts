import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("customer password state migration is additive and preserves customer authentication data", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0001_phase1.sql", "0002_freight_cost.sql", "0003_invoices_payments.sql", "0004_public_tracking.sql", "0005_expenses.sql", "0006_admin_viewer_role.sql", "0007_staff_follow_up.sql", "0008_customer_accounts.sql"])
    sql.exec(readFileSync(`migrations/admin/${file}`, "utf8"));
  const customerId = randomUUID();
  const accountId = randomUUID();
  sql.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)").run(customerId, "KD1", "Customer", null, "09123456789", "customer@example.test", null, null, "2026-01-01", "2026-01-01");
  sql.prepare("INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(accountId, customerId, "customer@example.test", "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, 1, "2026-01-01", "2026-01-01");
  sql.prepare("INSERT INTO customer_sessions VALUES (?,?,?,?,?)").run(randomUUID(), accountId, "c".repeat(64), "2026-01-01", "2027-01-01");
  sql.prepare("INSERT INTO customer_password_reset_tokens VALUES (?,?,?,?,?,NULL)").run(randomUUID(), accountId, "d".repeat(64), "2026-01-01", "2027-01-01");

  sql.exec(readFileSync("migrations/admin/0009_customer_account_password_state.sql", "utf8"));

  const account = sql.prepare("SELECT customer_id,login_email,enabled,password_state FROM customer_accounts WHERE id=?").get(accountId)!;
  assert.equal(account.customer_id, customerId);
  assert.equal(account.login_email, "customer@example.test");
  assert.equal(account.enabled, 1);
  assert.equal(account.password_state, "temporary");
  sql.prepare("UPDATE customer_accounts SET password_state='active' WHERE id=?").run(accountId);
  assert.equal(sql.prepare("SELECT password_state FROM customer_accounts WHERE id=?").get(accountId)!.password_state, "active");
  assert.throws(() => sql.prepare("UPDATE customer_accounts SET password_state='invalid' WHERE id=?").run(accountId), /CHECK/);
  sql.prepare("UPDATE customer_accounts SET enabled=0 WHERE id=?").run(accountId);
  const disabled = sql.prepare("SELECT enabled,password_state FROM customer_accounts WHERE id=?").get(accountId)!;
  assert.equal(disabled.enabled, 0);
  assert.equal(disabled.password_state, "active");
  assert.equal(sql.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customer_sessions WHERE customer_account_id=?").get(accountId)!.n, 1);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customer_password_reset_tokens WHERE customer_account_id=?").get(accountId)!.n, 1);
});

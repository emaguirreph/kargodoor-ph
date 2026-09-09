import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import {
  clearCustomerSessionCookie,
  createCustomerSession,
  customerPasswordHash,
  customerSession,
  customerSessionCookie,
  customerSessionCookieValue,
  deleteCustomerSession,
  hashSessionToken,
  loginCustomer,
  normalizeCustomerEmail,
  requestCookie,
  verifyCustomerPassword,
  type CustomerAccount,
} from "../lib/customer/security";

function fixture() {
  const sql = new DatabaseSync(":memory:");

  sql.exec("PRAGMA foreign_keys=ON");

  for (const file of [
    "0001_phase1.sql",
    "0002_freight_cost.sql",
    "0003_invoices_payments.sql",
    "0004_public_tracking.sql",
    "0005_expenses.sql",
    "0006_admin_viewer_role.sql",
    "0007_staff_follow_up.sql",
    "0008_customer_accounts.sql",
    "0009_customer_account_password_state.sql",
  ]) {
    sql.exec(readFileSync(`migrations/admin/${file}`, "utf8"));
  }

  sql.prepare(
    "INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "customer",
    "KD1",
    "Portal Customer",
    null,
    "09123456789",
    "portal@example.test",
    null,
    null,
    "2026-01-01",
    "2026-01-01",
  );

  const accountId = randomUUID();
  const password = "correct horse battery staple";
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = customerPasswordHash(password, salt);

  sql.prepare(
    "INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    accountId,
    "customer",
    "portal@example.test",
    hash,
    salt,
    "scrypt",
    32768,
    8,
    1,
    64,
    1,
    "2026-01-01",
    "2026-01-01",
    "active",
  );

  let values: unknown[] = [];

  const db = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },

        async first() {
          return (
            sql.prepare(query).get(...(values as never[])) ?? null
          );
        },

        async run() {
          return {
            meta: sql.prepare(query).run(...(values as never[])),
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    sql,
    db,
    accountId,
    password,
  };
}

test(
  "customer passwords, sessions and cookies are isolated and secure",
  async () => {
    const { sql, db, accountId, password } = fixture();

    const account = sql
      .prepare(
        "SELECT * FROM customer_accounts WHERE id=?",
      )
      .get(accountId)! as unknown as CustomerAccount;

    assert.equal(
      normalizeCustomerEmail(" Portal@Example.Test "),
      "portal@example.test",
    );

    assert.equal(
      verifyCustomerPassword(password, account),
      true,
    );

    assert.equal(
      verifyCustomerPassword("incorrect", account),
      false,
    );

    const login = await loginCustomer(
      db,
      " Portal@Example.Test ",
      password,
    );

    assert.equal(
      login?.account.customer_id,
      "customer",
    );

    assert.equal(
      await loginCustomer(
        db,
        "portal@example.test",
        "incorrect",
      ),
      null,
    );

    const session = await createCustomerSession(
      db,
      accountId,
      new Date("2026-09-09T00:00:00.000Z"),
    );

    const row = sql
      .prepare(
        "SELECT * FROM customer_sessions WHERE token_hash=?",
      )
      .get(hashSessionToken(session.token))!;

    assert.equal(
      row.token_hash,
      hashSessionToken(session.token),
    );

    assert.ok(
      !JSON.stringify(row).includes(session.token),
    );

    assert.equal(
      (
        await customerSession(
          db,
          session.token,
          new Date("2026-09-10T00:00:00.000Z"),
        )
      )?.customer_id,
      "customer",
    );

    assert.equal(
      await customerSession(
        db,
        session.token,
        new Date("2026-09-17T00:00:01.000Z"),
      ),
      null,
    );

    assert.match(
      customerSessionCookieValue(session.token),
      new RegExp(
        `${customerSessionCookie}=${session.token}; Path=/customer; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
      ),
    );

    assert.match(
      clearCustomerSessionCookie(),
      /Path=\/customer; Max-Age=0; HttpOnly; Secure; SameSite=Lax/,
    );

    assert.equal(
      requestCookie(
        new Request(
          "https://example.test/customer",
          {
            headers: {
              Cookie: `${customerSessionCookie}=${session.token}`,
            },
          },
        ),
        customerSessionCookie,
      ),
      session.token,
    );

    sql.prepare(
      "UPDATE customer_accounts SET enabled=0 WHERE id=?",
    ).run(accountId);

    assert.equal(
      await loginCustomer(
        db,
        "portal@example.test",
        password,
      ),
      null,
    );

    assert.equal(
      await customerSession(
        db,
        session.token,
        new Date("2026-09-10T00:00:00.000Z"),
      ),
      null,
    );

    await deleteCustomerSession(
      db,
      session.token,
    );

    await deleteCustomerSession(
      db,
      login!.session.token,
    );

    assert.equal(
      sql
        .prepare(
          "SELECT COUNT(*) AS n FROM customer_sessions",
        )
        .get()!.n,
      0,
    );
  },
);

test(
  "customer routes protect the placeholder and public navigation exposes login",
  () => {
    const login = readFileSync(
      "app/customer/login/page.tsx",
      "utf8",
    );

    const dashboard = readFileSync(
      "app/customer/page.tsx",
      "utf8",
    );

    const logout = readFileSync(
      "app/customer/logout/route.ts",
      "utf8",
    );

    const header = readFileSync(
      "components/site-chrome.tsx",
      "utf8",
    );

    assert.match(
      login,
      /Invalid email or password./,
    );

    assert.match(
      dashboard,
      /customerSession\(/,
    );

    assert.match(
      dashboard,
      /redirect\("\/customer\/login"\)/,
    );

    assert.ok(
      !/shipment|invoice|payment|freight/i.test(
        dashboard,
      ),
    );

    assert.match(
      logout,
      /deleteCustomerSession/,
    );

    assert.match(
      logout,
      /clearCustomerSessionCookie/,
    );

    assert.ok(
      header.indexOf(
        'className="kd-header-login" href="/customer/login"',
      ) <
        header.indexOf(
          'className="kd-header-quote"',
        ),
    );

    assert.match(
      header,
      /<Link href="\/customer\/login" onClick=\{\(\) => setMobileMenuOpen\(false\)\}>LOGIN<\/Link>/,
    );
  },
);

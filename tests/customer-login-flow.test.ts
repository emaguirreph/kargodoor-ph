import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { handleAdmin } from "../lib/admin/handler";
import { csrfToken } from "../lib/admin/security";
import { customerSession, verifyCustomerPassword, type CustomerAccount } from "../lib/customer/security";
import { POST as login } from "../app/api/customer/login/route";
import { POST as change } from "../app/customer/change-password/save/route";
import { POST as logout } from "../app/customer/logout/route";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations/admin").filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(`migrations/admin/${file}`, "utf8"));
  const db = { prepare(query: string) {
    let values: never[] = [];
    return { bind(...args: never[]) { values = args; return this; },
      async first() { return sql.prepare(query).get(...values) ?? null; },
      async all() { return { results: sql.prepare(query).all(...values) }; },
      async run() { return { success: true, meta: sql.prepare(query).run(...values) }; } };
  } } as unknown as D1Database;
  const adminId = randomUUID(), secret = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex");
  sql.prepare("INSERT INTO admin_users VALUES (?,?,?,?,?,?)").run(adminId,"Test owner","owner@example.test","owner","2026-01-01","2026-01-01");
  const ids = [randomUUID(), randomUUID()];
  ids.forEach((id,i) => sql.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)").run(id,`KDOOR${i}`,`Customer ${i}`,null,"09123456789",`customer${i}@example.test`,null,null,"2026-01-01","2026-01-01"));
  const env = { ADMIN_DB: db, ADMIN_ORIGIN: "http://localhost:8787", ADMIN_LOCAL_DEV: "true", LOCAL_ADMIN_EMAIL: "owner@example.test", LOCAL_ADMIN_HASH: `${salt}:${scryptSync(secret,salt,64).toString("hex")}`, ADMIN_CSRF_SECRET: randomBytes(32).toString("hex") };
  Object.assign(globalThis, { [Symbol.for("__cloudflare-context__")]: { env } });
  const headers = { Authorization: `Basic ${Buffer.from(`owner@example.test:${secret}`).toString("base64")}`, Origin: env.ADMIN_ORIGIN };
  const admin = (action: string, id=ids[0]) => handleAdmin(new Request(`${env.ADMIN_ORIGIN}/admin/customers`, { method:"POST", headers, body:new URLSearchParams({action, customer_id:id, csrf:csrfToken(env,adminId,"/admin/customers")}) }), "customers");
  const account = (id=ids[0]) => sql.prepare("SELECT * FROM customer_accounts WHERE customer_id=?").get(id) as unknown as CustomerAccount;
  return {sql,db,ids,admin,account};
}
const tokenFrom = (r: Response) => { const c=r.headers.get("set-cookie"); assert.ok(c, "successful authentication must set a cookie"); return c.split(";")[0].split("=")[1]; };
const request = (path:string, fields:Record<string,string>, token?:string) => new Request(`https://example.test${path}`, {method:"POST", headers:{Origin:"https://example.test", ...(token ? {Cookie:`kargodoor_customer_session=${token}`} : {})}, body:new URLSearchParams(fields)});

test("Admin create/reset response password verifies against exact stored row; no later disclosure", async () => {
  const f=fixture();
  const created=await f.admin("portal_create"); assert.equal(created.status,200);
  const html=await created.text(), password=html.match(/<code>([^<]+)<\/code>/)?.[1]; assert.ok(password);
  assert.equal(verifyCustomerPassword(password,f.account()),true);
  assert.equal(JSON.stringify(f.account()).includes(password),false);
  assert.match(created.headers.get("cache-control")!,/no-store/);
  const reset=await f.admin("portal_reset"); const next=(await reset.text()).match(/<code>([^<]+)<\/code>/)?.[1]; assert.ok(next);
  assert.equal(next === password,false);
  assert.equal(verifyCustomerPassword(next,f.account()),true);
  assert.equal(verifyCustomerPassword(password,f.account()),false);
});

test("actual login, password-change and logout routes complete with browser-scoped cookies", async () => {
  const f=fixture();
  const html=await (await f.admin("portal_create")).text(), password=html.match(/<code>([^<]+)<\/code>/)![1];
  const response=await login(request("/api/customer/login",{email:" CUSTOMER0@EXAMPLE.TEST ",password}));
  assert.equal(response.headers.get("location"),"https://example.test/customer/change-password");
  const token=tokenFrom(response);
  assert.match(response.headers.get("set-cookie")!,/Path=\/customer;.*HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await customerSession(f.db,token))?.password_state,"temporary");
  const page=readFileSync("app/customer/change-password/page.tsx","utf8");
  const action=page.match(/action="([^"]+)"/)![1];
  assert.ok(action.startsWith("/customer/"),"form action must receive Path=/customer cookie");
  const permanent=randomBytes(24).toString("base64url");
  const mismatch=await change(request(action,{password:permanent,confirm_password:"mismatch"},token));
  assert.equal(mismatch.headers.get("location"),"https://example.test/customer/change-password");
  const changed=await change(request(action,{password:permanent,confirm_password:permanent},token));
  assert.equal(changed.headers.get("location"),"https://example.test/customer");
  const fresh=tokenFrom(changed);
  assert.equal(await customerSession(f.db,token),null);
  assert.equal((await customerSession(f.db,fresh))?.password_state,"active");
  assert.equal(verifyCustomerPassword(password,f.account()),false);
  assert.equal(verifyCustomerPassword(permanent,f.account()),true);
  const logged=await login(request("/api/customer/login",{email:"customer0@example.test",password:permanent}));
  assert.equal(logged.headers.get("location"),"https://example.test/customer");
  const out=await logout(request("/customer/logout",{},fresh));
  assert.equal(out.headers.get("location"),"https://example.test/customer/login");
  assert.match(out.headers.get("set-cookie")!,/Max-Age=0/);
  assert.equal(await customerSession(f.db,fresh),null);
});

test("reset/disable isolate customers, invalidate sessions and reject wrong credentials", async () => {
  const f=fixture();
  const passwords=[];
  for(const id of f.ids) passwords.push((await (await f.admin("portal_create",id)).text()).match(/<code>([^<]+)<\/code>/)![1]);
  const a=tokenFrom(await login(request("/api/customer/login",{email:"customer0@example.test",password:passwords[0]})));
  const b=tokenFrom(await login(request("/api/customer/login",{email:"customer1@example.test",password:passwords[1]})));
  assert.equal((await customerSession(f.db,a))?.customer_id,f.ids[0]);
  assert.equal((await customerSession(f.db,b))?.customer_id,f.ids[1]);
  await f.admin("portal_reset");
  assert.equal(await customerSession(f.db,a),null);
  assert.equal((await customerSession(f.db,b))?.customer_id,f.ids[1]);
  const old=await login(request("/api/customer/login",{email:"customer0@example.test",password:passwords[0]}));
  assert.equal(old.headers.get("location"),"https://example.test/customer/login?error=1");
  await f.admin("portal_disable",f.ids[1]);
  assert.equal(await customerSession(f.db,b),null);
  const disabled=await login(request("/api/customer/login",{email:"customer1@example.test",password:passwords[1]}));
  assert.equal(disabled.headers.get("location"),"https://example.test/customer/login?error=1");
  const wrong=await login(request("/api/customer/login",{email:"customer0@example.test",password:"wrong"}));
  assert.equal(wrong.headers.get("location"),"https://example.test/customer/login?error=1");
});

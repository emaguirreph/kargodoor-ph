import type { D1Database } from "@cloudflare/workers-types";

// Facebook connection for FB Posts (Em, 2026-11-24). Ported from Sabong Sentral's FB Scheduler:
// posts go into Facebook's own schedule through Meta's official Graph API, so they publish
// even if this site is down.
//
// Setup (once, by Em):
//   - a Meta app in Development mode (no App Review: only Em uses it, on her own Page)
//   - FB_APP_ID (wrangler.jsonc vars) = the app's App ID (not secret)
//   - Worker secrets FB_APP_SECRET (the app's secret) and TOKEN_KEY (40+ random
//     characters; it encrypts the stored Page token). Never pasted into chat.
//   - In the Meta app, Valid OAuth Redirect URI https://kargodoorph.com/admin/fb-posts/callback
//
// Tokens never reach the browser, a URL or a log: they are sent to Meta in the
// Authorization header and stored encrypted (AES-GCM) in D1.

export const GRAPH_VERSION = "v24.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
// publish_video: Reels from "+ New post" (2026-11-24). Needs a Reconnect after it was added.
export const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "publish_video", "business_management"];
// Meta's window for scheduled feed/photo posts: 10 minutes to 30 days ahead.
export const MIN_AHEAD_MIN = 15; // a little more than Meta's 10 minutes, for clock drift
export const MAX_AHEAD_DAYS = 30;

export type SocialEnv = { ADMIN_DB: D1Database; FB_APP_ID?: string; FB_APP_SECRET?: string; TOKEN_KEY?: string };

/** What is still missing before "Connect Facebook" can work. */
export function setupMissing(env: SocialEnv): string[] {
  const miss: string[] = [];
  if (!/^\d{6,20}$/.test(env.FB_APP_ID ?? "")) miss.push("FB_APP_ID");
  if (!env.FB_APP_SECRET) miss.push("FB_APP_SECRET");
  if ((env.TOKEN_KEY ?? "").length < 32) miss.push("TOKEN_KEY");
  return miss;
}

export const CALLBACK_PATH = "/admin/fb-posts/callback";
/** origin = the canonical site origin, so the link always matches the one saved in the Meta app. */
export const redirectUri = (origin: string) => new URL(CALLBACK_PATH, origin).toString();

export type SocialPage = { id: number; fb_page_id: string; name: string; token_status: "ok" | "expired" | "missing"; checked_at: string | null };

export async function listPages(env: SocialEnv): Promise<SocialPage[]> {
  const { results } = await env.ADMIN_DB.prepare(`SELECT id,fb_page_id,name,token_status,checked_at FROM social_pages WHERE active=1 ORDER BY name`).all<SocialPage>();
  return results;
}

/** The KargoDoor page if it is connected, else the first active page. */
export async function mainPage(env: SocialEnv): Promise<SocialPage | null> {
  const pages = await listPages(env);
  return pages.find((p) => /kargo/i.test(p.name)) ?? pages[0] ?? null;
}

export type LogRow = { id: number; post_ref: string | null; action: string; request: string | null; http_status: number | null; fb_error_code: number | null; result: string | null; created_at: string };
export async function recentLog(env: SocialEnv, limit = 15): Promise<LogRow[]> {
  const { results } = await env.ADMIN_DB.prepare(`SELECT id,post_ref,action,request,http_status,fb_error_code,result,created_at FROM social_log ORDER BY id DESC LIMIT ?`).bind(limit).all<LogRow>();
  return results;
}

async function log(env: SocialEnv, row: { page?: number | null; ref?: string | null; action: string; request?: string; status?: number; code?: number | null; result?: string }) {
  await env.ADMIN_DB.prepare(`INSERT INTO social_log (page_id,post_ref,action,request,http_status,fb_error_code,result) VALUES (?,?,?,?,?,?,?)`)
    .bind(row.page ?? null, row.ref ?? null, row.action, (row.request ?? "").slice(0, 500), row.status ?? null, row.code ?? null, (row.result ?? "").slice(0, 1000)).run();
}

// ---------- token encryption ----------

const enc = new TextEncoder();
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(env: SocialEnv): Promise<CryptoKey> {
  const k = env.TOKEN_KEY ?? "";
  if (k.length < 32) throw new Error("TOKEN_KEY secret is missing or too short");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(k));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(env: SocialEnv, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(plain));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

async function unseal(env: SocialEnv, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !ct) throw new Error("bad token format");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return new TextDecoder().decode(pt);
}

// ---------- Graph API ----------

export type FbError = { message: string; code?: number; subcode?: number; status: number };
type FbResult<T> = { ok: true; data: T; status: number } | { ok: false; error: FbError };

// Token goes in the Authorization header, never in the URL.
async function graph<T>(method: "GET" | "POST" | "DELETE", path: string, token: string | null, params: Record<string, string> = {}): Promise<FbResult<T>> {
  const url = new URL(`${GRAPH}${path}`);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(params).toString(); }
  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    return { ok: false, error: { message: `No answer from Facebook (${e instanceof Error ? e.name : "network"})`, status: 0 } };
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
  if (!res.ok || json.error) {
    return { ok: false, error: { message: json.error?.message ?? `HTTP ${res.status}`, code: json.error?.code, subcode: json.error?.error_subcode, status: res.status } };
  }
  return { ok: true, data: json, status: res.status };
}

/** Plain words for the errors Em is likely to see. */
export function explain(e: FbError): string {
  if (e.code === 190) return "Facebook login expired or was removed. Click Reconnect Facebook.";
  if (e.code === 10 || e.code === 200) return `Missing permission on the Page (${e.message}). Reconnect and allow every permission.`;
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613 || e.code === 80001) return "Facebook rate limit. Wait an hour and try again.";
  if (e.code === 100) return `Facebook refused the request: ${e.message}`;
  if (e.status === 0) return `${e.message}. It may or may not have been created: check "On Facebook now" before trying again.`;
  return e.message;
}

// ---------- connect (OAuth) ----------

export function loginUrl(env: SocialEnv, origin: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", env.FB_APP_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

type PageRow = { id: string; name: string; access_token?: string; tasks?: string[] };
const PAGE_FIELDS = { fields: "id,name,access_token,tasks", limit: "100" };

// Pages the user manages directly (/me/accounts). If there are none, the Pages owned or
// client-managed through each Business Manager the user belongs to.
async function collectPages(env: SocialEnv, userToken: string): Promise<{ ok: true; pages: PageRow[] } | { ok: false; error: FbError; request: string }> {
  const acc = await graph<{ data: PageRow[] }>("GET", "/me/accounts", userToken, PAGE_FIELDS);
  if (!acc.ok) return { ok: false, error: acc.error, request: "list pages" };
  const direct = acc.data.data.filter((p) => p.access_token);
  if (direct.length) return { ok: true, pages: direct };

  const biz = await graph<{ data: { id: string; name: string }[] }>("GET", "/me/businesses", userToken, { fields: "id,name", limit: "100" });
  if (!biz.ok) return { ok: false, error: biz.error, request: "list businesses" };
  const found = new Map<string, PageRow>();
  let lastError: { error: FbError; request: string } | null = null;
  for (const b of biz.data.data) {
    for (const edge of ["owned_pages", "client_pages"] as const) {
      const r = await graph<{ data: PageRow[] }>("GET", `/${b.id}/${edge}`, userToken, PAGE_FIELDS);
      if (!r.ok) { lastError = { error: r.error, request: `list ${edge} of a business` }; await log(env, { action: "connect", request: lastError.request, status: r.error.status, code: r.error.code, result: r.error.message }); continue; }
      for (const p of r.data.data) if (p.access_token && !found.has(p.id)) found.set(p.id, p);
    }
  }
  if (!found.size && lastError) return { ok: false, error: lastError.error, request: lastError.request };
  return { ok: true, pages: [...found.values()] };
}

/**
 * Code -> short user token -> 60-day user token -> Page tokens (which do not expire while Em
 * stays admin, keeps her password and keeps the app). Only the KargoDoor Page is kept active
 * when it is among the Pages returned (the same Meta app also serves Sabong Sentral).
 */
export async function connectWithCode(env: SocialEnv, origin: string, code: string): Promise<{ ok: true; pages: string[] } | { ok: false; error: string }> {
  const short = await graph<{ access_token: string }>("GET", "/oauth/access_token", null, {
    client_id: env.FB_APP_ID ?? "", client_secret: env.FB_APP_SECRET ?? "", redirect_uri: redirectUri(origin), code,
  });
  if (!short.ok) { await log(env, { action: "connect", request: "exchange code", status: short.error.status, code: short.error.code, result: short.error.message }); return { ok: false, error: explain(short.error) }; }
  const long = await graph<{ access_token: string }>("GET", "/oauth/access_token", null, {
    grant_type: "fb_exchange_token", client_id: env.FB_APP_ID ?? "", client_secret: env.FB_APP_SECRET ?? "", fb_exchange_token: short.data.access_token,
  });
  if (!long.ok) { await log(env, { action: "connect", request: "long-lived token", status: long.error.status, code: long.error.code, result: long.error.message }); return { ok: false, error: explain(long.error) }; }
  const found = await collectPages(env, long.data.access_token);
  if (!found.ok) { await log(env, { action: "connect", request: found.request, status: found.error.status, code: found.error.code, result: found.error.message }); return { ok: false, error: explain(found.error) }; }
  const kargo = found.pages.filter((p) => /kargo/i.test(p.name));
  const pages = kargo.length ? kargo : found.pages;
  if (!pages.length) return { ok: false, error: "Facebook returned no Pages. On the Facebook screen, choose the KargoDoor PH Page and allow every permission." };
  const stmts = [];
  for (const p of pages) {
    stmts.push(env.ADMIN_DB.prepare(
      `INSERT INTO social_pages (fb_page_id,name,token_enc,token_status,tasks,checked_at) VALUES (?,?,?,'ok',?,datetime('now'))
       ON CONFLICT(fb_page_id) DO UPDATE SET name=excluded.name,token_enc=excluded.token_enc,token_status='ok',tasks=excluded.tasks,active=1,checked_at=excluded.checked_at,updated_at=datetime('now')`,
    ).bind(p.id, p.name.slice(0, 200), await seal(env, p.access_token!), (p.tasks ?? []).join(",")));
  }
  await env.ADMIN_DB.batch(stmts);
  await log(env, { action: "connect", request: "list pages", status: 200, result: `Connected: ${pages.map((p) => p.name).join(", ")}` });
  return { ok: true, pages: pages.map((p) => p.name) };
}

async function pageToken(env: SocialEnv, pageId: number): Promise<{ fbId: string; name: string; token: string } | null> {
  const r = await env.ADMIN_DB.prepare(`SELECT fb_page_id,name,token_enc FROM social_pages WHERE id=? AND active=1`).bind(pageId).first<{ fb_page_id: string; name: string; token_enc: string | null }>();
  if (!r?.token_enc) return null;
  try { return { fbId: r.fb_page_id, name: r.name, token: await unseal(env, r.token_enc) }; } catch { return null; }
}

async function markToken(env: SocialEnv, pageId: number, e?: FbError) {
  if (e?.code === 190) await env.ADMIN_DB.prepare(`UPDATE social_pages SET token_status='expired',checked_at=datetime('now') WHERE id=?`).bind(pageId).run();
}

export async function disconnect(env: SocialEnv, pageId: number) {
  await env.ADMIN_DB.prepare(`UPDATE social_pages SET token_enc=NULL,token_status='missing',active=0,updated_at=datetime('now') WHERE id=?`).bind(pageId).run();
}

// ---------- posting ----------

/** When a time is OK for Meta. Returns an error message or null. */
export function checkTime(unix: number): string | null {
  const now = Date.now() / 1000;
  if (unix < now + MIN_AHEAD_MIN * 60) return `Pick a time at least ${MIN_AHEAD_MIN} minutes from now.`;
  if (unix > now + MAX_AHEAD_DAYS * 86400 - 300) return `Facebook allows scheduling up to ${MAX_AHEAD_DAYS} days ahead.`;
  return null;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Schedules one post on Facebook. With an image: a photo post (Facebook downloads the image
 * from imageUrl, a public https link). Without: a text post, with the link preview if a link is given.
 */
export async function schedulePost(env: SocialEnv, pageId: number, opts: { caption: string; when: number; imageUrl?: string | null; link?: string | null; ref: string }): Promise<SendResult> {
  const t = await pageToken(env, pageId);
  if (!t) return { ok: false, error: "The Facebook Page is not connected. Click Connect Facebook." };
  const at = { published: "false", scheduled_publish_time: String(Math.floor(opts.when)) };
  const kind = opts.imageUrl ? "photo" : "text";
  const r = opts.imageUrl
    ? await graph<{ id: string; post_id?: string }>("POST", `/${t.fbId}/photos`, t.token, { url: opts.imageUrl, caption: opts.caption, ...at })
    : await graph<{ id: string; post_id?: string }>("POST", `/${t.fbId}/feed`, t.token, { message: opts.caption, ...(opts.link ? { link: opts.link } : {}), ...at });
  if (!r.ok) {
    await markToken(env, pageId, r.error);
    await log(env, { page: pageId, ref: opts.ref, action: `schedule ${kind}`, status: r.error.status, code: r.error.code, result: r.error.message });
    return { ok: false, error: explain(r.error) };
  }
  const id = r.data.post_id ?? r.data.id;
  await log(env, { page: pageId, ref: opts.ref, action: `schedule ${kind}`, request: `${kind} at ${new Date(opts.when * 1000).toISOString()}`, status: 200, result: `ok id=${id}` });
  return { ok: true, id };
}

/** Largest Reel video we pass on (the Worker reads the whole upload; Workers accept up to 100 MB). */
export const REEL_MAX_BYTES = 90 * 1024 * 1024;

/**
 * Schedules a Reel with Meta's Reels API: start an upload session, send the video bytes to
 * rupload.facebook.com, then finish with video_state SCHEDULED. The video is not stored here.
 */
export async function scheduleReel(env: SocialEnv, pageId: number, opts: { caption: string; when: number; video: File; ref: string }): Promise<SendResult> {
  const t = await pageToken(env, pageId);
  if (!t) return { ok: false, error: "The Facebook Page is not connected. Click Connect Facebook." };
  const fail = async (step: string, e: FbError) => {
    await markToken(env, pageId, e);
    await log(env, { page: pageId, ref: opts.ref, action: "schedule reel", request: step, status: e.status, code: e.code, result: e.message });
    return { ok: false as const, error: explain(e) };
  };
  const start = await graph<{ video_id: string; upload_url?: string }>("POST", `/${t.fbId}/video_reels`, t.token, { upload_phase: "start" });
  if (!start.ok) return fail("start", start.error);
  const videoId = start.data.video_id;
  let up: Response;
  try {
    up = await fetch(start.data.upload_url ?? `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${videoId}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${t.token}`, offset: "0", file_size: String(opts.video.size), "Content-Type": "application/octet-stream" },
      body: await opts.video.arrayBuffer(),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    return fail("upload", { message: `Video upload to Facebook did not finish (${e instanceof Error ? e.name : "network"})`, status: 0 });
  }
  const upJson = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } };
  if (!up.ok || upJson.success === false) return fail("upload", { message: upJson.debug_info?.message ?? `Video upload failed (HTTP ${up.status})`, status: up.status });
  const finish = await graph<{ success?: boolean }>("POST", `/${t.fbId}/video_reels`, t.token, {
    upload_phase: "finish", video_id: videoId, video_state: "SCHEDULED", scheduled_publish_time: String(Math.floor(opts.when)), description: opts.caption,
  });
  if (!finish.ok) return fail("finish", finish.error);
  await log(env, { page: pageId, ref: opts.ref, action: "schedule reel", request: `reel at ${new Date(opts.when * 1000).toISOString()} (${Math.round(opts.video.size / 1024 / 1024)} MB)`, status: 200, result: `ok id=${videoId}` });
  return { ok: true, id: videoId };
}

export type ScheduledPost = { id: string; message?: string; scheduled_publish_time?: number; permalink_url?: string };

/** Posts waiting in Facebook's own schedule for this Page (including ones made by hand in Business Suite). */
export async function scheduledOnFacebook(env: SocialEnv, pageId: number): Promise<{ ok: true; posts: ScheduledPost[] } | { ok: false; error: string }> {
  const t = await pageToken(env, pageId);
  if (!t) return { ok: false, error: "Not connected." };
  const r = await graph<{ data: ScheduledPost[] }>("GET", `/${t.fbId}/scheduled_posts`, t.token, { fields: "id,message,scheduled_publish_time,permalink_url", limit: "100" });
  if (!r.ok) { await markToken(env, pageId, r.error); return { ok: false, error: explain(r.error) }; }
  return { ok: true, posts: r.data.data };
}

/** Deletes a scheduled post. Facebook only lets the app delete posts the app created. */
export async function cancelPost(env: SocialEnv, pageId: number, postId: string): Promise<SendResult> {
  if (!/^[\d_]{5,60}$/.test(postId)) return { ok: false, error: "Bad post id." };
  const t = await pageToken(env, pageId);
  if (!t) return { ok: false, error: "Not connected." };
  const r = await graph<{ success: boolean }>("DELETE", `/${postId}`, t.token);
  await log(env, { page: pageId, ref: postId, action: "cancel", request: "delete scheduled post", status: r.ok ? 200 : r.error.status, code: r.ok ? null : r.error.code, result: r.ok ? "deleted" : r.error.message });
  if (!r.ok) return { ok: false, error: explain(r.error) };
  return { ok: true, id: postId };
}

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { AdminError, adminOriginAllowed, authenticate, canMutateAdmin, canonicalOrigin, checkCsrf, csrfToken, type AdminEnv, type AdminUser } from "./security";
import { esc, page } from "./ui";
import { blogCaption, fbLibrary, fbRotation, type FbCategory } from "./fb-library";
import { insights } from "../insights";
import {
  CALLBACK_PATH, cancelPost, checkTime, connectWithCode, disconnect, loginUrl, mainPage, recentLog,
  schedulePost, scheduledOnFacebook, setupMissing, type SocialEnv, type SocialPage,
} from "./fb-social";

// FB Posts (Em, 2026-11-24): a 10-day Facebook posting plan in the admin.
// - One automatic post a day at 7 PM Manila, rotating Learning, Rates, Importing, Blog, Tip,
//   Business and Rate comparison posts from the post library (lib/admin/fb-library.ts) and the Blog.
// - Em can add her own post (Canva image + caption + date/time); it replaces that day's auto post.
// - "Schedule all" sends every planned post to Facebook's own schedule (Graph API), so posts go
//   out even if nobody opens the admin. Facebook allows up to 30 days ahead.

type Env = AdminEnv & SocialEnv;
type PostRow = {
  id: string; post_date: string; post_time: string; kind: "auto" | "own"; topic: string | null; category: string;
  title: string; caption: string; image_path: string | null; image_id: string | null; link: string | null;
  status: "planned" | "scheduled" | "posted" | "skipped" | "failed"; replaced: number; fb_post_id: string | null; error: string | null;
};

const path = "/admin/fb-posts";
export const PLAN_DAYS = 10;
export const DEFAULT_TIME = "19:00";
const validId = (v: string) => /^[\da-f-]{36}$/i.test(v);
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ---------- Manila time (UTC+8, no daylight saving) ----------

const MANILA = 8 * 3600_000;
export const manilaDate = (ms = Date.now()) => new Date(ms + MANILA).toISOString().slice(0, 10);
export const unixFor = (date: string, time: string) => {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d, h, mi) - MANILA) / 1000);
};
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400_000);
const niceDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const niceTime = (time: string) => { const [h, m] = time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

/** First plan day: today if 7 PM is still more than 15 minutes away, else tomorrow. */
export function planStart(nowMs = Date.now()) {
  const today = manilaDate(nowMs);
  return unixFor(today, DEFAULT_TIME) - 15 * 60 > nowMs / 1000 ? today : addDays(today, 1);
}

// ---------- content choice ----------

type Choice = { topic: string; category: FbCategory; title: string; caption: string; image_path: string | null; link: string | null };

async function blogChoices(env: Env, origin: string): Promise<Choice[]> {
  const seen = new Set<string>();
  const list: Choice[] = [];
  const add = (slug: string, title: string, description: string) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    const url = `${origin}/insights/${slug}`;
    list.push({ topic: `blog:${slug}`, category: "Blog", title, caption: blogCaption(title, description, url), image_path: null, link: url });
  };
  try {
    const rows = (await env.ADMIN_DB.prepare("SELECT slug,title,body FROM insights WHERE status='Published' ORDER BY published_at DESC").all<{ slug: string; title: string; body: string }>()).results;
    for (const r of rows) add(r.slug, r.title, r.body.replace(/\s+/g, " ").trim().slice(0, 160).replace(/\s\S*$/, "") + "…");
  } catch { /* the Blog table is optional here */ }
  for (const i of insights) add(i.slug, i.title, i.description);
  return list;
}

const libraryChoices = (category: FbCategory): Choice[] =>
  fbLibrary.filter((i) => i.category === category).map((i) => ({ topic: i.key, category: i.category, title: i.headline, caption: i.caption, image_path: `/fb-cards/${i.key}.jpg`, link: null }));

/** The least-used post of a type (ties: library order), skipping `except`. */
async function pickPost(env: Env, origin: string, category: FbCategory, except: string[] = []): Promise<Choice | null> {
  const options = (category === "Blog" ? await blogChoices(env, origin) : libraryChoices(category)).filter((c) => !except.includes(c.topic));
  if (!options.length) return null;
  const used = new Map((await env.ADMIN_DB.prepare("SELECT topic,COUNT(*) AS n,MAX(post_date) AS last FROM fb_posts WHERE topic IS NOT NULL GROUP BY topic").all<{ topic: string; n: number; last: string }>()).results.map((r) => [r.topic, r]));
  return [...options].sort((a, b) => (used.get(a.topic)?.n ?? 0) - (used.get(b.topic)?.n ?? 0) || (used.get(a.topic)?.last ?? "").localeCompare(used.get(b.topic)?.last ?? ""))[0];
}

/** Fills every plan day that has no post yet, and marks past scheduled posts as posted. */
export async function ensurePlan(env: Env, origin: string, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString();
  await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='posted',updated_at=? WHERE status='scheduled' AND (post_date || ' ' || post_time) < ?").bind(now, new Date(nowMs + MANILA).toISOString().slice(0, 16).replace("T", " ")).run();
  const start = planStart(nowMs);
  const dates = Array.from({ length: PLAN_DAYS }, (_, i) => addDays(start, i));
  const taken = new Set((await env.ADMIN_DB.prepare("SELECT DISTINCT post_date FROM fb_posts WHERE post_date >= ? AND post_date <= ?").bind(dates[0], dates[dates.length - 1]).all<{ post_date: string }>()).results.map((r) => r.post_date));
  for (const date of dates) {
    if (taken.has(date)) continue;
    let choice: Choice | null = null;
    for (let step = 0; step < fbRotation.length && !choice; step += 1) choice = await pickPost(env, origin, fbRotation[(dayNumber(date) + step) % fbRotation.length]);
    if (!choice) continue;
    await env.ADMIN_DB.prepare("INSERT INTO fb_posts (id,post_date,post_time,kind,topic,category,title,caption,image_path,link,status,created_at,updated_at) VALUES (?,?,?,'auto',?,?,?,?,?,?,'planned',?,?)")
      .bind(randomUUID(), date, DEFAULT_TIME, choice.topic, choice.category, choice.title, choice.caption, choice.image_path, choice.link, now, now).run();
  }
}

// ---------- helpers ----------

async function audit(env: Env, user: AdminUser, action: string, id: string, notes: string) {
  try {
    await env.ADMIN_DB.prepare("INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,NULL,NULL,?,?)")
      .bind(randomUUID(), user.id, action, "fb_post", id, notes.slice(0, 500), new Date().toISOString()).run();
  } catch { /* the activity log never blocks posting */ }
}

const absolute = (origin: string, p: string | null) => (p ? new URL(p, origin).toString() : null);

async function sendToFacebook(env: Env, origin: string, pg: SocialPage | null, row: PostRow): Promise<string | null> {
  if (!pg) return "Connect Facebook first.";
  const when = unixFor(row.post_date, row.post_time);
  const timeError = checkTime(when);
  if (timeError) return `${niceDate(row.post_date)} ${niceTime(row.post_time)}: ${timeError}`;
  const r = await schedulePost(env, pg.id, { caption: row.caption, when, imageUrl: absolute(origin, row.image_path), link: row.link, ref: row.id });
  const now = new Date().toISOString();
  if (r.ok) await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='scheduled',fb_post_id=?,error=NULL,updated_at=? WHERE id=?").bind(r.id, now, row.id).run();
  else await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='failed',error=?,updated_at=? WHERE id=?").bind(r.error.slice(0, 500), now, row.id).run();
  return r.ok ? null : r.error;
}

/** Takes a scheduled post back off Facebook (before an edit, skip or delete). */
async function pullBack(env: Env, pg: SocialPage | null, row: PostRow): Promise<string | null> {
  if (row.status !== "scheduled" || !row.fb_post_id) return null;
  if (!pg) return "Connect Facebook first.";
  const r = await cancelPost(env, pg.id, row.fb_post_id);
  if (!r.ok) return `Could not take it off Facebook: ${r.error}`;
  await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='planned',fb_post_id=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), row.id).run();
  row.status = "planned"; row.fb_post_id = null;
  return null;
}

function isImage(file: File) {
  // JPEG or PNG only: Facebook reads both everywhere.
  return ["image/jpeg", "image/png"].includes(file.type) && file.size > 0 && file.size <= 1_900_000;
}

async function saveImage(env: Env, file: File) {
  if (!isImage(file)) throw new AdminError("Upload a JPEG or PNG image under 1.9 MB.");
  const id = randomUUID();
  // Same table as Blog covers: served publicly at /api/insights/images/<id>, which Facebook downloads.
  await env.ADMIN_DB.prepare("INSERT INTO insight_images (id,data,mime_type,created_at) VALUES (?,?,?,?)").bind(id, await file.arrayBuffer(), file.type, new Date().toISOString()).run();
  return id;
}

const back = (user: AdminUser, query: string) => page("FB Posts", "", user.name, 303, { Location: `${path}${query ? `?${query}` : ""}` }, true);
const msg = (kind: "ok" | "err", text: string) => `${kind}=${encodeURIComponent(text.slice(0, 300))}`;

// ---------- page ----------

const CSS = `<style>
.fbp-top{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.fbp-conn{display:flex;align-items:center;gap:10px;font-weight:700}.fbp-dot{width:12px;height:12px;border-radius:50%;background:#c7372f}.fbp-dot.ok{background:#69BE28}
.fbp-list{display:grid;gap:14px}
.fbp-card{display:grid;grid-template-columns:132px minmax(0,1fr);gap:18px;background:#fff;border:1px solid #c6dce9;border-radius:20px;padding:16px}
.fbp-card.is-skipped{opacity:.55}.fbp-card.is-own{border-color:#69BE28;box-shadow:0 0 0 2px #e3f5ea inset}
.fbp-thumb{width:132px;height:165px;border-radius:12px;object-fit:cover;background:#e7f4fc;display:flex;align-items:center;justify-content:center;text-align:center;color:#0649A8;font-weight:700;font-size:.85rem;padding:8px}
.fbp-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
.fbp-when{font-weight:800;color:#0A2F86}
.fbp-badge{display:inline-block;font-size:.75rem;font-weight:700;padding:2px 10px;border-radius:999px;background:#e7f4fc;color:#0649A8}
.fbp-badge.s-scheduled,.fbp-badge.s-posted{background:#e3f5ea;color:#1d6b3a}.fbp-badge.s-failed{background:#fde8e6;color:#a1261d}.fbp-badge.s-skipped{background:#eee;color:#555}.fbp-badge.own{background:#69BE28;color:#fff}
.fbp-title{font-weight:800;margin:2px 0 4px}
.fbp-caption{white-space:pre-wrap;color:#466177;font-size:.92rem;max-height:6.2em;overflow:hidden}
.fbp-err{color:#a1261d;font-size:.9rem;margin:6px 0 0}
.fbp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.fbp-actions form{margin:0}
.fbp-actions button,.fbp-actions summary{font-size:.9rem;padding:7px 14px;border-radius:7px}
.fbp-actions .light,.fbp-actions summary{background:#fff;color:#0753ad;border:1px solid #94b3c7;cursor:pointer;list-style:none;display:inline-block}
.fbp-actions summary::-webkit-details-marker{display:none}
.fbp-edit{flex-basis:100%}.fbp-edit[open] summary{margin-bottom:10px}
.fbp-edit form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fbp-edit textarea{min-height:220px}
.fbp-new{background:#fff;border:2px solid #69BE28;border-radius:20px;padding:0;margin-bottom:20px}
.fbp-new>summary{list-style:none;cursor:pointer;font-weight:800;padding:16px 22px;color:#1d6b3a}.fbp-new>summary::-webkit-details-marker{display:none}
.fbp-new form{padding:0 22px 22px}
.fbp-mix{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
@media(max-width:600px){.fbp-card{grid-template-columns:84px minmax(0,1fr);gap:12px;padding:12px}.fbp-thumb{width:84px;height:105px}.fbp-edit form{grid-template-columns:1fr}}
</style>`;

function postCard(row: PostRow, csrf: string, canWrite: boolean, connected: boolean) {
  const hidden = `<input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${esc(row.id)}">`;
  const button = (action: string, label: string, light = false) => `<form method="post" action="${path}">${hidden}<button name="action" value="${action}"${light ? ' class="light"' : ""}>${label}</button></form>`;
  const thumb = row.image_path ? `<img class="fbp-thumb" src="${esc(row.image_path)}" alt="" loading="lazy">` : `<div class="fbp-thumb">🔗 Blog link<br>Facebook shows the article preview</div>`;
  const statusLabel = { planned: "Planned", scheduled: "On Facebook ✓", posted: "Posted", skipped: row.replaced ? "Replaced by your post" : "Skipped", failed: "Not scheduled" }[row.status];
  const open = row.status === "planned" || row.status === "failed" || row.status === "scheduled";
  let actions = "";
  if (canWrite && open) {
    actions += row.status !== "scheduled" && connected ? button("schedule", "Schedule") : "";
    actions += row.kind === "auto" ? button("swap", "Different post", true) : "";
    actions += row.kind === "own" ? button("delete", "Delete", true) : button("skip", "Skip this day", true);
    actions += `<details class="fbp-edit"><summary>Edit caption / time</summary><form method="post" action="${path}" enctype="multipart/form-data" data-fb-post-form>${hidden}
      <label>Date<input type="date" name="post_date" value="${esc(row.post_date)}" required></label>
      <label>Time<input type="time" name="post_time" value="${esc(row.post_time)}" required></label>
      <label class="wide">Caption<textarea name="caption" maxlength="5000" required>${esc(row.caption)}</textarea></label>
      <label class="wide">Use a different image (optional)<input type="file" name="image" accept="image/jpeg,image/png" data-fb-post-image><small class="muted" style="display:block">For example your own design from Canva. It replaces the picture shown on the left.</small></label>
      <p class="wide muted" style="margin:0">${row.status === "scheduled" ? "This post is already on Facebook. Saving takes it off and schedules it again with your changes." : "Saved changes stay here until you click Schedule."}</p>
      <p class="wide" style="margin:0"><button name="action" value="save">Save changes</button></p></form></details>`;
  } else if (canWrite && row.status === "skipped" && !row.replaced) {
    actions += button("undo", "Undo skip", true);
  }
  return `<article class="fbp-card${row.status === "skipped" ? " is-skipped" : ""}${row.kind === "own" ? " is-own" : ""}">${thumb}<div>
    <div class="fbp-meta"><span class="fbp-when">${esc(niceDate(row.post_date))} · ${esc(niceTime(row.post_time))}</span><span class="fbp-badge${row.kind === "own" ? " own" : ""}">${esc(row.kind === "own" ? "Your post" : row.category)}</span><span class="fbp-badge s-${row.status}">${esc(statusLabel)}</span></div>
    ${row.kind === "own" ? "" : `<div class="fbp-title">${esc(row.title)}</div>`}<div class="fbp-caption">${esc(row.caption)}</div>
    ${row.status === "failed" && row.error ? `<p class="fbp-err">${esc(row.error)}</p>` : ""}
    <div class="fbp-actions">${actions}</div></div></article>`;
}

function newPostForm(csrf: string, connected: boolean) {
  const start = planStart();
  return `<details class="fbp-new"><summary>+ New post (your own image and caption)</summary><form method="post" action="${path}" enctype="multipart/form-data" class="grid" data-fb-post-form>
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    <label class="wide">Image (from Canva or your phone)<input type="file" name="image" accept="image/jpeg,image/png" data-fb-post-image><small class="muted" style="display:block">Best size 1080 × 1350 or 1080 × 1080. Big images are made smaller in your browser before upload. Leave empty for a text-only post.</small></label>
    <label class="wide">Caption *<textarea name="caption" maxlength="5000" required placeholder="Write your caption. Short lines, 1 or 2 emojis, and a link to kargodoorph.com/rates-calculator work best."></textarea></label>
    <label>Date<input type="date" name="post_date" value="${esc(start)}" min="${esc(manilaDate())}" required></label>
    <label>Time (Manila)<input type="time" name="post_time" value="${DEFAULT_TIME}" required></label>
    <p class="wide muted" style="margin:0">Your post replaces that day's automatic post. The automatic post comes back if you delete yours.</p>
    <p class="wide actions" style="margin:0">${connected ? '<button name="action" value="new_schedule">Save and schedule on Facebook</button><button name="action" value="new" class="light" style="background:#fff;color:#0753ad;border:1px solid #94b3c7">Save only</button>' : '<button name="action" value="new">Save post</button>'}</p>
  </form></details>`;
}

async function listingPage(env: Env, user: AdminUser, url: URL, origin: string) {
  const canWrite = canMutateAdmin(user);
  const csrf = csrfToken(env, user.id, path);
  if (canWrite) await ensurePlan(env, origin);
  const missing = setupMissing(env);
  const pg = missing.length ? null : await mainPage(env);
  const connected = !!pg && pg.token_status === "ok";
  const today = manilaDate();
  const rows = (await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE post_date >= ? ORDER BY post_date, post_time, kind DESC").bind(today).all<PostRow>()).results;
  const toSchedule = rows.filter((r) => (r.status === "planned" || r.status === "failed") && unixFor(r.post_date, r.post_time) > Date.now() / 1000 + 15 * 60).length;
  const notice = url.searchParams.get("ok") ? `<p class="notice">${esc(url.searchParams.get("ok"))}</p>` : url.searchParams.get("err") ? `<p class="notice" style="background:#fde8e6;border-color:#e8a19b">${esc(url.searchParams.get("err"))}</p>` : "";

  const connection = missing.length
    ? `<div class="fbp-conn"><span class="fbp-dot"></span>Facebook not set up yet</div><p class="muted" style="margin:6px 0 0">Waiting for: ${esc(missing.join(", "))} (Meta app settings and Cloudflare secrets).</p>`
    : pg
      ? `<div class="fbp-conn"><span class="fbp-dot${connected ? " ok" : ""}"></span>${connected ? `Connected to ${esc(pg.name)}` : `${esc(pg.name)}: login expired`}</div>`
      : `<div class="fbp-conn"><span class="fbp-dot"></span>Facebook not connected</div>`;
  const connectButton = !missing.length && canWrite ? `<a class="button" href="${path}?connect=1">${pg ? "Reconnect Facebook" : "Connect Facebook"}</a>` : "";
  const scheduleAll = canWrite && connected && toSchedule ? `<form method="post" action="${path}" style="margin:0"><input type="hidden" name="csrf" value="${esc(csrf)}"><button name="action" value="schedule_all">Schedule all ${toSchedule} on Facebook</button></form>` : "";

  let onFacebook = "";
  if (connected && pg) {
    const live = await scheduledOnFacebook(env, pg.id);
    onFacebook = live.ok
      ? live.posts.length
        ? `<div class="table"><table><thead><tr><th>When (Manila)</th><th>Post</th><th></th></tr></thead><tbody>${live.posts.sort((a, b) => (a.scheduled_publish_time ?? 0) - (b.scheduled_publish_time ?? 0)).map((p) => {
          const at = p.scheduled_publish_time ? new Date(p.scheduled_publish_time * 1000) : null;
          const when = at ? `${niceDate(manilaDate(at.getTime()))} · ${niceTime(new Date(at.getTime() + MANILA).toISOString().slice(11, 16))}` : "—";
          return `<tr><td>${esc(when)}</td><td>${esc((p.message ?? "").slice(0, 110))}${(p.message ?? "").length > 110 ? "…" : ""}</td><td>${canWrite ? `<form method="post" action="${path}" style="margin:0"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="fb_post_id" value="${esc(p.id)}"><button name="action" value="cancel_fb" style="background:#fff;color:#a1261d;border:1px solid #e8a19b;padding:6px 12px">Cancel</button></form>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`
        : `<p class="muted">Nothing waiting on Facebook yet. Click "Schedule all" above.</p>`
      : `<p class="notice">${esc(live.error)}</p>`;
  }

  const mix = fbRotation.map((c) => `<span class="fbp-badge">${esc(c)}</span>`).join("");
  const log = connected || pg ? (await recentLog(env, 12)) : [];
  const body = `${CSS}${notice}
  <section><div class="fbp-top"><div>${connection}</div><div class="actions" style="margin:0">${scheduleAll}${connectButton}</div></div>
  <p class="muted" style="margin:12px 0 0">One post a day at 7:00 PM for the next ${PLAN_DAYS} days, made for you. Check the captions, change anything you like, then click Schedule all. Facebook posts them even if nobody opens the admin.</p>
  <div class="fbp-mix">${mix}</div></section>
  ${canWrite ? newPostForm(csrf, connected) : ""}
  <section><h2>Next ${PLAN_DAYS} days</h2><div class="fbp-list">${rows.length ? rows.map((r) => postCard(r, csrf, canWrite, connected)).join("") : '<p class="muted">No posts planned.</p>'}</div></section>
  ${connected ? `<section><h2>On Facebook now</h2><p class="muted">Everything waiting in the Page's Facebook schedule, including posts made in Business Suite. Cancel works only for posts made here.</p>${onFacebook}</section>` : ""}
  ${pg ? `<details class="admin-collapsible card"><summary>Facebook activity (last ${log.length})</summary><section><div class="table"><table><thead><tr><th>Time (UTC)</th><th>Action</th><th>Result</th></tr></thead><tbody>${log.map((l) => `<tr><td>${esc(l.created_at)}</td><td>${esc(l.action)}${l.request ? `<br><small class="muted">${esc(l.request)}</small>` : ""}</td><td>${esc(l.result ?? "")}</td></tr>`).join("")}</tbody></table></div>${canWrite ? `<form method="post" action="${path}" class="actions"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="page_id" value="${pg.id}"><button name="action" value="disconnect" style="background:#fff;color:#a1261d;border:1px solid #e8a19b">Disconnect Facebook</button></form>` : ""}</section></details>` : ""}
  <script src="/admin-image-shrink.js" defer></script><script src="/admin-fb-posts.js" defer></script>`;
  return page("FB Posts", body, user.name, 200, {}, canWrite);
}

// ---------- actions ----------

async function handlePost(env: Env, user: AdminUser, request: Request, origin: string) {
  if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
  const form = await request.formData();
  checkCsrf(env, user.id, path, String(form.get("csrf") ?? ""));
  const action = String(form.get("action") ?? "");
  const pg = setupMissing(env).length ? null : await mainPage(env);
  const now = new Date().toISOString();

  if (action === "disconnect") {
    const pageId = Number(form.get("page_id"));
    if (Number.isInteger(pageId) && pageId > 0) await disconnect(env, pageId);
    await audit(env, user, "fb posts: disconnected facebook", String(pageId), "");
    return back(user, msg("ok", "Facebook disconnected. Posts already on Facebook stay scheduled."));
  }

  if (action === "cancel_fb") {
    const fbId = String(form.get("fb_post_id") ?? "");
    if (!pg) return back(user, msg("err", "Connect Facebook first."));
    const r = await cancelPost(env, pg.id, fbId);
    if (!r.ok) return back(user, msg("err", r.error));
    await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='planned',fb_post_id=NULL,updated_at=? WHERE fb_post_id=?").bind(now, fbId).run();
    await audit(env, user, "fb posts: cancelled on facebook", fbId, "");
    return back(user, msg("ok", "Cancelled on Facebook. If it was planned here, it is back to Planned."));
  }

  if (action === "schedule_all") {
    const rows = (await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE status IN ('planned','failed') AND post_date >= ? ORDER BY post_date, post_time").bind(manilaDate()).all<PostRow>()).results
      .filter((r) => unixFor(r.post_date, r.post_time) > Date.now() / 1000 + 15 * 60);
    let done = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const e = await sendToFacebook(env, origin, pg, row);
      if (e) errors.push(e); else done += 1;
      if (e && /rate limit|expired|Connect Facebook/i.test(e)) break;
    }
    await audit(env, user, "fb posts: schedule all", String(done), errors.join(" | "));
    return back(user, errors.length ? msg("err", `${done} scheduled. ${errors.length} not scheduled: ${errors[0]}`) : msg("ok", `${done} post${done === 1 ? "" : "s"} scheduled on Facebook.`));
  }

  if (action === "new" || action === "new_schedule") {
    const caption = String(form.get("caption") ?? "").trim().slice(0, 5000);
    const date = String(form.get("post_date") ?? ""), time = String(form.get("post_time") ?? "");
    if (!caption) throw new AdminError("Write a caption.");
    if (!validDate(date) || !validTime(time)) throw new AdminError("Pick a date and time.");
    const image = form.get("image");
    const imageId = image instanceof File && image.size ? await saveImage(env, image) : null;
    const id = randomUUID();
    const title = caption.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "Your post";
    // Her post replaces the automatic post of that day (taken off Facebook first if it was scheduled).
    const autos = (await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE post_date=? AND kind='auto' AND status IN ('planned','scheduled','failed')").bind(date).all<PostRow>()).results;
    for (const a of autos) {
      const e = await pullBack(env, pg, a);
      if (e) return back(user, msg("err", e));
      await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='skipped',replaced=1,updated_at=? WHERE id=?").bind(now, a.id).run();
    }
    await env.ADMIN_DB.prepare("INSERT INTO fb_posts (id,post_date,post_time,kind,topic,category,title,caption,image_path,image_id,status,created_at,updated_at) VALUES (?,?,?,'own',NULL,'Own',?,?,?,?,'planned',?,?)")
      .bind(id, date, time, title, caption, imageId ? `/api/insights/images/${imageId}` : null, imageId, now, now).run();
    await audit(env, user, "fb posts: new post", id, `${date} ${time}`);
    if (action === "new_schedule") {
      const row = await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE id=?").bind(id).first<PostRow>();
      const e = row ? await sendToFacebook(env, origin, pg, row) : "Post not found.";
      return back(user, e ? msg("err", `Saved, but not scheduled: ${e}`) : msg("ok", "Your post is saved and scheduled on Facebook."));
    }
    return back(user, msg("ok", "Your post is saved. Click Schedule when it is ready."));
  }

  const id = String(form.get("id") ?? "");
  const row = validId(id) ? await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE id=?").bind(id).first<PostRow>() : null;
  if (!row) throw new AdminError("Post not found.", 404);

  if (action === "schedule") {
    const e = await sendToFacebook(env, origin, pg, row);
    await audit(env, user, "fb posts: schedule", row.id, e ?? "ok");
    return back(user, e ? msg("err", e) : msg("ok", `Scheduled for ${niceDate(row.post_date)}, ${niceTime(row.post_time)}.`));
  }

  if (action === "save") {
    const caption = String(form.get("caption") ?? "").trim().slice(0, 5000);
    const date = String(form.get("post_date") ?? ""), time = String(form.get("post_time") ?? "");
    if (!caption) throw new AdminError("Write a caption.");
    if (!validDate(date) || !validTime(time)) throw new AdminError("Pick a date and time.");
    const wasScheduled = row.status === "scheduled";
    const e = await pullBack(env, pg, row);
    if (e) return back(user, msg("err", e));
    const image = form.get("image");
    let imagePath = row.image_path, imageId = row.image_id;
    if (image instanceof File && image.size) {
      const newId = await saveImage(env, image);
      if (row.image_id) await env.ADMIN_DB.prepare("DELETE FROM insight_images WHERE id=?").bind(row.image_id).run();
      imageId = newId; imagePath = `/api/insights/images/${newId}`;
    }
    await env.ADMIN_DB.prepare("UPDATE fb_posts SET caption=?,post_date=?,post_time=?,image_path=?,image_id=?,status=CASE WHEN status='failed' THEN 'planned' ELSE status END,error=NULL,updated_at=? WHERE id=?")
      .bind(caption, date, time, imagePath, imageId, now, row.id).run();
    await audit(env, user, "fb posts: edit", row.id, `${date} ${time}`);
    if (wasScheduled) {
      const fresh = await env.ADMIN_DB.prepare("SELECT * FROM fb_posts WHERE id=?").bind(row.id).first<PostRow>();
      const err = fresh ? await sendToFacebook(env, origin, pg, fresh) : "Post not found.";
      return back(user, err ? msg("err", `Saved, but not scheduled again: ${err}`) : msg("ok", "Saved and scheduled again on Facebook."));
    }
    return back(user, msg("ok", "Changes saved."));
  }

  if (action === "swap") {
    if (row.kind !== "auto") throw new AdminError("Only automatic posts can be swapped.");
    // Prefer a post that is not already in the coming days, so "Different post" does not bounce back.
    const inPlan = (await env.ADMIN_DB.prepare("SELECT DISTINCT topic FROM fb_posts WHERE topic IS NOT NULL AND post_date >= ? AND status != 'skipped'").bind(manilaDate()).all<{ topic: string }>()).results.map((r) => r.topic);
    const choice = (await pickPost(env, origin, row.category as FbCategory, [...inPlan, row.topic ?? ""])) ?? (await pickPost(env, origin, row.category as FbCategory, row.topic ? [row.topic] : []));
    if (!choice) return back(user, msg("err", "No other post of this type yet."));
    const e = await pullBack(env, pg, row);
    if (e) return back(user, msg("err", e));
    await env.ADMIN_DB.prepare("UPDATE fb_posts SET topic=?,title=?,caption=?,image_path=?,link=?,status='planned',error=NULL,updated_at=? WHERE id=?")
      .bind(choice.topic, choice.title, choice.caption, choice.image_path, choice.link, now, row.id).run();
    return back(user, msg("ok", `Changed to: ${choice.title}${row.status === "scheduled" ? ". It was taken off Facebook; click Schedule again." : ""}`));
  }

  if (action === "skip") {
    const e = await pullBack(env, pg, row);
    if (e) return back(user, msg("err", e));
    await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='skipped',updated_at=? WHERE id=?").bind(now, row.id).run();
    await audit(env, user, "fb posts: skip", row.id, row.post_date);
    return back(user, msg("ok", `${niceDate(row.post_date)} skipped. No automatic post that day.`));
  }

  if (action === "undo") {
    if (row.status !== "skipped" || row.replaced) throw new AdminError("This post cannot be restored.");
    await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='planned',updated_at=? WHERE id=?").bind(now, row.id).run();
    return back(user, msg("ok", "Back in the plan. Click Schedule to send it to Facebook."));
  }

  if (action === "delete") {
    if (row.kind !== "own") throw new AdminError("Automatic posts are skipped, not deleted.");
    const e = await pullBack(env, pg, row);
    if (e) return back(user, msg("err", e));
    await env.ADMIN_DB.prepare("DELETE FROM fb_posts WHERE id=?").bind(row.id).run();
    if (row.image_id) await env.ADMIN_DB.prepare("DELETE FROM insight_images WHERE id=?").bind(row.image_id).run();
    // The automatic post comes back when no other own post is left that day.
    const others = await env.ADMIN_DB.prepare("SELECT COUNT(*) AS n FROM fb_posts WHERE post_date=? AND kind='own'").bind(row.post_date).first<{ n: number }>();
    if (!others?.n) await env.ADMIN_DB.prepare("UPDATE fb_posts SET status='planned',replaced=0,updated_at=? WHERE post_date=? AND kind='auto' AND replaced=1").bind(now, row.post_date).run();
    await audit(env, user, "fb posts: delete own post", row.id, row.post_date);
    return back(user, msg("ok", "Your post was deleted."));
  }

  throw new AdminError("Unknown action.");
}

// ---------- routes ----------

async function context(request: Request) {
  const { env: cf } = await getCloudflareContext();
  const env = cf as unknown as Env;
  const user = await authenticate(request, env);
  const url = new URL(request.url);
  if (!adminOriginAllowed(env, url.origin)) throw new AdminError("Admin request origin is invalid.", 403);
  // Facebook downloads card images from the public site, so links use the canonical origin.
  let origin = url.origin;
  try { origin = new URL(canonicalOrigin(env)).origin; } catch { /* local dev */ }
  return { env, user, url, origin };
}

const failure = (error: unknown) => {
  const err = error instanceof AdminError ? error : new AdminError("FB Posts is unavailable. If this is new, the database update may not be applied yet.", 500);
  if (!(error instanceof AdminError)) console.error("fb-posts", error);
  return page("FB Posts", `<p class="notice">${esc(err.message)}</p><p><a href="${path}">Back to FB Posts</a></p>`, "", err.status);
};

export async function fbPostsAdminPage(request: Request) {
  try {
    const { env, user, url, origin } = await context(request);
    if (request.method === "POST") return await handlePost(env, user, request, origin);
    if (url.searchParams.get("connect") === "1") {
      if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
      const missing = setupMissing(env);
      if (missing.length) return back(user, msg("err", `Setup not finished: ${missing.join(", ")}.`));
      return new Response(null, { status: 302, headers: { Location: loginUrl(env, origin, csrfToken(env, user.id, CALLBACK_PATH)), "Cache-Control": "no-store" } });
    }
    return await listingPage(env, user, url, origin);
  } catch (error) {
    return failure(error);
  }
}

export async function fbPostsCallback(request: Request) {
  try {
    const { env, user, url, origin } = await context(request);
    if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
    if (url.searchParams.get("error")) return back(user, msg("err", `Facebook: ${url.searchParams.get("error_description") ?? "login was cancelled."}`));
    checkCsrf(env, user.id, CALLBACK_PATH, url.searchParams.get("state") ?? "");
    const code = url.searchParams.get("code") ?? "";
    if (!code) throw new AdminError("Facebook did not send a login code. Try Connect Facebook again.");
    const r = await connectWithCode(env, origin, code);
    if (!r.ok) return back(user, msg("err", r.error));
    await audit(env, user, "fb posts: connected facebook", r.pages.join(", "), "");
    return back(user, msg("ok", `Connected: ${r.pages.join(", ")}. Now click Schedule all.`));
  } catch (error) {
    return failure(error);
  }
}

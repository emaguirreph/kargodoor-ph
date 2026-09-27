import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { AdminError, adminOriginAllowed, authenticate, canDeleteAdmin, canMutateAdmin, checkCsrf, csrfToken, type AdminEnv } from "./security";
import { esc, page } from "./ui";

type InsightRow = {
  id: string; slug: string; title: string; body: string; cover_image_key: string | null;
  status: "Draft" | "Published"; published_at: string | null; created_at: string; updated_at: string;
};

const path = "/admin/insights";
const validId = (value: string) => /^[\da-f-]{36}$/i.test(value);
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "insight";
const cleanText = (value: FormDataEntryValue | null, maximum: number) => String(value ?? "").trim().slice(0, maximum);

function editor(row: Partial<InsightRow>, csrf: string, canDelete = false) {
  const publishing = row.status === "Published";
  const secondary = row.id ? `<section><h2>Publication controls</h2>${publishing ? `<form method="post" action="${path}" class="actions"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${esc(row.id)}"><button name="action" value="unpublish">Unpublish — keep as draft</button></form><p class="muted">This removes the article from the public Insights page but keeps it in Admin.</p>` : `<p class="muted">This draft is visible only in Admin. Select Published or use Publish now when it is ready.</p>`}${canDelete ? `<details><summary>Delete permanently</summary><p class="muted">This permanently removes the article and its cover image. This cannot be undone.</p><form method="post" action="${path}" class="actions" onsubmit="return confirm('Permanently delete this insight? This cannot be undone.');"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${esc(row.id)}"><input type="hidden" name="action" value="delete"><input type="hidden" name="confirm_delete" value="DELETE"><button>Delete permanently</button></form></details>` : ""}</section>` : "";
  return `<section><div class="actions"><a class="button" href="${path}">Back to Insights</a>${row.slug ? `<a class="button" href="/insights/${esc(row.slug)}" target="_blank" rel="noopener">View public article</a>` : ""}</div><h2>${row.id ? "Edit insight" : "New insight"}</h2><p class="muted">Write the article in plain text. Leave a blank line between paragraphs. Your image is compressed in the browser before upload and shown only with this article.</p><form method="post" action="${path}" enctype="multipart/form-data" class="grid" data-insight-editor><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${esc(row.id ?? "")}"><label class="wide">Title *<input name="title" value="${esc(row.title ?? "")}" maxlength="180" required></label><label class="wide">Article *<textarea name="body" maxlength="50000" required>${esc(row.body ?? "")}</textarea></label><label class="wide">Cover image (optional)<input name="cover_image" type="file" accept="image/jpeg,image/png,image/webp" data-insight-image><span class="muted">JPEG, PNG, or WebP; automatically compressed to WebP before upload.</span></label>${row.cover_image_key ? `<div class="wide"><img src="/api/insights/images/${encodeURIComponent(row.cover_image_key)}" alt="Current cover" style="max-width:280px;max-height:180px;border-radius:8px;display:block"><label><input type="checkbox" name="remove_cover" value="1"> Remove current cover image</label></div>` : ""}<label>Visibility<select name="status"><option value="Draft"${publishing ? "" : " selected"}>Draft — admin only</option><option value="Published"${publishing ? " selected" : ""}>Published — appears on Insights</option></select></label><p class="wide actions"><button name="action" value="save">${row.id ? "Save changes" : "Save draft"}</button><button name="action" value="publish">Publish now</button></p></form></section>${secondary}<script src="/admin-insights.js" defer></script>`;
}

async function uniqueSlug(env: AdminEnv, title: string, id?: string) {
  const base = slugify(title);
  let candidate = base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const existing = await env.ADMIN_DB.prepare("SELECT id FROM insights WHERE slug=?").bind(candidate).first<{ id: string }>();
    if (!existing || existing.id === id) return candidate;
    candidate = `${base}-${suffix}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size > 0 && file.size <= 3 * 1024 * 1024;
}

async function saveImage(env: AdminEnv, file: File) {
  if (!isImage(file)) throw new AdminError("Upload a JPEG, PNG, or WebP image smaller than 3 MB.");
  const id = randomUUID();
  await env.ADMIN_DB.prepare("INSERT INTO insight_images (id,data,mime_type,created_at) VALUES (?,?,?,?)").bind(id, await file.arrayBuffer(), file.type, new Date().toISOString()).run();
  return id;
}

export async function insightsAdminPage(request: Request) {
  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    const url = new URL(request.url);
    if (!adminOriginAllowed(env, url.origin)) throw new AdminError("Admin request origin is invalid.", 403);
    if (request.method === "POST") {
      if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
      const form = await request.formData();
      checkCsrf(env, user.id, path, String(form.get("csrf") ?? ""));
      const id = String(form.get("id") ?? "");
      const existing = id ? await env.ADMIN_DB.prepare("SELECT * FROM insights WHERE id=?").bind(id).first<InsightRow>() : null;
      if (id && (!validId(id) || !existing)) throw new AdminError("Insight not found.", 404);
      const action = String(form.get("action") ?? "save");
      if (action === "unpublish") {
        if (!existing) throw new AdminError("Insight not found.", 404);
        await env.ADMIN_DB.prepare("UPDATE insights SET status='Draft',published_at=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), existing.id).run();
        return page("Insights", "", user.name, 303, { Location: `${path}?id=${existing.id}&saved=1` }, canMutateAdmin(user));
      }
      if (action === "delete") {
        if (!existing) throw new AdminError("Insight not found.", 404);
        if (!canDeleteAdmin(user)) throw new AdminError("Only the owner can permanently delete Insights.", 403);
        if (form.get("confirm_delete") !== "DELETE") throw new AdminError("Confirm permanent deletion before continuing.");
        if (existing.cover_image_key) await env.ADMIN_DB.prepare("DELETE FROM insight_images WHERE id=?").bind(existing.cover_image_key).run();
        await env.ADMIN_DB.prepare("DELETE FROM insights WHERE id=?").bind(existing.id).run();
        return page("Insights", "", user.name, 303, { Location: `${path}?deleted=1` }, canMutateAdmin(user));
      }
      const title = cleanText(form.get("title"), 180), body = cleanText(form.get("body"), 50_000);
      if (!title || !body) throw new AdminError("A title and article are required.");
      const publish = action === "publish" || form.get("status") === "Published";
      const articleId = existing?.id ?? randomUUID();
      const image = form.get("cover_image");
      const uploadedImage = image instanceof File && image.size ? await saveImage(env, image) : null;
      const removeCover = form.get("remove_cover") === "1";
      const coverKey = uploadedImage ?? (removeCover ? null : existing?.cover_image_key ?? null);
      if (removeCover && existing?.cover_image_key && !uploadedImage) await env.ADMIN_DB.prepare("DELETE FROM insight_images WHERE id=?").bind(existing.cover_image_key).run();
      if (uploadedImage && existing?.cover_image_key && existing.cover_image_key !== uploadedImage) await env.ADMIN_DB.prepare("DELETE FROM insight_images WHERE id=?").bind(existing.cover_image_key).run();
      const now = new Date().toISOString(), status = publish ? "Published" : "Draft", slug = await uniqueSlug(env, title, articleId);
      const publishedAt = status === "Published" ? existing?.published_at ?? now : null;
      if (existing) await env.ADMIN_DB.prepare("UPDATE insights SET slug=?,title=?,body=?,cover_image_key=?,status=?,published_at=?,updated_at=? WHERE id=?").bind(slug, title, body, coverKey, status, publishedAt, now, articleId).run();
      else await env.ADMIN_DB.prepare("INSERT INTO insights (id,slug,title,body,cover_image_key,status,published_at,created_by_admin_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(articleId, slug, title, body, coverKey, status, publishedAt, user.id, now, now).run();
      return page("Insights", "", user.name, 303, { Location: `${path}?id=${articleId}&saved=1` }, canMutateAdmin(user));
    }
    const id = url.searchParams.get("id");
    if (id) {
      const row = validId(id) ? await env.ADMIN_DB.prepare("SELECT * FROM insights WHERE id=?").bind(id).first<InsightRow>() : null;
      if (!row) throw new AdminError("Insight not found.", 404);
      return page("Insights", `${url.searchParams.get("saved") === "1" ? '<p class="notice">Insight saved.</p>' : ""}${editor(row, csrfToken(env, user.id, path), canDeleteAdmin(user))}`, user.name, 200, {}, canMutateAdmin(user));
    }
    if (url.searchParams.get("new") === "1") return page("Insights", editor({}, csrfToken(env, user.id, path), canDeleteAdmin(user)), user.name, 200, {}, canMutateAdmin(user));
    const rows = (await env.ADMIN_DB.prepare("SELECT id,slug,title,status,published_at,updated_at FROM insights ORDER BY updated_at DESC").all<Pick<InsightRow, "id" | "slug" | "title" | "status" | "published_at" | "updated_at">>()).results;
    const listing = rows.length ? rows.map((row) => `<tr><td><a href="${path}?id=${esc(row.id)}">${esc(row.title)}</a></td><td>${esc(row.status)}</td><td>${esc(row.published_at || "—")}</td><td>${esc(row.updated_at)}</td><td><a href="${path}?id=${esc(row.id)}">Edit</a>${row.status === "Published" ? ` · <a href="/insights/${esc(row.slug)}" target="_blank" rel="noopener">View</a>` : ""}</td></tr>`).join("") : '<tr><td colspan="5">No Insights yet. Create your first article.</td></tr>';
    return page("Insights", `${url.searchParams.get("deleted") === "1" ? '<p class="notice">Insight permanently deleted.</p>' : ""}<section><div class="actions"><p>Create drafts privately, then publish them when they are ready for the public Insights page.</p>${canMutateAdmin(user) ? `<a class="button" href="${path}?new=1">New insight</a>` : ""}</div><div class="table"><table><thead><tr><th>Title</th><th>Status</th><th>Published</th><th>Last updated</th><th></th></tr></thead><tbody>${listing}</tbody></table></div></section>`, user.name, 200, {}, canMutateAdmin(user));
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("Insights are unavailable.", 500);
    return page("Insights", `<p class="notice">${esc(err.message)}</p>`, "", err.status);
  }
}

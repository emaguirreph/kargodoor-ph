import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  AdminError, adminOriginAllowed, authenticate, canMutateAdmin, checkCsrf, isRestrictedStaff, type AdminEnv, type AdminUser,
} from "./security";
import { esc, hidden, page } from "./ui";
import { detachForm } from "./detached-form";
import { niHaoFileMaxBytes, niHaoFileResponse, sniffNiHaoFile } from "./nihao-details";

/**
 * Proof of payment: the GCash / bank screenshot or PDF for a customer payment
 * or an expense. One file per record, dropped (or chosen) on the record's
 * row; uploading again replaces it. Same file rules as the Ni Hao file.
 */
export const proofPath = "/admin/finance/proof";
export const proofMaxBytes = niHaoFileMaxBytes;
export type ProofKind = "payment" | "expense";
export type ProofInfo = { file_name: string; file_size: number; uploaded_at: string };

const uuid = /^[\da-f-]{36}$/i;
// Where the upload form came from. Its path is also the page the CSRF token was made for.
const backPattern = /^\/admin\/(invoices|shipments|finance\/expenses)(\?[\w=&%.+-]*)?(#[\w-]+)?$/;

export async function readProofs(db: D1Database, kind: ProofKind, ids: string[]) {
  const found = new Map<string, ProofInfo>();
  const wanted = ids.filter((id) => uuid.test(id));
  // D1 allows 100 bound values per statement.
  for (let start = 0; start < wanted.length; start += 90) {
    const chunk = wanted.slice(start, start + 90);
    const { results } = await db.prepare(`SELECT entity_id, file_name, file_size, uploaded_at FROM payment_proofs
      WHERE entity_type = ? AND entity_id IN (${chunk.map(() => "?").join(",")})`)
      .bind(kind, ...chunk).all<ProofInfo & { entity_id: string }>();
    for (const row of results) found.set(row.entity_id, { file_name: row.file_name, file_size: row.file_size, uploaded_at: row.uploaded_at });
  }
  return found;
}

async function checkRecord(db: D1Database, kind: ProofKind, id: string, user: AdminUser) {
  if (!uuid.test(id)) throw new AdminError(kind === "payment" ? "Invalid payment ID." : "Invalid expense ID.");
  if (kind === "payment") {
    if (isRestrictedStaff(user)) throw new AdminError("This account can access only Quotations and Expenses.", 403);
    if (!await db.prepare("SELECT id FROM payments WHERE id = ?").bind(id).first()) throw new AdminError("Payment not found.", 404);
    return;
  }
  const staff = isRestrictedStaff(user);
  const expense = await db.prepare(`SELECT id FROM expenses WHERE id = ?${staff ? " AND created_by_admin_user_id = ?" : ""}`)
    .bind(id, ...(staff ? [user.id] : [])).first();
  if (!expense) throw new AdminError("Expense not found.", 404);
}

export async function saveProof(db: D1Database, kind: ProofKind, id: string, file: File, user: AdminUser) {
  await checkRecord(db, kind, id, user);
  if (!file.size) throw new AdminError("Choose a file to upload.");
  if (file.size > proofMaxBytes) throw new AdminError("The file is over 1.5 MB. Take a smaller screenshot or save the PDF smaller, then upload again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffNiHaoFile(bytes);
  if (!type) throw new AdminError("Upload the proof as a PDF, JPEG, PNG or WebP.");
  const name = file.name.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 120) || "proof";
  const old = await db.prepare("SELECT file_name, file_size FROM payment_proofs WHERE entity_type = ? AND entity_id = ?")
    .bind(kind, id).first<{ file_name: string; file_size: number }>();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO payment_proofs (entity_type, entity_id, file_name, file_mime, file_size, file_data, uploaded_by_admin_user_id, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET file_name = excluded.file_name, file_mime = excluded.file_mime,
        file_size = excluded.file_size, file_data = excluded.file_data,
        uploaded_by_admin_user_id = excluded.uploaded_by_admin_user_id, uploaded_at = excluded.uploaded_at`)
      .bind(kind, id, name, type, bytes.byteLength, bytes, user.id, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), user.id, old ? "proof_replaced" : "proof_uploaded", kind === "payment" ? "payments" : "expenses", id,
        old ? JSON.stringify(old) : null, JSON.stringify({ file_name: name, file_mime: type, file_size: bytes.byteLength }), null, now),
  ]);
}

export async function readProofFile(db: D1Database, kind: ProofKind, id: string) {
  return await db.prepare("SELECT file_name, file_mime, file_data FROM payment_proofs WHERE entity_type = ? AND entity_id = ?")
    .bind(kind, id).first<{ file_name: string; file_mime: string; file_data: ArrayBuffer | Uint8Array | number[] }>();
}

const kb = (size: number) => `${Math.max(1, Math.round(size / 1024)).toLocaleString("en-US")} KB`;

/**
 * The proof drop zone for one payment or expense row. Without formId it holds
 * its own form (for pages with no surrounding form). With formId the form is
 * detached (see detachForm) and `form` must be placed outside the page's form.
 */
export function proofCell(options: { kind: ProofKind; id: string; proof?: ProofInfo | null; csrf: string; canWrite: boolean; back: string; formId?: string }) {
  const { kind, id, proof } = options;
  const view = proof
    ? `<a class="proof-view" href="${proofPath}?type=${kind}&amp;id=${esc(encodeURIComponent(id))}" target="_blank" rel="noopener" title="${esc(proof.file_name)} · ${esc(kb(proof.file_size))}">📄 View proof</a>`
    : options.canWrite ? "" : '<span class="muted">—</span>';
  if (!options.canWrite || !backPattern.test(options.back)) return { inline: view, form: "" };
  const formHtml = `<form method="post" action="${proofPath}" enctype="multipart/form-data">${hidden("csrf", options.csrf)}${hidden("type", kind)}${hidden("id", id)}${hidden("back", options.back)}
    <label class="proof-pick">${proof ? "Replace" : "⬆ Add proof"}<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label>
    <button type="submit" class="proof-upload">Upload</button><span class="proof-status" data-proof-status role="status"></span></form>`;
  const upload = options.formId ? detachForm(formHtml, options.formId) : { inline: formHtml, form: "" };
  return {
    inline: `<div class="proof-drop" data-proof-drop title="Drop a screenshot or PDF here">${view}${upload.inline}</div>`,
    form: upload.form,
  };
}

export const proofCss = `<style>
.proof-drop{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-width:120px;padding:6px 8px;border:1.5px dashed #b8c4d6;border-radius:8px;background:#f8fafc}
.proof-drop form,.proof-drop .detached-form{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}
.proof-drop .proof-pick{position:relative;display:inline-flex;align-items:center;margin:0;font-weight:700;font-size:.9em;color:#1f4f8f;cursor:pointer;white-space:nowrap}
.proof-drop .proof-pick input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
.proof-drop .proof-pick:focus-within{outline:2px solid #1f4f8f;outline-offset:2px}
.proof-drop .proof-view{white-space:nowrap;font-weight:700}
.proof-drop .proof-upload{display:none}
.proof-drop .proof-status{font-size:.85em;font-weight:700;color:#1f4f8f}
.proof-drop .proof-status:empty{display:none}
.proof-drop.is-dragover{border-color:#1f4f8f;border-style:solid;background:#e8f0fb;box-shadow:0 0 0 3px #c9daf3}
.proof-drop.is-uploading{opacity:.7}
.proof-hint{margin:4px 0 0}
</style><script src="/admin-proof-file.js" defer></script>`;

/** GET shows a proof file; POST uploads or replaces it. */
export async function proofRequest(request: Request) {
  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    const url = new URL(request.url);
    if (!adminOriginAllowed(env, url.origin)) throw new AdminError("Admin request origin is invalid.", 403);
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > proofMaxBytes + 64 * 1024) throw new AdminError("The file is over 1.5 MB.", 413);
      const form = await request.formData();
      const kind = String(form.get("type") ?? "");
      if (kind !== "payment" && kind !== "expense") throw new AdminError("Unknown proof type.");
      // Staff may add proof only to their own expenses; viewers never upload.
      if (!canMutateAdmin(user) && !(kind === "expense" && isRestrictedStaff(user))) throw new AdminError("Viewer access is read-only.", 403);
      const back = String(form.get("back") ?? "");
      if (!backPattern.test(back)) throw new AdminError("Unexpected return page.");
      checkCsrf(env, user.id, back.replace(/[?#].*$/, ""), String(form.get("csrf") ?? ""));
      const id = String(form.get("id") ?? "");
      const file = form.get("file");
      if (!(file instanceof File)) throw new AdminError("Choose a file to upload.");
      await saveProof(env.ADMIN_DB, kind, id, file, user);
      const [target, hash = ""] = back.split("#");
      const location = `${target}${target!.includes("?") ? "&" : "?"}proof=1${hash ? `#${hash}` : ""}`;
      return page("Saved", "", user.name, 303, { Location: location });
    }
    const kind = url.searchParams.get("type") === "expense" ? "expense" : url.searchParams.get("type") === "payment" ? "payment" : null;
    const id = url.searchParams.get("id") ?? "";
    if (!kind) throw new AdminError("Unknown proof type.");
    await checkRecord(env.ADMIN_DB, kind, id, user);
    const row = await readProofFile(env.ADMIN_DB, kind, id);
    if (!row) throw new AdminError("No proof of payment uploaded for this record yet.", 404);
    return niHaoFileResponse(row);
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("The proof of payment could not be saved. Please try again.", 500);
    if (!(error instanceof AdminError)) console.error("KargoDoor proof upload failed", error instanceof Error ? error.message : "Unknown error");
    return page("Proof of payment", `<p class="notice">${esc(err.message)}</p><p><a href="/admin/dashboard">Back to Dashboard</a></p>`, "", err.status);
  }
}

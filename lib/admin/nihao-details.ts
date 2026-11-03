import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { niHaoDetailsSchema, type NiHaoDetailsInput, type RecordData } from "./validation";
import {
  AdminError, adminOriginAllowed, authenticate, canMutateAdmin, checkCsrf, isRestrictedStaff, secureHeaders, type AdminEnv,
} from "./security";
import { esc, hidden, page, pesos } from "./ui";
import { detachForm } from "./detached-form";

/**
 * Ni Hao details on Edit shipment: Ni Hao's No., Doc No., date and tracking
 * number for this shipment, the file Ni Hao sent, and a Copy button. The
 * amount is the shipment's Ni Hao freight cost and the size is the Verified
 * CBM / weight, so neither is typed twice.
 */
export const niHaoDetailKeys = ["nihao_no", "nihao_doc_no", "nihao_date", "nihao_tracking"] as const;
export const niHaoFilePath = "/admin/shipments/nihao-file";
export const niHaoFileMaxBytes = 1.5 * 1024 * 1024;
const shipmentsPath = "/admin/shipments";
const fileTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
type FileType = (typeof fileTypes)[number];

export type NiHaoDetails = {
  nihao_no: string | null; nihao_doc_no: string | null; nihao_date: string | null; nihao_tracking: string | null;
  file_name: string | null; file_size: number | null; file_uploaded_at: string | null;
};

/** Takes the Ni Hao details fields out of the Edit shipment form (they are saved separately). Null when the form has none. */
export function takeNiHaoDetails(form: URLSearchParams): NiHaoDetailsInput | null {
  if (!niHaoDetailKeys.some((key) => form.has(key))) return null;
  const raw: Record<string, string> = {};
  for (const key of niHaoDetailKeys) {
    if (form.getAll(key).length > 1) throw new AdminError("Unexpected or repeated form field.");
    raw[key] = form.get(key) ?? "";
    form.delete(key);
  }
  return niHaoDetailsSchema.parse(raw);
}

export async function readNiHaoDetails(db: D1Database, shipmentId: string) {
  if (!shipmentId) return null;
  return await db.prepare(`SELECT nihao_no, nihao_doc_no, nihao_date, nihao_tracking, file_name, file_size, file_uploaded_at
    FROM shipment_nihao_details WHERE shipment_id = ?`).bind(shipmentId).first<NiHaoDetails>();
}

export async function saveNiHaoDetails(db: D1Database, shipmentId: string, values: NiHaoDetailsInput, userId: string) {
  const old = await readNiHaoDetails(db, shipmentId);
  const changed = niHaoDetailKeys.filter((key) => (old?.[key] ?? null) !== (values[key] ?? null));
  if (!changed.length) return false;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO shipment_nihao_details (shipment_id, nihao_no, nihao_doc_no, nihao_date, nihao_tracking, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shipment_id) DO UPDATE SET nihao_no = excluded.nihao_no, nihao_doc_no = excluded.nihao_doc_no,
        nihao_date = excluded.nihao_date, nihao_tracking = excluded.nihao_tracking, updated_at = excluded.updated_at`)
      .bind(shipmentId, values.nihao_no, values.nihao_doc_no, values.nihao_date, values.nihao_tracking, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, "nihao_details", "shipments", shipmentId,
        JSON.stringify(Object.fromEntries(changed.map((key) => [key, old?.[key] ?? null]))),
        JSON.stringify(Object.fromEntries(changed.map((key) => [key, values[key] ?? null]))), null, now),
  ]);
  return true;
}

const dateLabel = (iso: string | null) => {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const present = (value: unknown) => value !== null && value !== undefined && value !== "";

/** What "Copy Ni Hao details" puts on the clipboard. */
export function niHaoCopyText(details: Partial<NiHaoDetails> | null, record: RecordData, customerName: string) {
  return [
    details?.nihao_no ? `Ni Hao No.: ${details.nihao_no}` : "",
    details?.nihao_doc_no ? `Ni Hao Doc No.: ${details.nihao_doc_no}` : "",
    details?.nihao_date ? `Ni Hao date: ${dateLabel(details.nihao_date)}` : "",
    details?.nihao_tracking ? `Ni Hao Tracking No.: ${details.nihao_tracking}` : "",
    present(record.verified_cbm) ? `Verified CBM: ${Number(record.verified_cbm).toFixed(3)}` : "",
    present(record.verified_weight_kg) ? `Verified weight: ${Number(record.verified_weight_kg).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg` : "",
    present(record.nihao_cost) ? `Ni Hao freight cost: ${pesos(record.nihao_cost)}` : "",
    `KargoDoor shipment: ${record.tracking_number ?? ""}${customerName ? ` (${customerName})` : ""}`,
  ].filter(Boolean).join("\n");
}

const kb = (size: number | null) => (size ? `${Math.max(1, Math.round(size / 1024)).toLocaleString("en-US")} KB` : "");

/**
 * The Ni Hao details card for the Edit shipment form. `inline` goes inside the
 * form (its four fields save with Save shipment); `form` is the separate
 * upload form, placed after the main form (see detachForm).
 */
export function niHaoDetailsBox(options: { shipmentId: string; record: RecordData; details: NiHaoDetails | null; customerName: string; csrf: string; canWrite: boolean; uploaded?: boolean }) {
  const { details, record, shipmentId } = options;
  const field = (key: (typeof niHaoDetailKeys)[number], label: string, attrs: string) =>
    `<label>${esc(label)}<input name="${key}" value="${esc(details?.[key] ?? "")}" ${attrs}${options.canWrite ? "" : " readonly"}></label>`;
  const copyId = `nihao-copy-${shipmentId || "new"}`;
  const fileUrl = `${niHaoFilePath}?id=${encodeURIComponent(shipmentId)}`;
  const fileLine = details?.file_name
    ? `<span>📄 <strong>${esc(details.file_name)}</strong> <span class="muted">· ${esc(kb(details.file_size))} · uploaded ${esc(dateLabel(String(details.file_uploaded_at ?? "").slice(0, 10)))}</span></span>
       <a href="${esc(fileUrl)}" target="_blank" rel="noopener">View file</a>`
    : `<span class="muted">No Ni Hao file yet.</span>`;
  const upload = shipmentId && options.canWrite
    ? detachForm(`<form method="post" action="${niHaoFilePath}" enctype="multipart/form-data">${hidden("csrf", options.csrf)}${hidden("id", shipmentId)}
        <label class="nihao-file-pick">${details?.file_name ? "Replace file" : "⬆ Upload Ni Hao file"}<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label>
        <button type="submit" class="nihao-file-upload">Upload</button><span class="muted">or drag the file here · PDF or photo, up to 1.5 MB</span><span class="nihao-drop-status" data-nihao-drop-status role="status"></span></form>`, "nihao-file-form")
    : { inline: "", form: "" };
  const inline = `<div class="shipment-pay-box nihao-details" id="nihao-details"><h4>Ni Hao details</h4>
    ${options.uploaded ? `<p class="notice" role="status">Ni Hao file uploaded.</p>` : ""}
    <p class="muted">From Ni Hao's paper. Amount = Ni Hao freight cost above. CBM and weight = Verified CBM and weight. Saved with <strong>Save shipment</strong>.</p>
    <div class="grid">${field("nihao_no", "Ni Hao No.", 'maxlength="40" placeholder="9945"')}${field("nihao_doc_no", "Ni Hao Doc No. (optional)", 'maxlength="40" placeholder="0040385"')}
    ${field("nihao_date", "Ni Hao date", 'type="date"')}${field("nihao_tracking", "Ni Hao Tracking No.", 'maxlength="80" placeholder="2610040014-1"')}</div>
    ${shipmentId ? `<div class="nihao-file-row">${fileLine}${upload.inline}</div>` : `<p class="muted">Save the shipment first, then upload Ni Hao's file.</p>`}
    ${shipmentId ? `<pre hidden id="${copyId}">${esc(niHaoCopyText(details, record, options.customerName))}</pre>
    <div class="actions"><button type="button" class="nihao-copy" data-copy-source="${copyId}">📋 Copy Ni Hao details</button></div>` : ""}
  </div>`;
  return { inline, form: upload.form };
}

export const niHaoDetailsCss = `<style>
.nihao-file-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 0 0;padding:12px 14px;border:1.5px dashed #f0aaa4;border-radius:10px;background:#fff8f7}
.nihao-file-row .detached-form{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.nihao-file-pick{display:inline-flex;align-items:center;gap:8px;margin:0;font-weight:700;color:#a3261f}
.nihao-file-pick input{max-width:240px;font-weight:400}
.nihao-file-row.is-dragover{border-color:#a3261f;border-style:solid;background:#ffe9e6;box-shadow:0 0 0 3px #f6c7c1}
.nihao-file-row.is-uploading{opacity:.7}
.nihao-drop-status{font-weight:700;color:#a3261f}
.nihao-drop-status:empty{display:none}
html body .shipment-money-nh .nihao-details .nihao-copy{background:#fff;color:#a3261f;border:1.5px solid #a3261f;box-shadow:none}
</style><script src="/admin-nihao-file.js" defer></script>`;

/** Reads the first bytes so a renamed file cannot pretend to be a PDF or photo. */
export function sniffNiHaoFile(bytes: Uint8Array): FileType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function saveNiHaoFile(db: D1Database, shipmentId: string, file: File, userId: string) {
  if (!/^[\da-f-]{36}$/i.test(shipmentId)) throw new AdminError("Invalid shipment ID.");
  const shipment = await db.prepare("SELECT id FROM shipments WHERE id = ?").bind(shipmentId).first();
  if (!shipment) throw new AdminError("Shipment not found.", 404);
  if (!file.size) throw new AdminError("Choose a file to upload.");
  if (file.size > niHaoFileMaxBytes) throw new AdminError("The file is over 1.5 MB. Take a smaller photo or save the PDF smaller, then upload again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffNiHaoFile(bytes);
  if (!type) throw new AdminError("Upload Ni Hao's file as a PDF, JPEG, PNG or WebP.");
  const name = file.name.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 120) || "nihao";
  const old = await readNiHaoDetails(db, shipmentId);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO shipment_nihao_details (shipment_id, file_name, file_mime, file_size, file_data, file_uploaded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shipment_id) DO UPDATE SET file_name = excluded.file_name, file_mime = excluded.file_mime, file_size = excluded.file_size,
        file_data = excluded.file_data, file_uploaded_at = excluded.file_uploaded_at, updated_at = excluded.updated_at`)
      .bind(shipmentId, name, type, bytes.byteLength, bytes, now, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, old?.file_name ? "nihao_file_replaced" : "nihao_file_uploaded", "shipments", shipmentId,
        old?.file_name ? JSON.stringify({ file_name: old.file_name, file_size: old.file_size }) : null,
        JSON.stringify({ file_name: name, file_mime: type, file_size: bytes.byteLength }), null, now),
  ]);
}

export async function readNiHaoFile(db: D1Database, shipmentId: string) {
  return await db.prepare("SELECT file_name, file_mime, file_data FROM shipment_nihao_details WHERE shipment_id = ? AND file_data IS NOT NULL")
    .bind(shipmentId).first<{ file_name: string; file_mime: string; file_data: ArrayBuffer | Uint8Array | number[] }>();
}

export function niHaoFileResponse(row: { file_name: string; file_mime: string; file_data: ArrayBuffer | Uint8Array | number[] }) {
  const body = row.file_data instanceof Uint8Array ? row.file_data
    : row.file_data instanceof ArrayBuffer ? new Uint8Array(row.file_data) : Uint8Array.from(row.file_data);
  return new Response(body as unknown as BodyInit, {
    headers: {
      ...secureHeaders,
      "Content-Type": (fileTypes as readonly string[]).includes(row.file_mime) ? row.file_mime : "application/octet-stream",
      "Content-Disposition": `inline; filename="${row.file_name.replace(/"/g, "")}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}

/** GET shows Ni Hao's file for a shipment; POST uploads or replaces it. */
export async function niHaoFileRequest(request: Request) {
  try {
    const { env: cf } = await getCloudflareContext();
    const env = cf as unknown as AdminEnv;
    const user = await authenticate(request, env);
    const url = new URL(request.url);
    if (!adminOriginAllowed(env, url.origin)) throw new AdminError("Admin request origin is invalid.", 403);
    if (isRestrictedStaff(user)) throw new AdminError("This account can access only Quotations and Expenses.", 403);
    if (request.method === "POST") {
      if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
      if (Number(request.headers.get("content-length") ?? 0) > niHaoFileMaxBytes + 64 * 1024) throw new AdminError("The file is over 1.5 MB.", 413);
      const form = await request.formData();
      checkCsrf(env, user.id, shipmentsPath, String(form.get("csrf") ?? ""));
      const id = String(form.get("id") ?? "");
      const file = form.get("file");
      if (!(file instanceof File)) throw new AdminError("Choose a file to upload.");
      await saveNiHaoFile(env.ADMIN_DB, id, file, user.id);
      return page("Saved", "", user.name, 303, { Location: `${shipmentsPath}?id=${encodeURIComponent(id)}&edit=1&nihao_file=1#nihao-details` });
    }
    const id = url.searchParams.get("id") ?? "";
    const row = /^[\da-f-]{36}$/i.test(id) ? await readNiHaoFile(env.ADMIN_DB, id) : null;
    if (!row) throw new AdminError("No Ni Hao file uploaded for this shipment yet.", 404);
    return niHaoFileResponse(row);
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("The Ni Hao file could not be saved. Please try again.", 500);
    if (!(error instanceof AdminError)) console.error("KargoDoor Ni Hao file failed", error instanceof Error ? error.message : "Unknown error");
    return page("Ni Hao file", `<p class="notice">${esc(err.message)}</p><p><a href="${shipmentsPath}">Back to Shipments</a></p>`, "", err.status);
  }
}

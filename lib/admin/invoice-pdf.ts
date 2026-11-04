import type { D1Database } from "@cloudflare/workers-types";
import { kargodoorBankAccounts } from "./bank-accounts";
import { invoiceLogo } from "./invoice-logo";
import { AdminError } from "./security";

/**
 * Customer invoice PDF (A4), drawn by hand so the Worker needs no PDF library.
 * Layout follows the approved 2026-11-03 mockup: logo + status pill, billed-to /
 * invoice / shipment boxes, a charges table, totals with a big amount-due box,
 * then "How to pay" (while a balance is open) and "Payment received" (once paid).
 * Amounts are centavos.
 */

type Row = Record<string, unknown>;
export type InvoicePayment = { date: string; method: string; reference: string; amount: number };
export type InvoicePdfData = { invoice: Row; payments: InvoicePayment[] };

export async function readInvoicePdfData(db: D1Database, id: string): Promise<InvoicePdfData> {
  const invoice = await db.prepare(`SELECT i.*, c.customer_code, c.full_name, c.company_name, c.mobile,
      s.tracking_number, s.service_type, s.china_warehouse, s.cbm, s.weight_kg, s.verified_cbm, s.verified_weight_kg,
      s.cargo_item, s.cargo_description, s.cargo_quantity, s.warehouse_received_date, s.actual_arrival,
      q.quotation_number
    FROM invoices i JOIN customers c ON c.id = i.customer_id JOIN shipments s ON s.id = i.shipment_id
    LEFT JOIN quotations q ON q.id = s.source_quotation_id
    WHERE i.id = ? AND i.archived_at IS NULL`).bind(id).first<Row>();
  if (!invoice) throw new AdminError("Invoice not found.", 404);
  const payments = (await db.prepare(`SELECT payment_date, payment_method, reference_number, amount FROM payments
    WHERE invoice_id = ? ORDER BY payment_date, created_at`).bind(id).all<Row>()).results.map((p) => ({
    date: str(p.payment_date), method: str(p.payment_method), reference: str(p.reference_number), amount: num(p.amount),
  }));
  return { invoice, payments };
}

// ---------- small helpers ----------
const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDate(v: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  return m ? `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}` : str(v);
}
const amount = (c: number) => (c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "₱1,234.00"; the ₱ is drawn as a P with two bars (the built-in fonts have no ₱). */
const peso = (c: number) => `₱${amount(c)}`;
const trimNumber = (n: number) => String(Number(n.toFixed(3)));

// ---------- fonts (built-in Helvetica, WinAnsi) ----------
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// WinAnsi codes for the few non-Latin-1 characters we use.
const WIN: Record<string, [number, number]> = { "—": [151, 1000], "–": [150, 556], "•": [149, 350], "’": [146, 222], "‘": [145, 222], "“": [147, 333], "”": [148, 333], "₱": [80, 667] };

function encodeChar(ch: string): [number, number | null] {
  const code = ch.codePointAt(0)!;
  if (WIN[ch]) return [WIN[ch][0], WIN[ch][1]];
  if (code >= 32 && code <= 126) return [code, null];
  if (code >= 160 && code <= 255) return [code, code === 183 ? 278 : 556];
  return [63, null]; // "?"
}
function textWidth(text: string, size: number, bold = false) {
  const table = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of text) {
    const [code, fixed] = encodeChar(ch);
    w += fixed ?? table[code - 32] ?? 556;
  }
  return (w * size) / 1000;
}
function pdfString(text: string) {
  let out = "";
  for (const ch of text) {
    const [code] = encodeChar(ch);
    if (code === 40 || code === 41 || code === 92) out += "\\" + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return `(${out})`;
}
function wrap(text: string, size: number, maxWidth: number, bold = false) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- colours ----------
type RGB = [number, number, number];
const hex = (h: string): RGB => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255) as RGB;
const C = {
  blue: hex("#1b3f97"), blueDark: hex("#122b6b"), green: hex("#5bb52f"), greenSoft: hex("#f1f9ec"),
  ink: hex("#1c2333"), muted: hex("#667085"), line: hex("#e3e8f0"), white: hex("#ffffff"),
  red: hex("#d92d20"), redSoft: hex("#fef3f2"), redLine: hex("#fecdca"),
  ok: hex("#027a48"), okSoft: hex("#ecfdf3"), okLine: hex("#abefc6"), stamp: hex("#d5ece0"),
  grey: hex("#475467"), greySoft: hex("#f2f4f7"), greyLine: hex("#d0d5dd"),
};
const rgb = (c: RGB) => c.map((v) => v.toFixed(3)).join(" ");

// ---------- drawing ----------
class Canvas {
  ops: string[] = [];
  rect(x: number, y: number, w: number, h: number, fill?: RGB, stroke?: RGB, lw = 0.75) {
    this.path(`${x} ${y} ${w} ${h} re`, fill, stroke, lw);
  }
  round(x: number, y: number, w: number, h: number, r: number, fill?: RGB, stroke?: RGB, lw = 0.75) {
    const k = 0.5523 * r;
    const p = [
      `${x + r} ${y} m`, `${x + w - r} ${y} l`, `${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y + r} c`,
      `${x + w} ${y + h - r} l`, `${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x + w - r} ${y + h} c`,
      `${x + r} ${y + h} l`, `${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y + h - r} c`,
      `${x} ${y + r} l`, `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c`, "h",
    ].join(" ");
    this.path(p, fill, stroke, lw);
  }
  path(p: string, fill?: RGB, stroke?: RGB, lw = 0.75) {
    const paint = fill && stroke ? "B" : fill ? "f" : "S";
    this.ops.push(`q ${fill ? rgb(fill) + " rg " : ""}${stroke ? rgb(stroke) + " RG " + lw + " w " : ""}${p} ${paint} Q`);
  }
  hline(x1: number, x2: number, y: number, color = C.line, lw = 0.75) {
    this.ops.push(`q ${rgb(color)} RG ${lw} w ${x1} ${y} m ${x2} ${y} l S Q`);
  }
  /** Text at baseline y. align: left edge, right edge or centre at x. Returns the width. */
  text(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; spacing?: number } = {}) {
    if (!s) return 0;
    const bold = !!opts.bold;
    const spacing = opts.spacing ?? 0;
    const w = textWidth(s, size, bold) + spacing * Math.max([...s].length - 1, 0);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(opts.color ?? C.ink)} rg ${spacing} Tc ${left.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(s)} Tj ET`);
    // Two bars across each P that stands for ₱.
    let cursor = left;
    for (const ch of s) {
      if (ch === "₱") {
        const lw = Math.max(size * (bold ? 0.075 : 0.055), 0.5);
        for (const h of [0.5, 0.62]) {
          this.ops.push(`q ${rgb(opts.color ?? C.ink)} RG ${lw.toFixed(2)} w ${(cursor - size * 0.03).toFixed(2)} ${(y + size * h).toFixed(2)} m ${(cursor + size * 0.6).toFixed(2)} ${(y + size * h).toFixed(2)} l S Q`);
        }
      }
      const [code, fixed] = encodeChar(ch);
      cursor += ((fixed ?? (bold ? W_BOLD : W_REG)[code - 32] ?? 556) * size) / 1000 + spacing;
    }
    return w;
  }
  image(x: number, y: number, w: number, h: number) {
    this.ops.push(`q ${w} 0 0 ${h} ${x} ${y} cm /Im1 Do Q`);
  }
}

// ---------- page ----------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const L = 42;
const R = PAGE_W - 42;

const serviceLine: Record<string, string> = {
  "Air Freight": "Air freight, China to Manila",
  "Sea Freight": "Sea freight, China to Manila",
  FCL: "Full container (FCL), China to Manila",
};

export function customerInvoicePdf({ invoice, payments }: InvoicePdfData) {
  const c = new Canvas();
  const status = str(invoice.status) || "Unpaid";
  const freight = num(invoice.subtotal);
  const delivery = num(invoice.delivery_charge);
  const other = num(invoice.other_charge);
  const total = num(invoice.total) + other;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(total - paid, 0);
  const settled = status === "Paid" || (total > 0 && balance === 0);
  const number = str(invoice.invoice_number);
  const firstName = str(invoice.full_name).split(/\s+/)[0] || "po";

  // Top colour band.
  c.rect(0, PAGE_H - 4, PAGE_W * 0.7, 4, C.blue);
  c.rect(PAGE_W * 0.7, PAGE_H - 4, PAGE_W * 0.3, 4, C.green);

  // Header: logo + company, INVOICE + number + status pill.
  const logoH = 58;
  const logoW = (logoH * invoiceLogo.width) / invoiceLogo.height;
  c.image(L - 4, PAGE_H - 40 - logoH, logoW, logoH);
  c.text("KargoDoor Cargo Forwarding · Malabon, Metro Manila", L, PAGE_H - 112, 8, { color: C.muted });
  c.text("support@kargodoorph.com · +63 919 932 3077 · kargodoorph.com", L, PAGE_H - 123, 8, { color: C.muted });

  c.text("INVOICE", R, PAGE_H - 70, 26, { bold: true, color: C.blue, align: "right", spacing: 0.6 });
  const noW = c.text(number, R, PAGE_H - 88, 9, { bold: true, align: "right" });
  c.text("No. ", R - noW, PAGE_H - 88, 9, { color: C.muted, align: "right" });

  const pill = (() => {
    if (status === "Void") return { label: "VOID", fill: C.redSoft, line: C.redLine, color: C.red };
    if (status === "Draft") return { label: "DRAFT", fill: C.greySoft, line: C.greyLine, color: C.grey };
    if (settled) return { label: "PAID", fill: C.okSoft, line: C.okLine, color: C.ok };
    if (paid > 0) return { label: `PARTIAL · ${peso(balance)} DUE`, fill: C.redSoft, line: C.redLine, color: C.red };
    return { label: `UNPAID · ${peso(balance)} DUE`, fill: C.redSoft, line: C.redLine, color: C.red };
  })();
  const pillW = textWidth(pill.label, 8.5, true) + 0.4 * (pill.label.length - 1) + 20;
  c.round(R - pillW, PAGE_H - 120, pillW, 18, 9, pill.fill, pill.line);
  c.text(pill.label, R - pillW / 2, PAGE_H - 114.5, 8.5, { bold: true, color: pill.color, align: "center", spacing: 0.4 });

  // Three info boxes.
  const boxTop = PAGE_H - 145;
  const boxH = 72;
  const gap = 12;
  const w1 = 190;
  const w2 = (R - L - w1 - gap * 2) / 2;
  const boxes = [L, L + w1 + gap, L + w1 + gap + w2 + gap];
  const label = (s: string, x: number, y: number) => c.text(s.toUpperCase(), x, y, 6.5, { bold: true, color: C.muted, spacing: 0.9 });
  [w1, w2, w2].forEach((w, i) => c.round(boxes[i], boxTop - boxH, w, boxH, 5, undefined, C.line));

  let y = boxTop - 16;
  label("Billed to", boxes[0] + 11, y);
  c.text(str(invoice.full_name) || "Customer", boxes[0] + 11, y - 15, 10.5, { bold: true });
  let by = y - 28;
  if (str(invoice.company_name)) { c.text(str(invoice.company_name), boxes[0] + 11, by, 9); by -= 12; }
  c.text(`Customer code ${str(invoice.customer_code)}`, boxes[0] + 11, by, 8.3, { color: C.muted });
  const mobile = str(invoice.mobile).replace(/\s+/g, "");
  if (mobile) c.text(/^09\d{9}$/.test(mobile) ? mobile.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3") : str(invoice.mobile), boxes[0] + 11, by - 11, 8.3, { color: C.muted });

  const kv = (title: string, x: number, w: number, rows: [string, string][]) => {
    label(title, x + 11, y);
    rows.forEach(([k, v], i) => {
      c.text(k, x + 11, y - 15 - i * 13, 8.6, { color: C.muted });
      c.text(v, x + w - 11, y - 15 - i * 13, 8.6, { align: "right" });
    });
  };
  const invoiceRows: [string, string][] = [
    ["Issued", niceDate(invoice.issued_at ?? invoice.created_at)],
    ["Due", str(invoice.due_at) ? niceDate(invoice.due_at) : "Before release"],
  ];
  if (str(invoice.quotation_number)) invoiceRows.push(["Quotation", str(invoice.quotation_number)]);
  const shipmentRows: [string, string][] = [
    ["Tracking", str(invoice.tracking_number) || "—"],
    ["Service", str(invoice.service_type)],
    str(invoice.actual_arrival) ? ["Arrived PH", niceDate(invoice.actual_arrival)] : ["From", str(invoice.china_warehouse)],
  ];
  kv("Invoice", boxes[1], w2, invoiceRows);
  kv("Shipment", boxes[2], w2, shipmentRows);

  // Charges table.
  y = boxTop - boxH - 18;
  const th = 22;
  c.round(L, y - th, R - L, th, 5, C.blue);
  c.rect(L, y - th, R - L, 6, C.blue);
  const colNo = L + 9;
  const colDesc = L + 30;
  const colSize = L + 352;
  const head = (s: string, x: number, align: "left" | "right" = "left") => c.text(s, x, y - 14.5, 7, { bold: true, color: C.white, spacing: 0.7, align });
  head("#", colNo); head("DESCRIPTION", colDesc); head("SIZE", colSize); head("AMOUNT", R - 9, "right");
  y -= th;

  const item = str(invoice.cargo_item) || str(invoice.cargo_description);
  const qty = num(invoice.cargo_quantity);
  const detail = [
    [item, qty ? `${qty} pc${qty === 1 ? "" : "s"}` : ""].filter(Boolean).join(", "),
    str(invoice.china_warehouse) ? `${str(invoice.china_warehouse)} to Malabon warehouse` : "",
    str(invoice.warehouse_received_date) ? `received in China ${niceDate(invoice.warehouse_received_date)}` : "",
  ].filter(Boolean).join(" · ");
  const verified = invoice.verified_cbm !== null && invoice.verified_cbm !== undefined || invoice.verified_weight_kg !== null && invoice.verified_weight_kg !== undefined;
  const cbm = verified && invoice.verified_cbm !== null && invoice.verified_cbm !== undefined ? num(invoice.verified_cbm) : num(invoice.cbm);
  const kg = verified && invoice.verified_weight_kg !== null && invoice.verified_weight_kg !== undefined ? num(invoice.verified_weight_kg) : num(invoice.weight_kg);
  const lines: { title: string; detail: string; size: [string, string]; amount: number }[] = [
    { title: serviceLine[str(invoice.service_type)] ?? "Freight, China to Manila", detail, size: [cbm ? `${trimNumber(cbm)} CBM` : "", kg ? `${trimNumber(kg)} kg ${verified ? "verified" : "declared"}` : ""], amount: freight },
  ];
  if (delivery > 0) lines.push({ title: "Delivery to your address", detail: "Malabon warehouse to your door", size: ["—", ""], amount: delivery });
  if (other > 0) lines.push({ title: "Other charges", detail: "", size: ["—", ""], amount: other });

  lines.forEach((line, i) => {
    const detailLines = line.detail ? wrap(line.detail, 8, colSize - colDesc - 14) : [];
    const rowH = 30 + detailLines.length * 10.5;
    c.text(String(i + 1), colNo + 2, y - 17, 9.5);
    c.text(line.title, colDesc, y - 17, 9.5, { bold: true });
    detailLines.forEach((d, j) => c.text(d, colDesc, y - 29 - j * 10.5, 8, { color: C.muted }));
    c.text(line.size[0], colSize, y - 17, 9.5);
    if (line.size[1]) c.text(line.size[1], colSize, y - 29, 8, { color: C.muted });
    c.text(peso(line.amount), R - 9, y - 17, 9.5, { align: "right" });
    y -= rowH;
    c.hline(L, R, y);
  });

  // Summary: note on the left, totals on the right.
  y -= 14;
  const note = status === "Void"
    ? "This invoice was voided and is no longer payable. Please refer to your latest KargoDoor invoice."
    : settled
      ? "Fully paid. Your cargo is cleared for release or delivery. Keep this copy as your billing record from KargoDoor PH."
      : "Please settle the amount due before release. Cargo is released or delivered once KargoDoor verifies your payment.";
  wrap(note, 8.3, 270).forEach((l, i) => c.text(l, L, y - 9 - i * 11.5, 8.3, { color: C.muted }));

  const tx = R - 210;
  const totalRow = (k: string, v: string, opts: { bold?: boolean; color?: RGB } = {}) => {
    c.text(k, tx + 8, y - 10, 9.3, opts);
    c.text(v, R - 8, y - 10, 9.3, { ...opts, align: "right" });
    y -= 18;
  };
  totalRow("Freight", peso(freight));
  if (delivery > 0) totalRow("Delivery", peso(delivery));
  if (other > 0) totalRow("Other charges", peso(other));
  c.hline(tx, R, y + 2);
  y -= 4;
  totalRow("Total", peso(total), { bold: true });
  if (paid > 0) totalRow("Less: payment received", `- ${peso(paid)}`, { color: C.ok });
  const grandH = 34;
  y -= 6;
  const zero = settled && status !== "Void";
  c.round(tx, y - grandH + 6, R - tx, grandH, 5, zero ? C.ok : status === "Void" ? C.grey : C.blue);
  c.text(paid > 0 ? "BALANCE DUE" : "AMOUNT DUE", tx + 10, y - 12.5, 7.5, { bold: true, color: C.white, spacing: 0.8 });
  c.text(peso(status === "Void" ? 0 : balance), R - 10, y - 15.5, 15, { bold: true, color: C.white, align: "right" });
  y -= grandH + 14;

  // PAID stamp, behind nothing important (left of the totals).
  if (zero) {
    const sx = L + 60;
    const sy = y + 44;
    const a = (-14 * Math.PI) / 180;
    const [cs, sn] = [Math.cos(a), Math.sin(a)];
    c.ops.push(`q ${cs.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${cs.toFixed(4)} ${sx} ${sy} cm`);
    c.round(0, 0, 150, 46, 6, undefined, C.stamp, 2.5);
    c.text("PAID", 75, 12, 30, { bold: true, color: C.stamp, align: "center", spacing: 4 });
    c.ops.push("Q");
  }

  // How to pay (open balance) — UnionBank + GCash from bank-accounts.ts.
  const showHowToPay = !settled && status !== "Void" && balance > 0;
  if (showHowToPay) {
    const boxH2 = 112;
    c.round(L, y - boxH2, R - L, boxH2, 7, undefined, C.green, 1.2);
    c.ops.push(`q ${L + 0.6} ${y - 26} ${R - L - 1.2} 25.4 re W n`);
    c.round(L + 0.6, y - 40, R - L - 1.2, 39.4, 6.5, C.greenSoft);
    c.ops.push("Q");
    c.text("How to pay", L + 12, y - 17.5, 10.5, { bold: true, color: C.blueDark });
    const amt = peso(balance);
    const aw = c.text(amt, R - 12, y - 17, 8.6, { bold: true, align: "right" });
    c.text("Account name must match. Pay the exact amount: ", R - 12 - aw, y - 17, 8.3, { color: C.muted, align: "right" });
    const top = y - 26;
    const half = (R - L) / 2;
    c.ops.push(`q ${rgb(C.line)} RG 0.75 w ${L + half} ${top} m ${L + half} ${top - 52} l S Q`);
    kargodoorBankAccounts.forEach((acct, i) => {
      const x = L + 12 + i * half;
      c.text(acct.bank === "UnionBank of the Philippines" ? "UnionBank" : acct.bank, x, top - 15, 9.5, { bold: true, color: C.blue });
      const digits = acct.accountNumber.replace(/\s/g, "");
      const shown = /^\d{12}$/.test(digits) ? digits.replace(/(\d{4})(?=\d)/g, "$1 ") : acct.accountNumber;
      c.text(shown, x, top - 32, 13, { bold: true, spacing: 0.6 });
      c.text(acct.accountName.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase()), x, top - 44, 8.3, { color: C.muted });
    });
    c.hline(L, R, top - 52);
    const steps = [`Send ${amt} to any account above.`, "Send the receipt screenshot to us on Messenger or WhatsApp.", "We verify within the day and release or deliver your cargo."];
    const third = (R - L - 24) / 3;
    steps.forEach((s, i) => {
      const x = L + 12 + i * third;
      c.round(x, top - 72, 13, 13, 6.5, C.blue);
      c.text(String(i + 1), x + 6.5, top - 68, 7.5, { bold: true, color: C.white, align: "center" });
      wrap(s, 8.4, third - 26).slice(0, 2).forEach((l, j) => c.text(l, x + 19, top - 68.5 - j * 11, 8.4));
    });
    y -= boxH2 + 14;
  }

  // Payments received (any payment on record).
  if (payments.length) {
    const shown = payments.slice(showHowToPay ? -2 : -5);
    const boxH3 = 30 + 20 + shown.length * 22;
    c.round(L, y - boxH3, R - L, boxH3, 7, undefined, C.okLine, 1.2);
    c.ops.push(`q ${L + 0.6} ${y - 30} ${R - L - 1.2} 29.4 re W n`);
    c.round(L + 0.6, y - 40, R - L - 1.2, 39.4, 6.5, C.okSoft);
    c.ops.push("Q");
    c.text(settled ? "Payment received. Salamat!" : "Payments received", L + 12, y - 19, 10.5, { bold: true, color: C.ok });
    let py = y - 30;
    const cols = [L + 12, L + 150, L + 270];
    ["DATE", "METHOD", "REFERENCE NO."].forEach((h, i) => c.text(h, cols[i], py - 13, 6.8, { bold: true, color: C.muted, spacing: 0.7 }));
    c.text("AMOUNT", R - 12, py - 13, 6.8, { bold: true, color: C.muted, spacing: 0.7, align: "right" });
    py -= 20;
    c.hline(L, R, py);
    shown.forEach((p, i) => {
      c.text(niceDate(p.date), cols[0], py - 14, 8.8);
      c.text(p.method, cols[1], py - 14, 8.8);
      c.text(p.reference || "—", cols[2], py - 14, 8.8);
      c.text(peso(p.amount), R - 12, py - 14, 8.8, { align: "right" });
      py -= 22;
      if (i < shown.length - 1) c.hline(L, R, py);
    });
    y -= boxH3 + 14;
  }

  // Good to know + thank you, pinned above the footer.
  const ty = 116;
  c.text("Good to know", L, ty, 8.2, { bold: true });
  const bullets = [
    "Charges are based on the verified size and weight measured at our warehouse.",
    "Unclaimed cargo after 7 days from arrival notice is charged ₱500/day storage.",
    "Questions about this bill? Message us within 3 days with your invoice no.",
  ];
  let bly = ty - 12;
  for (const b of bullets) {
    wrap(b, 7.8, 290).forEach((l, j) => {
      if (j === 0) c.text("•", L + 2, bly, 7.8, { color: C.muted });
      c.text(l, L + 10, bly, 7.8, { color: C.muted });
      bly -= 10.5;
    });
  }
  const rx = L + 335;
  c.text(`Salamat, ${firstName}!`, rx, ty - 2, 11, { bold: true, color: C.blue });
  wrap("Refer a friend who imports from China and get a referral reward on their first shipment.", 7.8, R - rx).forEach((l, i) => c.text(l, rx, ty - 16 - i * 10.5, 7.8, { color: C.muted }));

  c.hline(L, R, 56);
  c.text("KargoDoor PH · China to PH, made SIMPLE", L, 44, 7.6, { color: C.muted });
  c.text(`${number} · Page 1 of 1`, R, 44, 7.6, { color: C.muted, align: "right" });

  return buildPdf(c.ops.join("\n"));
}

function buildPdf(content: string) {
  const enc = new TextEncoder();
  const logo = Uint8Array.from(atob(invoiceLogo.jpegBase64), (ch) => ch.charCodeAt(0));
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects: (string | Uint8Array[])[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >>`,
    font("Helvetica"),
    font("Helvetica-Bold"),
    [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${invoiceLogo.width} /Height ${invoiceLogo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`), logo, enc.encode("\nendstream")],
    `<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`,
  ];
  const parts: Uint8Array[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => { const b = typeof chunk === "string" ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  push("%PDF-1.4\n%âãÏÓ\n");
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    if (typeof obj === "string") push(obj); else obj.forEach(push);
    push("\nendobj\n");
  });
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Shared with the quotation PDF so both documents look the same. */
export { Canvas, C, wrap as wrapPdfText, textWidth as pdfTextWidth, buildPdf, niceDate, peso, trimNumber, PAGE_W, PAGE_H, L as PDF_LEFT, R as PDF_RIGHT };
export type { RGB };

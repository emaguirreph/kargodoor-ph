import type { D1Database } from "@cloudflare/workers-types";
import { AdminError } from "./security";
import { philippineToday } from "./finance-dates";

/**
 * One shipment's money story in one place: the customer, what KargoDoor
 * billed and collected, what Ni Hao charged and what was paid to them, and
 * the freight profit. Used by the Shipment Statement PDF and the ledger CSV.
 */
const niHaoCategory = "Freight / Ni Hao Cost";
const marginTarget = 15;

type Row = Record<string, unknown>;
export type StatementPayment = { date: string; method: string; amount: number; reference: string };
export type ShipmentStatement = {
  shipment: Row;
  customer: Row;
  quotationNumber: string;
  invoice: Row | null;
  payments: StatementPayment[];
  niHaoPayments: StatementPayment[];
  billed: number;
  collected: number;
  balance: number;
  niHaoCost: number | null;
  niHaoPaid: number;
  niHaoOwed: number | null;
  profit: number | null;
  marginPercent: number | null;
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function summarize(shipment: Row, invoice: Row | null, payments: StatementPayment[], niHaoPayments: StatementPayment[]) {
  const charge = num(shipment.shipping_charge);
  // An issued invoice is what the customer owes; before that, the shipment's charges.
  const billed = invoice
    ? num(invoice.total) + num(invoice.other_charge)
    : charge + num(shipment.delivery_charge);
  const collected = payments.reduce((sum, p) => sum + p.amount, 0);
  const niHaoCost = shipment.nihao_cost === null || shipment.nihao_cost === undefined ? null : num(shipment.nihao_cost);
  const niHaoPaid = niHaoPayments.reduce((sum, p) => sum + p.amount, 0);
  const profit = niHaoCost === null ? null : charge - niHaoCost;
  return {
    billed,
    collected,
    balance: Math.max(billed - collected, 0),
    niHaoCost,
    niHaoPaid,
    niHaoOwed: niHaoCost === null ? null : niHaoPaid > 0 ? 0 : niHaoCost,
    profit,
    marginPercent: profit === null || charge === 0 ? null : (profit / charge) * 100,
  };
}

export async function readShipmentStatement(db: D1Database, shipmentId: string): Promise<ShipmentStatement> {
  const shipment = await db.prepare(`SELECT s.*, c.customer_code, c.full_name, c.company_name, c.mobile,
      c.email, c.address, q.quotation_number
    FROM shipments s JOIN customers c ON c.id = s.customer_id
    LEFT JOIN quotations q ON q.id = s.source_quotation_id
    WHERE s.id = ?`).bind(shipmentId).first<Row>();
  if (!shipment) throw new AdminError("Shipment not found.", 404);
  const invoice = await db.prepare(`SELECT id, invoice_number, status, total, other_charge, issued_at, created_at
    FROM invoices WHERE shipment_id = ? AND status != 'Void' AND archived_at IS NULL
    ORDER BY created_at DESC LIMIT 1`).bind(shipmentId).first<Row>();
  const payments = invoice
    ? (await db.prepare(`SELECT payment_date, payment_method, amount, reference_number FROM payments
        WHERE invoice_id = ? ORDER BY payment_date, created_at`).bind(invoice.id).all<Row>()).results
    : [];
  const niHao = shipment.tracking_number
    ? (await db.prepare(`SELECT expense_date, payment_method, amount, reference_number FROM expenses
        WHERE category = ? AND tracking_number = ? COLLATE NOCASE ORDER BY expense_date, created_at`)
        .bind(niHaoCategory, shipment.tracking_number).all<Row>()).results
    : [];
  const toPayment = (row: Row, date: string): StatementPayment => ({
    date: text(row[date]), method: text(row.payment_method), amount: num(row.amount), reference: text(row.reference_number),
  });
  const paid = payments.map((row) => toPayment(row, "payment_date"));
  const niHaoPaid = niHao.map((row) => toPayment(row, "expense_date"));
  return {
    shipment,
    customer: {
      customer_code: shipment.customer_code, full_name: shipment.full_name, company_name: shipment.company_name,
      mobile: shipment.mobile, email: shipment.email, address: shipment.address,
    },
    quotationNumber: text(shipment.quotation_number),
    invoice: invoice ?? null,
    payments: paid,
    niHaoPayments: niHaoPaid,
    ...summarize(shipment, invoice ?? null, paid, niHaoPaid),
  };
}

const peso = (centavos: number) => `PHP ${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// The built-in PDF fonts only cover Latin-1; keep the text printable.
const pdfText = (value: unknown) => text(value).replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

type Line = { text: string; bold?: boolean; size?: number; gap?: number; red?: boolean };

/** Plain one-or-more page A4 PDF built by hand, like the invoice PDF. */
function buildPdf(lines: Line[]) {
  const pages: string[] = [];
  let stream = "";
  let y = 800;
  const open = () => { stream = ""; y = 800; };
  open();
  for (const line of lines) {
    const size = line.size ?? 10.5;
    const gap = line.gap ?? size + 5;
    if (y - gap < 50) { pages.push(stream); open(); }
    y -= gap;
    if (line.text) {
      stream += `BT /${line.bold ? "F2" : "F1"} ${size} Tf ${line.red ? "0.7 0.1 0.1 rg" : "0.1 0.14 0.19 rg"} 50 ${y} Td (${pdfText(line.text)}) Tj ET\n`;
    }
  }
  pages.push(stream);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // pages, filled below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const kids: string[] = [];
  for (const content of pages) {
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${pageId} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function shipmentStatementPdf(statement: ShipmentStatement, today = philippineToday()) {
  const s = statement.shipment;
  const c = statement.customer;
  const or = (value: unknown, fallback = "-") => text(value).trim() || fallback;
  const heading = (title: string): Line[] => [{ text: "", gap: 6 }, { text: title.toUpperCase(), bold: true, size: 11.5, gap: 18 }];
  const row = (label: string, value: string, red = false): Line => ({ text: `${label}:  ${value}`, red });
  const paymentLines = (rows: StatementPayment[], none: string) => rows.length
    ? rows.map((p) => row("  Paid", `${p.date}  |  ${peso(p.amount)}  |  ${p.method || "-"}${p.reference ? `  |  Ref ${p.reference}` : ""}`))
    : [row("  Payments", none)];
  const lines: Line[] = [
    { text: "KARGODOOR PH", bold: true, size: 16, gap: 20 },
    { text: `SHIPMENT STATEMENT  -  ${or(s.tracking_number, "No tracking number")}`, bold: true, size: 13, gap: 20 },
    { text: `Prepared ${today}  |  Internal record of customer billing and Ni Hao cost`, size: 9, gap: 14 },
    ...heading("Customer"),
    row("Name", or(c.full_name)),
    ...(text(c.company_name).trim() ? [row("Company", text(c.company_name))] : []),
    row("Account / cargo code", or(c.customer_code)),
    row("Mobile", or(c.mobile)),
    row("Email", or(c.email)),
    ...(text(c.address).trim() ? [row("Address", text(c.address))] : []),
    ...heading("Shipment"),
    row("Tracking no.", or(s.tracking_number)),
    ...(statement.quotationNumber ? [row("Quotation", statement.quotationNumber)] : []),
    row("Service", or(s.service_type)),
    row("Origin warehouse", or(s.china_warehouse)),
    row("Status", or(s.status)),
    row("China warehouse received", or(s.warehouse_received_date)),
    row("Arrived in PH", or(s.actual_arrival)),
    row("Declared size", `${or(s.cbm)} CBM  |  ${or(s.weight_kg)} kg`),
    row("Verified size", `${or(s.verified_cbm)} CBM  |  ${or(s.verified_weight_kg)} kg`),
    ...heading("KargoDoor billing (money in)"),
    row("Freight charge", peso(num(s.shipping_charge))),
    ...(num(s.delivery_charge) ? [row("Delivery charge", peso(num(s.delivery_charge)))] : []),
    ...(statement.invoice
      ? [row("Invoice", `${or(statement.invoice.invoice_number)}  (${or(statement.invoice.status)}${statement.invoice.issued_at ? `, issued ${statement.invoice.issued_at}` : ""})`)]
      : [row("Invoice", "Not issued yet")]),
    row(statement.invoice ? "Invoice total" : "Amount to bill", peso(statement.billed)),
    ...paymentLines(statement.payments, "None received yet"),
    row("Balance due", peso(statement.balance), statement.balance > 0),
    ...heading("Ni Hao (money out)"),
    row("Ni Hao cost", statement.niHaoCost === null ? "Not entered" : `${peso(statement.niHaoCost)}  (${s.nihao_cost_source === "estimate" ? "estimate" : "Ni Hao actual"})`),
    ...paymentLines(statement.niHaoPayments, "Not paid yet"),
    row("Still owed to Ni Hao", statement.niHaoOwed === null ? "Unknown" : peso(statement.niHaoOwed), (statement.niHaoOwed ?? 0) > 0),
    ...heading("Freight profit"),
    statement.profit === null
      ? row("Freight charge - Ni Hao cost", "Enter the Ni Hao cost to calculate")
      : row("Freight charge - Ni Hao cost",
        `${peso(statement.profit)}  |  ${(statement.marginPercent ?? 0).toFixed(1)}% margin${(statement.marginPercent ?? 0) < marginTarget ? `  (below ${marginTarget}% target)` : ""}`,
        (statement.marginPercent ?? 0) < marginTarget),
    { text: "", gap: 18 },
    { text: "Ni Hao SOA and receipts are kept in Google Drive under the same tracking number.", size: 9 },
  ];
  return buildPdf(lines);
}

export function statementFilename(statement: ShipmentStatement) {
  const clean = (value: unknown) => text(value).replace(/[^A-Za-z0-9 .-]/g, "").replace(/\s+/g, " ").trim();
  return `${clean(statement.shipment.tracking_number) || "Shipment"} - ${clean(statement.customer.full_name) || "Customer"}.pdf`;
}

const csvCell = (value: unknown) => {
  const raw = text(value).replace(/^([=+\-@])/, "'$1");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};
const php = (centavos: number | null) => (centavos === null ? "" : (centavos / 100).toFixed(2));

/** Every active shipment as one ledger row: customer, KD billed/collected, Ni Hao cost/paid, profit. */
export async function shipmentsLedgerCsv(db: D1Database, today = philippineToday()) {
  const { results: shipments } = await db.prepare(`SELECT s.*, c.customer_code, c.full_name, c.company_name,
      c.mobile, c.email, c.address, q.quotation_number
    FROM shipments s JOIN customers c ON c.id = s.customer_id
    LEFT JOIN quotations q ON q.id = s.source_quotation_id
    WHERE s.status != 'Cancelled' AND s.archived_at IS NULL
    ORDER BY COALESCE(s.warehouse_received_date, substr(s.created_at, 1, 10)) DESC, s.created_at DESC`).all<Row>();
  const { results: invoices } = await db.prepare(`SELECT id, shipment_id, invoice_number, status, total, other_charge, issued_at, created_at
    FROM invoices WHERE status != 'Void' AND archived_at IS NULL ORDER BY created_at`).all<Row>();
  const { results: payments } = await db.prepare(`SELECT p.invoice_id, p.payment_date, p.payment_method, p.amount, p.reference_number
    FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.archived_at IS NULL ORDER BY p.payment_date, p.created_at`).all<Row>();
  const { results: niHao } = await db.prepare(`SELECT lower(tracking_number) AS tracking, expense_date, payment_method, amount, reference_number
    FROM expenses WHERE category = ? AND tracking_number IS NOT NULL ORDER BY expense_date, created_at`).bind(niHaoCategory).all<Row>();

  const invoiceByShipment = new Map<string, Row>();
  for (const invoice of invoices) invoiceByShipment.set(String(invoice.shipment_id), invoice);
  const group = <T extends Row>(rows: T[], key: string) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(String(r[key]), [...(map.get(String(r[key])) ?? []), r]);
    return map;
  };
  const paymentsByInvoice = group(payments, "invoice_id");
  const niHaoByTracking = group(niHao, "tracking");

  const columns = ["Tracking No.", "Customer", "Account Code", "Company", "Mobile", "Email", "Quotation", "Service", "Status",
    "China Received", "Arrived PH", "Verified CBM", "Verified kg", "Invoice No.", "Invoice Status", "KD Billed PHP",
    "Client Paid PHP", "Last Client Payment", "Balance Due PHP", "Ni Hao Cost PHP", "Ni Hao Cost Source",
    "Ni Hao Paid PHP", "Ni Hao Paid Date", "Ni Hao Reference", "Owed to Ni Hao PHP", "Freight Profit PHP", "Margin %"];
  const lines = shipments.map((shipment) => {
    const invoice = invoiceByShipment.get(String(shipment.id)) ?? null;
    const paid = (invoice ? paymentsByInvoice.get(String(invoice.id)) ?? [] : [])
      .map((p) => ({ date: text(p.payment_date), method: text(p.payment_method), amount: num(p.amount), reference: text(p.reference_number) }));
    const niHaoPaid = (niHaoByTracking.get(text(shipment.tracking_number).toLowerCase()) ?? [])
      .map((p) => ({ date: text(p.expense_date), method: text(p.payment_method), amount: num(p.amount), reference: text(p.reference_number) }));
    const sum = summarize(shipment, invoice, paid, niHaoPaid);
    const last = niHaoPaid[niHaoPaid.length - 1];
    return [
      shipment.tracking_number, shipment.full_name, shipment.customer_code, shipment.company_name, shipment.mobile, shipment.email,
      shipment.quotation_number, shipment.service_type, shipment.status, shipment.warehouse_received_date, shipment.actual_arrival,
      shipment.verified_cbm, shipment.verified_weight_kg, invoice?.invoice_number, invoice ? invoice.status : "Not issued",
      php(sum.billed), php(sum.collected), paid[paid.length - 1]?.date, php(sum.balance), php(sum.niHaoCost),
      sum.niHaoCost === null ? "" : shipment.nihao_cost_source === "estimate" ? "Estimate" : "Actual",
      php(sum.niHaoPaid), last?.date, niHaoPaid.map((p) => p.reference).filter(Boolean).join("; "),
      php(sum.niHaoOwed), php(sum.profit), sum.marginPercent === null ? "" : sum.marginPercent.toFixed(1),
    ].map(csvCell).join(",");
  });
  return new Response(`﻿${[columns.join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="KargoDoor-Shipments-Ledger-${today}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}

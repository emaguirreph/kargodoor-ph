import type { D1Database } from "@cloudflare/workers-types";
import {
  airItems,
  airPerKgRates,
  airPieceRates,
  itemCategories,
  seaRates,
} from "./quotation-pricing";
import { kargoDoorPackageTiers } from "./rates-guide";
import {
  niHaoAirRates,
  niHaoPackageRates,
  niHaoSeaCategories,
} from "./nihao-rates";

const csv = (value: unknown) => {
  const text = String(value ?? "").replace(/^([=+\-@])/, "'$1");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const download = (name: string, columns: string[], rows: Record<string, unknown>[]) =>
  new Response(`\ufeff${[columns.join(","), ...rows.map((row) => columns.map((column) => csv(row[column])).join(","))].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });

const php = (centavos: unknown) => (Number(centavos ?? 0) / 100).toFixed(2);
const filename = (label: string, date: string) => `KargoDoor-${label}-${date}.csv`;

async function expensesCsv(db: D1Database, date: string) {
  const columns = ["Expense Date", "Category", "Payee", "Description", "Amount PHP", "Payment Method", "Reference Number", "Notes", "Created", "Updated"];
  const records = (await db.prepare(`SELECT expense_date, category, payee, description, amount,
    payment_method, reference_number, notes, created_at, updated_at FROM expenses
    ORDER BY expense_date DESC, created_at DESC, id DESC`).all<Record<string, unknown>>()).results;
  const rows = records.map((record) => ({
    "Expense Date": record.expense_date,
    Category: record.category,
    Payee: record.payee,
    Description: record.description,
    "Amount PHP": php(record.amount),
    "Payment Method": record.payment_method,
    "Reference Number": record.reference_number,
    Notes: record.notes,
    Created: record.created_at,
    Updated: record.updated_at,
  }));
  return download(filename("Expenses", date), columns, rows);
}

async function invoicesCsv(db: D1Database, date: string) {
  const columns = ["Invoice Number", "Customer Code", "Customer", "Tracking Number", "Subtotal PHP", "Delivery Charge PHP", "Total PHP", "Paid PHP", "Balance PHP", "Status", "Issued At", "Due At", "Created", "Updated"];
  const records = (await db.prepare(`SELECT i.invoice_number, c.customer_code, c.full_name,
    s.tracking_number, i.subtotal, i.delivery_charge, i.total,
    COALESCE(SUM(p.amount), 0) AS paid, i.status, i.issued_at, i.due_at,
    i.created_at, i.updated_at
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    JOIN shipments s ON s.id = i.shipment_id
    LEFT JOIN payments p ON p.invoice_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC, i.id DESC`).all<Record<string, unknown>>()).results;
  const rows = records.map((record) => ({
    "Invoice Number": record.invoice_number,
    "Customer Code": record.customer_code,
    Customer: record.full_name,
    "Tracking Number": record.tracking_number,
    "Subtotal PHP": php(record.subtotal),
    "Delivery Charge PHP": php(record.delivery_charge),
    "Total PHP": php(record.total),
    "Paid PHP": php(record.paid),
    "Balance PHP": php(Math.max(0, Number(record.total ?? 0) - Number(record.paid ?? 0))),
    Status: record.status,
    "Issued At": record.issued_at,
    "Due At": record.due_at,
    Created: record.created_at,
    Updated: record.updated_at,
  }));
  return download(filename("Invoices", date), columns, rows);
}

async function cashAndCreditsCsv(db: D1Database, date: string) {
  const columns = ["Source", "Date", "Entry Type", "Customer Code", "Customer", "Invoice Number", "Amount PHP", "Payment Method", "Reference Number", "Notes", "Related Record ID", "Record ID", "Created"];
  const [manual, automatic] = await Promise.all([
    db.prepare(`SELECT 'Manual cash / customer credit' AS source, e.entry_date,
      e.entry_type, c.customer_code, c.full_name, NULL AS invoice_number, e.amount,
      NULL AS payment_method, e.reference_number, e.notes, e.related_entry_id,
      e.id AS record_id, e.created_at
      FROM finance_cash_entries e LEFT JOIN customers c ON c.id = e.customer_id`).all<Record<string, unknown>>(),
    db.prepare(`SELECT 'Automatic invoice payment' AS source, p.payment_date AS entry_date,
      'Customer Payment Received' AS entry_type, c.customer_code, c.full_name,
      i.invoice_number, p.amount, p.payment_method, p.reference_number, p.notes,
      NULL AS related_entry_id, p.id AS record_id, p.created_at
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      JOIN customers c ON c.id = p.customer_id`).all<Record<string, unknown>>(),
  ]);
  const rows = [...manual.results, ...automatic.results]
    .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)))
    .map((record) => ({
      Source: record.source,
      Date: record.entry_date,
      "Entry Type": record.entry_type,
      "Customer Code": record.customer_code,
      Customer: record.full_name,
      "Invoice Number": record.invoice_number,
      "Amount PHP": php(record.amount),
      "Payment Method": record.payment_method,
      "Reference Number": record.reference_number,
      Notes: record.notes,
      "Related Record ID": record.related_entry_id,
      "Record ID": record.record_id,
      Created: record.created_at,
    }));
  return download(filename("Cash-Flow-and-Customer-Credits", date), columns, rows);
}

function ratesCsv(date: string) {
  const columns = ["Section", "Item / Category", "Category / Range", "CBM Rate PHP", "Density Rate PHP", "Base Rate / Charging Basis", "Rule"];
  const rows: Record<string, unknown>[] = [
    ...Object.entries(itemCategories).map(([item, category]) => ({
      Section: "Sea Freight Item Rates",
      "Item / Category": item,
      "Category / Range": category,
      "CBM Rate PHP": seaRates[category].cbmRate,
      "Density Rate PHP": seaRates[category].densityRate ?? "Exempt",
      "Base Rate / Charging Basis": "Per CBM",
      Rule: "Density pricing applies above 425 kg/CBM.",
    })),
    ...kargoDoorPackageTiers.map((tier) => ({
      Section: "Sea Freight Package Tiers",
      "Item / Category": tier.tier,
      "Category / Range": tier.range,
      "CBM Rate PHP": "",
      "Density Rate PHP": "",
      "Base Rate / Charging Basis": tier.base,
      Rule: tier.rule,
    })),
    ...airItems.map((item) => ({
      Section: "Air Freight Rates",
      "Item / Category": item,
      "Category / Range": "",
      "CBM Rate PHP": "",
      "Density Rate PHP": "",
      "Base Rate / Charging Basis": item in airPieceRates
        ? `${airPieceRates[item]!} per piece`
        : `${item === "Ordinary Items" ? airPerKgRates.ordinary : item === "Medicine and Food Supplements" ? airPerKgRates.medicine : airPerKgRates.restricted} per kg`,
      Rule: item in airPieceRates ? "Per piece." : "Higher of actual or volumetric weight.",
    })),
  ];
  return download(filename("Rates-and-Pricing", date), columns, rows);
}

function niHaoRatesCsv(date: string) {
  const columns = ["Section", "Item / Category", "Range / Items", "Ni Hao Rate", "KargoDoorPH Rate", "Notes"];
  const rows: Record<string, unknown>[] = [
    ...niHaoSeaCategories.map(([category, items, niHaoRate, kargoCategory]) => ({
      Section: "Sea Freight Category Rates",
      "Item / Category": category,
      "Range / Items": items,
      "Ni Hao Rate": `${niHaoRate} per CBM`,
      "KargoDoorPH Rate": `${seaRates[kargoCategory].cbmRate} per CBM${seaRates[kargoCategory].densityRate === null ? "; density exempt" : `; ${seaRates[kargoCategory].densityRate} per kg density`}`,
      Notes: category === "HIGH VALUE" ? "Mobile / computer parts use KargoDoorPH Mobile / Computers / Tablets rates." : "",
    })),
    ...niHaoPackageRates.map(([tier, range, niHaoRate], index) => ({
      Section: "Sea Freight Package Rates",
      "Item / Category": tier,
      "Range / Items": range,
      "Ni Hao Rate": niHaoRate,
      "KargoDoorPH Rate": `${kargoDoorPackageTiers[index].tier}: ${kargoDoorPackageTiers[index].base}`,
      Notes: kargoDoorPackageTiers[index].rule,
    })),
    ...niHaoAirRates.map(([item, niHaoRate, kargoRate]) => ({
      Section: "Air Freight Rates",
      "Item / Category": item,
      "Range / Items": "",
      "Ni Hao Rate": niHaoRate,
      "KargoDoorPH Rate": kargoRate,
      Notes: "",
    })),
  ];
  return download(filename("Ni-Hao-Rates", date), columns, rows);
}

export async function extendedAdminCsv(action: string | null, db: D1Database, date: string) {
  if (action === "expenses") return expensesCsv(db, date);
  if (action === "invoices") return invoicesCsv(db, date);
  if (action === "cash-and-credits") return cashAndCreditsCsv(db, date);
  if (action === "rates-and-pricing") return ratesCsv(date);
  if (action === "nihao-rates") return niHaoRatesCsv(date);
  return null;
}

import { AdminError } from "./security";
export type FinanceRange = { from: string; to: string };
export function validBusinessDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function philippineToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}
export function financeRange(url: URL, now = new Date()): FinanceRange {
  for (const key of ["from", "to", "preset"])
    if (url.searchParams.getAll(key).length > 1) throw new AdminError("Repeated date-range parameter.");
  const preset = url.searchParams.get("preset") ?? "";
  if (preset) {
    const today = philippineToday(now);
    if (preset === "all") return { from: "", to: "" };
    if (preset === "month") return { from: today.slice(0, 7) + "-01", to: today };
    if (preset === "year") return { from: today.slice(0, 4) + "-01-01", to: today };
    if (preset === "last-month") {
      const last = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      last.setUTCDate(0);
      const to = last.toISOString().slice(0, 10);
      return { from: to.slice(0, 7) + "-01", to };
    }
    throw new AdminError("Choose a valid date preset.");
  }
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  if ((from && !validBusinessDate(from)) || (to && !validBusinessDate(to)))
    throw new AdminError("Enter valid From Date and To Date values.");
  if (from && to && from > to) throw new AdminError("From Date must not be after To Date.");
  return { from, to };
}
// Receipt dates are business dates; only UTC creation timestamps need conversion.
export const shipmentBusinessDateSql = "COALESCE(NULLIF(warehouse_received_date, ''), date(created_at, '+8 hours'))";
export function inFinanceRange(date: string, range: FinanceRange) {
  return validBusinessDate(date) && (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

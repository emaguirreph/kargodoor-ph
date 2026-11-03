/**
 * Estimated arrival window, counted from the day the China warehouse
 * received the cargo. Sea (and FCL) takes 3 to 5 weeks; Air takes 5 to 7 days.
 * It is an estimate only and is never stored.
 */

const windows: Record<string, { from: number; to: number; label: string }> = {
  "Sea Freight": { from: 21, to: 35, label: "3–5 weeks" },
  FCL: { from: 21, to: 35, label: "3–5 weeks" },
  "Air Freight": { from: 5, to: 7, label: "5–7 days" },
};

/** Statuses where the cargo has already arrived or the shipment is over. */
const finishedStatuses = ["Malabon Warehouse", "Delivered", "Cancelled"];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ArrivalWindow = { from: string; to: string; span: string };

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const arrivalWindow = (serviceType: unknown, receivedDate: unknown): ArrivalWindow | null => {
  const window = windows[String(serviceType ?? "")];
  const received = String(receivedDate ?? "");
  if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(received) || Number.isNaN(Date.parse(received))) return null;
  return { from: addDays(received, window.from), to: addDays(received, window.to), span: window.label };
};

const parts = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m: months[m - 1], d };
};

/** "Nov 12 – Nov 26, 2026", or "Dec 28, 2026 – Jan 11, 2027" across years. */
export const formatArrivalWindow = (window: ArrivalWindow) => {
  const a = parts(window.from);
  const b = parts(window.to);
  return a.y === b.y
    ? `${a.m} ${a.d} – ${b.m} ${b.d}, ${b.y}`
    : `${a.m} ${a.d}, ${a.y} – ${b.m} ${b.d}, ${b.y}`;
};

/** Short form for the shipment list: "Nov 12 – 26" or "Nov 27 – Dec 1". */
export const shortArrivalWindow = (window: ArrivalWindow) => {
  const a = parts(window.from);
  const b = parts(window.to);
  return a.m === b.m && a.y === b.y ? `${a.m} ${a.d} – ${b.d}` : `${a.m} ${a.d} – ${b.m} ${b.d}`;
};

/** True once the cargo is in Manila (or the shipment was cancelled), so no estimate is needed. */
export const arrivalWindowDone = (status: unknown) => finishedStatuses.includes(String(status ?? ""));

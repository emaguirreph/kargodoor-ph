// Courier details a customer sends from the portal once their supplier ships
// (Em, 2026-11-15). Shared by the portal page, the portal action and admin.

/** Couriers Chinese suppliers use most; the box still takes any name. */
export const courierChoices = ["SF Express", "ZTO Express", "YTO Express", "STO Express", "Yunda", "JD Logistics", "J&T Express", "Best Express", "Deppon", "EMS / China Post"] as const;

/** Most courier notices one customer can send in 24 hours. */
export const courierDailyLimit = 15;

/** Items that need a check with us first: some are only accepted at certain warehouses, or refused. Same list as the portal reminders. */
export const restrictedItems = ["Batteries", "Liquids", "Chemicals", "Food", "Medicines", "Cosmetics", "Branded goods", "Hazardous materials", "Other regulated products"] as const;

/** The customer's answer about restricted items, as admin sees it. */
export const contentsCheckLabel: Record<string, string> = {
  none: "No restricted items",
  asked: "Has restricted items, already checked with us",
  not_asked: "⚠️ Has restricted items, did NOT check with us",
};
export const contentsChecks = ["none", "asked", "not_asked"] as const;

/** What the customer sees for each admin status. */
export const courierStatusLabel: Record<string, string> = { New: "SENT", Noted: "WE'RE WATCHING FOR IT", Arrived: "AT CHINA WAREHOUSE" };

/** One line of trimmed text, cut to `max` characters. */
export const courierText = (value: FormDataEntryValue | null, max: number) =>
  String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

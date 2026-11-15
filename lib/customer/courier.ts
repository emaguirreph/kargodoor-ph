// Courier details a customer sends from the portal once their supplier ships
// (Em, 2026-11-15). Shared by the portal page, the portal action and admin.

/** Couriers Chinese suppliers use most; the box still takes any name. */
export const courierChoices = ["SF Express", "ZTO Express", "YTO Express", "STO Express", "Yunda", "JD Logistics", "J&T Express", "Best Express", "Deppon", "EMS / China Post"] as const;

/** Most courier notices one customer can send in 24 hours. */
export const courierDailyLimit = 15;

/** What the customer sees for each admin status. */
export const courierStatusLabel: Record<string, string> = { New: "SENT", Noted: "WE'RE WATCHING FOR IT", Arrived: "AT CHINA WAREHOUSE" };

/** One line of trimmed text, cut to `max` characters. */
export const courierText = (value: FormDataEntryValue | null, max: number) =>
  String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

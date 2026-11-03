// Shipment bookings from the website chat assistant: shared rules for the
// public booking endpoints and the admin Bookings page.
import { z } from "zod";
import { getAirEstimate, getSeaEstimate } from "./shipping-estimate.mjs";

import { bookingWarehouses, normalizePhMobile } from "./booking-rules";
export { bookingWarehouses, bookingFileMaxBytes, bookingMaxPhotos, bookingDailyLimit, normalizePhMobile } from "./booking-rules";

const text = (max: number) => z.string().trim().max(max);
const positive = (max: number) => z.coerce.number().finite().min(0).max(max);

export const bookingInput = z.object({
  fullName: text(160).min(2, "Please enter your full name."),
  phone: z.string().transform((value, ctx) => {
    const phone = normalizePhMobile(value);
    if (!phone) ctx.addIssue({ code: "custom", message: "Please enter a valid PH mobile number (09XX XXX XXXX)." });
    return phone ?? "";
  }),
  email: text(254).optional().default("").refine((value) => !value || z.string().email().safeParse(value).success, "Please check your email address."),
  service: z.enum(["sea", "air"]),
  deliveryMode: z.enum(["pickup", "delivery"]),
  deliveryAddress: text(400).optional().default(""),
  item: text(300).min(2, "Please tell us what you are shipping."),
  quantity: text(120).min(1, "Please enter the quantity."),
  cbm: positive(1000),
  weight: positive(100000).refine((value) => value > 0, "Please enter the estimated weight."),
  itemValue: positive(100_000_000).optional(),
  warehouse: z.enum(bookingWarehouses),
  supplier: text(300).min(2, "Please enter your supplier's name or contact."),
  notes: text(1000).optional().default(""),
  consent: z.boolean().refine((value) => value, "Please agree so we can contact you about this booking."),
}).superRefine((value, ctx) => {
  if (value.deliveryMode === "delivery" && value.deliveryAddress.length < 8)
    ctx.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Please enter your delivery address." });
  if (value.service === "sea" && !(value.cbm > 0))
    ctx.addIssue({ code: "custom", path: ["cbm"], message: "Please enter the estimated CBM." });
});
export type BookingInput = z.infer<typeof bookingInput>;

/** Website calculator estimate in centavos (same math as /rates-calculator). */
export function bookingEstimate(service: "sea" | "air", cbm: number, weight: number) {
  const estimate = service === "sea" ? getSeaEstimate(cbm, weight) : getAirEstimate(Math.max(weight, cbm * 167));
  return { amount: Math.round(estimate.amount * 100), tier: estimate.packageName };
}

export const bookingRefPattern = /^KD-BOOK-\d{4,}$/i;
export const formatBookingRef = (n: number) => `KD-BOOK-${String(n).padStart(4, "0")}`;
export const nextBookingNumber = (refs: string[]) =>
  refs.reduce((max, ref) => Math.max(max, Number(String(ref).replace(/^KD-BOOK-/i, "")) || 0), 0) + 1;

/** A booking is looked up with its reference plus the last 4 digits of the phone used. */
export function bookingLookup(raw: unknown) {
  const value = (raw ?? {}) as { ref?: unknown; last4?: unknown };
  const ref = String(value.ref ?? "").trim().toUpperCase();
  const last4 = String(value.last4 ?? "").replace(/\D/g, "");
  if (!bookingRefPattern.test(ref) || last4.length !== 4) return null;
  return { ref, last4 };
}

/** Small first-name greeting for the chat ("Juan"), never the full name. */
export const firstName = (fullName: unknown) => String(fullName ?? "").trim().split(/\s+/)[0] ?? "";

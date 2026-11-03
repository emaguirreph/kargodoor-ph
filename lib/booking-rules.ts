// Booking rules shared by the chat assistant (browser) and the server.
// Kept free of zod so the chat bundle stays small.
export const bookingWarehouses = ["Guangzhou", "Yiwu", "Shishi", "Hong Kong", "Tongda Air Cargo", "Not sure"] as const;
export const bookingFileMaxBytes = 1.5 * 1024 * 1024;
export const bookingMaxPhotos = 5;
/** Bookings one phone number (or one browser) may send in 24 hours. */
export const bookingDailyLimit = 3;

/** Philippine mobile number as 09XXXXXXXXX, or null. Accepts +63 / 63 / 9XX forms and spaces or dashes. */
export function normalizePhMobile(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[\s()+.-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const local = digits.startsWith("639") && digits.length === 12 ? `0${digits.slice(2)}`
    : digits.startsWith("9") && digits.length === 10 ? `0${digits}`
      : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

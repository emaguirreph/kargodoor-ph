import { createBooking, BookingError } from "@/lib/bookings-server";
import { sendBookingAlert } from "@/lib/leads/notify";
import { bookingEnv, failure, json, sameSite } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

export async function POST(request: Request) {
  try {
    if (!sameSite(request)) throw new BookingError("Bookings can only be sent from kargodoorph.com.", 403);
    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) throw new BookingError("Unsupported form format.", 415);
    if (Number(request.headers.get("content-length") ?? 0) > 10 * 1024 * 1024) throw new BookingError("Your photos are too big. Please use smaller photos.", 413);
    const { db, env, ctx } = await bookingEnv();
    const booking = await createBooking(db, await request.formData(), request.headers.get("cf-connecting-ip"));
    const input = booking.input;
    ctx.waitUntil(sendBookingAlert(env.LEAD_EMAIL as Parameters<typeof sendBookingAlert>[0], {
      bookingRef: booking.ref,
      fullName: input.fullName,
      phone: input.phone,
      service: input.service === "sea" ? "Sea Freight" : "Air Freight",
      item: input.item,
      quantity: input.quantity,
      size: `${input.cbm} CBM · ${input.weight} kg`,
      warehouse: input.warehouse,
      estimate: `${peso(booking.estimate.amount)} (${booking.estimate.tier})`,
    }));
    return json({ ref: booking.ref, estimate: booking.estimate.amount / 100, tier: booking.estimate.tier });
  } catch (error) {
    return failure(error, "Chat booking failed");
  }
}

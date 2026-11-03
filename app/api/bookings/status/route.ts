import { bookingLookup } from "@/lib/bookings";
import { bookingStatus, BookingError } from "@/lib/bookings-server";
import { bookingEnv, failure, json, sameSite } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameSite(request)) throw new BookingError("Not allowed.", 403);
    const lookup = bookingLookup(await request.json().catch(() => null));
    if (!lookup) throw new BookingError("Please enter your booking number (KD-BOOK-0000) and the last 4 digits of your mobile number.");
    const { db } = await bookingEnv();
    return json(await bookingStatus(db, lookup));
  } catch (error) {
    return failure(error, "Booking status lookup failed");
  }
}

import { bookingLookup } from "@/lib/bookings";
import { saveCustomerProof, BookingError } from "@/lib/bookings-server";
import { bookingEnv, failure, json, sameSite } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameSite(request)) throw new BookingError("Not allowed.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 2 * 1024 * 1024) throw new BookingError("The file is over 1.5 MB. Please send a smaller screenshot.", 413);
    const form = await request.formData();
    const lookup = bookingLookup({ ref: form.get("ref"), last4: form.get("last4") });
    const file = form.get("file");
    if (!lookup) throw new BookingError("Please enter your booking number and the last 4 digits of your mobile number.");
    if (!(file instanceof File)) throw new BookingError("Please choose your screenshot or receipt.");
    const { db } = await bookingEnv();
    await saveCustomerProof(db, lookup, file);
    return json({ ok: true });
  } catch (error) {
    return failure(error, "Customer proof upload failed");
  }
}

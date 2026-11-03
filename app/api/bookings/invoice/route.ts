import { bookingLookup } from "@/lib/bookings";
import { paidInvoicePdf, BookingError } from "@/lib/bookings-server";
import { bookingEnv, failure, sameSite } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sameSite(request)) throw new BookingError("Not allowed.", 403);
    const lookup = bookingLookup(await request.json().catch(() => null));
    if (!lookup) throw new BookingError("Please enter your booking number and the last 4 digits of your mobile number.");
    const { db } = await bookingEnv();
    const { pdf, name } = await paidInvoicePdf(db, lookup);
    return new Response(pdf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "Paid invoice download failed");
  }
}

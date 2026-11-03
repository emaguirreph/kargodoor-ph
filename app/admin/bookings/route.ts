import { bookingsPage } from "@/lib/admin/bookings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => bookingsPage(request);
export const POST = (request: Request) => bookingsPage(request);

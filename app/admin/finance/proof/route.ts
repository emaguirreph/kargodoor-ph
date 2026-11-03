import { proofRequest } from "@/lib/admin/payment-proof";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => proofRequest(request);
export const POST = (request: Request) => proofRequest(request);

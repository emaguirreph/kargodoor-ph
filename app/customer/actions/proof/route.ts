import { sendProof } from "@/lib/customer/portal-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request) => sendProof(request);
export const GET = () => new Response("Method not allowed.", { status: 405, headers: { Allow: "POST" } });

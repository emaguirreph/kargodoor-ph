import { niHaoFileRequest } from "@/lib/admin/nihao-details";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => niHaoFileRequest(request);
export const POST = (request: Request) => niHaoFileRequest(request);

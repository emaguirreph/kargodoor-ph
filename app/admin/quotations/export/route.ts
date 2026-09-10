import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerQuotationPdf } from "@/lib/admin/quotation-pdf";
import { AdminError, authenticate, secureHeaders, type AdminEnv } from "@/lib/admin/security";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Row=Record<string,unknown>;
export async function GET(request:Request){try{const {env:cf}=await getCloudflareContext();const env=cf as unknown as AdminEnv;await authenticate(request,env);const id=new URL(request.url).searchParams.get("id")??"";if(!/^[\\da-f-]{36}$/i.test(id))throw new AdminError("Invalid quotation ID.");const quotation=await env.ADMIN_DB.prepare("SELECT * FROM quotations WHERE id=?").bind(id).first<Row>();if(!quotation)throw new AdminError("Quotation not found.",404);const filename=String(quotation.quotation_number).replace(/[^A-Za-z0-9-]/g,"")||"quotation";return new Response(customerQuotationPdf(quotation),{headers:{...secureHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}.pdf"`}});}catch(error){const err=error instanceof AdminError?error:new AdminError("PDF export is unavailable.",500);return new Response(err.message,{status:err.status,headers:{...secureHeaders,"Content-Type":"text/plain; charset=utf-8"}});}}

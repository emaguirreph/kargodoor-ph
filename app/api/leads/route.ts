import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAirEstimate, getSeaEstimate } from "@/lib/shipping-estimate.mjs";
import type { AdminEnv } from "@/lib/admin/security";
import { sendLeadAlert } from "@/lib/leads/notify";

export const runtime = "nodejs";

const leadInput = z.object({
  fullName: z.string().trim().min(1).max(160),
  phone: z.string().trim().regex(/^[+\d() .-]{5,40}$/),
  email: z.string().trim().max(254).optional().default("").refine((value) => !value || z.string().email().safeParse(value).success),
  consent: z.literal(true),
  service: z.enum(["sea", "air"]),
  cbm: z.number().finite().positive().max(1_000_000),
  weight: z.number().finite().positive().max(100_000_000),
}).strict();

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Unsupported form format." }, 415);
    const raw = await request.json();
    const parsed = leadInput.safeParse(raw);
    if (!parsed.success) return json({ error: "Please enter a valid name, phone number, consent, and shipment details." }, 400);
    const input = parsed.data;
    const estimate = input.service === "sea"
      ? getSeaEstimate(input.cbm, input.weight)
      : getAirEstimate(Math.max(input.weight, input.cbm * 167));
    const { env: cf, ctx } = await getCloudflareContext();
    const db = (cf as unknown as AdminEnv).ADMIN_DB;
    const codes = (await db.prepare("SELECT lead_code FROM leads WHERE lead_code LIKE 'KD-LEAD-%'").all<{ lead_code: string }>()).results;
    const next = codes.reduce((max, row) => Math.max(max, Number(String(row.lead_code).replace("KD-LEAD-", "")) || 0), 0) + 1;
    const now = new Date().toISOString();
    const leadCode = `KD-LEAD-${String(next).padStart(6, "0")}`;
    await db.prepare("INSERT INTO leads (id,lead_code,full_name,phone,email,service_type,cbm,weight_kg,density_kg_cbm,estimated_rate,source,contacted_status,sales_status,notes,consent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(randomUUID(), leadCode, input.fullName, input.phone, input.email.toLowerCase() || null, input.service === "sea" ? "Sea Freight" : "Air Freight", input.cbm, input.weight, input.service === "sea" ? input.weight / input.cbm : null, Math.round(estimate.amount * 100), "Website Calculator", "No", "New", null, 1, now, now).run();
    ctx.waitUntil(sendLeadAlert((cf as unknown as { LEAD_EMAIL?: Parameters<typeof sendLeadAlert>[0] }).LEAD_EMAIL, {
      leadCode,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      service: input.service === "sea" ? "Sea Freight" : "Air Freight",
      cbm: input.cbm,
      weightKg: input.weight,
      estimate: `₱${estimate.amount.toLocaleString("en-PH")}`,
      tier: estimate.packageName,
    }));
    return json({ estimate });
  } catch (error) {
    console.error("Website lead submission failed", error);
    return json({ error: "We could not save your inquiry. Please try again." }, 500);
  }
}

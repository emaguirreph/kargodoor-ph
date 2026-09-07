import { z, ZodError } from "zod";
export const warehouses = ["Guangzhou", "Yiwu", "Shishi", "Hong Kong", "Taiwan"] as const;
export const statuses = [
  "Received at Warehouse",
  "In Transit",
  "Arrived in Philippines",
  "Ready for Release",
  "Delivered",
  "Cancelled",
] as const;
const required = (max: number) =>
  z.string().trim().min(1, "Required value is missing").max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const decimal = (max: number) =>
  required(30)
    .regex(/^\d+(\.\d{1,3})?$/, "Use a positive number with up to 3 decimals")
    .transform(Number)
    .refine((n) => Number.isFinite(n) && n <= max, "Number is too large");
const money = required(30)
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Use a non-negative peso amount with at most 2 decimals",
  )
  .transform((v) => {
    const [pesos, cents = ""] = v.split(".");
    return Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  })
  .refine(
    (n) => Number.isSafeInteger(n) && n <= 100000000000,
    "Amount is too large",
  );
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Enter a valid date",
  )
  .transform((v) => v || null);
export const customerSchema = z
  .object({
    customer_code: required(40)
      .regex(/^[a-zA-Z0-9-]+$/, "Use letters, numbers and hyphens")
      .transform((v) => v.toUpperCase()),
    full_name: required(160),
    company_name: optional(160),
    mobile: required(40).regex(
      /^[+\d() .-]{5,40}$/,
      "Enter a valid phone number",
    ),
    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        (v) => !v || z.string().email().safeParse(v).success,
        "Enter a valid email",
      )
      .transform((v) => v.toLowerCase() || null),
    address: optional(1000),
    notes: optional(4000),
  })
  .strict();
export const shipmentSchema = z
  .object({
    customer_id: z.string().uuid(),
    tracking_number: required(60)
      .regex(/^[A-Za-z0-9-]+$/)
      .transform((v) => v.toUpperCase()),
    service_type: z.enum(["Sea Freight", "Air Freight"]),
    china_warehouse: z.enum(warehouses),
    cbm: decimal(1000000),
    weight_kg: decimal(100000000),
    status: z.enum(statuses),
    estimated_arrival: date,
    actual_arrival: date,
    shipping_charge: money,
    nihao_cost: z.union([z.literal("").transform(() => null), money]),
    delivery_charge: money,
    payment_status: z.enum(["Unpaid", "Partial", "Paid"]),
  })
  .strict();
export const schemas = { customers: customerSchema, shipments: shipmentSchema };
export type Entity = keyof typeof schemas;
export type RecordData = Record<string, string | number | null>;
export function parseForm(entity: Entity, form: URLSearchParams) {
  const allowed = [
    ...Object.keys(schemas[entity].shape),
    "id",
    "revision",
    "csrf",
  ];
  for (const key of form.keys())
    if (!allowed.includes(key) || form.getAll(key).length !== 1)
      throw new ZodError([{ code: "custom", path: [key], message: "Unexpected or repeated form field" }]);
  return schemas[entity].parse(
    Object.fromEntries(
      Object.keys(schemas[entity].shape).map((key) => [
        key,
        form.get(key) ?? "",
      ]),
    ),
  );
}

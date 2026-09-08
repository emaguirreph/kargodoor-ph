import { z, ZodError } from "zod";

export const warehouses = [
  "Guangzhou",
  "Yiwu",
  "Shishi",
  "Hong Kong",
  "Taiwan",
] as const;

export const statuses = [
  "Received at Warehouse",
  "In Transit",
  "Arrived in Philippines",
  "Ready for Release",
  "Delivered",
  "Cancelled",
] as const;

const required = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Required value is missing")
    .max(max);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const decimal = (max: number) =>
  required(30)
    .regex(
      /^\d+(\.\d{1,3})?$/,
      "Use a positive number with up to 3 decimals",
    )
    .transform(Number)
    .refine(
      (number) =>
        Number.isFinite(number) &&
        number <= max,
      "Number is too large",
    );

const money = required(30)
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Use a non-negative peso amount with at most 2 decimals",
  )
  .transform((value) => {
    const [pesos, cents = ""] =
      value.split(".");

    return (
      Number(pesos) * 100 +
      Number(cents.padEnd(2, "0"))
    );
  })
  .refine(
    (number) =>
      Number.isSafeInteger(number) &&
      number <= 100000000000,
    "Amount is too large",
  );

const date = z
  .string()
  .refine(
    (value) =>
      !value ||
      (
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value)
          .toISOString()
          .slice(0, 10) === value
      ),
    "Enter a valid date",
  )
  .transform((value) => value || null);

export const customerSchema = z
  .object({
    customer_code: required(40)
      .regex(
        /^[a-zA-Z0-9-]+$/,
        "Use letters, numbers and hyphens",
      )
      .transform((value) =>
        value.toUpperCase(),
      ),

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
        (value) =>
          !value ||
          z
            .string()
            .email()
            .safeParse(value)
            .success,
        "Enter a valid email",
      )
      .transform(
        (value) =>
          value.toLowerCase() || null,
      ),

    address: optional(1000),

    notes: optional(4000),
  })
  .strict();

const shipmentObjectSchema = z
  .object({
    customer_id: z
      .string()
      .uuid(),

    tracking_number: required(60)
      .regex(
        /^[A-Za-z0-9-]+$/,
        "Use letters, numbers and hyphens",
      )
      .transform((value) =>
        value.toUpperCase(),
      ),

    cargo_code: required(60)
      .regex(
        /^(?:AIR-)?KDOOR-\d{4,}$/,
        "Use a valid cargo code such as KDOOR-0001 or AIR-KDOOR-0001",
      )
      .transform((value) =>
        value.toUpperCase(),
      ),

    service_type: z.enum([
      "Sea Freight",
      "Air Freight",
    ]),

    china_warehouse:
      z.enum(warehouses),

    warehouse_received_date:
      date,

    departure_date:
      date,

    cbm: decimal(1000000),

    weight_kg:
      decimal(100000000),

    status:
      z.enum(statuses),

    estimated_arrival:
      date,

    actual_arrival:
      date,

    tracking_remarks:
      optional(2000),

    shipping_charge:
      money,

    nihao_cost: z.union([
      z
        .literal("")
        .transform(() => null),
      money,
    ]),

    delivery_charge:
      money,

    payment_status: z.enum([
      "Unpaid",
      "Partial",
      "Paid",
    ]),
  })
  .strict();

export const shipmentSchema =
  shipmentObjectSchema.superRefine(
    (values, context) => {
      const isAir =
        values.service_type ===
        "Air Freight";

      const cargoIsAir =
        values.cargo_code.startsWith(
          "AIR-",
        );

      if (isAir !== cargoIsAir) {
        context.addIssue({
          code: "custom",
          path: ["cargo_code"],
          message:
            isAir
              ? "Air Freight cargo codes must start with AIR-KDOOR-."
              : "Sea Freight cargo codes must start with KDOOR- and must not use AIR-KDOOR-.",
        });
      }

      if (
        values.departure_date &&
        values.warehouse_received_date &&
        values.departure_date <
          values.warehouse_received_date
      ) {
        context.addIssue({
          code: "custom",
          path: [
            "departure_date",
          ],
          message:
            "Departure date cannot be before the warehouse received date",
        });
      }

      if (
        values.actual_arrival &&
        values.departure_date &&
        values.actual_arrival <
          values.departure_date
      ) {
        context.addIssue({
          code: "custom",
          path: [
            "actual_arrival",
          ],
          message:
            "Actual arrival cannot be before the departure date",
        });
      }
    },
  );

export const schemas = {
  customers: customerSchema,
  shipments: shipmentSchema,
};

export type Entity =
  keyof typeof schemas;

export type RecordData =
  Record<
    string,
    string | number | null
  >;

export const schemaKeys: Record<
  Entity,
  readonly string[]
> = {
  customers: [
    "customer_code",
    "full_name",
    "company_name",
    "mobile",
    "email",
    "address",
    "notes",
  ],

  shipments: [
    "customer_id",
    "tracking_number",
    "cargo_code",
    "service_type",
    "china_warehouse",
    "warehouse_received_date",
    "departure_date",
    "cbm",
    "weight_kg",
    "status",
    "estimated_arrival",
    "actual_arrival",
    "tracking_remarks",
    "shipping_charge",
    "nihao_cost",
    "delivery_charge",
    "payment_status",
  ],
};

export function parseForm(
  entity: Entity,
  form: URLSearchParams,
) {
  const keys =
    schemaKeys[entity];

  const allowed = [
    ...keys,
    "id",
    "revision",
    "csrf",
  ];

  for (const key of form.keys()) {
    if (
      !allowed.includes(key) ||
      form.getAll(key).length !== 1
    ) {
      throw new ZodError([
        {
          code: "custom",
          path: [key],
          message:
            "Unexpected or repeated form field",
        },
      ]);
    }
  }

  const raw =
    Object.fromEntries(
      keys.map((key) => [
        key,
        form.get(key) ?? "",
      ]),
    );

  if (entity === "customers") {
    return customerSchema.parse(raw);
  }

  return shipmentSchema.parse(raw);
}

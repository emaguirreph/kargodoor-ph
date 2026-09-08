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
        /^(?:KD-?(?:SEA|AIR)-?\d{6,}|(?:AIR-)?KDOOR-?\d{4,})$/i,
        "Use KDSEA000001 or KDAIR000001. Existing dashed numbers are also accepted.",
      )
      .transform((value) =>
        value.toUpperCase(),
      ),

    // Legacy field retained for existing records and the separate tracking editor.
    // New admin shipments are identified publicly by tracking_number.
    cargo_code: optional(60)
      .refine(
        (value) => value === null || /^[A-Za-z0-9-]+$/.test(value),
        "Use letters, numbers and hyphens",
      )
      .transform((value) => value?.toUpperCase() ?? null),

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
      if (
        values.departure_date &&
        values.warehouse_received_date &&
        values.departure_date <
          values.warehouse_received_date
      ) {
        context.addIssue({
          code: "custom",
          path: ["departure_date"],
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
          path: ["actual_arrival"],
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

export type RecordData = Record<
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

const formKeys: Record<Entity, readonly string[]> = {
  customers: schemaKeys.customers.filter((key) => key !== "customer_code"),
  shipments: schemaKeys.shipments.filter(
    (key) => key !== "tracking_number" && key !== "cargo_code",
  ),
};

const customerFormSchema = customerSchema.omit({ customer_code: true });
const shipmentFormSchema = shipmentObjectSchema
  .omit({ tracking_number: true, cargo_code: true })
  .superRefine((values, context) => {
    if (values.departure_date && values.warehouse_received_date && values.departure_date < values.warehouse_received_date)
      context.addIssue({ code: "custom", path: ["departure_date"], message: "Departure date cannot be before the warehouse received date" });
    if (values.actual_arrival && values.departure_date && values.actual_arrival < values.departure_date)
      context.addIssue({ code: "custom", path: ["actual_arrival"], message: "Actual arrival cannot be before the departure date" });
  });

export function parseForm(
  entity: Entity,
  form: URLSearchParams,
) {
  const keys = formKeys[entity];

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
    return customerFormSchema.parse(raw);
  }

  return shipmentFormSchema.parse(raw);
}

export const expenseSchema = z.object({
  expense_date: date.refine((value) => value !== null, "Expense date is required"),
  category: required(160),
  payee: optional(160),
  description: required(2000),
  amount: money.refine((value) => value > 0, "Amount must be greater than zero"),
  payment_method: optional(160),
  reference_number: optional(160),
  tracking_number: optional(60),
  notes: optional(4000),
}).strict();

export function parseExpenseForm(form: URLSearchParams) {
  const keys = Object.keys(expenseSchema.shape);
  for (const key of form.keys()) {
    if (![...keys, "csrf"].includes(key) || form.getAll(key).length !== 1) {
      throw new ZodError([{ code: "custom", path: [key], message: "Unexpected or repeated form field" }]);
    }
  }
  return expenseSchema.parse(Object.fromEntries(keys.map((key) => [key, form.get(key) ?? ""])));
}

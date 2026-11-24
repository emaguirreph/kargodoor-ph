// Shipping terms a customer must agree to before booking in the portal
// (Em, 2026-11-16: "like a terms and condition… so they have nothing against us").
// Bump the version when the wording changes; the booking saves which one was agreed.
export const shippingTermsVersion = "2026-11-16";

export const shippingTerms = [
  "Message KargoDoor BEFORE your supplier ships if your order has batteries, power banks, liquids, chemicals, food, medicines, cosmetics or other regulated items. Some items are only accepted at certain China warehouses, and some can't be shipped at all.",
  "Every package must show your KargoDoor code (KDOOR-XXXX) on the label. The warehouse may REFUSE packages with no code, an incomplete label or damaged packaging.",
  "If a package is refused, returned, held, seized or lost because of restricted items, a missing code or a wrong label, that is the customer's responsibility. KargoDoor is not liable, and any return, storage or courier fees are paid by the customer.",
  "Fake or counterfeit products are NOT allowed. Branded items are OK only if they are original.",
  "Final charges are based on the CBM and weight verified by our China warehouse.",
] as const;

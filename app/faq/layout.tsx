import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "China to Philippines Shipping FAQ | KargoDoor PH",
  "Answers about shipping from China to the Philippines, sea freight, air freight, cargo codes, warehouse locations, customs clearance, rates, and delivery.",
  "/faq",
);

export default function FaqLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

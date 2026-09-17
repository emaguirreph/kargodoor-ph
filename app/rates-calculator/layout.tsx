import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "China to Philippines Shipping Rates & Calculator | KargoDoor PH",
  "Estimate sea freight and air freight shipping costs from China to the Philippines using KargoDoor PH's shipping calculator for CBM, weight, and volumetric weight.",
  "/rates-calculator",
);

export default function RatesCalculatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Shipping Rates & Calculator | KargoDoor PH", "View KargoDoor PH shipping rates and estimate your China to Philippines sea or air freight cost with our shipping calculator.", "/rates-calculator");

export default function RatesCalculatorLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Shipping FAQ | KargoDoor PH", "Get answers about KargoDoor PH shipping, China warehouse locations, transit times, package sizes, payments, tracking, and cargo receiving.", "/faq");

export default function FaqLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

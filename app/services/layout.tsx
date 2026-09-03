import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("China to Philippines Shipping Services | KargoDoor PH", "Explore KargoDoor PH sea freight, air freight, small-package shipping, and all-in shipping services from China to the Philippines.", "/services");

export default function ServicesLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

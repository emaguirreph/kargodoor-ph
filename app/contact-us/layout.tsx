import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Contact KargoDoor PH | China Shipping Philippines", "Contact KargoDoor PH for China to Philippines shipping inquiries, rates, warehouse coordination, cargo assistance, and quotations.", "/contact-us");

export default function ContactUsLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

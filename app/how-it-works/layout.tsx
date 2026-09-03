import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("How It Works | KargoDoor PH", "Learn how to ship from China to the Philippines with KargoDoor PH—from sourcing and warehouse receiving to international shipping and cargo release.", "/how-it-works");

export default function HowItWorksLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

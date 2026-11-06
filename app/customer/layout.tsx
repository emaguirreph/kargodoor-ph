import type { Metadata } from "next";
import { noIndex } from "@/lib/seo";

// The customer portal is private: keep its pages out of Google.
export const metadata: Metadata = {
  title: "MY KargoDoorPH | Customer Portal",
  ...noIndex,
};

export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

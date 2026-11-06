import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Track Your Shipment | China to Philippines Cargo Tracking | KargoDoor PH",
  "Track your KargoDoor PH sea freight or air freight shipment from China to the Philippines using your tracking number.",
  "/track",
);

export default function TrackLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }

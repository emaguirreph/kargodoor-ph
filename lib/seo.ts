import type { Metadata } from "next";

export const siteUrl = "https://kargodoorph.com";
export const socialTitle = "KargoDoor PH | China to Philippines Shipping";
export const socialDescription = "SOURCE · SHIP · RECEIVE. Simple, reliable, and affordable shipping from China to the Philippines.";

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: "KargoDoor PH", title: socialTitle, description: socialDescription },
    twitter: { card: "summary", title: socialTitle, description: socialDescription },
  };
}

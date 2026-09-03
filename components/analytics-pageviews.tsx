"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const measurementId = "G-N0SJG6R2VH";

export function AnalyticsPageViews() {
  const pathname = usePathname();

  useEffect(() => {
    window.gtag?.("config", measurementId, { page_path: pathname });
  }, [pathname]);

  return null;
}

"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";

type TrackedLinkProps = ComponentProps<typeof Link> & { analyticsEvent?: AnalyticsEvent };

export function TrackedLink({ analyticsEvent, onClick, ...props }: TrackedLinkProps) {
  return <Link {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && analyticsEvent) trackEvent(analyticsEvent); }} />;
}

type TrackedAnchorProps = ComponentProps<"a"> & { analyticsEvent?: AnalyticsEvent };

export function TrackedAnchor({ analyticsEvent, onClick, ...props }: TrackedAnchorProps) {
  return <a {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && analyticsEvent) trackEvent(analyticsEvent); }} />;
}

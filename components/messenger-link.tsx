"use client";

import type { ComponentProps } from "react";
import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";
import {
  MESSENGER_URL,
  messengerPlatform,
  startMessengerNavigation,
} from "@/lib/contact-links";

type Props = Omit<ComponentProps<"a">, "href"> & {
  analyticsEvent?: AnalyticsEvent;
};

export function MessengerLink({ analyticsEvent, onClick, ...props }: Props) {
  return (
    <a
      {...props}
      href={MESSENGER_URL}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (analyticsEvent) trackEvent(analyticsEvent);
        const platform = messengerPlatform(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints,
        );
        if (platform === "desktop") return;
        event.preventDefault();
        startMessengerNavigation(platform, {
          navigate: (url) => window.location.assign(url),
          schedule: (callback, delay) => window.setTimeout(callback, delay),
          onHidden: (callback) => {
            const listener = () => {
              if (document.visibilityState === "hidden") callback();
            };
            document.addEventListener("visibilitychange", listener);
            return () => document.removeEventListener("visibilitychange", listener);
          },
          isHidden: () => document.visibilityState === "hidden",
        });
      }}
    />
  );
}

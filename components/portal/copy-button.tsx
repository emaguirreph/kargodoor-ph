"use client";

import { useState } from "react";

/** A button that copies text and briefly says COPIED. */
export function CopyButton({ text, label, className = "pbtn pbtn-line" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? "COPIED ✓" : label}
    </button>
  );
}

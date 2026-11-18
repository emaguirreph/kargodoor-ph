"use client";

import { useEffect, useRef } from "react";
import { shrinkImage, type ShrinkMode } from "@/lib/shrink-image";

/**
 * Put inside a plain portal upload form. On submit, every file box marked
 * data-shrink="photo" or data-shrink="doc" has its photos made smaller in the
 * browser first, then the form is sent as usual. Without JavaScript the form
 * still works and sends the original files.
 */
export function ShrinkOnSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form || typeof DataTransfer === "undefined") return;
    let ready = false;
    const onSubmit = async (event: SubmitEvent) => {
      if (ready) return;
      const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type="file"][data-shrink]')].filter((input) => input.files?.length);
      if (!inputs.length) return;
      event.preventDefault();
      const button = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const label = button?.textContent ?? "";
      if (button) { button.disabled = true; button.textContent = "PREPARING PHOTOS…"; }
      for (const input of inputs) {
        const mode = (input.dataset.shrink === "photo" ? "photo" : "doc") as ShrinkMode;
        const files = await Promise.all([...(input.files ?? [])].map((file) => shrinkImage(file, mode)));
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
      }
      if (button) { button.disabled = false; button.textContent = label; }
      ready = true;
      form.submit();
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);
  return <span ref={ref} hidden />;
}

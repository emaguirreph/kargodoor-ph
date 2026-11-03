(() => {
  // Proof of payment boxes (customer payments and expenses): drop a screenshot
  // or PDF on a box, or choose one, and it uploads right away. A photo over
  // 1.5 MB is made smaller in the browser first so phone screenshots fit.
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const maxBytes = 1.5 * 1024 * 1024;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  // createImageBitmap reads the file directly, so it works under the admin
  // page's img-src 'self' rule (a blob: image URL would be blocked).
  const shrink = async (file) => {
    if (file.size <= maxBytes || !file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (typeof bitmap.close === "function") bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch {
      return file;
    }
  };

  const setup = () => {
    document.querySelectorAll("[data-proof-drop]").forEach((zone) => {
      const input = zone.querySelector('input[type="file"][name="file"]');
      if (!(input instanceof HTMLInputElement) || !input.form) return;
      const form = input.form;
      const status = zone.querySelector("[data-proof-status]");
      const say = (text) => { if (status) status.textContent = text; };
      let depth = 0;
      let busy = false;

      const send = async (picked) => {
        if (busy) return;
        if (picked.type && !allowed.includes(picked.type)) { say("Use a PDF, JPEG, PNG or WebP file."); return; }
        busy = true;
        zone.classList.add("is-uploading");
        say("Preparing…");
        const file = await shrink(picked);
        if (file.size > maxBytes) {
          busy = false;
          zone.classList.remove("is-uploading");
          say("The file is over 1.5 MB.");
          return;
        }
        if (file !== picked || input.files?.[0] !== picked) {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
        }
        say(`Uploading ${file.name}…`);
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
      };

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) send(file);
      });
      zone.addEventListener("dragenter", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth += 1;
        zone.classList.add("is-dragover");
      });
      zone.addEventListener("dragover", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      });
      zone.addEventListener("dragleave", () => {
        depth = Math.max(0, depth - 1);
        if (!depth) zone.classList.remove("is-dragover");
      });
      zone.addEventListener("drop", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth = 0;
        zone.classList.remove("is-dragover");
        const files = event.dataTransfer?.files;
        if (!files || files.length !== 1) { say("Drop one file only."); return; }
        send(files[0]);
      });
    });
  };

  // A file dropped next to a box should not open in the browser and leave the page.
  window.addEventListener("dragover", (event) => { if (hasFiles(event)) event.preventDefault(); });
  window.addEventListener("drop", (event) => { if (hasFiles(event)) event.preventDefault(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();

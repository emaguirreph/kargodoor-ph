(() => {
  // Drag and drop for the Ni Hao file box in Edit shipment: drop a PDF or
  // photo on the box and it uploads right away (same form as the Upload button).
  // Photos are made smaller in the browser first (admin-image-shrink.js), for
  // drops and for the Upload button; PDFs upload as they are.
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const maxBytes = 1.5 * 1024 * 1024;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
  const shrink = (file) => (typeof window.kdShrinkImage === "function" ? window.kdShrinkImage(file, "doc") : Promise.resolve(file));

  const setup = () => {
    document.querySelectorAll(".nihao-file-row").forEach((zone) => {
      const input = zone.querySelector('input[type="file"][name="file"]');
      if (!(input instanceof HTMLInputElement) || !input.form) return;
      const status = zone.querySelector("[data-nihao-drop-status]");
      const say = (text) => { if (status) status.textContent = text; };
      let depth = 0;

      const form = input.form;
      let busy = false;
      let ready = false;

      // Shrink, put the result back in the file box, then submit the form.
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
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        const note = typeof window.kdShrinkNote === "function" ? window.kdShrinkNote(picked, file) : "";
        say(`${note ? note + " " : ""}Uploading ${file.name}…`);
        ready = true;
        // Next tick: a submit asked for while the first submit event is still
        // running is ignored by the browser (this happens for PDFs, which need no shrinking).
        setTimeout(() => {
          if (typeof form.requestSubmit === "function") form.requestSubmit();
          else form.submit();
        }, 0);
      };

      // The Upload button: stop the plain submit once, shrink, then send.
      form.addEventListener("submit", (event) => {
        if (ready) return;
        const file = input.files?.[0];
        if (!file) return;
        event.preventDefault();
        send(file);
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

  // A file dropped next to the box should not open in the browser and leave the form.
  window.addEventListener("dragover", (event) => { if (hasFiles(event)) event.preventDefault(); });
  window.addEventListener("drop", (event) => { if (hasFiles(event)) event.preventDefault(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();

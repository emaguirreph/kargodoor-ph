(() => {
  // Drag and drop for the Ni Hao file box in Edit shipment: drop a PDF or
  // photo on the box and it uploads right away (same form as the Upload button).
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  const setup = () => {
    document.querySelectorAll(".nihao-file-row").forEach((zone) => {
      const input = zone.querySelector('input[type="file"][name="file"]');
      if (!(input instanceof HTMLInputElement) || !input.form) return;
      const status = zone.querySelector("[data-nihao-drop-status]");
      const say = (text) => { if (status) status.textContent = text; };
      let depth = 0;

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
        const file = files[0];
        if (file.type && !allowed.includes(file.type)) { say("Use a PDF, JPEG, PNG or WebP file."); return; }
        if (file.size > 1.5 * 1024 * 1024) { say("The file is over 1.5 MB."); return; }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        say(`Uploading ${file.name}…`);
        zone.classList.add("is-uploading");
        if (typeof input.form.requestSubmit === "function") input.form.requestSubmit();
        else input.form.submit();
      });
    });
  };

  // A file dropped next to the box should not open in the browser and leave the form.
  window.addEventListener("dragover", (event) => { if (hasFiles(event)) event.preventDefault(); });
  window.addEventListener("drop", (event) => { if (hasFiles(event)) event.preventDefault(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();

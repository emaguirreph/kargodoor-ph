(() => {
  const form = document.querySelector("[data-insight-editor]");
  const input = document.querySelector("[data-insight-image]");
  if (!form || !input || !window.HTMLCanvasElement) return;
  form.addEventListener("submit", async (event) => {
    const file = input.files && input.files[0];
    if (!file || file.type === "image/webp") return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) return;
    event.preventDefault();
    const action = event.submitter && event.submitter.value;
    if (action) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "action";
      hidden.value = action;
      form.append(hidden);
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) return form.submit();
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }));
        input.files = transfer.files;
        form.submit();
      }, "image/webp", .82);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); form.submit(); };
    image.src = objectUrl;
  }, { once: true });
})();

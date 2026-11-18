(() => {
  // Blog cover: shrink the photo in the browser (admin-image-shrink.js,
  // "photo" size: 1600 px, about 300 KB) before the form is sent.
  const form = document.querySelector("[data-insight-editor]");
  const input = document.querySelector("[data-insight-image]");
  if (!form || !input || typeof window.kdShrinkImage !== "function") return;
  let ready = false;
  form.addEventListener("submit", async (event) => {
    if (ready) return;
    const file = input.files && input.files[0];
    if (!file) return;
    event.preventDefault();
    const action = event.submitter && event.submitter.value;
    if (action) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "action";
      hidden.value = action;
      form.append(hidden);
    }
    const small = await window.kdShrinkImage(file, "photo");
    if (small !== file) {
      const transfer = new DataTransfer();
      transfer.items.add(small);
      input.files = transfer.files;
    }
    ready = true;
    form.submit();
  });
})();

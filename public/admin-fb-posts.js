(() => {
  // FB Posts: make a big image (Canva PNG, phone photo) smaller in the browser before upload
  // (admin-image-shrink.js, "post" size: up to 2048 px, under about 1.5 MB), so it fits the
  // database and Facebook still gets a sharp picture.
  if (typeof window.kdShrinkImage !== "function") return;
  for (const form of document.querySelectorAll("[data-fb-post-form]")) {
    const input = form.querySelector("[data-fb-post-image]");
    if (!input) continue;
    let ready = false;
    form.addEventListener("submit", async (event) => {
      if (ready) return;
      const file = input.files && input.files[0];
      if (!file || file.size <= 1500 * 1024) return;
      event.preventDefault();
      const action = event.submitter && event.submitter.value;
      if (action) {
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "action";
        hidden.value = action;
        form.append(hidden);
      }
      const small = await window.kdShrinkImage(file, "post");
      if (small !== file) {
        const transfer = new DataTransfer();
        transfer.items.add(small);
        input.files = transfer.files;
      }
      ready = true;
      form.submit();
    });
  }
})();

(() => {
  // FB Posts: one click = one post. After a form is sent, its buttons are switched off so a
  // second or third click (slow connection) can't schedule the same post again on Facebook.
  for (const form of document.querySelectorAll("form[method=post]")) {
    form.addEventListener("submit", (event) => {
      if (event.defaultPrevented) return;
      if (form.dataset.sent) { event.preventDefault(); return; }
      form.dataset.sent = "1";
      const submitter = event.submitter;
      if (submitter && submitter.name && !form.querySelector(`input[type=hidden][name="${submitter.name}"]`)) {
        const hidden = document.createElement("input");
        hidden.type = "hidden"; hidden.name = submitter.name; hidden.value = submitter.value;
        form.append(hidden);
      }
      setTimeout(() => {
        for (const b of form.querySelectorAll("button, input[type=submit]")) { b.disabled = true; if (b === submitter) b.textContent = "Working…"; }
      }, 0);
    });
  }
})();

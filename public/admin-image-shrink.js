(() => {
  // Shared photo shrinker for admin uploads (proof of payment, Ni Hao file,
  // blog cover). Same recipe as Sabong Sentral's PhotoPicker: redraw the photo
  // on a canvas, cap the longest side, save as WebP (JPEG where the browser
  // cannot make WebP) and lower the quality step by step until it is under the
  // target size. Redrawing also drops the phone's location (EXIF) data.
  //
  // "doc" (default) keeps receipts and Ni Hao papers readable: 2200 px, ~800 KB.
  // "photo" is for pictures like blog covers: 1600 px, ~300 KB.
  // PDFs and anything that is not a JPEG/PNG/WebP photo are returned untouched,
  // and if the browser cannot read the photo the original file is kept.
  const presets = { doc: { maxSide: 2200, target: 800_000 }, photo: { maxSide: 1600, target: 300_000 } };
  const shrinkable = ["image/jpeg", "image/png", "image/webp"];

  // createImageBitmap reads the file directly, so it works under the admin
  // page's img-src 'self' rule (a blob: image URL would be blocked).
  const decode = async (file) => {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { return await createImageBitmap(file); }
  };

  const shrinkImage = async (file, mode) => {
    const { maxSide, target } = presets[mode] || presets.doc;
    if (!file || !shrinkable.includes(file.type) || typeof createImageBitmap !== "function") return file;
    try {
      const bitmap = await decode(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      // Already small enough on both counts: nothing to gain.
      if (scale === 1 && file.size <= target) { if (bitmap.close) bitmap.close(); return file; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { if (bitmap.close) bitmap.close(); return file; }
      // White under see-through PNG parts, so a JPEG fallback is not black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      let type = "image/webp";
      let quality = 0.82;
      let blob = await encode(type, quality);
      if (!blob || blob.type !== "image/webp") { type = "image/jpeg"; blob = await encode(type, quality); }
      while (blob && blob.size > target && quality > 0.45) { quality -= 0.1; blob = await encode(type, quality); }
      if (!blob || blob.size >= file.size) return file;
      const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
      return new File([blob], name, { type, lastModified: Date.now() });
    } catch {
      return file;
    }
  };

  const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-US")} KB`;
  const describe = (before, after) => (after === before ? "" : `Photo made smaller: ${kb(before.size)} → ${kb(after.size)}.`);

  window.kdShrinkImage = shrinkImage;
  window.kdShrinkNote = describe;
})();

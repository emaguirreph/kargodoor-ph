// Browser-only photo shrinker for customer uploads (portal + chat assistant).
// Same recipe as the admin's public/admin-image-shrink.js and Sabong Sentral's
// PhotoPicker: redraw on a canvas, cap the longest side, save as WebP (JPEG
// where WebP is not available), lower the quality, then the size, until the
// file is under a hard cap. Redrawing drops the phone's location (EXIF) data.
// PDFs are returned untouched, and the original is kept if the browser cannot
// read the photo. Keep the numbers in step with admin-image-shrink.js.

export type ShrinkMode = "doc" | "photo";

// doc: receipts, payment screenshots, packing lists (text must stay readable).
// photo: product photos.
const presets: Record<ShrinkMode, { maxSide: number; target: number }> = {
  doc: { maxSide: 2000, target: 300 * 1024 },
  photo: { maxSide: 1600, target: 200 * 1024 },
};
const shrinkable = ["image/jpeg", "image/png", "image/webp"];

async function decode(file: File): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return await createImageBitmap(file); }
}

export async function shrinkImage(file: File, mode: ShrinkMode = "doc"): Promise<File> {
  const { maxSide, target } = presets[mode];
  if (!shrinkable.includes(file.type) || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await decode(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= target) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    const draw = (s: number) => {
      canvas.width = Math.max(1, Math.round(bitmap.width * s));
      canvas.height = Math.max(1, Math.round(bitmap.height * s));
      ctx.fillStyle = "#fff"; // white under see-through PNG parts
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    };
    const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    let size = scale;
    draw(size);
    let type = "image/webp";
    let quality = 0.82;
    let blob = await encode(type, quality);
    if (!blob || blob.type !== "image/webp") { type = "image/jpeg"; blob = await encode(type, quality); }
    for (;;) {
      while (blob && blob.size > target && quality > 0.55) { quality -= 0.1; blob = await encode(type, quality); }
      if (!blob || blob.size <= target || Math.max(canvas.width, canvas.height) <= 600) break;
      size *= 0.85;
      draw(size);
      quality = 0.7;
      blob = await encode(type, quality);
    }
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
    return new File([blob], name, { type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * Normalizes an uploaded image's orientation by drawing it through a
 * <canvas>. Browsers already correctly auto-rotate a JPEG for on-screen
 * display according to its EXIF Orientation tag (however that tag is
 * encoded — multiple metadata segments, unusual encoders, etc. all work,
 * since this is the same well-tested code path every <img> tag uses).
 * Drawing the loaded image onto a canvas bakes that same correction into
 * the actual pixel data, and re-exporting from the canvas produces a
 * fresh image with no orientation tag at all.
 *
 * This means everything downstream (the editor preview, and especially
 * pdf-lib for the PDF export, which does NOT read EXIF orientation and
 * previously required fragile hand-rolled parsing/rotation math) only
 * ever deals with plain, already-upright pixels.
 */
export async function normalizeImageOrientation(file: Blob): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Canvas toBlob failed");
    return blob;
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  if ("createImageBitmap" in window) {
    // imageOrientation: "from-image" explicitly asks for EXIF-corrected
    // pixels (this is also the default in every current browser, but be
    // explicit since that default has changed across browser versions).
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }
  // Fallback for environments without createImageBitmap: load via <img>,
  // which also auto-rotates per EXIF, then treat it as a "bitmap".
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

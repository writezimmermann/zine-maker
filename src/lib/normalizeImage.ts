/**
 * Normalizes an uploaded image's orientation and resolution by drawing it
 * through a <canvas>. Browsers already correctly auto-rotate a JPEG for
 * on-screen display according to its EXIF Orientation tag (however that
 * tag is encoded — multiple metadata segments, unusual encoders, etc. all
 * work, since this is the same well-tested code path every <img> tag
 * uses). Drawing the loaded image onto a canvas bakes that same
 * correction into the actual pixel data, and re-exporting from the canvas
 * produces a fresh image with no orientation tag at all.
 *
 * This means everything downstream (the editor preview, and especially
 * pdf-lib for the PDF export, which does NOT read EXIF orientation and
 * previously required fragile hand-rolled parsing/rotation math) only
 * ever deals with plain, already-upright pixels.
 *
 * The same pass also downsamples the image to a print-appropriate
 * resolution. Photos straight off a modern camera or phone are typically
 * far higher resolution (e.g. 24+ megapixels) than an A5 page can ever
 * resolve on paper, so embedding them at full size into the PDF only adds
 * dead weight — this was the entire reason an 8-page zine's exported PDF
 * could balloon to 40+ MB. MAX_DIMENSION_PX is chosen generously above
 * what's needed for ~400 DPI on A5's printable area, with headroom for
 * the manual zoom/scale control, so there's no visible loss of quality on
 * a printed page.
 */
const MAX_DIMENSION_PX = 3000;
const JPEG_QUALITY = 0.85;

export async function normalizeImageOrientation(file: Blob): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const downscale = Math.min(1, MAX_DIMENSION_PX / longEdge);
    const width = Math.round(bitmap.width * downscale);
    const height = Math.round(bitmap.height * downscale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
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

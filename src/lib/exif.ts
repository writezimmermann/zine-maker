/**
 * Minimal JPEG EXIF orientation reader.
 *
 * Browsers (and the <img> preview in the editor) automatically rotate a
 * JPEG according to its EXIF Orientation tag before displaying it — but
 * pdf-lib embeds the raw, un-rotated pixel buffer as-is. Without this,
 * any photo taken by a phone/camera held sideways (which stores pixels
 * "sideways" and relies on the Orientation tag to display upright) prints
 * sideways in the exported PDF even though it looks correct on screen.
 *
 * This reads just the Orientation tag (EXIF tag 0x0112) out of a JPEG's
 * APP1/Exif segment. Returns 1 (normal) for non-JPEGs, JPEGs with no EXIF,
 * or on any parse error.
 */
export async function readJpegOrientation(blob: Blob): Promise<number> {
  if (blob.type !== "image/jpeg" && blob.type !== "image/jpg") return 1;

  try {
    const buf = await blob.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xffe1) {
        const segmentStart = offset + 2;
        if (view.getUint32(segmentStart) !== 0x45786966) return 1; // "Exif"
        const tiffStart = segmentStart + 6; // skip "Exif\0\0"
        const little = view.getUint16(tiffStart) === 0x4949;
        const getUint16 = (o: number) => view.getUint16(o, little);
        const getUint32 = (o: number) => view.getUint32(o, little);
        const firstIfdOffset = getUint32(tiffStart + 4);
        const ifdStart = tiffStart + firstIfdOffset;
        const entryCount = getUint16(ifdStart);
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          const tag = getUint16(entryOffset);
          if (tag === 0x0112) {
            const value = getUint16(entryOffset + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else if (marker === 0xffd8 || marker === 0xffd9) {
        continue;
      } else {
        offset += view.getUint16(offset);
      }
    }
  } catch {
    return 1;
  }
  return 1;
}

/**
 * Degrees to rotate the raw pixel buffer clockwise to display it upright,
 * plus whether it also needs a horizontal mirror (rare; only orientations
 * 2, 4, 5, 7 are mirrored — these are uncommon from real cameras/phones,
 * so the mirror is reported but callers may choose to ignore it).
 */
export function orientationToRotation(orientation: number): {
  rotationCw: 0 | 90 | 180 | 270;
  mirrored: boolean;
} {
  switch (orientation) {
    case 2:
      return { rotationCw: 0, mirrored: true };
    case 3:
      return { rotationCw: 180, mirrored: false };
    case 4:
      return { rotationCw: 180, mirrored: true };
    case 5:
      return { rotationCw: 90, mirrored: true };
    case 6:
      return { rotationCw: 90, mirrored: false };
    case 7:
      return { rotationCw: 270, mirrored: true };
    case 8:
      return { rotationCw: 270, mirrored: false };
    default:
      return { rotationCw: 0, mirrored: false };
  }
}

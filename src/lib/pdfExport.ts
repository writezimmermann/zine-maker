import {
  PDFDocument,
  PDFImage,
  PDFPage,
  degrees,
  rgb,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  moveTo,
  lineTo,
  type PDFFont,
} from "pdf-lib";
import type { DuplexImpositionPlan, ImpositionPlan, ImpositionSlot } from "./imposition";
import type { PageTransform, ZinePage } from "../types";
import { getImage } from "./db";
import { normalizeImageOrientation } from "./normalizeImage";

const MM_TO_PT = 2.8346456693;
const A5_WIDTH = 148 * MM_TO_PT;
const A5_HEIGHT = 210 * MM_TO_PT;
const A4_WIDTH = A5_WIDTH * 2;
const A4_HEIGHT = A5_HEIGHT;
const CROP_MARK_LEN = 3 * MM_TO_PT;
const CROP_MARK_OFFSET = 1.5 * MM_TO_PT;
/** Whitespace margin kept around every image so nothing is cropped. */
const IMAGE_MARGIN_MM = 10;
const IMAGE_MARGIN = IMAGE_MARGIN_MM * MM_TO_PT;

async function embedImageForBlob(doc: PDFDocument, blob: Blob): Promise<PDFImage> {
  // Belt-and-suspenders: normalize orientation again here, at export time.
  // Images uploaded before normalizeImageOrientation() existed (or from any
  // other path that stored raw bytes) still carry an EXIF orientation tag
  // that pdf-lib itself never reads/respects — only the browser's own
  // decoders (img/canvas/ImageBitmap) do. Re-running the same canvas-based
  // normalization here guarantees pdf-lib always receives already-upright,
  // tag-free pixels, regardless of when/how the image entered storage. This
  // is idempotent: an already-normalized image has no orientation tag, so
  // it round-trips through the canvas unchanged.
  blob = await normalizeImageOrientation(blob);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === "image/png") {
    return doc.embedPng(bytes);
  }
  // default to jpg for jpeg/other; pdf-lib will throw if truly incompatible
  try {
    return await doc.embedJpg(bytes);
  } catch {
    return await doc.embedPng(bytes);
  }
}

function rotatedOrigin(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: x + h, y };
    case 180:
      return { x: x + w, y: y + h };
    case 270:
      return { x, y: y + w };
    default:
      return { x, y };
  }
}

/**
 * pdf-lib (and the underlying PDF rotation matrix) rotates COUNTER-clockwise
 * for a positive angle, but our rotation values everywhere else (the
 * on-screen CSS preview, the manual rotate button, EXIF orientation) are
 * expressed as CLOCKWISE degrees, since that's the intuitive convention.
 * This converts a clockwise angle to the equivalent value pdf-lib expects.
 */
function cwToPdfRotation(cwDegrees: number): 0 | 90 | 180 | 270 {
  return (((360 - cwDegrees) % 360) as 0 | 90 | 180 | 270);
}

function drawImageInSlot(
  page: PDFPage,
  image: PDFImage,
  slotX: number,
  slotY: number,
  transform: PageTransform,
  extraRotate180: boolean,
) {
  // All rotation sources combined, expressed clockwise: the manual
  // rotate-button value the user set, and the saddle-stitch imposition's
  // own 180 flip for Side B pages. (Images are normalized to correct,
  // EXIF-free orientation at upload time — see lib/normalizeImage.ts —
  // so no separate EXIF-based rotation is needed here.)
  const totalCwRotation = ((transform.rotation + (extraRotate180 ? 180 : 0)) %
    360) as 0 | 90 | 180 | 270;

  const imgDims = image.scale(1);
  // Available whitespace-inset area the image must fit fully inside (no cropping).
  const availW = A5_WIDTH - IMAGE_MARGIN * 2;
  const availH = A5_HEIGHT - IMAGE_MARGIN * 2;
  // If the image is rotated a quarter turn, its effective footprint swaps
  // width/height for the purposes of fitting it in the available area.
  const rotatedQuarter = totalCwRotation === 90 || totalCwRotation === 270;
  const effW = rotatedQuarter ? imgDims.height : imgDims.width;
  const effH = rotatedQuarter ? imgDims.width : imgDims.height;

  const containScale =
    Math.min(availW / effW, availH / effH) * transform.scale;
  const drawWidth = imgDims.width * containScale;
  const drawHeight = imgDims.height * containScale;

  // center of the image within the slot, based on normalized offset (0..1, 0.5 = centered)
  const centerX = slotX + A5_WIDTH * transform.offsetX;
  const centerY = slotY + A5_HEIGHT * (1 - transform.offsetY);

  const targetX = centerX - drawWidth / 2;
  const targetY = centerY - drawHeight / 2;

  const pdfRotation = cwToPdfRotation(totalCwRotation);
  const { x, y } = rotatedOrigin(targetX, targetY, drawWidth, drawHeight, pdfRotation);

  page.drawRectangle({
    x: slotX,
    y: slotY,
    width: A5_WIDTH,
    height: A5_HEIGHT,
    color: rgb(1, 1, 1),
  });

  // Clip to the slot rectangle so nothing (even at extreme manual scale/
  // offset adjustments) bleeds into the neighboring slot.
  page.pushOperators(
    pushGraphicsState(),
    moveTo(slotX, slotY),
    lineTo(slotX + A5_WIDTH, slotY),
    lineTo(slotX + A5_WIDTH, slotY + A5_HEIGHT),
    lineTo(slotX, slotY + A5_HEIGHT),
    clip(),
    endPath(),
  );

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
    rotate: degrees(pdfRotation),
  });

  page.pushOperators(popGraphicsState());
}

function drawFoldAndCropMarks(page: PDFPage) {
  const midX = A4_WIDTH / 2;
  // dashed fold line down the center
  page.drawLine({
    start: { x: midX, y: 0 },
    end: { x: midX, y: A4_HEIGHT },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
    dashArray: [4, 4],
  });
  // corner crop marks
  const corners = [
    { x: 0, y: 0 },
    { x: A4_WIDTH, y: 0 },
    { x: 0, y: A4_HEIGHT },
    { x: A4_WIDTH, y: A4_HEIGHT },
  ];
  for (const c of corners) {
    const dx = c.x === 0 ? 1 : -1;
    const dy = c.y === 0 ? 1 : -1;
    page.drawLine({
      start: { x: c.x + dx * CROP_MARK_OFFSET, y: c.y },
      end: { x: c.x + dx * (CROP_MARK_OFFSET + CROP_MARK_LEN), y: c.y },
      thickness: 0.5,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawLine({
      start: { x: c.x, y: c.y + dy * CROP_MARK_OFFSET },
      end: { x: c.x, y: c.y + dy * (CROP_MARK_OFFSET + CROP_MARK_LEN) },
      thickness: 0.5,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
}

async function drawSlotOntoNewPage(
  doc: PDFDocument,
  slot: ImpositionSlot,
  pagesByNumber: Map<number, ZinePage>,
  font: PDFFont | null,
): Promise<PDFPage> {
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  drawFoldAndCropMarks(page);

  for (const [pageNumber, x] of [
    [slot.left, 0],
    [slot.right, A5_WIDTH],
  ] as const) {
    if (pageNumber == null) continue;
    const zinePage = pagesByNumber.get(pageNumber);
    if (!zinePage?.imageId) {
      if (font) {
        page.drawText(`p.${pageNumber} (empty)`, {
          x: x + 10,
          y: A4_HEIGHT / 2,
          size: 8,
          font,
          color: rgb(0.7, 0.7, 0.7),
        });
      }
      continue;
    }
    const blob = await getImage(zinePage.imageId);
    if (!blob) continue;
    const image = await embedImageForBlob(doc, blob);
    drawImageInSlot(page, image, x, 0, zinePage.transform, slot.rotate180);
  }

  return page;
}

async function buildSideDocument(
  slots: ImpositionSlot[],
  pagesByNumber: Map<number, ZinePage>,
  font: PDFFont | null,
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (const slot of slots) {
    await drawSlotOntoNewPage(doc, slot, pagesByNumber, font);
  }
  return doc;
}

export interface ExportResult {
  sideA: Blob;
  sideB: Blob;
  sheetCount: number;
}

export async function exportZinePdfs(
  plan: ImpositionPlan,
  pages: ZinePage[],
): Promise<ExportResult> {
  const pagesByNumber = new Map(pages.map((p) => [p.pageNumber, p]));

  const sideADoc = await buildSideDocument(plan.sideA, pagesByNumber, null);
  const sideBDoc = await buildSideDocument(plan.sideB, pagesByNumber, null);

  const [sideABytes, sideBBytes] = await Promise.all([
    sideADoc.save(),
    sideBDoc.save(),
  ]);

  return {
    sideA: new Blob([sideABytes as BlobPart], { type: "application/pdf" }),
    sideB: new Blob([sideBBytes as BlobPart], { type: "application/pdf" }),
    sheetCount: plan.sheetCount,
  };
}

export interface DuplexExportResult {
  /** Single PDF: front, back, front, back… one pair per physical sheet. */
  duplex: Blob;
  sheetCount: number;
}

/**
 * Builds one combined PDF for true duplex (auto double-sided) printers:
 * each sheet's front page is immediately followed by its back page, so
 * the OS/printer's native duplex handling pairs them up correctly in a
 * single print pass — no manual stack-flipping needed.
 */
export async function exportZineDuplexPdf(
  plan: DuplexImpositionPlan,
  pages: ZinePage[],
): Promise<DuplexExportResult> {
  const pagesByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const doc = await PDFDocument.create();

  for (const sheet of plan.sheets) {
    await drawSlotOntoNewPage(doc, sheet.front, pagesByNumber, null);
    await drawSlotOntoNewPage(doc, sheet.back, pagesByNumber, null);
  }

  const bytes = await doc.save();
  return {
    duplex: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    sheetCount: plan.sheetCount,
  };
}

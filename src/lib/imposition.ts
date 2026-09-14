/**
 * Saddle-stitch imposition math.
 *
 * A zine of `pageCount` pages (must be a multiple of 4) is printed on
 * `pageCount / 4` physical A4 sheets. Each sheet is landscape A4 = two
 * A5-portrait slots side by side. When all sheets are stacked, folded in
 * half down the vertical center line, and nested inside one another,
 * the pages read in order 1..pageCount.
 *
 * Since we're printing single-sided on a LaserJet (no auto-duplex), each
 * sheet needs its "outer" side (Side A) and "inner" side (Side B) printed
 * as two separate passes: print all Side A sheets, flip the whole stack
 * over, reload, then print all Side B sheets on the reverse.
 */

export type FlipMethod = "long-edge" | "short-edge";

export interface ImpositionSlot {
  /** 1-indexed sheet number */
  sheetNumber: number;
  side: "A" | "B";
  /** page number (1-indexed) placed in the left half of the sheet, or null for a blank filler page */
  left: number | null;
  /** page number (1-indexed) placed in the right half of the sheet */
  right: number | null;
  /** whether this slot's content should be rotated 180 degrees before printing */
  rotate180: boolean;
}

export interface ImpositionPlan {
  sheetCount: number;
  /** Side A slots, in the order they should be sent to the printer */
  sideA: ImpositionSlot[];
  /** Side B slots, in the order they should be sent to the printer (after flipping the printed stack) */
  sideB: ImpositionSlot[];
  flipMethod: FlipMethod;
  instructions: string[];
}

/**
 * One physical A4 sheet's worth of content for a true duplex (auto
 * double-sided) print: front and back, already in final printed sheet
 * order (1..sheetCount), no manual stack-reversal needed.
 */
export interface DuplexSheet {
  sheetNumber: number;
  front: ImpositionSlot;
  back: ImpositionSlot;
}

export interface DuplexImpositionPlan {
  sheetCount: number;
  sheets: DuplexSheet[];
  flipMethod: FlipMethod;
  instructions: string[];
}

/** Rounds pageCount up to the next multiple of 4 (min 4) and returns padded page count. */
export function normalizePageCount(pageCount: number): number {
  const rounded = Math.max(4, Math.round(pageCount / 4) * 4);
  return rounded;
}

function rawSlotsForSheet(n: number, s: number): { front: ImpositionSlot; backRaw: ImpositionSlot } {
  const outerLeft = n - 2 * s + 2;
  const outerRight = 2 * s - 1;
  const innerLeft = 2 * s;
  const innerRight = n - 2 * s + 1;

  return {
    front: {
      sheetNumber: s,
      side: "A",
      left: outerLeft <= n ? outerLeft : null,
      right: outerRight <= n ? outerRight : null,
      rotate180: false,
    },
    backRaw: {
      sheetNumber: s,
      side: "B",
      left: innerLeft <= n ? innerLeft : null,
      right: innerRight <= n ? innerRight : null,
      rotate180: false,
    },
  };
}

/**
 * Transforms a sheet's raw "inner" (back) content into what actually needs
 * to be printed on the reverse of that same physical sheet, so it lines up
 * once the *person* manually flips the printed stack over by hand.
 *
 * This is for the manual two-pass flow only (see computeImposition) — the
 * physical action described to the user in the instructions:
 *
 * "long-edge" flip (turning the whole stack over sideways, like a page in
 * a book): what was on the left is now on the right relative to the
 * printer's feed, so left/right are swapped.
 *
 * "short-edge" flip (turning the stack over top-to-bottom, like flipping a
 * desk calendar page): the sheet ends up upside down relative to the
 * front, so the content is rotated 180 degrees.
 *
 * True hardware duplex uses a different mapping — see
 * applyDuplexBackTransform below for why.
 */
function applyBackTransform(slot: ImpositionSlot, flipMethod: FlipMethod): ImpositionSlot {
  if (flipMethod === "long-edge") {
    return { ...slot, left: slot.right, right: slot.left };
  }
  return { ...slot, rotate180: true };
}

/**
 * Transforms a sheet's raw "inner" (back) content for a true hardware
 * duplex (auto double-sided) print.
 *
 * Our sheets are authored as landscape pages (wider than tall — two
 * portrait A5 slots side by side), and a printer driver's "Flip on Long
 * Edge" / "Flip on Short Edge" duplex setting refers to the physical A4
 * sheet's long/short edge, not the logical orientation of the content on
 * it. For a landscape page, that physical binding-edge choice produces a
 * different visual result than it would on a portrait page, and — per an
 * actual physical test print — "Flip on Long Edge" (this app's default
 * duplex flip method) requires a FULL 180-degree rotation of the entire
 * back page: both which slot (left/right) each page's content lands in,
 * AND each image's own orientation, need to flip together, as if the
 * whole printed back page were spun 180 degrees around its center.
 *
 * This was found in two steps from real print tests: an earlier fix
 * corrected only the per-image rotation (content was upside down, now
 * right-side up), but left the left/right slot assignment untouched —
 * which turned out to still put the wrong page next to the cover. Adding
 * the left/right swap on top of the rotation (this version) additionally
 * fixes that, since the two are independent: rotating an image in place
 * doesn't change which slot it's drawn into, and vice versa.
 *
 * "Flip on Short Edge" duplex has not yet been physically tested — for
 * now this leaves it as a straight pass-through (no swap, no rotation), the
 * remaining untried option of the four possible combinations. If you test
 * short-edge duplex and it's wrong, that's the thing to revisit.
 */
function applyDuplexBackTransform(slot: ImpositionSlot, flipMethod: FlipMethod): ImpositionSlot {
  if (flipMethod === "long-edge") {
    return { ...slot, left: slot.right, right: slot.left, rotate180: true };
  }
  return slot;
}

export function computeImposition(
  pageCount: number,
  flipMethod: FlipMethod = "long-edge",
): ImpositionPlan {
  const n = normalizePageCount(pageCount);
  const sheetCount = n / 4;

  const sideA: ImpositionSlot[] = [];
  const sideBRaw: ImpositionSlot[] = [];

  for (let s = 1; s <= sheetCount; s++) {
    const { front, backRaw } = rawSlotsForSheet(n, s);
    sideA.push(front);
    sideBRaw.push(backRaw);
  }

  // Side B needs to align with Side A once the physically-printed stack is
  // flipped over *as a whole block* and re-fed. Unlike a single sheet being
  // duplexed automatically, flipping an entire stack over also reverses
  // which sheet ends up on top — so for "long-edge" we additionally
  // reverse the sheet order (the per-sheet content transform is
  // applyBackTransform, for this by-hand flip specifically — true hardware
  // duplex uses a different mapping, see applyDuplexBackTransform).
  const sideB: ImpositionSlot[] =
    flipMethod === "long-edge"
      ? [...sideBRaw].reverse().map((slot) => applyBackTransform(slot, flipMethod))
      : sideBRaw.map((slot) => applyBackTransform(slot, flipMethod));

  const instructions =
    flipMethod === "long-edge"
      ? [
          "1. Print the \"Side A\" PDF (blank/duplicate pages excluded automatically).",
          "2. Take the printed stack without reordering it.",
          "3. Flip the whole stack over sideways along the left edge, like turning a single page in a book, so it's now face-down.",
          "4. Load it back into the paper tray face-down, same edge first.",
          "5. Print the \"Side B\" PDF.",
          "6. Fold every sheet in half vertically, nest them in sheet-number order, and staple/stitch down the spine.",
        ]
      : [
          "1. Print the \"Side A\" PDF.",
          "2. Take the printed stack without reordering it.",
          "3. Flip the whole stack top-to-bottom (like flipping a calendar page), so it's now face-down.",
          "4. Load it back into the paper tray face-down, same edge first.",
          "5. Print the \"Side B\" PDF.",
          "6. Fold every sheet in half vertically, nest them in sheet-number order, and staple/stitch down the spine.",
        ];

  return { sheetCount, sideA, sideB, flipMethod, instructions };
}

/**
 * Imposition for a true duplex (auto double-sided) printer: one sheet is
 * fed once and the printer prints and flips it itself, so — unlike the
 * manual two-pass flow above — sheets stay in straight 1..sheetCount order.
 * The front/back content transform uses applyDuplexBackTransform, NOT
 * applyBackTransform — see that function for why hardware duplex needs a
 * different (opposite) mapping than the by-hand flip does.
 */
export function computeDuplexImposition(
  pageCount: number,
  flipMethod: FlipMethod = "long-edge",
): DuplexImpositionPlan {
  const n = normalizePageCount(pageCount);
  const sheetCount = n / 4;

  const sheets: DuplexSheet[] = [];
  for (let s = 1; s <= sheetCount; s++) {
    const { front, backRaw } = rawSlotsForSheet(n, s);
    sheets.push({
      sheetNumber: s,
      front,
      back: applyDuplexBackTransform(backRaw, flipMethod),
    });
  }

  const instructions =
    flipMethod === "long-edge"
      ? [
          "1. In your printer's settings, turn on two-sided (duplex) printing set to \"Flip on Long Edge\".",
          "2. Print this single PDF — each sheet's front and back are already in the correct order and orientation.",
          "3. Fold every sheet in half vertically, nest them in sheet-number order, and staple/stitch down the spine.",
        ]
      : [
          "1. In your printer's settings, turn on two-sided (duplex) printing set to \"Flip on Short Edge\".",
          "2. Print this single PDF — each sheet's front and back are already in the correct order and orientation.",
          "3. Fold every sheet in half vertically, nest them in sheet-number order, and staple/stitch down the spine.",
        ];

  return { sheetCount, sheets, flipMethod, instructions };
}

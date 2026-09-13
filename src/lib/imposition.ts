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

/** Rounds pageCount up to the next multiple of 4 (min 4) and returns padded page count. */
export function normalizePageCount(pageCount: number): number {
  const rounded = Math.max(4, Math.round(pageCount / 4) * 4);
  return rounded;
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
    const outerLeft = n - 2 * s + 2;
    const outerRight = 2 * s - 1;
    const innerLeft = 2 * s;
    const innerRight = n - 2 * s + 1;

    sideA.push({
      sheetNumber: s,
      side: "A",
      left: outerLeft <= n ? outerLeft : null,
      right: outerRight <= n ? outerRight : null,
      rotate180: false,
    });
    sideBRaw.push({
      sheetNumber: s,
      side: "B",
      left: innerLeft <= n ? innerLeft : null,
      right: innerRight <= n ? innerRight : null,
      rotate180: false,
    });
  }

  // Side B needs to align with Side A once the physically-printed stack is
  // flipped over and re-fed. The two common manual-duplex techniques:
  //
  // "long-edge" flip (flip the stack over like turning a page in a book,
  // i.e. around the vertical/left edge): the sheet that was physically on
  // top of the Side A stack ends up on the BOTTOM of the re-inserted stack,
  // and each sheet's content is mirrored left-right (what was on the left
  // is now on the right relative to the printer's feed). So we reverse the
  // sheet order and swap left/right.
  //
  // "short-edge" flip (flip the stack top-to-bottom, like flipping a desk
  // calendar): sheet order in the stack is preserved, but each sheet is
  // rotated 180 degrees.
  let sideB: ImpositionSlot[];
  if (flipMethod === "long-edge") {
    sideB = [...sideBRaw].reverse().map((slot) => ({
      ...slot,
      left: slot.right,
      right: slot.left,
    }));
  } else {
    sideB = sideBRaw.map((slot) => ({ ...slot, rotate180: true }));
  }

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

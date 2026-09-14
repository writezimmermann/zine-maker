# Zine Maker

A tiny, local-only web tool for laying out A5 zines and printing them on A4
paper (2-up, saddle-stitch), inspired by a photographer's booklet workflow.

Everything runs in the browser — no backend, no accounts. Zines and their
images are stored in your browser's IndexedDB.

## How it works

1. **Create a zine** — pick a page count (multiple of 4, saddle-stitch only)
   and name it.
2. **Editor** — drop or click to add a photo to each page. Drag to
   reposition, use the buttons to scale/rotate.
3. **Export** — choose how your printer handles double-sided printing:
   - **Single-sided printer (manual flip)** — generates two PDFs, **Side A**
     and **Side B**. Print Side A, physically flip the whole printed stack
     over (instructions are shown in-app, with a toggle for which flip
     method matches your printer), then print Side B on the back.
   - **Duplex printer (double-sided)** — generates a single PDF with each
     sheet's front and back already interleaved in the right order and
     orientation for your printer's automatic duplex unit. Set your
     printer's duplex binding to match the flip-method toggle ("Flip on
     Long Edge" or "Flip on Short Edge") and print.
4. **Fold & bind** — fold every A4 sheet in half, nest them in sheet order,
   and staple/stitch down the spine.

### Duplex printing quirk (already handled for you)

If you're curious why duplex export needed special handling: this app's
pages are authored **landscape** (two portrait A5 slots side by side on a
landscape A4 sheet). A printer driver's "Flip on Long Edge" / "Flip on
Short Edge" duplex setting refers to the *physical* A4 sheet's long/short
edge, not the logical orientation of the content on it — and for landscape
content, that inverts the usual result. With the driver set to duplex
"Long Edge" (this app's default), a landscape sheet's back physically
flips **top-to-bottom** (like a calendar), not side-to-side (like a book).

The exported duplex PDF already compensates for this (see
`applyDuplexBackTransform` in `src/lib/imposition.ts`), so you shouldn't
need to think about it — just pick the flip method in the app that matches
what you set in your printer's duplex dialog. This was found and fixed via
two rounds of real physical test prints:

1. First print: back pages were upside down → fixed by rotating each
   back-side image 180°.
2. Second print: rotation was correct, but the wrong pages were paired
   together (e.g. page 7 landed right behind the cover instead of page 2)
   → fixed by *also* swapping which slot (left/right) each page's content
   is drawn into, on top of the rotation.
3. Third print: confirmed correct.

**"Flip on Short Edge" duplex is untested on real hardware.** It's currently
left as a pass-through (no transform). If you try it and the output looks
wrong, it likely needs the same kind of fix — flag it.

## Development

```bash
npm install
npm run dev
```

## Build / Deploy

Pushes to `main` build and deploy to GitHub Pages automatically via
`.github/workflows/deploy.yml`. Enable Pages in the repo settings
("Deploy from GitHub Actions") once this is pushed.

## Known rough edges (v1)

- Only saddle-stitch A5-on-A4 imposition is implemented (no 2-up-cut mode,
  no A4-on-A3 yet).
- Manual (single-sided) flip has been validated on paper for both "long
  edge" and "short edge". True duplex has only been validated for "long
  edge" — see the duplex quirk section above.
- No creep/shingling compensation for thick zines (fine for ~32pp or less
  on standard paper).

## Problem-solving history

A log of the non-obvious bugs found and fixed while building this, mostly
because several of them only showed up on an actual printed page — not in
the browser or in a rendered PDF preview — so it's worth understanding
*why* the code is the way it is before changing it.

1. **Cropped images → fit instead of fill.** Images were initially drawn to
   fill (and crop) their A5 slot. Switched to "contain" (fit fully inside a
   10mm margin, no cropping), which is what you generally want for a photo
   zine.

2. **Sideways/rotated images in the exported PDF.** pdf-lib does not read
   EXIF orientation — only the browser's own image decoders do
   (`<img>`/canvas/`createImageBitmap`). Photos with an EXIF rotation tag
   displayed correctly in the editor (browser-rendered) but came out
   sideways in the PDF (pdf-lib reads raw pixels). Fixed by baking the
   correct orientation into the actual pixel data via a canvas pass before
   embedding — see `src/lib/normalizeImage.ts`.

3. **Some images still wrong after that fix.** The orientation-baking step
   only ran for newly uploaded images going forward — images already
   uploaded before the fix existed (or via any other path) still had raw,
   untouched pixels. Fixed by *also* running the same normalization
   defensively at export time (`embedImageForBlob` in
   `src/lib/pdfExport.ts`), not just at upload time. This "normalize twice,
   at both boundaries" pattern — belt-and-suspenders, and idempotent, since
   an already-normalized image has nothing left to correct — turned out to
   be the right general shape for this class of bug, and got reused for
   the resolution fix below.

4. **Duplex printer export added.** Originally the app only supported
   printing single-sided in two manual passes (see "Export" above). Added
   `computeDuplexImposition()` / `exportZineDuplexPdf()` to also generate
   one combined PDF for printers with an automatic duplex unit, reusing the
   same per-sheet page-assignment math as the manual flow.

5. **Duplex back pages upside down.** See the "Duplex printing quirk"
   section above — landscape content inverts the usual meaning of a
   printer driver's Long-Edge/Short-Edge duplex binding setting. Fixed by
   rotating each back-side image 180° for long-edge duplex specifically
   (`applyDuplexBackTransform` in `src/lib/imposition.ts`), leaving the
   already-verified manual flow's transform untouched.

6. **Duplex sequencing still wrong after that.** The rotation fix above
   corrected each image's own orientation but not *which slot* it was
   drawn into, so e.g. page 7 ended up directly behind the cover instead of
   page 2. Rotating an image in place and swapping its left/right slot
   assignment are independent operations — the fix was additive: swap the
   slots *as well as* rotating, equivalent to rotating the entire back page
   180° around its center. Confirmed correct on paper after this.

7. **41MB PDF for an 8-page zine.** Photos were embedded into the PDF at
   their original captured resolution — e.g. a 24-megapixel camera photo —
   even though an A5 printed page can't resolve anywhere near that much
   detail. `normalizeImageOrientation()` now also downsamples the image
   (long edge capped at 3000px, comfortably above ~400 DPI on A5's
   printable area) as part of the same canvas pass that bakes in EXIF
   orientation. Because that function already ran at both upload time and
   export time (see #3), the fix applied automatically to new uploads
   *and* retroactively to already-stored oversized photos, with no other
   changes needed. Reduced the example 41MB export to ~4–5MB per side with
   no visible quality loss at print resolution.

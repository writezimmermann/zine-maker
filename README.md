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
3. **Export** — generates two PDFs: **Side A** and **Side B**. Since most
   home laser printers don't auto-duplex, you print Side A, physically flip
   the stack (instructions are shown in-app, with a toggle for which flip
   method matches your printer), then print Side B on the back.
4. **Fold & bind** — fold every A4 sheet in half, nest them in sheet order,
   and staple/stitch down the spine.

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
- The "long edge" vs "short edge" flip toggle in the export panel hasn't
  been validated against a physical printer yet — print a short test zine
  first and switch the toggle if Side B lands on the wrong side of Side A.
- No creep/shingling compensation for thick zines (fine for ~32pp or less
  on standard paper).

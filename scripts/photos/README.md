# How the car photos were made

Reproducible pipeline used for `public/cars/*.webp` (credits: `public/cars/CREDITS.md`).

1. `node scripts/photos/commons-candidates.mjs <dir>` — searches Wikimedia Commons, keeps **free licences only**
   (CC BY / CC BY-SA / CC0 / public domain), downloads small thumbnails + licence metadata for review.
2. `node scripts/photos/fetch-chosen.mjs <dir> <outDir>` — downloads the hand-picked files at 1600 px and writes `credits.json`.
3. `python scripts/photos/cutout.py <outDir> <cutDir>` — background removal with [rembg](https://github.com/danielgatis/rembg)
   (`isnet-general-use`, runs locally; `pip install "rembg[cpu]"`).
4. `node scripts/photos/trim-pass.mjs <cutDir> <workDir>` — alpha clean-up (largest component), trim, 900 px, grid previews for measuring.
5. `node scripts/photos/finalize.mjs <workDir>/trim public/cars <preview.jpg>` — erases leftover background pieces,
   replaces licence plates with a generic game plate (GS460: badge too), exports WebP.

Lamp / exhaust-tip / anchor coordinates in `src/drive/carPhotos.ts` were measured by hand on the step-4 grid previews.

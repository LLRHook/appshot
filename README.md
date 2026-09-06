# Appshot Studio

A local-first App Store screenshot studio. Build a cohesive campaign, connect a device across adjacent screenshots, and download full-resolution PNGs directly from your browser.

## Run locally

```bash
cd app
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Node 22.12+ is recommended. PNG export runs in the browser: no API keys, accounts, debugging Chrome, or rendering server are needed. The initial workspace includes a five-frame Billington campaign made with real app screenshots.

## Create a campaign

1. Start with the Billington example or choose **New campaign**. Add PNG, JPEG, or WebP screenshots from the toolkit, top toolbar, or by dropping files onto the canvas.
2. Choose a style for the set: **Cobalt studio**, **Sunday paper**, **After hours**, **Soft serve**, or **Field notes**. Each changes typography, palette, geometry, and background treatment.
3. Select a frame to edit its headline, supporting copy, caption, colors, and typography scale. The Composition tab controls text placement, device frame, scale, rotation, fill, gradient, shadow, and glow.
4. Use **Across the seam** to connect the selected frame to the next one. A campaign supports one connected pair. The two exports crop one shared phone and backdrop. Position, rotation, scale, image, and shared treatments remain aligned. Reordering or deleting a connected frame clears a broken pair; undo restores it.
5. Select the output size and choose **Export set**. Download the complete ZIP, the selected PNG, or a presentation contact sheet.

Campaigns support 1–10 frames. Each input image can be up to 12 MB, 24 megapixels, and 8000 pixels per side. Project files are bounded to 60 MB. PNG exports are opaque and use the selected exact pixel dimensions.

| App Store upload class | Output |
| --- | --- |
| iPhone 6.9-inch | 1320 × 2868 |
| iPhone 6.5-inch | 1284 × 2778 |
| iPad 13-inch | 2064 × 2752 |

These match [Apple's current screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). Upload genuine screenshots appropriate to the device class; changing the canvas size does not convert a phone interface into a tablet interface.

## Saving and portability

Edits autosave to IndexedDB in this browser. **Save project** downloads an editable `.appshot.json` file with its source images embedded. **Open project** restores it. The complete export ZIP also contains a self-contained `project.json`. Imported projects are validated before use and only accept local demo images or embedded PNG/JPEG/WebP images.

Undo/redo is available in the toolbar and with ⌘/Ctrl-Z and ⇧-⌘/Ctrl-Z when focus is outside a text field. The editor also works on narrow screens, with the storyboard scrolling horizontally.

All editing, image processing, storage, and export happen locally. Fonts are bundled under SIL Open Font License; no runtime font service is used. Billington sample-image provenance is recorded in `app/static/demo/README.md`.

## Architecture

- `app/src/lib/model/`: typed composition, style directions, sample campaign, project validation and persistence.
- `app/src/lib/stitch/panorama.ts`: pure canonical geometry for the shared two-panel world; offset is in output pixels.
- `app/src/lib/render/`: one Canvas renderer used by previews and exports, native PNG encoding, deterministic ZIP assembly, portable projects and contact sheets.
- `app/src/lib/components/`: preview canvas and SVG icons.
- `app/src/routes/+page.svelte`: Svelte 5 studio, immutable editing history, import/export and controls.

A connected scene is rasterized as one complete world and cropped into two output rectangles. This avoids subpixel rasterization differences at the seam. Preview canvases use the same scene renderer at a smaller size; exports render at the full selected size. Fonts and images are awaited, and stale asynchronous preview draws cannot overwrite newer edits.

## Validation

```bash
cd app
npm run check
npm run lint
npm run test:unit -- --run
npm run test:setup       # once, installs Chromium for the browser tests
npm run test:e2e
npm run build
```

The unit suite covers seam geometry, ZIP integrity and project validation. Playwright covers real editing, uploads, saving/reloading, reopening portable projects, downloads, PNG dimensions, narrow-screen use, and exact panorama pixel equivalence. To use an existing development server, set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173` before the end-to-end command. Otherwise Playwright builds and launches its own production preview.

## Visual references

The campaign system was informed by [Apple's product-page guidance](https://developer.apple.com/app-store/product-page/), [ScreenForge's panoramic screenshot workflow](https://getscreenforge.com/), and [AppScreens' screenshot examples](https://appscreens.com/). The implemented layouts, shapes, and styling are original. The Billington UI images are original local project assets.

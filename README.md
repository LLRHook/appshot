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
2. Choose a style for the set: **Cobalt studio**, **Sunday paper**, **After hours**, **Soft serve**, **Field notes**, or **Table Linen**. Each changes typography, palette, geometry, and background treatment.
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

## Table Linen

Table Linen is the editorial Billington direction: deep teal or warm cream panels, a linen band, an Instrument Serif headline with *italic accent* spans in gold or teal, DM Sans supporting copy, a small wordmark with a gold dot, and one quiet phone. Unlike the other styles its geometry is explicit and fully editable. Every number is a 1320 × 2868 reference pixel; horizontal positions and all sizes scale by `width / 1320` and vertical anchors by `height / 2868` for other export sizes. At 1320 × 2868, all ten V2 campaign images match the external `render-table-linen.mjs` renderer pixel for pixel when compared in the same browser runtime. The connected pair is one 2640 × 2868 world cropped into two PNGs. Different browser builds can introduce small text and edge-rasterization differences.

Editing: in the headline, each row is a line and words wrapped in asterisks (`*fair shares*`) are drawn in serif italic in the accent color. An unbalanced asterisk, a headline line wider than its column, or a phone that would overlap the copy or leave the canvas is reported as an error on that frame rather than silently trimmed. The Content tab has the theme toggle (teal / cream), the band switch, and the palette; the Composition tab has the phone (frame preset, top, bottom, max width, center X, rotation ±8°, shell, corner radius, frameless, shadow, fit mode) and an advanced type-layout group. On a connected pair the phone is shared and stored on the panorama, so editing it from either frame moves the same phone; copy, theme, canvas, band, headline, accent, supporting, wordmark and dot colors stay per frame, while the phone shell, shell edge and shadow (the hardware palette the renderer takes from the left frame) are shown and edited as one shared value from either half. Center X of a shared phone counts across the two-frame world, so 1320 is the seam, and the shared phone's screen must actually cross it; a phone that sits wholly in one frame is an error.

### iPhone 17 Pro Max hardware frame

The **Frame preset** control switches the phone between the generic V1 shell and a code-native iPhone 17 Pro Max illustration (V2). The frame is a custom illustration. Its Dynamic Island placement was measured from a `simctl io` screenshot of the iOS 26.3 iPhone 17 Pro Max simulator compositor, whose only difference from the raw app capture is the island core at native `x 472, y 42, 376 × 110, radius 55` (uniformly blank white in the calibrated captures). The frame keeps the same body bounds as the shell setting; the shell band is split into an 8-native-pixel silver rim and a black glass bezel, the display mask uses a 150-native-pixel corner radius, and optional side buttons (action, volume up/down, power, camera control at source rows 300–400, 505–700, 745–940 left and 585–865, 1540–1720 right) project 2.5 native pixels beyond the body. All constants are native 1320 × 2868 capture pixels scaled with the capture, and every part shares the phone's single translate-rotate transform, so the screenshot and the frame rotate together. Screenshot pixels are drawn unmodified; masking only removes corner and (optionally) island safe-area pixels.

| Project field | Values | Notes |
| --- | --- | --- |
| `phone.hardware` | omitted or `iphone-17-pro-max` | Omitted keeps the V1 shell byte-for-byte |
| `phone.dynamicIsland` | `source` (default) or `draw` | `source` never draws an island. `draw` adds the cutout unless the capture's island centre (native 660, 97) is already dark, which avoids a doubled island |
| `phone.hardwareButtons` | boolean | The shared V2 campaign uses `true`; the rotated outer bounds including buttons must fit the canvas |

With the hardware preset the corner radius and shell-color controls are hidden because the display shape and hardware materials are fixed; shell width and shadow remain editable. These fields live in `slide.linen.phone` and `panorama.linenPhone`, are validated on import, and round-trip through saved projects.

### Alternate export sizes

Every Table Linen number is a 1320 × 2868 reference pixel. For iPhone 6.5" (1284 × 2778) the horizontal and vertical scale factors are nearly equal and the authored layout fits. For iPad 13" (2064 × 2752) the horizontal scale is about 1.56 while the vertical is about 0.96, so type grows much more than the anchors move apart. The renderer validates in output space with real text metrics (never less than the font size, so extreme leading cannot hide ink): the wordmark, headline and supporting text must fit the frame width, must not overlap one another, and the phone (including hardware buttons) must fit the canvas and clear the lowest copy, including the headline and wordmark when there is no supporting text. Collisions are reported as errors that name the control to change, rather than being drawn overlapping. Preview canvases account for their raster scale, so shadows match the export at every zoom. An image whose decoded size differs from the size recorded in the project is reported as an invalid image instead of being stretched.

Project fields (all optional and validated on import): `slide.linen = { colors, layout, phone, band }` and `panorama.linenPhone`. Their keys are the renderer manifest keys:

| Manifest | Project field | Notes |
| --- | --- | --- |
| `colors.canvas/band/headline/accent/subtitle/wordmark/dot/shell/shellEdge` | `linen.colors.*` | Strict `#RRGGBB` |
| `colors.shadow` (`rgba(r,g,b,a)` or hex) | `linen.colors.shadow` + `linen.colors.shadowOpacity` | Hex + opacity 0–1; the exact alpha is preserved |
| `layout.margin … bandTop` | `linen.layout.*` | Same twelve keys; finite and bounded |
| `phone.mode/top/bottom/maxWidth/centerX/shell/radius/frameless/shadow/rotation/cropReason` | `linen.phone.*`, `panorama.linenPhone.*` | `top < bottom`; `bottom-crop` needs `cropReason`; rotation −8…8° |
| `phone.hardware/dynamicIsland/hardwareButtons` | same, optional | V2 hardware API above; omitted keys stay omitted |
| `slide.theme`, `slide.band`, `style: linen-quiet` | resolved into `linen.colors` / `linen.band` | Quiet is cream with `band: false` |
| `headline: []`, `subtitle: []` | `typography.headline`, `typography.subtitle` | Lines joined with `\n`; asterisk markup kept |
| `panorama.enabled/leftId/rightId/image` | `panorama` with `continuityMode: paired` | Adjacent ordered slides only |

`tableLinenFromManifest(manifest, images)` in `app/src/lib/model/linen.ts` performs that conversion for an already-loaded image map keyed by manifest path (no file or network access). Images are validated with the same rules as project files (`app/src/lib/model/image.ts`: demo paths or signed PNG/JPEG/WebP data URLs, 12 MB, 24 megapixels, 8000-pixel sides, 200-character IDs), so a converted project always reopens. Shared phone defaults merge `phone`, the left slide's `phone`, `centerX: 1320`, then `panorama.phone`, exactly as the renderer does. The canonical phone placement (`linenPhoneBox`, including hardware rim, display radius, buttons and island rectangles) is shared by `stitch/panorama.ts` and the renderer, so preview, export, and the seam always agree. Legacy panorama offset/scale/tilt are not applied in this style.

## Saving and portability

Edits autosave to IndexedDB in this browser. **Save project** downloads an editable `.appshot.json` file with its source images embedded. **Open project** restores it. The complete export ZIP also contains a self-contained `project.json`. Imported projects are validated before use and only accept local demo images or embedded PNG/JPEG/WebP images.

Undo/redo is available in the toolbar and with ⌘/Ctrl-Z and ⇧-⌘/Ctrl-Z when focus is outside a text field. The editor also works on narrow screens, with the storyboard scrolling horizontally.

All editing, image processing, storage, and export happen locally. Fonts are bundled under SIL Open Font License; no runtime font service is used. Billington sample-image provenance is recorded in `app/static/demo/README.md`.

## Architecture

- `app/src/lib/model/`: typed composition, style directions, sample campaign, project validation and persistence. `linen.ts` holds the Table Linen defaults, validators, canonical phone geometry and manifest converter; `render/linen.ts` paints it.
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

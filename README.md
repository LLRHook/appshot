# Appshot Studio

A local-first App Store screenshot studio. Build a cohesive campaign, connect a device across adjacent screenshots, and download full-resolution PNGs directly from your browser.

## Run locally

```bash
cd app
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Node 22.12+ is recommended. PNG export runs in the browser: no API keys, accounts, debugging Chrome, or rendering server are needed. The initial workspace is a five-frame campaign for **Sample Garden**, a fictional plant-care app that exists only as this sample.

## Create a campaign

1. Start with the Sample Garden example or choose **New campaign**. Add PNG, JPEG, or WebP screenshots from the toolkit, top toolbar, or by dropping files onto the canvas. Bundled samples are marked as samples and block App Store export until replaced, including sample art used as a layer.
2. Choose a style for the set: **Cobalt studio**, **Sunday paper**, **After hours**, **Soft serve**, **Field notes**, **Table Linen**, or **The Check**. Each changes typography, palette, geometry, and background treatment.
3. Select a frame to edit its headline, supporting copy, caption, colors, and typography scale. The Composition tab controls the layout and includes **Callouts & artwork**: lift real pixels from a screenshot, drag or type its crop, adjust its position and uniform scale, upload artwork, and reorder layers. A frame supports up to 12 layers. Removing a layer also removes its attached pen mark and torn edge in the same undo step.
4. Use **Across the seam** to connect the selected frame to the next one. A campaign supports one connected pair. The two exports crop one shared phone and backdrop. Position, rotation, scale, image, and shared treatments remain aligned. Duplicating the left frame places the copy after the pair. Reordering or deleting a connected frame clears a broken pair; undo restores it.
5. Add the displays your app supports in **Output sizes**, then use **Active output** to edit each one. Copy and app name are shared; captures, crop layers and placement belong to each output. Adding a size starts with empty capture bindings. A mismatched screenshot stays in the library instead of silently filling the wrong display.
6. Use **Store preview** to inspect the first three screenshots against light and dark store backgrounds. Open **Export set** for the complete checklist and choose **App Store set** or an explicitly labelled **Draft set**. Draft PNG and contact-sheet previews are also available.

Campaigns support 1–10 frames per display. Each input image can be up to 12 MB, 24 megapixels, and 8000 pixels per side. Version 2 campaigns deduplicate image bytes, with limits of 300 images, 180 MB of unique images and a 256 MB portable file; legacy version 1 imports retain their 60 MB limit. **Remove** in the screenshot library unbinds an image from every output and removes it from the campaign limit; undo restores it. PNG exports are decoded after encoding to verify exact dimensions and opacity.

Each library image has a **Capture record** for its actual device, OS, app version, build and capture date, plus confirmation that account data is fictional. This record is supplied by the author and does not independently verify a capture. A mismatched image can be used for a draft only after entering a reason; that override always blocks App Store export. Bundled-sample markers remain in saved and reopened projects.

The generated device catalog contains 62 accepted geometries, including landscape variants. Common portrait outputs are:

| Display                         | Output      |
| ------------------------------- | ----------- |
| iPhone Dynamic Island, medium   | 1206 × 2622 |
| iPhone Dynamic Island, large    | 1320 × 2868 |
| iPad 13-inch                    | 2064 × 2752 |
| iPhone Duo outer (future class) | 1398 × 2034 |
| iPhone Duo inner (future class) | 2007 × 2853 |

The catalog records its source and verification date against [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). Supply both medium and large iPhone outputs; add iPad when the app supports iPad. Each Duo posture needs its own native capture. Changing the canvas size does not convert a phone interface into a tablet or Duo interface.

Store export blocks missing required classes, missing or incompatible captures, captures marked synthetic, bundled samples, invalid layers, unavailable fonts and refused layouts. Crops and enlargement are reported for review. The ZIP groups PNGs by device class and geometry, includes a SHA-256 manifest, and keeps a portable `project.json`. A subset or omitted frame is labelled partial; drafts carry `DRAFT` names and a separate folder. These checks establish file and layout readiness; the submitted build must still match the captures and claims.

## The Check

The Check combines a deep teal, cream and gold palette with large Instrument Serif headlines, italic accents, DM Sans supporting text, frameless screenshot panels, real-UI callouts and an optional pen mark. Its Hero, Detail, Editorial and Closer layouts adapt to the output's aspect family. Headlines fit using measured glyph bounds; a layout that cannot fit reports the problem instead of clipping copy.

In Composition, choose the canvas and layout, show or hide the screenshot panel and app-name wordmark, and add a ring or underline to a region of the capture or a lifted layer. Mark coordinates and crop rectangles refer to original source pixels. Crop, placement, marks and torn edges stay with the active output. Artwork can use smooth or nearest-neighbor pixel-art sampling; source pixels are embedded in saved projects.

## Table Linen

Table Linen is an editorial style: deep teal or warm cream panels, a linen band, an Instrument Serif headline with _italic accent_ spans in gold or teal, DM Sans supporting copy, a small wordmark with a gold dot, and one quiet phone. Unlike the other styles its geometry is explicit and fully editable. Every number is a 1320 × 2868 reference pixel; horizontal positions and all sizes scale by `width / 1320` and vertical anchors by `height / 2868` for other export sizes. The connected pair is one 2640 × 2868 world cropped into two PNGs. Different browser builds can introduce small text and edge-rasterization differences.

Editing: in the headline, each row is a line and words wrapped in asterisks (`*these words*`) are drawn in serif italic in the accent color. An unbalanced asterisk, a headline line wider than its column, or a phone that would overlap the copy or leave the canvas is reported as an error on that frame rather than silently trimmed. The Content tab has the theme toggle (teal / cream), the band switch, and the palette; the Composition tab has the phone (frame preset, top, bottom, max width, center X, rotation ±8°, shell, corner radius, frameless, shadow, fit mode) and an advanced type-layout group. On a connected pair the phone is shared and stored on the panorama, so editing it from either frame moves the same phone; copy, theme, canvas, band, headline, accent, supporting, wordmark and dot colors stay per frame, while the phone shell, shell edge and shadow (the hardware palette the renderer takes from the left frame) are shown and edited as one shared value from either half. Center X of a shared phone counts across the two-frame world, so 1320 is the seam, and the shared phone's screen must actually cross it; a phone that sits wholly in one frame is an error.

### iPhone 17 Pro Max hardware frame

The **Frame preset** control switches the phone between the generic V1 shell and a code-native iPhone 17 Pro Max illustration (V2). The frame is a custom illustration. Its Dynamic Island placement was measured from a `simctl io` screenshot of the iOS 26.3 iPhone 17 Pro Max simulator compositor, whose only difference from a raw app capture is the island core at native `x 472, y 42, 376 × 110, radius 55`. The frame keeps the same body bounds as the shell setting; the shell band is split into an 8-native-pixel silver rim and a black glass bezel, the display mask uses a 150-native-pixel corner radius, and optional side buttons (action, volume up/down, power, camera control at source rows 300–400, 505–700, 745–940 left and 585–865, 1540–1720 right) project 2.5 native pixels beyond the body. All constants are native 1320 × 2868 capture pixels scaled with the capture, and every part shares the phone's single translate-rotate transform, so the screenshot and the frame rotate together. Screenshot pixels are drawn unmodified; masking only removes corner and (optionally) island safe-area pixels.

| Project field           | Values                         | Notes                                                                                                                                                     |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phone.hardware`        | omitted or `iphone-17-pro-max` | Omitted keeps the V1 shell byte-for-byte                                                                                                                  |
| `phone.dynamicIsland`   | `source` (default) or `draw`   | `source` never draws an island. `draw` adds the cutout unless the capture's island centre (native 660, 97) is already dark, which avoids a doubled island |
| `phone.hardwareButtons` | boolean                        | With `true`, the rotated outer bounds including buttons must fit the canvas                                                                               |

With the hardware preset the corner radius and shell-color controls are hidden because the display shape and hardware materials are fixed; shell width and shadow remain editable. These fields live in `slide.linen.phone` and `panorama.linenPhone`, are validated on import, and round-trip through saved projects.

### Alternate export sizes

Every Table Linen number is a 1320 × 2868 reference pixel. For iPhone 6.5" (1284 × 2778) the horizontal and vertical scale factors are nearly equal and the authored layout fits. For iPad 13" (2064 × 2752) the horizontal scale is about 1.56 while the vertical is about 0.96, so type grows much more than the anchors move apart. The renderer validates in output space with real text metrics (never less than the font size, so extreme leading cannot hide ink): the wordmark, headline and supporting text must fit the frame width, must not overlap one another, and the phone (including hardware buttons) must fit the canvas and clear the lowest copy, including the headline and wordmark when there is no supporting text. Collisions are reported as errors that name the control to change, rather than being drawn overlapping. Preview canvases account for their raster scale, so shadows match the export at every zoom. An image whose decoded size differs from the size recorded in the project is reported as an invalid image instead of being stretched.

Project fields (all optional and validated on import): `slide.linen = { colors, layout, phone, band }` and `panorama.linenPhone`. Their keys are the manifest keys:

| Manifest                                                                                   | Project field                                        | Notes                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `colors.canvas/band/headline/accent/subtitle/wordmark/dot/shell/shellEdge`                 | `linen.colors.*`                                     | Strict `#RRGGBB`                                                 |
| `colors.shadow` (`rgba(r,g,b,a)` or hex)                                                   | `linen.colors.shadow` + `linen.colors.shadowOpacity` | Hex + opacity 0–1; the exact alpha is preserved                  |
| `layout.margin … bandTop`                                                                  | `linen.layout.*`                                     | Same twelve keys; finite and bounded                             |
| `phone.mode/top/bottom/maxWidth/centerX/shell/radius/frameless/shadow/rotation/cropReason` | `linen.phone.*`, `panorama.linenPhone.*`             | `top < bottom`; `bottom-crop` needs `cropReason`; rotation −8…8° |
| `phone.hardware/dynamicIsland/hardwareButtons`                                             | same, optional                                       | V2 hardware API above; omitted keys stay omitted                 |
| `slide.theme`, `slide.band`, `style: linen-quiet`                                          | resolved into `linen.colors` / `linen.band`          | Quiet is cream with `band: false`                                |
| `headline: []`, `subtitle: []`                                                             | `typography.headline`, `typography.subtitle`         | Lines joined with `\n`; asterisk markup kept                     |
| `panorama.enabled/leftId/rightId/image`                                                    | `panorama` with `continuityMode: paired`             | Adjacent ordered slides only                                     |

`tableLinenFromManifest(manifest, images)` in `app/src/lib/model/linen.ts` performs that conversion for an already-loaded image map keyed by manifest path (no file or network access). Images are validated with the same rules as project files (`app/src/lib/model/image.ts`: bundled sample paths or signed PNG/JPEG/WebP data URLs, 12 MB, 24 megapixels, 8000-pixel sides, 200-character IDs), so a converted project always reopens. Shared phone defaults merge `phone`, the left slide's `phone`, `centerX: 1320`, then `panorama.phone`. The canonical phone placement (`linenPhoneBox`, including hardware rim, display radius, buttons and island rectangles) is shared by `stitch/panorama.ts` and the renderer, so preview, export, and the seam always agree. Legacy panorama offset/scale/tilt are not applied in this style.

## Saving and portability

Image bytes are stored once in IndexedDB; a small synchronous journal preserves the latest edit while autosave finishes. **Recent campaigns** keeps earlier work when starting or opening another campaign. An unreadable autosave is retained for recovery. If two tabs conflict, **Keep my edits as a copy** preserves both versions, including when reopening the original or undoing edits in the copy. Reopening a campaign that another tab updated saves your previous version and, when different, the latest version available through Redo as separate copies in Recent campaigns. The redo copy is labelled **Recovered redo version**. Earlier Undo entries follow their saved copy, so undo cannot overwrite the newer work. Opening a saved campaign without editing it does not create a competing save, including when journal recovery finishes an interrupted open. Earlier campaigns can be deleted from Recent campaigns with an explicit second click; open another campaign before deleting the current one. If another tab recreates a deleted campaign, its revision advances so reopening still preserves older Undo history separately.

**Save project** downloads a version 2 `.appshot.json` with every output and its original images embedded. **Open project** accepts that file, legacy version 1 files, or an exported ZIP containing `project.json`. Imported data is validated before use; session-only blob URLs and external image URLs are rejected in portable files. Original image bytes are retained even when a crop shows only part of an image.

Earlier builds bundled different sample images. A project or autosave that still refers to one by path (`/demo/*.png`, `/brand/*.png`) is refused with that reason rather than painted with other pixels: open a portable copy with its images embedded instead. A refused autosave stays in **Recent campaigns** as unreadable, with its bytes intact and available to download, and the sample campaign still starts. Projects with every image embedded open as before.

Undo/redo is available in the toolbar and with ⌘/Ctrl-Z and ⇧-⌘/Ctrl-Z when focus is outside a text field; sliders, color pickers and menus use the editor's undo. Typing in one field or dragging one control counts as a single step, and undo returns to the frame the change was made on. The editor also works on narrow screens, with the storyboard scrolling horizontally.

All editing, image processing, storage, and export happen locally. Fonts are bundled under SIL Open Font License; no runtime font service is used.

## Sample images

`app/static/sample/` holds the five screens behind the first-run campaign and an art mark the tests paint, with a README saying what they are. They are generated by `npm run generate:samples` (`app/scripts/sample-assets/`) from original templates, using Playwright's Chromium and the bundled fonts. Their plants, names and numbers are made up, each screen carries a visible "Sample data" marker, and they are not store-ready: every sample carries `provenance.tool: 'appshot-sample'`, which blocks App Store export even after it is embedded in a saved project. The screenshot library leaves the art mark out because it is not a screenshot.

## Architecture

- `app/src/lib/model/`: generated device catalog, source classification, versioned campaign model, migration and target projection. `check.ts` and `linen.ts` hold style geometry and validation; their render modules paint it.
- `app/src/lib/stitch/panorama.ts`: pure canonical geometry for the shared two-panel world; offset is in output pixels.
- `app/src/lib/render/`: one Canvas renderer used by previews and exports, full preflight, a sequential export matrix, decoded-PNG verification, ZIP assembly and manifests.
- `app/src/lib/editor/`: `store.svelte.ts` owns immutable edits, undo and selection; `campaign-persistence.ts` owns deduplicated assets, journals, campaign history and conflict detection. `studio.svelte.ts` is the controller the panels share through context.
- `app/src/lib/components/`: preview canvas and SVG icons; `studio/` holds the editor panels.
- `app/src/routes/+page.svelte`: wires the controller to the panels and window events.
- `app/src/lib/model/contracts.ts`: shared multi-target types. `projectForTarget` projects one campaign into the composition the renderer consumes; edits write back to the active target without borrowing another target's source.

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

The unit suite covers device/source compatibility, geometry, file validation, manifests, persistence and editor history. A synthetic multi-target campaign (`app/src/lib/model/__fixtures__/sample-campaign.ts`) covers target bindings, layers, marks and crops together. Playwright covers real editing, target isolation, mixed-validity uploads, immediate reload, crash and conflict recovery, portable JSON/ZIP reopening, crop and artwork controls, export matrices, PNG dimensions, narrow screens and panorama equivalence.

`node app/scripts/verify-export.mjs run --out <dir> [--project <file>]` repeats the export path outside the test runner with synthetic captures, optionally adding an editable project file of your own, and checks every archive with code that shares nothing with the exporter. `verify-export.mjs check <export.zip>` checks one archive. To use an existing development server, set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173` before the end-to-end command. Otherwise Playwright builds and launches its own production preview on `PLAYWRIGHT_PORT` (default 4173), and fails if that port is taken. Set `PLAYWRIGHT_OUTPUT_DIR` to move traces and screenshots, and `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome instead of Playwright's Chromium.

CI runs these checks on Node 22 for pushes to `main` and `feat/**`, for every pull request, and on demand. It uploads Playwright traces and screenshots when a job fails.

## Visual references

The campaign system was informed by [Apple's product-page guidance](https://developer.apple.com/app-store/product-page/), [ScreenForge's panoramic screenshot workflow](https://getscreenforge.com/), and [AppScreens' screenshot examples](https://appscreens.com/). The implemented layouts, shapes, and styling are original.

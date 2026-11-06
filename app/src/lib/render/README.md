# Shared canvas renderer

`renderSlide(canvas, composition, index, { width? })` draws exact App Store pixels by default. Passing a smaller width renders an editor preview through the same drawing function. Pending image/font loads cannot overwrite a newer canvas render.

A connected panorama uses the canonical geometry in `stitch/panorama.ts`: one phone and background in a two-panel world, clipped by each panel's viewport. `renderPanoramaPair` exposes the uncropped world for seam verification. Panorama frame and effects come from the left slide.

`exportSlide`, `exportCampaign` and `exportContactSheet` retain their single-composition APIs. PNGs are decoded after encoding to verify dimensions, pixel data and opacity. The codec checks chunks and CRCs and normalizes opaque RGBA to RGB.

`exportMatrix(ProjectV2, options)` in `render/export.ts` is the multi-output API. It runs full preflight and renders one frame at a time, returning `blocked`, `complete` or `partial`. Pass `scope: 'draft'` for labelled review files; store export stops on blocking findings. The archive includes class/geometry folders, a SHA-256 manifest and a portable `project.json`. The studio supplies `CampaignPersistence.exportPortable` so the archive includes every original asset. Progress and an `AbortSignal` are supported; partial exports list omissions. `projectTextFromFile` reads either portable JSON or the project inside an exported ZIP.

`preflight` loads bundled fonts and dry-runs each frame through the real painter. `capturePlacement` uses the painter's layout helpers to measure clipped capture area, including rotation, each panorama viewport and a torn cut. `createPreflight` also supports a lightweight `layout: false` pass for the live panel. File/layout checks do not verify which app build a capture depicts.

All rendering and image data stays in the browser. No Chrome debugging process, server renderer, or third-party export service is needed.

## Scenes and layers

Layouts keep copy clear of the screenshot panel. `Slide.layers` paint above the scene, followed by The Check's pen mark. Each connected frame clips its own layers at its viewport, so a layer does not cross the seam. No style paints pagination or footer text.

A layer (`render/frames.ts`) is a whole-pixel crop of a real image, placed at output x/y with one uniform scale, so it can neither stretch a capture nor invent pixels. The editor and portable parser allow 12 layers per frame. `model/limits.ts` supplies the scale bounds shared with the painter: 0.01 to 16 for UI crops or 64 for artwork. `imageLayerError` names a layer that cannot be painted; `sampling: 'pixelated'` is for pixel art. Shadows are multiplied by the raster scale, because Canvas shadows ignore the transform.

The Check (`render/check.ts`, layout in `model/check.ts`) draws copy from real glyph metrics, including italic overhang, and fails with a named error when copy, a panel, a layer or a mark would collide. Its panel is frameless or a neutral device edge. Measured hardware comes only from Table Linen's opt-in `phone.hardware`, and `frameProfileError` refuses a size it was not measured for.

Fonts load through `render/fonts.ts`. A failed face is retried through a new `FontFace` on the next render, because a failed CSS `FontFace` stays failed for the life of the page.

The ZIP writer uses the standard STORE method because PNG data is already compressed. CRC-32 and directory structure are independently tested.

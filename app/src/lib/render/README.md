# Shared canvas renderer

`renderSlide(canvas, composition, index, { width? })` draws exact App Store pixels by default. Passing a smaller width renders an editor preview through the same drawing function. Pending image/font loads cannot overwrite a newer canvas render.

A connected panorama uses the canonical geometry in `stitch/panorama.ts`: one phone and background in a two-panel world, clipped by each panel's viewport. `renderPanoramaPair` exposes the uncropped world for seam verification. Panorama frame and effects come from the left slide.

`exportSlide` produces a native Canvas PNG; `exportCampaign` produces a ZIP with full-resolution PNGs and a portable `project.json` containing original screenshots as data URLs. `exportContactSheet` produces a presentation overview. All rendering and image data stays in the browser. No Chrome debugging process, server renderer, or third-party export service is needed.

The ZIP writer uses the standard STORE method because PNG data is already compressed. CRC-32 and directory structure are independently tested.

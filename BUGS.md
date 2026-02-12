# Bug Fixes To-Do

Bugs found during real-world testing with 6 Billington (checksinmyhead) screenshots on the Panoramic Flow template.

## Critical

### B1: Export hangs forever when rendering screenshots with data URLs

**Severity:** Critical — blocks all real-world export use cases
**Template:** All templates (any template with uploaded screenshots)
**Steps to reproduce:**
1. Open any template editor
2. Upload one or more screenshots
3. Click "Export iPhone 6.9"" or "All Slides (ZIP)"
4. The button shows "Exporting..." and never completes

**Root cause:**
The `/api/render` endpoint (in `src/routes/api/render/+server.ts`) converts base64 data URL params to `file://` temp file paths. However, when headless Chrome navigates to the template page via `http://localhost`, the template's `<img>` tags try to load `file://` URLs — which Chrome blocks due to cross-origin security (HTTP page cannot load file:// resources).

The image loading checker (lines 68-83) waits via `Runtime.evaluate` with a Promise that polls `img.complete && img.naturalWidth > 0` every 100ms but has **no timeout**. Since the images never load (blocked by security), the Promise never resolves and the request hangs indefinitely.

**Fix options:**
1. Add a timeout (e.g., 10 seconds) to the image loading Promise so the export fails gracefully instead of hanging
2. Instead of `file://` URLs, serve the temp images via the dev server (e.g., write to `static/tmp/` and use HTTP URLs)
3. Use CDP's `Page.addScriptToEvaluateOnNewDocument` or `Network.interceptRequest` to handle file:// URLs
4. Pass the base64 data directly to the template page via `Runtime.evaluate` after navigation (bypass URL params for images entirely — use the postMessage approach that the LivePreview already uses)

**Recommended fix:** Option 4 — after navigating headless Chrome to the template URL, use `Runtime.evaluate` to inject the base64 src directly into the img elements, matching the `postMessage` pattern already used by the LivePreview iframe. Also add a timeout to the image loading checker as a safety net.

---

## Medium

### B2: Color input emits warnings during manual hex entry

**Severity:** Low — cosmetic, console noise only
**Steps to reproduce:**
1. Open any template with color params
2. Click on the hex text input next to a color picker
3. Type a hex value character by character (e.g., "#2C8C7C")
4. Console shows warnings for each partial value: `The specified value "#2" does not conform to the required format...`

**Root cause:** The text input is bound to the same reactive value as the `<input type="color">`. Each keystroke updates the value, and the browser's color input validates it immediately — partial hex strings are invalid.

**Fix:** Debounce the text-to-color sync, or only push values to the color input when they match a complete hex pattern (`/^#[0-9a-fA-F]{6}$/`).

---

### B3: Panoramic gradient "flow" effect is imperceptible with similar colors

**Severity:** Low — UX/design
**Steps to reproduce:**
1. Open Panoramic Flow template
2. Set gradient start to `#2C8C7C` and end to `#4C5B6B`
3. Upload 6 screenshots and navigate between slides
4. The background gradient looks nearly identical across all slides

**Root cause:** The panoramic effect uses `background-size: 600% 100%` and shifts `background-position` per slide. When gradient colors are similar in hue/lightness, the shift is imperceptible.

**Suggested fix:** Add a tooltip or helper text suggesting users pick contrasting colors for the best panoramic effect. Alternatively, consider using a wider color interpolation (e.g., via multiple color stops) to create more visual variation between slides.

---

## Low

### B4: Iframe sandbox warnings in console

**Severity:** Negligible — expected browser behavior
**Details:** The template preview iframe has `sandbox="allow-scripts allow-same-origin"`, which triggers Chrome warnings about sandbox escaping. This is a necessary trade-off for the template system to function (templates need script execution and same-origin access for postMessage communication).

**Fix:** No fix needed — this is by design. Could suppress by removing `sandbox` attribute entirely, but that's a security regression.

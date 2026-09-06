import { DEVICES } from '../model/devices';
import {
	LINEN_COPY_CLEARANCE,
	LINEN_REFERENCE,
	linenHeadlineSpans,
	linenIslandProbePixel,
	linenLines,
	linenPhoneBox,
	linenPhoneFitError,
	linenScale,
	linenSeamError,
	linenShadowCss,
	resolveLinenSettings,
	resolveSharedLinenPhone,
	type LinenColors,
	type LinenPhone,
	type LinenPhoneBox,
	type LinenScale,
	type LinenSettings
} from '../model/linen';
import type { Composition, Slide } from '../model/types';
import type { PanoramaGeometry } from '../stitch/panorama';

/**
 * Table Linen scene painter. Draw order and arithmetic follow the external
 * `render-table-linen.mjs` artifact: every panel's background, then every panel's copy,
 * then exactly one phone. At 1320×2868 the numbers are identical to that renderer; other
 * output sizes scale horizontal/size values by width/1320 and vertical anchors by
 * height/2868 (see `linenScale`). Validation happens in OUTPUT space with real text
 * metrics, so a layout that only fits at the reference aspect is reported, never
 * silently overlapped or clipped.
 */

type Context = CanvasRenderingContext2D & { letterSpacing?: string };

interface Panel {
	width: number;
	height: number;
}

let linenFontsReady: Promise<void> | undefined;

function faceLoaded(family: string, style: string): boolean {
	let found = false;
	document.fonts.forEach((face) => {
		if (
			face.family.replace(/^["']|["']$/g, '') === family &&
			face.style === style &&
			face.status === 'loaded'
		)
			found = true;
	});
	return found;
}

/** Await the real Instrument Serif italic; a synthesized oblique would silently differ. */
export async function loadLinenFonts(): Promise<void> {
	linenFontsReady ??= (async () => {
		await Promise.all([
			document.fonts.load('400 118px "Instrument Serif"'),
			document.fonts.load('italic 400 118px "Instrument Serif"'),
			document.fonts.load('400 44px "DM Sans"'),
			document.fonts.load('500 34px "DM Sans"')
		]);
		if (!faceLoaded('Instrument Serif', 'normal') || !faceLoaded('Instrument Serif', 'italic')) {
			linenFontsReady = undefined;
			throw new Error(
				'The Instrument Serif regular and italic fonts could not be loaded, so Table Linen cannot be drawn accurately.'
			);
		}
	})();
	await linenFontsReady;
}

function rounded(ctx: Context, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Rightmost ink of a measured run, relative to its start (advance or glyph overhang). */
function inkRight(metrics: TextMetrics): number {
	const overhang = metrics.actualBoundingBoxRight;
	return Math.max(metrics.width, Number.isFinite(overhang) ? overhang : 0);
}

/**
 * Lowest ink below a `textBaseline = 'top'` origin. Real metrics when the browser
 * reports them, but never less than the font size, so an absurd leading cannot hide a
 * huge glyph run from the collision checks.
 */
function inkBottom(metrics: TextMetrics, size: number): number {
	const descent = metrics.actualBoundingBoxDescent;
	return Math.max(Number.isFinite(descent) ? descent : 0, size);
}

export function linenBackground(
	ctx: Context,
	settings: LinenSettings,
	offset: number,
	width: number,
	height: number,
	scale: LinenScale
) {
	ctx.fillStyle = settings.colors.canvas;
	ctx.fillRect(offset, 0, width, height);
	if (settings.band) {
		const bandTop = settings.layout.bandTop * scale.sy;
		ctx.fillStyle = settings.colors.band;
		ctx.fillRect(offset, bandTop, width, height - bandTop);
	}
}

function wrapSubtitle(ctx: Context, line: string, maxWidth: number, index: number): string[] {
	if (ctx.measureText(line).width <= maxWidth) return [line];
	const lines: string[] = [];
	let current = '';
	for (const word of line.split(/\s+/).filter(Boolean)) {
		if (ctx.measureText(word).width > maxWidth)
			throw new Error(
				`Supporting text line ${index + 1} has a word wider than its column. Shorten it or widen the supporting text.`
			);
		const candidate = current ? `${current} ${word}` : word;
		if (current && ctx.measureText(candidate).width > maxWidth) {
			lines.push(current);
			current = word;
		} else current = candidate;
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * Wordmark, headline with *italic accent* spans, and explicit subtitle lines. Drawing
 * arithmetic and order match the reference renderer; every check is made on the actual
 * output-space position and measured ink. Returns the bottom of the copy block in output
 * pixels (wordmark, headline and subtitle extents, whichever is lowest) so the phone can
 * be checked against it even when there is no subtitle.
 */
export function linenCopy(
	ctx: Context,
	name: string,
	slide: Slide,
	settings: LinenSettings,
	offset: number,
	scale: LinenScale,
	panel: Panel
): number {
	const { sx, sy } = scale;
	const c = settings.colors;
	const l = settings.layout;
	const edge = panel.width + 0.5;
	if (!('letterSpacing' in ctx))
		throw new Error(
			'This browser cannot draw Table Linen letter spacing. Use a current Chrome, Edge, Safari, or Firefox.'
		);
	const headlineLines = linenLines(slide.typography.headline);
	const subtitleLines = linenLines(slide.typography.subtitle);
	ctx.save();
	ctx.translate(offset, 0);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';

	// Wordmark: gold dot then the campaign name.
	const wordmarkTop = l.wordmarkTop * sy;
	ctx.fillStyle = c.dot;
	ctx.beginPath();
	ctx.arc((l.margin + 6) * sx, wordmarkTop + 21 * sx, 6 * sx, 0, 2 * Math.PI);
	ctx.fill();
	ctx.font = `500 ${34 * sx}px "DM Sans"`;
	ctx.letterSpacing = `${0.68 * sx}px`;
	ctx.fillStyle = c.wordmark;
	const wordmarkMetrics = ctx.measureText(name);
	const wordmarkX = (l.margin + 32) * sx;
	if (wordmarkX + inkRight(wordmarkMetrics) > edge)
		throw new Error(
			`The wordmark "${name}" runs past the right edge of the frame. Shorten the campaign name or reduce the left margin in the Type layout group.`
		);
	ctx.fillText(name, wordmarkX, wordmarkTop);
	const wordmarkBottom = wordmarkTop + inkBottom(wordmarkMetrics, 34 * sx);

	// Headline: explicit lines, *italic* spans in the accent color.
	const headlineTop = l.headlineTop * sy;
	const headlineSize = l.headlineSize * sx;
	const headlineLeading = l.headlineLeading * sx;
	if (headlineLines.length && headlineTop < wordmarkBottom)
		throw new Error(
			'The headline starts inside the wordmark. Move the headline top down or the wordmark top up in the Type layout group.'
		);
	let headlineInkBottom = headlineTop;
	headlineLines.forEach((line, lineIndex) => {
		const spans = linenHeadlineSpans(line, `Headline line ${lineIndex + 1}`);
		const y = headlineTop + lineIndex * headlineLeading;
		if (line.trim() && lineIndex > 0 && y < headlineInkBottom - 0.5)
			throw new Error(
				'Headline lines overlap. Increase the headline leading in the Type layout group.'
			);
		let x = l.margin * sx;
		ctx.letterSpacing = `${l.headlineTracking * sx}px`;
		for (const span of spans) {
			const style = span.italic ? 'italic ' : '';
			ctx.font = `${style}400 ${headlineSize}px "Instrument Serif"`;
			ctx.fillStyle = span.italic ? c.accent : c.headline;
			const metrics = ctx.measureText(span.text);
			const width = metrics.width;
			if (x + width > (l.margin + l.headlineWidth) * sx + 0.5)
				throw new Error(
					`Headline line ${lineIndex + 1} is wider than the headline column. Shorten it, reduce the headline size, or widen the headline.`
				);
			if (x + inkRight(metrics) > edge)
				throw new Error(
					`Headline line ${lineIndex + 1} runs past the right edge of the ${panel.width}-pixel frame. Shorten it, reduce the headline size, or narrow the headline column and margin.`
				);
			ctx.fillText(span.text, x, y);
			x += width;
			if (span.text.trim())
				headlineInkBottom = Math.max(headlineInkBottom, y + inkBottom(metrics, headlineSize));
		}
	});
	const headlineBlockBottom = headlineTop + headlineLines.length * headlineLeading;
	const headlineBottom = Math.max(headlineBlockBottom, headlineInkBottom);

	// Supporting text.
	const subtitleTop = l.subtitleTop * sy;
	const subtitleSize = l.subtitleSize * sx;
	const subtitleLeading = l.subtitleLeading * sx;
	if (subtitleLines.length && subtitleTop < headlineBottom)
		throw new Error(
			`The supporting text starts inside the headline block (headline ends at ${Math.round(headlineBottom)} px, supporting text starts at ${Math.round(subtitleTop)} px). Move the supporting top down, reduce the headline size or leading, or remove a headline line.`
		);
	ctx.letterSpacing = '0px';
	ctx.font = `400 ${subtitleSize}px "DM Sans"`;
	ctx.fillStyle = c.subtitle;
	const drawn = subtitleLines.flatMap((line, index) =>
		wrapSubtitle(ctx, line, l.subtitleWidth * sx, index)
	);
	let subtitleInkBottom = subtitleTop;
	drawn.forEach((text, lineIndex) => {
		const metrics = ctx.measureText(text);
		const y = subtitleTop + lineIndex * subtitleLeading;
		if (text.trim() && lineIndex > 0 && y < subtitleInkBottom - 0.5)
			throw new Error(
				'Supporting text lines overlap. Increase the supporting leading in the Type layout group.'
			);
		if (l.margin * sx + inkRight(metrics) > edge)
			throw new Error(
				`Supporting text line ${lineIndex + 1} runs past the right edge of the ${panel.width}-pixel frame. Shorten it or narrow the supporting width and margin.`
			);
		ctx.fillText(text, l.margin * sx, y);
		if (text.trim())
			subtitleInkBottom = Math.max(subtitleInkBottom, y + inkBottom(metrics, subtitleSize));
	});
	ctx.restore();
	const subtitleBottom = Math.max(subtitleTop + drawn.length * subtitleLeading, subtitleInkBottom);
	const copyBottom = Math.max(wordmarkBottom, headlineBottom, subtitleBottom);
	if (copyBottom > panel.height)
		throw new Error(
			`The copy runs off the bottom of the ${panel.height}-pixel frame. Raise the headline or supporting top, or shorten the text.`
		);
	return copyBottom;
}

/**
 * Canvas shadows are applied in device pixels and ignore the current transform, so the
 * preview's raster scale has to be multiplied in by hand. Read before any rotation so a
 * 1320-wide export at scale 1 gets exactly 80 / 40.
 */
function rasterScale(ctx: Context): number {
	const transform = ctx.getTransform();
	return Math.hypot(transform.a, transform.b) || 1;
}

/**
 * Trivial duplicate-island guard shared with the V2 renderer: a capture whose island
 * centre is already dark keeps its own island. Samples one decoded pixel; the capture
 * itself is never modified.
 */
function captureHasDarkIslandCenter(image: HTMLImageElement): boolean {
	const probe = document.createElement('canvas');
	probe.width = probe.height = 1;
	const pc = probe.getContext('2d', { willReadFrequently: true });
	if (!pc) return false;
	const pixel = linenIslandProbePixel(image);
	pc.drawImage(image, pixel.x, pixel.y, 1, 1, 0, 0, 1, 1);
	const [r, g, b] = pc.getImageData(0, 0, 1, 1).data;
	probe.width = probe.height = 0;
	return r + g + b < 120;
}

function placeholder(ctx: Context, box: LinenPhoneBox, sx: number, sy: number) {
	ctx.fillStyle = '#f5f5f1';
	ctx.fillRect(sx, sy, box.screenWidth, box.screenHeight);
	ctx.fillStyle = '#a1a19a';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `400 ${box.screenWidth * 0.05}px "DM Sans", Arial, sans-serif`;
	ctx.fillText('Your screenshot here', 0, -box.screenHeight * 0.1);
	ctx.font = `400 ${box.screenWidth * 0.028}px "DM Sans", Arial, sans-serif`;
	ctx.fillText('Add an image to begin', 0, -box.screenHeight * 0.055);
}

/**
 * Shell and full-capture screen under one translate(centre)·rotate transform. Without
 * `phone.hardware` this is the V1 flat shell, byte-for-byte. With it, the V2 iPhone 17
 * Pro Max illustration: side buttons, metal body, glass bezel, calibrated display
 * corners, the unmodified capture, and optionally the island cutout. Every part shares
 * the one rigid transform, so screenshot and frame rotate together.
 */
export function linenPhone(
	ctx: Context,
	box: LinenPhoneBox,
	phone: LinenPhone,
	colors: LinenColors,
	scale: LinenScale,
	image?: HTMLImageElement
) {
	const border = box.border;
	ctx.save();
	ctx.translate(box.centerX, box.centerY);
	const shadowScale = scale.sx * rasterScale(ctx);
	if (box.rotation) ctx.rotate(box.rotation);
	const sx = -box.screenWidth / 2;
	const sy = -box.screenHeight / 2;
	const hw = box.hardware;
	if (hw) {
		const unit = scale.sx;
		ctx.lineWidth = 1 * unit;
		ctx.fillStyle = '#B7BABE';
		ctx.strokeStyle = 'rgba(58,62,66,0.55)';
		for (const button of hw.buttons) {
			const { x, y, width, height } = button.local;
			rounded(ctx, x, y, width, height, 1.5 * unit);
			ctx.fill();
			ctx.stroke();
		}
		if (phone.shadow) {
			ctx.shadowColor = linenShadowCss(colors);
			ctx.shadowBlur = 80 * shadowScale;
			ctx.shadowOffsetY = 40 * shadowScale;
		}
		rounded(ctx, hw.bx, hw.by, box.shellWidth, box.shellHeight, hw.bodyRadius);
		const metal = ctx.createLinearGradient(hw.bx, hw.by, hw.bx, hw.by + box.shellHeight);
		metal.addColorStop(0, '#DADCDF');
		metal.addColorStop(0.5, '#C3C6CA');
		metal.addColorStop(1, '#D3D5D8');
		ctx.fillStyle = metal;
		ctx.fill();
		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetY = 0;
		ctx.strokeStyle = 'rgba(64,68,72,0.6)';
		ctx.stroke();
		rounded(
			ctx,
			hw.bx + hw.rim,
			hw.by + hw.rim,
			box.shellWidth - 2 * hw.rim,
			box.shellHeight - 2 * hw.rim,
			hw.bodyRadius - hw.rim
		);
		ctx.fillStyle = '#0A0B0C';
		ctx.fill();
		ctx.strokeStyle = 'rgba(255,255,255,0.12)';
		ctx.stroke();
		// The display mask blanks corner pixels only; the capture is drawn unmodified.
		rounded(ctx, sx, sy, box.screenWidth, box.screenHeight, hw.displayRadius);
		ctx.clip();
		if (image) {
			ctx.drawImage(image, sx, sy, box.screenWidth, box.screenHeight);
			// `source` never draws; `draw` skips a capture that already carries a dark island.
			if (hw.islandMode === 'draw' && !captureHasDarkIslandCenter(image)) {
				const island = hw.islandLocal;
				rounded(ctx, island.x, island.y, island.width, island.height, island.radius);
				ctx.fillStyle = '#000000';
				ctx.fill();
			}
		} else placeholder(ctx, box, sx, sy);
		ctx.restore();
		return;
	}
	if (phone.shadow) {
		ctx.shadowColor = linenShadowCss(colors);
		ctx.shadowBlur = 80 * shadowScale;
		ctx.shadowOffsetY = 40 * shadowScale;
	}
	rounded(ctx, sx - border, sy - border, box.shellWidth, box.shellHeight, box.radius + border);
	ctx.fillStyle = phone.frameless ? colors.canvas : colors.shell;
	ctx.fill();
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetY = 0;
	if (!phone.frameless) {
		ctx.lineWidth = 2 * scale.sx;
		ctx.strokeStyle = colors.shellEdge;
		ctx.stroke();
	}
	// The whole capture is uniformly scaled; corner masking only touches background pixels.
	rounded(ctx, sx, sy, box.screenWidth, box.screenHeight, box.radius);
	ctx.clip();
	if (image) ctx.drawImage(image, sx, sy, box.screenWidth, box.screenHeight);
	else placeholder(ctx, box, sx, sy);
	ctx.restore();
}

function checkPhone(
	box: LinenPhoneBox,
	phone: LinenPhone,
	worldWidth: number,
	height: number,
	copyBottom: number,
	scale: LinenScale
) {
	const fit = linenPhoneFitError(box, phone, worldWidth, height);
	if (fit) throw new Error(fit);
	const clearance = copyBottom + LINEN_COPY_CLEARANCE * scale.sy;
	if (box.bounds.top < clearance)
		throw new Error(
			`The phone overlaps the copy (phone top ${Math.round(box.bounds.top)} px, copy needs ${Math.round(clearance)} px). Move the phone top down, raise the headline or supporting text, reduce the type size, or shorten the text.`
		);
}

/**
 * Paint one Table Linen slide, or the connected pair's whole world when `panorama` is set.
 * The caller has already awaited fonts and the shared/primary image.
 */
export function drawLinenScene(
	ctx: Context,
	composition: Composition,
	slideIndex: number,
	panorama: PanoramaGeometry | null,
	source: HTMLImageElement | undefined,
	wholePair: boolean
) {
	const { width, height } = DEVICES[composition.device];
	const scale = linenScale(width, height);
	const panel = { width, height };
	const name = composition.name || 'Your app';
	if (panorama) {
		const indices = [panorama.leftIndex, panorama.rightIndex];
		const settings = indices.map((index) => resolveLinenSettings(composition, index));
		ctx.save();
		ctx.translate(wholePair ? 0 : -panorama.viewportX, 0);
		settings.forEach((item, i) => linenBackground(ctx, item, i * width, width, height, scale));
		const copyBottom = Math.max(
			...indices.map((index, i) =>
				linenCopy(ctx, name, composition.slides[index], settings[i], i * width, scale, panel)
			)
		);
		const phone = resolveSharedLinenPhone(composition);
		const box = linenPhoneBox(phone, composition.panorama!.image, scale);
		checkPhone(box, phone, width * 2, height, copyBottom, scale);
		const seam = linenSeamError(box, width, width * 2);
		if (seam) throw new Error(seam);
		// Hardware colors (shell, edge, shadow) come from the left frame; copy stays per frame.
		linenPhone(ctx, box, phone, settings[0].colors, scale, source);
		ctx.restore();
		return;
	}
	const slide = composition.slides[slideIndex];
	const settings = resolveLinenSettings(composition, slideIndex);
	linenBackground(ctx, settings, 0, width, height, scale);
	const copyBottom = linenCopy(ctx, name, slide, settings, 0, scale, panel);
	const box = linenPhoneBox(settings.phone, slide.primaryImage ?? LINEN_REFERENCE_SOURCE, scale);
	checkPhone(box, settings.phone, width, height, copyBottom, scale);
	linenPhone(ctx, box, settings.phone, settings.colors, scale, source);
}

const LINEN_REFERENCE_SOURCE = {
	naturalWidth: LINEN_REFERENCE.width,
	naturalHeight: LINEN_REFERENCE.height
};

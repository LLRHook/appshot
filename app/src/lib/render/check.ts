import {
	CHECK_PANEL_ANCHOR,
	CHECK_PALETTES,
	checkFamily,
	checkLayout,
	checkMarkStroke,
	checkPairPanel,
	checkStrokeOutline,
	checkTornEdge,
	resolveCheckSettings,
	type CheckCanvas,
	type CheckFont,
	type CheckMeasure,
	type CheckPalette,
	type CheckPanelBox,
	type CheckScene,
	type CheckSettings
} from '../model/check';
import type { AspectFamily, ImageLayer, PixelRect } from '../model/contracts';
import { DEVICES } from '../model/devices';
import type { Composition, ImageRef, Slide } from '../model/types';
import type { PanoramaGeometry } from '../stitch/panorama';
import {
	clearShadow,
	hexWithAlpha,
	imageLayerError,
	layerBounds,
	layerRegionToOutput,
	paintImageLayer,
	setShadow,
	type Rect
} from './frames';

/**
 * The Check painter. Pure layout comes from `model/check.ts`; this file measures real glyphs and
 * paints. Order: canvas, copy, panel, layers, pen mark, so nothing but a deliberate callout or
 * mark ever sits over app UI. All geometry is in output pixels: one scale from the caller's
 * transform turns it into a preview, which is what keeps preview and export the same picture.
 */

type Context = CanvasRenderingContext2D & {
	letterSpacing?: string;
	fontKerning?: string;
	textRendering?: string;
};

function cssFont(font: CheckFont, italic = font.italic): string {
	const family = font.role === 'display' ? '"Instrument Serif"' : '"DM Sans"';
	return `${italic ? 'italic ' : ''}${font.weight} ${font.size}px ${family}`;
}

function useFont(ctx: Context, font: CheckFont, italic = font.italic) {
	ctx.font = cssFont(font, italic);
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${font.tracking}px`;
}

function realMetrics(ctx: Context): CheckMeasure {
	return (text, font) => {
		useFont(ctx, font);
		const metrics = ctx.measureText(text);
		return {
			advance: metrics.width,
			left: metrics.actualBoundingBoxLeft,
			right: metrics.actualBoundingBoxRight,
			ascent: metrics.actualBoundingBoxAscent,
			descent: metrics.actualBoundingBoxDescent
		};
	};
}

function prepareText(ctx: Context) {
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
	// Metrics and glyph placement stay linear at any preview scale.
	if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';
}

/* ------------------------------------------------------------------ canvas */

/**
 * Deterministic textures. Thread and grain are irregular rather than periodic, so scaling them
 * down averages to the flat color instead of beating into moiré, and light and dark balance so the
 * mean color does not move. They are invisible at store scale and do not change contrast.
 */
const TEXTURE_SIZE = 512;
let clothTile: HTMLCanvasElement | undefined;
let grainTile: HTMLCanvasElement | undefined;

function textureRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function makeTile(paint: (x: number, y: number) => number): HTMLCanvasElement {
	const tile = document.createElement('canvas');
	tile.width = tile.height = TEXTURE_SIZE;
	const ctx = tile.getContext('2d');
	if (!ctx) throw new Error('Your browser could not create a drawing canvas.');
	const pixels = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
	for (let y = 0; y < TEXTURE_SIZE; y++) {
		for (let x = 0; x < TEXTURE_SIZE; x++) {
			const value = paint(x, y);
			const offset = (y * TEXTURE_SIZE + x) * 4;
			pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value > 0 ? 255 : 0;
			pixels.data[offset + 3] = Math.min(255, Math.round(Math.abs(value) * 255));
		}
	}
	ctx.putImageData(pixels, 0, 0);
	return tile;
}

function cloth(): HTMLCanvasElement {
	if (clothTile) return clothTile;
	const random = textureRandom(20261105);
	// Thread widths vary, so no period is short enough to beat against a downscale.
	const threads = () => {
		const values: number[] = [];
		while (values.length < TEXTURE_SIZE) {
			const shade = random() - 0.5;
			const span = 2 + Math.floor(random() * 3);
			for (let i = 0; i < span; i++) values.push(shade);
		}
		return values;
	};
	const warp = threads();
	const weft = threads();
	clothTile = makeTile((x, y) => (warp[x] + weft[y]) * 0.013 + (random() - 0.5) * 0.008);
	return clothTile;
}

function grain(): HTMLCanvasElement {
	if (grainTile) return grainTile;
	const random = textureRandom(19920417);
	grainTile = makeTile(() => (random() - 0.5) * 0.016);
	return grainTile;
}

/** Gold is a clean tone from top to foot: it may fall by no more than about 15 levels. */
const CANVAS_LIGHT: Record<CheckCanvas, readonly [string, string]> = {
	teal: ['rgba(255,255,255,0.015)', 'rgba(0,0,0,0.12)'],
	cream: ['rgba(255,255,255,0)', 'rgba(120,88,40,0.045)'],
	gold: ['rgba(255,246,214,0.05)', 'rgba(150,100,10,0.05)']
};

/** Texture is only added where it can resolve; a small preview shows what it averages to. */
const MIN_TEXTURE_RASTER = 0.6;

function paintCanvas(
	ctx: Context,
	canvas: CheckCanvas,
	palette: CheckPalette,
	offset: number,
	width: number,
	height: number,
	raster: number
) {
	ctx.fillStyle = palette.canvas;
	ctx.fillRect(offset, 0, width, height);
	const [top, bottom] = CANVAS_LIGHT[canvas];
	const light = ctx.createLinearGradient(0, 0, 0, height);
	light.addColorStop(0, top);
	light.addColorStop(1, bottom);
	ctx.fillStyle = light;
	ctx.fillRect(offset, 0, width, height);
	if (raster < MIN_TEXTURE_RASTER) return;
	const pattern = ctx.createPattern(canvas === 'teal' ? cloth() : grain(), 'repeat');
	if (!pattern) return;
	ctx.fillStyle = pattern;
	ctx.fillRect(offset, 0, width, height);
}

/* ------------------------------------------------------------------ copy */

function paintCopyInk(ctx: Context, scene: CheckScene) {
	const { palette, wordmark, headline, support } = scene;
	prepareText(ctx);
	if (wordmark) {
		ctx.fillStyle = palette.dot;
		ctx.beginPath();
		ctx.arc(wordmark.dot.x, wordmark.dot.y, wordmark.dot.radius, 0, Math.PI * 2);
		ctx.fill();
		useFont(ctx, wordmark.font);
		ctx.fillStyle = palette.wordmark;
		ctx.fillText(wordmark.text, wordmark.x, wordmark.baseline);
	}
	for (const line of headline.lines) {
		for (const run of line.runs) {
			useFont(ctx, headline.font, run.italic);
			ctx.fillStyle = run.italic ? palette.accent : palette.headline;
			ctx.fillText(run.text, run.x, line.baseline);
		}
	}
	useFont(ctx, support.font);
	ctx.fillStyle = palette.support;
	for (const line of support.lines) {
		for (const run of line.runs) ctx.fillText(run.text, run.x, line.baseline);
	}
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/**
 * Copy is set on its own transparent layer. On the opaque frame buffer the browser gives text under
 * its 256 px path limit subpixel (LCD) edges and larger text gray edges, so the same headline style
 * came out color-fringed on some frames and clean on others, and it depended on the size of the type.
 * A transparent layer has no subpixel order to use, so every size gets the same gray edges.
 */
function paintCopy(ctx: Context, scene: CheckScene) {
	const { copyBounds } = scene;
	if (!copyBounds) return;
	const transform = ctx.getTransform();
	const reach = scene.headline.font.size * 0.2;
	const left = Math.floor(transform.a * (copyBounds.left - reach) + transform.e);
	const top = Math.floor(transform.d * (copyBounds.top - reach) + transform.f);
	const right = Math.ceil(transform.a * (copyBounds.right + reach) + transform.e);
	const bottom = Math.ceil(transform.d * (copyBounds.bottom + reach) + transform.f);
	const layer = document.createElement('canvas');
	layer.width = Math.max(1, right - left);
	layer.height = Math.max(1, bottom - top);
	const ink = layer.getContext('2d') as Context | null;
	if (!ink) throw new Error('Your browser could not create a drawing canvas.');
	ink.setTransform(transform.a, 0, 0, transform.d, transform.e - left, transform.f - top);
	paintCopyInk(ink, scene);
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.drawImage(layer, left, top);
	ctx.restore();
	layer.width = layer.height = 0;
}

/* ------------------------------------------------------------------ panel */

const PANEL_SHADOWS = {
	soft: { blur: 0.075, offsetY: 0.03 },
	dramatic: { blur: 0.125, offsetY: 0.055 }
} as const;

function panelPath(ctx: Context, panel: CheckPanelBox, outset: number) {
	const x = -panel.width / 2 - outset;
	const y = -panel.height / 2 - outset;
	const width = panel.width + outset * 2;
	const height = panel.height + outset * 2;
	const radius = panel.radius + outset;
	if (panel.cut === undefined) {
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, radius);
		return;
	}
	// Local coordinates: the cut is measured from the unrotated top of the capture.
	const cutY = panel.cut - (panel.y + panel.height / 2);
	const teeth = checkTornEdge(x, x + width, cutY, panel.tearUnit);
	ctx.beginPath();
	ctx.moveTo(x, teeth[0].y);
	ctx.lineTo(x, y + radius);
	ctx.arcTo(x, y, x + radius, y, radius);
	ctx.lineTo(x + width - radius, y);
	ctx.arcTo(x + width, y, x + width, y + radius, radius);
	for (let i = teeth.length - 1; i >= 0; i--) ctx.lineTo(teeth[i].x, teeth[i].y);
	ctx.closePath();
}

function paintPanel(
	ctx: Context,
	panel: CheckPanelBox,
	slide: Slide,
	palette: CheckPalette,
	frameWidth: number,
	image: HTMLImageElement | undefined
) {
	ctx.save();
	ctx.translate(panel.x + panel.width / 2, panel.y + panel.height / 2);
	if (panel.rotation) ctx.rotate(panel.rotation);
	const shadow = slide.effects.shadow;
	if (shadow !== 'none') {
		const spec = PANEL_SHADOWS[shadow];
		setShadow(ctx, {
			color: hexWithAlpha(palette.shadow, palette.shadowOpacity),
			blur: frameWidth * spec.blur,
			offsetY: frameWidth * spec.offsetY
		});
	}
	panelPath(ctx, panel, panel.edge);
	ctx.fillStyle = panel.edge > 0 ? palette.edge : '#FFFFFF';
	ctx.fill();
	clearShadow(ctx);
	panelPath(ctx, panel, 0);
	ctx.clip();
	const x = -panel.width / 2;
	const y = -panel.height / 2;
	if (image) {
		ctx.fillStyle = '#FFFFFF';
		ctx.fillRect(x, y, panel.width, panel.height);
		// One uniform scale over the whole capture, status bar included. Nothing is redrawn.
		ctx.drawImage(image, x, y, panel.width, panel.height);
	} else {
		ctx.fillStyle = '#F5F1E8';
		ctx.fillRect(x, y, panel.width, panel.height);
		ctx.fillStyle = '#6F7A76';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `500 ${panel.width * 0.045}px "DM Sans", Arial, sans-serif`;
		ctx.fillText('Your screenshot here', 0, y + panel.width * 0.5);
	}
	ctx.restore();
}

/* ------------------------------------------------------------------ collisions and pen */

function overlap(a: Rect, b: Rect): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function layerName(layer: ImageLayer): string {
	return `${layer.kind === 'art' ? 'Artwork' : 'Callout'} "${layer.id}"`;
}

function assertLayersClearCopy(scene: CheckScene, layers: readonly ImageLayer[]) {
	for (const layer of layers) {
		const bounds = layerBounds(layer);
		if (scene.copyBoxes.some((box) => overlap(box, bounds)))
			throw new Error(
				`${layerName(layer)} overlaps the copy. Move it down, reduce its scale, or shorten the headline.`
			);
	}
}

function assertPanelClearsCopy(scene: CheckScene) {
	const { panel } = scene;
	if (panel && scene.copyBoxes.some((box) => overlap(box, panel.bounds)))
		throw new Error(
			'The screenshot overlaps the copy. Reduce its scale or tilt, or shorten the headline.'
		);
}

/** A mark's anchor region in output pixels, or a message saying why it cannot be marked. */
function markRegion(
	settings: CheckSettings,
	layers: readonly ImageLayer[],
	panel: CheckPanelBox | undefined,
	image: ImageRef | undefined
): PixelRect | null {
	const mark = settings.mark;
	if (!mark) return null;
	const { rect, anchor } = mark;
	if (anchor === CHECK_PANEL_ANCHOR) {
		if (!panel || !image)
			throw new Error('The pen mark points at the screenshot, but this frame shows none.');
		if (panel.rotation)
			throw new Error('The pen mark cannot follow a tilted screenshot. Set the tilt to 0.');
		if (rect.x + rect.width > image.naturalWidth || rect.y + rect.height > image.naturalHeight)
			throw new Error(
				`The pen mark points outside the ${image.naturalWidth} × ${image.naturalHeight} screenshot. Move it back onto the capture.`
			);
		return {
			x: panel.x + rect.x * panel.scale,
			y: panel.y + rect.y * panel.scale,
			width: rect.width * panel.scale,
			height: rect.height * panel.scale
		};
	}
	const layer = layers.find((item) => item.id === anchor);
	if (!layer)
		throw new Error(`The pen mark points at "${anchor}", which is not an image on this frame.`);
	if (layer.rotation)
		throw new Error(
			`The pen mark cannot follow rotated ${layerName(layer)}. Set its rotation to 0.`
		);
	const { crop } = layer;
	if (
		rect.x < crop.x ||
		rect.y < crop.y ||
		rect.x + rect.width > crop.x + crop.width ||
		rect.y + rect.height > crop.y + crop.height
	)
		throw new Error(
			`The pen mark points outside ${layerName(layer)}'s crop. Move it inside the crop, or widen the crop.`
		);
	return layerRegionToOutput(layer, rect);
}

function paintMark(
	ctx: Context,
	scene: CheckScene,
	settings: CheckSettings,
	layers: readonly ImageLayer[],
	image: ImageRef | undefined,
	frame: { width: number; height: number }
) {
	const mark = settings.mark;
	if (!mark) return;
	const region = markRegion(settings, layers, scene.panel, image);
	if (!region) return;
	const stroke = checkMarkStroke(mark.kind, region, mark.seed, frame.width / 1320);
	const bounds = stroke.bounds;
	if (
		bounds.left < 0 ||
		bounds.top < 0 ||
		bounds.right > frame.width ||
		bounds.bottom > frame.height ||
		(scene.panel?.cut !== undefined &&
			mark.anchor === CHECK_PANEL_ANCHOR &&
			bounds.bottom > scene.panel.cut)
	)
		throw new Error(
			'The pen mark runs off the visible frame. Mark something further inside, or reduce the scale.'
		);
	if (scene.copyBoxes.some((box) => overlap(box, bounds)))
		throw new Error('The pen mark overlaps the copy. Mark something further from the text.');
	const markRect: Rect = {
		left: region.x,
		right: region.x + region.width,
		top: region.y,
		bottom: region.y + region.height
	};
	const anchorIndex = layers.findIndex((layer) => layer.id === mark.anchor);
	for (const layer of layers.slice(anchorIndex + 1)) {
		if (overlap(layerBounds(layer), markRect))
			throw new Error(
				`${layerName(layer)} covers what the pen mark points at. Move it, or mark something else.`
			);
	}
	const outline = checkStrokeOutline(stroke.points);
	ctx.save();
	ctx.fillStyle = scene.palette.pen;
	ctx.beginPath();
	ctx.moveTo(outline[0].x, outline[0].y);
	for (const point of outline.slice(1)) ctx.lineTo(point.x, point.y);
	ctx.closePath();
	ctx.fill('nonzero');
	ctx.restore();
}

/* ------------------------------------------------------------------ scene */

function targetFamily(composition: Composition, width: number, height: number): AspectFamily {
	const target = DEVICES[composition.device] as { layoutFamily?: AspectFamily };
	return target.layoutFamily ?? checkFamily(width, height);
}

function paintLayers(
	ctx: Context,
	layers: readonly ImageLayer[],
	images: ReadonlyMap<string, HTMLImageElement>,
	frame: { width: number; height: number },
	palette: CheckPalette,
	settings: CheckSettings,
	unit: number
) {
	for (const layer of layers) {
		const image = images.get(layer.image.blobUrl);
		if (!image) continue;
		const width = layer.crop.width * layer.scale;
		const reachesBottom = !layer.rotation && layerBounds(layer).bottom >= frame.height - 0.5;
		paintImageLayer(ctx, layer, image, frame.width, {
			shadowColor: palette.shadow,
			shadowStrength: palette.shadowOpacity / CHECK_PALETTES.teal.shadowOpacity,
			squareBottom: reachesBottom,
			...(settings.tear === layer.id ? { bottomEdge: checkTornEdge(0, width, 0, unit) } : {})
		});
	}
}

/** Lowest point of artwork in the brand band at the top, which the copy must start below. */
function artClearance(layers: readonly ImageLayer[], height: number): number | undefined {
	const bottoms = layers
		.filter((layer) => layer.kind === 'art')
		.map((layer) => layerBounds(layer))
		.filter((bounds) => bounds.top < height * 0.1 && bounds.bottom < height * 0.2)
		.map((bounds) => bounds.bottom);
	return bottoms.length ? Math.max(...bottoms) : undefined;
}

function validLayers(slide: Slide, frame: { width: number; height: number }): ImageLayer[] {
	const layers = slide.layers ?? [];
	for (const layer of layers) {
		const error = imageLayerError(layer, frame);
		if (error) throw new Error(error);
	}
	return layers;
}

function pairPanel(composition: Composition, panorama: PanoramaGeometry): CheckPanelBox {
	const { width, height } = DEVICES[composition.device];
	const shared = composition.panorama!;
	return checkPairPanel(
		width,
		height,
		shared.image,
		{
			offset: shared.offset,
			scale: shared.scale,
			tilt: shared.tilt,
			frame: composition.slides[panorama.leftIndex].frame
		},
		targetFamily(composition, width, height)
	);
}

/** The single-frame layout is shared by painting and the export crop measurement. */
function frameScene(ctx: Context, composition: Composition, slideIndex: number): CheckScene {
	const { width, height } = DEVICES[composition.device];
	const slide = composition.slides[slideIndex];
	prepareText(ctx);
	return checkLayout({
		width,
		height,
		family: targetFamily(composition, width, height),
		settings: resolveCheckSettings(composition, slideIndex),
		headline: slide.typography.headline,
		support: slide.typography.subtitle,
		name: composition.name,
		fontScale: slide.fontScale,
		panelScale: slide.scale,
		tilt: slide.tilt,
		frame: slide.frame,
		artBottom: artClearance(slide.layers ?? [], height),
		source: slide.primaryImage,
		measure: realMetrics(ctx)
	});
}

/** The exact panel the painter uses. A connected pair shares one world-space panel. */
export function measureCheckPanel(
	ctx: Context,
	composition: Composition,
	slideIndex: number,
	panorama: PanoramaGeometry | null
): CheckPanelBox | null {
	return panorama
		? pairPanel(composition, panorama)
		: (frameScene(ctx, composition, slideIndex).panel ?? null);
}

/** Paint one frame, or a connected pair's whole world when `panorama` is set. */
export function drawCheckScene(
	ctx: Context,
	composition: Composition,
	slideIndex: number,
	panorama: PanoramaGeometry | null,
	source: HTMLImageElement | undefined,
	images: ReadonlyMap<string, HTMLImageElement>,
	raster: number
) {
	const { width, height } = DEVICES[composition.device];
	const frame = { width, height };
	const family = targetFamily(composition, width, height);
	const measure = realMetrics(ctx);
	prepareText(ctx);
	const name = composition.name;

	if (panorama) {
		const indices = [panorama.leftIndex, panorama.rightIndex];
		const shared = composition.panorama!;
		const world = pairPanel(composition, panorama);
		const frames = indices.map((index, i) => {
			const slide = composition.slides[index];
			const settings = resolveCheckSettings(composition, index);
			const offset = i * width;
			const scene = checkLayout({
				width,
				height,
				family,
				settings: { ...settings, panel: false },
				headline: slide.typography.headline,
				support: slide.typography.subtitle,
				name,
				fontScale: slide.fontScale,
				frame: slide.frame,
				artBottom: artClearance(slide.layers ?? [], height),
				sharedPanel: {
					...world,
					x: world.x - offset,
					bounds: {
						...world.bounds,
						left: world.bounds.left - offset,
						right: world.bounds.right - offset
					}
				},
				measure
			});
			return { slide, settings, scene, offset, layers: validLayers(slide, frame) };
		});
		const left = frames[0];
		frames.forEach((item) =>
			paintCanvas(ctx, item.settings.canvas, item.scene.palette, item.offset, width, height, raster)
		);
		for (const item of frames) {
			assertLayersClearCopy(item.scene, item.layers);
			assertPanelClearsCopy(item.scene);
			ctx.save();
			ctx.translate(item.offset, 0);
			paintCopy(ctx, item.scene);
			ctx.restore();
		}
		paintPanel(ctx, world, left.slide, left.scene.palette, width, source);
		// Each frame's own layers and mark stay in its half, so no element is split by the seam.
		for (const item of frames) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(item.offset, 0, width, height);
			ctx.clip();
			ctx.translate(item.offset, 0);
			paintLayers(
				ctx,
				item.layers,
				images,
				frame,
				item.scene.palette,
				item.settings,
				item.scene.unit
			);
			paintMark(ctx, item.scene, item.settings, item.layers, shared.image, frame);
			ctx.restore();
		}
		return;
	}

	const slide = composition.slides[slideIndex];
	const settings = resolveCheckSettings(composition, slideIndex);
	const layers = validLayers(slide, frame);
	const scene = frameScene(ctx, composition, slideIndex);
	assertLayersClearCopy(scene, layers);
	assertPanelClearsCopy(scene);
	paintCanvas(ctx, settings.canvas, scene.palette, 0, width, height, raster);
	paintCopy(ctx, scene);
	if (scene.panel) paintPanel(ctx, scene.panel, slide, scene.palette, width, source);
	paintLayers(ctx, layers, images, frame, scene.palette, settings, scene.unit);
	paintMark(ctx, scene, settings, layers, slide.primaryImage, frame);
}

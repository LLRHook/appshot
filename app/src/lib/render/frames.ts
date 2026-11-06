import { MAX_IMAGE_SIDE } from '../model/image';
import type { ImageLayer, PixelRect } from '../model/contracts';
import type { DeviceSize } from '../model/devices';
import type { LinenHardwareModel } from '../model/linen';
import type { ImageRef } from '../model/types';
import { MAX_ART_SCALE, MAX_LAYER_SCALE, MIN_LAYER_SCALE } from '../model/limits';
export { MAX_ART_SCALE, MAX_LAYER_SCALE } from '../model/limits';

/**
 * What every scene shares: raster-independent shadows, real-pixel image layers, and which measured
 * device frames a target may show. Nothing here reads a style.
 */

type Context = CanvasRenderingContext2D;

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Area-equivalent capture height after a frame edge or torn cut, excluding rounded corners. */
export function visibleCaptureHeight(
	box: { x: number; y: number; width: number; height: number; rotation?: number; cut?: number },
	viewport: Rect
): number {
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const bottom = Math.max(box.y, Math.min(box.y + box.height, box.cut ?? Infinity));
	const cos = Math.cos(box.rotation ?? 0);
	const sin = Math.sin(box.rotation ?? 0);
	let polygon = [
		[box.x, box.y],
		[box.x + box.width, box.y],
		[box.x + box.width, bottom],
		[box.x, bottom]
	].map(([x, y]) => ({
		x: cx + (x - cx) * cos - (y - cy) * sin,
		y: cy + (x - cx) * sin + (y - cy) * cos
	}));
	for (const [axis, edge, direction] of [
		['x', viewport.left, 1],
		['x', viewport.right, -1],
		['y', viewport.top, 1],
		['y', viewport.bottom, -1]
	] as const) {
		const clipped: typeof polygon = [];
		for (let index = 0; index < polygon.length; index++) {
			const a = polygon[index];
			const b = polygon[(index + 1) % polygon.length];
			const insideA = (a[axis] - edge) * direction >= 0;
			const insideB = (b[axis] - edge) * direction >= 0;
			if (insideA) clipped.push(a);
			if (insideA !== insideB) {
				const t = (edge - a[axis]) / (b[axis] - a[axis]);
				clipped.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
			}
		}
		polygon = clipped;
	}
	const area =
		Math.abs(
			polygon.reduce((sum, a, index) => {
				const b = polygon[(index + 1) % polygon.length];
				return sum + a.x * b.y - b.x * a.y;
			}, 0)
		) / 2;
	return Math.max(0, Math.min(box.height, area / box.width));
}

export interface ShadowSpec {
	color: string;
	blur: number;
	offsetY: number;
}

/**
 * Canvas shadows are applied in device pixels and ignore the current transform, so a preview's
 * raster scale has to be multiplied in by hand. Rotation does not change this length.
 */
export function rasterScale(ctx: Context): number {
	const transform = ctx.getTransform();
	return Math.hypot(transform.a, transform.b) || 1;
}

/** Set a shadow described in output pixels, so a preview matches its export. */
export function setShadow(ctx: Context, spec: ShadowSpec) {
	const raster = rasterScale(ctx);
	ctx.shadowColor = spec.color;
	ctx.shadowBlur = spec.blur * raster;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = spec.offsetY * raster;
}

export function clearShadow(ctx: Context) {
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
}

export function hexWithAlpha(color: string, alpha: number): string {
	const channel = (offset: number) => parseInt(color.slice(offset, offset + 2), 16);
	return `rgba(${channel(1)},${channel(3)},${channel(5)},${alpha})`;
}

function layerName(layer: ImageLayer): string {
	return `${layer.kind === 'art' ? 'Artwork' : 'Callout'} "${layer.id}"`;
}

/** The output rectangle a layer covers once rotated. */
export function layerBounds(layer: ImageLayer): Rect {
	const width = layer.crop.width * layer.scale;
	const height = layer.crop.height * layer.scale;
	const cx = layer.x + width / 2;
	const cy = layer.y + height / 2;
	const radians = ((layer.rotation ?? 0) * Math.PI) / 180;
	const cos = Math.abs(Math.cos(radians));
	const sin = Math.abs(Math.sin(radians));
	const extentX = (width * cos + height * sin) / 2;
	const extentY = (width * sin + height * cos) / 2;
	return { left: cx - extentX, right: cx + extentX, top: cy - extentY, bottom: cy + extentY };
}

function isWhole(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Null when a layer is safe to paint, otherwise a message naming what to change. The crop must be
 * whole source pixels inside the image, and the placement one finite uniform scale, so a layer can
 * neither stretch a capture nor invent pixels the capture does not have.
 */
export function imageLayerError(
	layer: ImageLayer,
	frame: { width: number; height: number }
): string | null {
	const name = layerName(layer);
	const { image, crop } = layer;
	if (![image?.naturalWidth, image?.naturalHeight].every((side) => isWhole(side) && side > 0))
		return `${name} has no valid image. Choose its image again.`;
	if (![crop?.x, crop?.y, crop?.width, crop?.height].every(isWhole))
		return `${name} needs a crop in whole source pixels. Set its crop again.`;
	if (
		crop.width < 1 ||
		crop.height < 1 ||
		crop.width > MAX_IMAGE_SIDE ||
		crop.height > MAX_IMAGE_SIDE
	)
		return `${name} has an empty or oversized crop. Set its crop again.`;
	if (
		crop.x < 0 ||
		crop.y < 0 ||
		crop.x + crop.width > image.naturalWidth ||
		crop.y + crop.height > image.naturalHeight
	)
		return `${name} crops outside its ${image.naturalWidth} × ${image.naturalHeight} image (x ${crop.x}, y ${crop.y}, ${crop.width} × ${crop.height}). Move the crop inside the image.`;
	const largest = layer.kind === 'art' ? MAX_ART_SCALE : MAX_LAYER_SCALE;
	if (!Number.isFinite(layer.scale) || layer.scale < MIN_LAYER_SCALE || layer.scale > largest)
		return `${name} needs one scale from ${MIN_LAYER_SCALE} to ${largest}.`;
	if (!Number.isFinite(layer.x) || !Number.isFinite(layer.y))
		return `${name} has an invalid position. Set its position again.`;
	if (layer.rotation !== undefined && !Number.isFinite(layer.rotation))
		return `${name} has an invalid rotation.`;
	if (layer.radius !== undefined && (!Number.isFinite(layer.radius) || layer.radius < 0))
		return `${name} has an invalid corner radius.`;
	if (layer.kind !== 'source-crop' && layer.kind !== 'art')
		return `${name} has an unsupported kind.`;
	const bounds = layerBounds(layer);
	if (
		bounds.right <= 0 ||
		bounds.bottom <= 0 ||
		bounds.left >= frame.width ||
		bounds.top >= frame.height
	)
		return `${name} is entirely outside the ${frame.width} × ${frame.height} frame. Move it back into view.`;
	return null;
}

/** Every distinct image a slide's layers need, for loading before the atomic paint. */
export function layerImages(layers: readonly ImageLayer[] | undefined): ImageRef[] {
	const seen = new Map<string, ImageRef>();
	for (const layer of layers ?? [])
		if (layer.image?.blobUrl && !seen.has(layer.image.blobUrl))
			seen.set(layer.image.blobUrl, layer.image);
	return [...seen.values()];
}

const LAYER_SHADOWS = {
	soft: { blur: 0.062, offsetY: 0.022, alpha: 0.26 },
	dramatic: { blur: 0.11, offsetY: 0.044, alpha: 0.38 }
} as const;

export interface LayerPaint {
	/** Shadow tint. Defaults to a neutral dark. */
	shadowColor?: string;
	/** Multiplies the shadow's opacity, for a canvas where it should sit quieter. */
	shadowStrength?: number;
	/**
	 * Replaces the bottom edge, left to right, with y measured from the layer's bottom. Only the
	 * top corners stay rounded, and the crop's last rows show through the teeth.
	 */
	bottomEdge?: readonly { x: number; y: number }[];
	/** The layer runs off the bottom of the frame, so only its top corners are rounded. */
	squareBottom?: boolean;
}

function roundedLayerPath(
	ctx: Context,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
	{ bottomEdge, squareBottom }: LayerPaint
) {
	const radius = Math.max(0, Math.min(r, w / 2, h / 2));
	ctx.beginPath();
	if (!bottomEdge?.length) {
		ctx.roundRect(x, y, w, h, squareBottom ? [radius, radius, 0, 0] : radius);
		return;
	}
	const bottom = y + h;
	ctx.moveTo(x, bottom + bottomEdge[0].y);
	ctx.lineTo(x, y + radius);
	ctx.arcTo(x, y, x + radius, y, radius);
	ctx.lineTo(x + w - radius, y);
	ctx.arcTo(x + w, y, x + w, y + radius, radius);
	for (let i = bottomEdge.length - 1; i >= 0; i--)
		ctx.lineTo(x + bottomEdge[i].x, bottom + bottomEdge[i].y);
	ctx.closePath();
}

/**
 * Paint one validated layer at uniform scale. A real capture crop gets a rounded shadow plate
 * behind it; art keeps its own alpha, and any shadow follows its ink. Nearest-neighbor sampling
 * applies to this draw only and is restored afterwards.
 */
export function paintImageLayer(
	ctx: Context,
	layer: ImageLayer,
	image: CanvasImageSource,
	frameWidth: number,
	paint: LayerPaint = {}
) {
	const width = layer.crop.width * layer.scale;
	const height = layer.crop.height * layer.scale;
	const radius = layer.radius ?? 0;
	const shadow = layer.shadow && layer.shadow !== 'none' ? LAYER_SHADOWS[layer.shadow] : null;
	const shadowSpec = shadow
		? {
				color: hexWithAlpha(
					paint.shadowColor ?? '#0A1412',
					Math.min(1, shadow.alpha * (paint.shadowStrength ?? 1))
				),
				blur: frameWidth * shadow.blur,
				offsetY: frameWidth * shadow.offsetY
			}
		: null;
	const { crop } = layer;
	ctx.save();
	ctx.translate(layer.x + width / 2, layer.y + height / 2);
	if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
	const x = -width / 2;
	const y = -height / 2;
	if (layer.kind === 'source-crop') {
		if (shadowSpec) setShadow(ctx, shadowSpec);
		ctx.fillStyle = '#FFFFFF';
		roundedLayerPath(ctx, x, y, width, height, radius, paint);
		ctx.fill();
		clearShadow(ctx);
	} else if (shadowSpec) setShadow(ctx, shadowSpec);
	if (radius > 0 || paint.bottomEdge?.length) {
		// `clip` would also stop an art layer's shadow; art with a radius keeps it inside anyway.
		roundedLayerPath(ctx, x, y, width, height, radius, paint);
		ctx.clip();
	}
	ctx.imageSmoothingEnabled = layer.sampling !== 'pixelated';
	ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, x, y, width, height);
	ctx.restore();
}

/**
 * Map a region of a layer's source pixels to output pixels. Only valid for an unrotated layer;
 * a rotated anchor is rejected by the caller rather than marked in the wrong place.
 */
export function layerRegionToOutput(layer: ImageLayer, region: PixelRect): PixelRect {
	return {
		x: layer.x + (region.x - layer.crop.x) * layer.scale,
		y: layer.y + (region.y - layer.crop.y) * layer.scale,
		width: region.width * layer.scale,
		height: region.height * layer.scale
	};
}

/**
 * Measured hardware belongs to one display class. `target.frameProfile` is the catalog's word on
 * which device a size is. Before a target declares one, only the exact size the iPhone 17 Pro Max
 * illustration was calibrated against qualifies. Returns a message naming the fix, or null.
 */
export function frameProfileError(
	hardware: LinenHardwareModel | undefined,
	target: DeviceSize & { frameProfile?: string }
): string | null {
	if (!hardware) return null;
	const measured =
		hardware === 'iphone-17-pro-max' && target.width === 1320 && target.height === 2868;
	if (target.frameProfile === hardware || measured) return null;
	return `The iPhone 17 Pro Max frame was measured from a 1320 × 2868 capture, so it cannot appear on ${target.label} (${target.width} × ${target.height}). Choose Simple frame in the Composition tab.`;
}

import { dataUrlFromBytes } from './assets';
import { readCapture } from './capture';
import { parseCheckSettings } from './check';
import type { ImageLayer } from './contracts';
import { DEVICES } from './devices';
import { STYLES } from './studio';
import { parseImageRef } from './image';
import { parseLinenPhone, parseLinenSettings } from './linen';
import {
	MAX_ART_SCALE,
	MAX_FRAMES,
	MAX_LAYER_SCALE,
	MAX_SLIDE_LAYERS,
	MIN_LAYER_SCALE,
	validateProjectSize
} from './limits';
export { MAX_SLIDE_LAYERS } from './limits';
import type { Composition, ImageRef, Panorama, Slide } from './types';

export const PROJECT_KEY = 'appshot-studio-project-v1';
export const INVALID_PROJECT = 'Choose a valid Appshot project with 1–10 screenshots.';
const INVALID_SLIDE = 'The project contains an invalid screenshot.';
const INVALID_LAYER = 'The project contains an invalid image layer.';

export function record(value: unknown, message = INVALID_SLIDE): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
	return value as Record<string, unknown>;
}

export function string(value: unknown, max: number, message = INVALID_SLIDE): string {
	if (typeof value !== 'string' || value.length > max) throw new Error(message);
	return value;
}

export function id(value: unknown, message = INVALID_SLIDE): string {
	const result = string(value, 200, message);
	if (!result.trim()) throw new Error(message);
	return result;
}

export function number(value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new Error('The project contains an invalid layout value.');
	}
	return value;
}

export function choice<T extends string | number>(value: unknown, choices: readonly T[]): T {
	if (!choices.includes(value as T)) throw new Error(INVALID_SLIDE);
	return value as T;
}

export function color(value: unknown): string {
	if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
		throw new Error('The project contains an invalid color.');
	}
	return value;
}

export const LAYOUT_IDS = [
	'text-above',
	'text-below',
	'text-left',
	'text-right',
	'centered',
	'split'
] as const;

/** Shared with the Table Linen converter; see `image.ts` for the accepted formats. */
const parseImage = (value: unknown): ImageRef => parseImageRef(value);

function wholePixel(value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
		throw new Error('A layer crop must be whole pixels inside its image.');
	return value;
}

/**
 * Validate a slide's image layers. `resolve` turns the stored image reference (an `ImageRef` in a
 * projected document, an asset id in a stored one) into the image and its real pixel size, so a
 * crop can never reach outside the source. Placement is one uniform scale, so nothing can stretch.
 */
export function parseImageLayers<TImage>(
	value: unknown,
	resolve: (image: unknown) => { image: TImage; naturalWidth: number; naturalHeight: number }
): ImageLayer<TImage>[] {
	if (!Array.isArray(value) || value.length > MAX_SLIDE_LAYERS) throw new Error(INVALID_LAYER);
	const ids = new Set<string>();
	return value.map((entry) => {
		const layer = record(entry, INVALID_LAYER);
		const layerId = id(layer.id, INVALID_LAYER);
		if (ids.has(layerId)) throw new Error(INVALID_LAYER);
		ids.add(layerId);
		const { image, naturalWidth, naturalHeight } = resolve(layer.image);
		const crop = record(layer.crop, INVALID_LAYER);
		const x = wholePixel(crop.x, 0, naturalWidth - 1);
		const y = wholePixel(crop.y, 0, naturalHeight - 1);
		const kind = choice(layer.kind, ['source-crop', 'art'] as const);
		const parsed: ImageLayer<TImage> = {
			id: layerId,
			kind,
			image,
			crop: {
				x,
				y,
				width: wholePixel(crop.width, 1, naturalWidth - x),
				height: wholePixel(crop.height, 1, naturalHeight - y)
			},
			x: number(layer.x, -16000, 16000),
			y: number(layer.y, -16000, 16000),
			scale: number(layer.scale, MIN_LAYER_SCALE, kind === 'art' ? MAX_ART_SCALE : MAX_LAYER_SCALE)
		};
		if (layer.rotation !== undefined) parsed.rotation = number(layer.rotation, -360, 360);
		if (layer.radius !== undefined) parsed.radius = number(layer.radius, 0, 4000);
		if (layer.shadow !== undefined)
			parsed.shadow = choice(layer.shadow, ['none', 'soft', 'dramatic'] as const);
		if (layer.sampling !== undefined)
			parsed.sampling = choice(layer.sampling, ['smooth', 'pixelated'] as const);
		return parsed;
	});
}

/** Fields every project version shares, up to where a v1 slide stores its image. */
export function parseSlideCopy(slide: Record<string, unknown>) {
	const background = record(slide.background);
	const typography = record(slide.typography);
	const effects = record(slide.effects);
	if (
		!Array.isArray(background.colors) ||
		background.colors.length < 1 ||
		background.colors.length > 8
	) {
		throw new Error('The project contains an invalid background.');
	}
	return {
		id: id(slide.id),
		...(slide.label !== undefined ? { label: string(slide.label, 200) } : {}),
		background: {
			kind: choice(background.kind, ['solid', 'linear', 'radial', 'mesh'] as const),
			colors: background.colors.map(color),
			...(background.angle !== undefined ? { angle: number(background.angle, -360, 360) } : {}),
			...(background.noise !== undefined ? { noise: number(background.noise, 0, 1) } : {})
		},
		frame: choice(slide.frame, ['bezel', 'clay', 'wireframe', 'none'] as const),
		layout: choice(slide.layout, LAYOUT_IDS),
		typography: {
			headline: string(typography.headline, 180),
			...(typography.subtitle !== undefined ? { subtitle: string(typography.subtitle, 300) } : {}),
			fontColor: color(typography.fontColor),
			fontWeight: choice(typography.fontWeight, [400, 500, 600, 700, 800] as const)
		},
		effects: {
			shadow: choice(effects.shadow, ['none', 'soft', 'dramatic'] as const),
			glow: number(effects.glow, 0, 1)
		}
	};
}

/** Fields every project version shares, after where a v1 slide stores its image. */
export function parseSlideTreatment(slide: Record<string, unknown>) {
	return {
		...(slide.tilt !== undefined ? { tilt: number(slide.tilt, -30, 30) } : {}),
		...(slide.scale !== undefined ? { scale: number(slide.scale, 0.6, 1.4) } : {}),
		...(slide.fontScale !== undefined ? { fontScale: number(slide.fontScale, 0.7, 1.3) } : {}),
		...(slide.badge !== undefined ? { badge: string(slide.badge, 80) } : {}),
		...(slide.linen !== undefined ? { linen: parseLinenSettings(slide.linen) } : {}),
		...(slide.check !== undefined ? { check: parseCheckSettings(slide.check) } : {})
	};
}

function parseSlide(value: unknown, device: Composition['device']): Slide {
	const slide = record(value);
	if (slide.device !== device) throw new Error(INVALID_SLIDE);
	const { id: slideId, ...copy } = parseSlideCopy(slide);
	const continuity = record(slide.continuity);
	return {
		id: slideId,
		device,
		...copy,
		continuity: {
			inset: number(continuity.inset, -8000, 8000),
			...(continuity.incoming !== undefined ? { incoming: parseImage(continuity.incoming) } : {}),
			...(continuity.outgoing !== undefined ? { outgoing: parseImage(continuity.outgoing) } : {})
		},
		...(slide.primaryImage !== undefined ? { primaryImage: parseImage(slide.primaryImage) } : {}),
		...parseSlideTreatment(slide),
		...(slide.layers !== undefined
			? {
					layers: parseImageLayers<ImageRef>(slide.layers, (raw) => {
						const image = parseImage(raw);
						return {
							image,
							naturalWidth: image.naturalWidth,
							naturalHeight: image.naturalHeight
						};
					})
				}
			: {})
	};
}

/** The connected pair's fields every version shares, validated against the frame order. */
export function parsePanoramaPlacement(
	panorama: Record<string, unknown>,
	slides: readonly { id: string }[]
): Omit<Panorama, 'image'> {
	const leftId = id(panorama.leftId);
	const rightId = id(panorama.rightId);
	const leftIndex = slides.findIndex((slide) => slide.id === leftId);
	if (leftIndex < 0 || slides[leftIndex + 1]?.id !== rightId)
		throw new Error('The connected screenshots must be adjacent and in order.');
	return {
		leftId,
		rightId,
		offset: number(panorama.offset, -400, 400),
		scale: number(panorama.scale, 0.6, 1.4),
		tilt: number(panorama.tilt, -30, 30),
		...(panorama.linenPhone !== undefined
			? { linenPhone: parseLinenPhone(panorama.linenPhone) }
			: {})
	};
}

/** Validate untrusted imports and return only the supported, portable model fields. */
export function parseProject(text: string): Composition {
	validateProjectSize(text);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(INVALID_PROJECT);
	}
	return parseComposition(parsed);
}

/** `parseProject` for a value already read from JSON. */
export function parseComposition(parsed: unknown): Composition {
	const value = record(parsed, INVALID_PROJECT);
	if (
		value.version !== 1 ||
		typeof value.device !== 'string' ||
		!Object.hasOwn(DEVICES, value.device) ||
		!Array.isArray(value.slides) ||
		value.slides.length < 1 ||
		value.slides.length > MAX_FRAMES
	) {
		throw new Error(INVALID_PROJECT);
	}
	const device = value.device as Composition['device'];
	const slides = value.slides.map((slide) => parseSlide(slide, device));
	if (new Set(slides.map((slide) => slide.id)).size !== slides.length)
		throw new Error(INVALID_SLIDE);
	const composition: Composition = {
		version: 1,
		name: string(value.name, 200, INVALID_PROJECT),
		device,
		style: choice(
			value.style,
			STYLES.map((style) => style.id)
		),
		accent: color(value.accent),
		continuityMode: choice(value.continuityMode, ['none', 'paired'] as const),
		slides
	};
	if (value.panorama !== undefined) {
		const panorama = record(value.panorama, 'The connected composition is invalid.');
		const { leftId, rightId, ...placement } = parsePanoramaPlacement(panorama, slides);
		composition.panorama = {
			leftId,
			rightId,
			image: parseImage(panorama.image),
			...placement
		};
	}
	return composition;
}

function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('Browser storage is unavailable. Save a project backup to keep your work.'));
			return;
		}
		const request = indexedDB.open('appshot-studio', 1);
		let blocked = false;
		request.onupgradeneeded = () => request.result.createObjectStore('projects');
		request.onsuccess = () => {
			if (blocked) {
				request.result.close();
				return;
			}
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () =>
			reject(request.error ?? new Error('Browser storage could not be opened.'));
		request.onblocked = () => {
			blocked = true;
			reject(new Error('Browser storage is busy. Close other Appshot tabs and try again.'));
		};
	});
}

export async function saveProject(project: Composition): Promise<void> {
	// Apply the same boundary to persisted state so every successful save can be reopened.
	const serialized = JSON.stringify(parseProject(JSON.stringify(project)));
	const db = await database();
	return new Promise((resolve, reject) => {
		try {
			const transaction = db.transaction('projects', 'readwrite');
			transaction.oncomplete = () => {
				db.close();
				resolve();
			};
			transaction.onabort = transaction.onerror = () => {
				db.close();
				reject(transaction.error ?? new Error('The project could not be saved.'));
			};
			transaction.objectStore('projects').put(serialized, PROJECT_KEY);
		} catch (error) {
			db.close();
			reject(error);
		}
	});
}

export async function loadProject(): Promise<Composition | null> {
	const db = await database();
	return new Promise((resolve, reject) => {
		try {
			const transaction = db.transaction('projects');
			const request = transaction.objectStore('projects').get(PROJECT_KEY);
			transaction.oncomplete = () => {
				db.close();
				try {
					if (request.result === undefined) resolve(null);
					else if (typeof request.result === 'string') resolve(parseProject(request.result));
					else reject(new Error(INVALID_PROJECT));
				} catch (error) {
					reject(error);
				}
			};
			transaction.onabort = transaction.onerror = () => {
				db.close();
				reject(transaction.error ?? new Error('The saved project could not be opened.'));
			};
		} catch (error) {
			db.close();
			reject(error);
		}
	});
}

/** The legacy autosave exactly as stored, unparsed, or undefined when there is none. */
export async function readLegacyAutosave(): Promise<unknown> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const request = db.transaction('projects').objectStore('projects').get(PROJECT_KEY);
		request.onsuccess = () => {
			db.close();
			resolve(request.result);
		};
		request.onerror = () => {
			db.close();
			reject(request.error ?? new Error('The saved project could not be opened.'));
		};
	});
}

/** Disconnect a pair whose frames are no longer adjacent, for any project version. */
export function clearBrokenPanorama<
	T extends {
		slides: readonly { id: string }[];
		panorama?: { leftId: string; rightId: string };
		continuityMode: 'none' | 'paired';
	}
>(composition: T): T {
	if (!composition.panorama) return composition;
	const index = composition.slides.findIndex((slide) => slide.id === composition.panorama!.leftId);
	if (index < 0 || composition.slides[index + 1]?.id !== composition.panorama.rightId) {
		return { ...composition, panorama: undefined, continuityMode: 'none' };
	}
	return composition;
}

export function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Read a screenshot into an embedded image for the single-target document. */
export async function readImage(file: File): Promise<ImageRef> {
	const capture = await readCapture(file);
	return parseImage({
		id: crypto.randomUUID(),
		blobUrl: dataUrlFromBytes(new Uint8Array(await capture.blob.arrayBuffer()), capture.mime),
		naturalWidth: capture.naturalWidth,
		naturalHeight: capture.naturalHeight
	});
}

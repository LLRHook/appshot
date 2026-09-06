import { DEVICES } from './devices';
import { STYLES } from './studio';
import type { Composition, ImageRef, Slide } from './types';

export const PROJECT_KEY = 'appshot-studio-project-v1';
const MAX_PROJECT_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const INVALID_PROJECT = 'Choose a valid Appshot project with 1–10 screenshots.';
const INVALID_SLIDE = 'The project contains an invalid screenshot.';
const INVALID_IMAGE = 'The project contains an invalid image. Use a PNG, JPG, or WebP under 12 MB.';

function record(value: unknown, message = INVALID_SLIDE): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
	return value as Record<string, unknown>;
}

function string(value: unknown, max: number, message = INVALID_SLIDE): string {
	if (typeof value !== 'string' || value.length > max) throw new Error(message);
	return value;
}

function id(value: unknown): string {
	const result = string(value, 200);
	if (!result.trim()) throw new Error(INVALID_SLIDE);
	return result;
}

function number(value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new Error('The project contains an invalid layout value.');
	}
	return value;
}

function choice<T extends string | number>(value: unknown, choices: readonly T[]): T {
	if (!choices.includes(value as T)) throw new Error(INVALID_SLIDE);
	return value as T;
}

function color(value: unknown): string {
	if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
		throw new Error('The project contains an invalid color.');
	}
	return value;
}

function imageUrl(value: unknown): string {
	if (typeof value !== 'string') throw new Error(INVALID_IMAGE);
	if (/^\/demo\/(home|split|receipt|items|share)\.png$/.test(value)) return value;
	const prefix = /^data:image\/(png|jpeg|webp);base64,/.exec(value);
	if (!prefix) throw new Error(INVALID_IMAGE);
	const payload = value.slice(prefix[0].length);
	// Check the payload without decoding an entire multi-megabyte image or using
	// a repeated regex group that can exhaust the JS regex stack on large files.
	const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
	if (
		payload.length < 16 ||
		payload.length % 4 !== 0 ||
		(payload.length / 4) * 3 - padding > MAX_IMAGE_BYTES ||
		/[^A-Za-z0-9+/]/.test(payload.slice(0, payload.length - padding))
	)
		throw new Error(INVALID_IMAGE);
	const header = atob(payload.slice(0, 16));
	const signatureMatches =
		prefix[1] === 'png'
			? header.startsWith('\x89PNG\r\n\x1a\n')
			: prefix[1] === 'jpeg'
				? header.startsWith('\xff\xd8\xff')
				: header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
	if (!signatureMatches) throw new Error(INVALID_IMAGE);
	return value;
}

function parseImage(value: unknown): ImageRef {
	const image = record(value, INVALID_IMAGE);
	const naturalWidth = number(image.naturalWidth, 1, 8000);
	const naturalHeight = number(image.naturalHeight, 1, 8000);
	if (
		!Number.isInteger(naturalWidth) ||
		!Number.isInteger(naturalHeight) ||
		naturalWidth * naturalHeight > 24_000_000
	) {
		throw new Error('Choose a screenshot under 24 megapixels, with each side under 8000 pixels.');
	}
	return { id: id(image.id), blobUrl: imageUrl(image.blobUrl), naturalWidth, naturalHeight };
}

function parseSlide(value: unknown, device: Composition['device']): Slide {
	const slide = record(value);
	if (slide.device !== device) throw new Error(INVALID_SLIDE);
	const background = record(slide.background);
	const typography = record(slide.typography);
	const effects = record(slide.effects);
	const continuity = record(slide.continuity);
	if (
		!Array.isArray(background.colors) ||
		background.colors.length < 1 ||
		background.colors.length > 8
	) {
		throw new Error('The project contains an invalid background.');
	}
	return {
		id: id(slide.id),
		device,
		...(slide.label !== undefined ? { label: string(slide.label, 200) } : {}),
		background: {
			kind: choice(background.kind, ['solid', 'linear', 'radial', 'mesh'] as const),
			colors: background.colors.map(color),
			...(background.angle !== undefined ? { angle: number(background.angle, -360, 360) } : {}),
			...(background.noise !== undefined ? { noise: number(background.noise, 0, 1) } : {})
		},
		frame: choice(slide.frame, ['bezel', 'clay', 'wireframe', 'none'] as const),
		layout: choice(slide.layout, [
			'text-above',
			'text-below',
			'text-left',
			'text-right',
			'centered',
			'split'
		] as const),
		typography: {
			headline: string(typography.headline, 180),
			...(typography.subtitle !== undefined ? { subtitle: string(typography.subtitle, 300) } : {}),
			fontColor: color(typography.fontColor),
			fontWeight: choice(typography.fontWeight, [400, 500, 600, 700, 800] as const)
		},
		effects: {
			shadow: choice(effects.shadow, ['none', 'soft', 'dramatic'] as const),
			glow: number(effects.glow, 0, 1)
		},
		continuity: {
			inset: number(continuity.inset, -8000, 8000),
			...(continuity.incoming !== undefined ? { incoming: parseImage(continuity.incoming) } : {}),
			...(continuity.outgoing !== undefined ? { outgoing: parseImage(continuity.outgoing) } : {})
		},
		...(slide.primaryImage !== undefined ? { primaryImage: parseImage(slide.primaryImage) } : {}),
		...(slide.tilt !== undefined ? { tilt: number(slide.tilt, -30, 30) } : {}),
		...(slide.scale !== undefined ? { scale: number(slide.scale, 0.6, 1.4) } : {}),
		...(slide.fontScale !== undefined ? { fontScale: number(slide.fontScale, 0.7, 1.3) } : {}),
		...(slide.badge !== undefined ? { badge: string(slide.badge, 80) } : {})
	};
}

/** Validate untrusted imports and return only the supported, portable model fields. */
export function parseProject(text: string): Composition {
	if (
		text.length > MAX_PROJECT_BYTES ||
		new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES
	) {
		throw new Error('This project is too large. Keep it under 60 MB.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(INVALID_PROJECT);
	}
	const value = record(parsed, INVALID_PROJECT);
	if (
		value.version !== 1 ||
		typeof value.device !== 'string' ||
		!Object.hasOwn(DEVICES, value.device) ||
		!Array.isArray(value.slides) ||
		value.slides.length < 1 ||
		value.slides.length > 10
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
		const leftId = id(panorama.leftId);
		const rightId = id(panorama.rightId);
		const leftIndex = slides.findIndex((slide) => slide.id === leftId);
		if (leftIndex < 0 || slides[leftIndex + 1]?.id !== rightId)
			throw new Error('The connected screenshots must be adjacent and in order.');
		composition.panorama = {
			leftId,
			rightId,
			image: parseImage(panorama.image),
			offset: number(panorama.offset, -400, 400),
			scale: number(panorama.scale, 0.6, 1.4),
			tilt: number(panorama.tilt, -30, 30)
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

export function clearBrokenPanorama(composition: Composition): Composition {
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

export async function readImage(file: File): Promise<ImageRef> {
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
		throw new Error('Choose a PNG, JPG, or WebP screenshot.');
	if (file.size > MAX_IMAGE_BYTES)
		throw new Error(`${file.name} is too large. Choose an image under 12 MB.`);
	const url = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () =>
			reject(new Error('This screenshot could not be read. Try selecting it again.'));
		reader.onabort = () => reject(new Error('Reading the screenshot was cancelled.'));
		reader.readAsDataURL(file);
	});
	const image = new Image();
	image.src = url;
	try {
		await image.decode();
	} catch {
		throw new Error('This image could not be opened. Choose a valid PNG, JPG, or WebP screenshot.');
	}
	return parseImage({
		id: crypto.randomUUID(),
		blobUrl: url,
		naturalWidth: image.naturalWidth,
		naturalHeight: image.naturalHeight
	});
}

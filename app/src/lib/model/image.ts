import type { ImageRef } from './types';

/**
 * The one source of truth for what an ImageRef may contain. `project.ts` (import,
 * autosave, portable files) and the Table Linen manifest converter both use it, so a
 * converter result can never carry an image that `parseProject` later rejects.
 *
 * This module imports only types; anything may depend on it without a cycle.
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const MAX_IMAGE_ID_LENGTH = 200;
export const INVALID_IMAGE =
	'The project contains an invalid image. Use a PNG, JPG, or WebP under 12 MB.';
const INVALID_IMAGE_SIZE =
	'Choose a screenshot under 24 megapixels, with each side under 8000 pixels.';

/** Only bundled demo assets or embedded PNG/JPEG/WebP data URLs with a real signature. */
export function imageUrl(value: unknown): string {
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

function imageId(value: unknown): string {
	if (typeof value !== 'string' || value.length > MAX_IMAGE_ID_LENGTH || !value.trim())
		throw new Error(INVALID_IMAGE);
	return value;
}

function imageSide(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > MAX_IMAGE_SIDE)
		throw new Error(INVALID_IMAGE_SIZE);
	return value;
}

/** Validate an untrusted ImageRef and return only its portable fields. */
export function parseImageRef(value: unknown): ImageRef {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID_IMAGE);
	const image = value as Record<string, unknown>;
	const naturalWidth = imageSide(image.naturalWidth);
	const naturalHeight = imageSide(image.naturalHeight);
	if (
		!Number.isInteger(naturalWidth) ||
		!Number.isInteger(naturalHeight) ||
		naturalWidth * naturalHeight > MAX_IMAGE_PIXELS
	)
		throw new Error(INVALID_IMAGE_SIZE);
	return {
		id: imageId(image.id),
		blobUrl: imageUrl(image.blobUrl),
		naturalWidth,
		naturalHeight
	};
}

/**
 * The decoded bitmap must be the size its metadata claims; otherwise the renderer would
 * stretch or crop the capture based on a lie. Called on every draw, including cache hits.
 */
export function assertDecodedImageMatches(
	image: { naturalWidth: number; naturalHeight: number },
	ref: ImageRef
): void {
	if (image.naturalWidth === ref.naturalWidth && image.naturalHeight === ref.naturalHeight) return;
	throw new Error(
		`A screenshot is ${image.naturalWidth} × ${image.naturalHeight} pixels but the project lists it as ${ref.naturalWidth} × ${ref.naturalHeight}. Replace the image from the Content tab so the project records its real size.`
	);
}

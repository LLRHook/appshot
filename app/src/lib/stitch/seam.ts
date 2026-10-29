import type { Slide } from '../model/types';
import { DEVICES } from '../model/devices';

export interface SeamAnchors {
	slideIndex: number;
	leftSlideId: string;
	rightSlideId: string;
	imageWidth: number;
	imageHeight: number;
	y: number;
	leftX: number;
	rightX: number;
	inset: number;
}

export interface SeamValidation {
	valid: boolean;
	reason?: string;
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A seam spans the boundary between slide N and slide N+1. The shared image is
 * placed so half of it sits on slide N (against the right edge) and half on
 * slide N+1 (against the left edge); concatenating the exports reproduces one
 * unbroken image. `inset` shifts the image along the horizontal axis on both
 * sides by the same amount, preserving the continuity invariant.
 */
export function computeSeamGeometry(
	left: Slide,
	right: Slide,
	slideIndex: number
): SeamAnchors | null {
	if (!Number.isSafeInteger(slideIndex) || slideIndex < 0) return null;
	if (!Object.hasOwn(DEVICES, left.device) || !Object.hasOwn(DEVICES, right.device)) return null;
	const deviceLeft = DEVICES[left.device];
	const deviceRight = DEVICES[right.device];
	if (deviceLeft.width !== deviceRight.width || deviceLeft.height !== deviceRight.height)
		return null;
	if (!nonemptyString(left.id) || !nonemptyString(right.id) || left.id === right.id) return null;

	const out = left.continuity?.outgoing;
	const incoming = right.continuity?.incoming;
	if (!out || !incoming) return null;
	// An ID alone does not guarantee both halves will draw the same bitmap.
	if (
		!nonemptyString(out.id) ||
		!nonemptyString(out.blobUrl) ||
		out.id !== incoming.id ||
		out.blobUrl !== incoming.blobUrl ||
		out.naturalWidth !== incoming.naturalWidth ||
		out.naturalHeight !== incoming.naturalHeight
	)
		return null;
	if (
		!Number.isSafeInteger(out.naturalWidth) ||
		!Number.isSafeInteger(out.naturalHeight) ||
		out.naturalWidth <= 0 ||
		out.naturalHeight <= 0
	)
		return null;

	const inset = left.continuity.inset;
	if (!Number.isFinite(inset) || inset !== right.continuity.inset) return null;
	const imageWidth = out.naturalWidth;
	const imageHeight = out.naturalHeight;
	const half = Math.floor(imageWidth / 2);
	const y = Math.round((deviceLeft.height - imageHeight) / 2);
	const leftX = deviceLeft.width - half + inset;

	return {
		slideIndex,
		leftSlideId: left.id,
		rightSlideId: right.id,
		imageWidth,
		imageHeight,
		y,
		leftX,
		// Derive this from the actual left coordinate: evaluating the two sides
		// independently can round fractional insets differently and break the invariant.
		rightX: leftX - deviceLeft.width,
		inset
	};
}

/**
 * Verifies the anchors against the current ordered slides and shared image:
 *  - both slides use the same output dimensions and the same valid image reference
 *  - the anchors still match the current image dimensions and placement
 *  - the continuity invariant `rightX = leftX - deviceWidth` holds, which is what
 *    guarantees no visible seam when the two canvases are placed edge-to-edge.
 */
export function validateSeamIntegrity(
	anchors: SeamAnchors,
	left: Slide,
	right: Slide
): SeamValidation {
	const expected = computeSeamGeometry(left, right, anchors.slideIndex);
	if (!expected) {
		return { valid: false, reason: 'slides do not define a valid shared continuity image' };
	}
	const deviceLeft = DEVICES[left.device];
	if (
		anchors.leftSlideId !== expected.leftSlideId ||
		anchors.rightSlideId !== expected.rightSlideId
	) {
		return { valid: false, reason: 'seam anchors belong to a different ordered pair of slides' };
	}
	if (anchors.imageWidth !== expected.imageWidth || anchors.imageHeight !== expected.imageHeight) {
		return { valid: false, reason: 'seam image dimensions do not match the shared image' };
	}
	if (![anchors.leftX, anchors.rightX, anchors.y, anchors.inset].every(Number.isFinite)) {
		return { valid: false, reason: 'seam anchors contain non-finite coordinates' };
	}
	if (anchors.rightX !== anchors.leftX - deviceLeft.width) {
		return { valid: false, reason: 'continuity invariant violated: rightX != leftX - deviceWidth' };
	}
	if (
		anchors.leftX !== expected.leftX ||
		anchors.rightX !== expected.rightX ||
		anchors.y !== expected.y ||
		anchors.inset !== expected.inset
	) {
		return { valid: false, reason: 'seam anchors do not match the current image placement' };
	}
	return { valid: true };
}

export function collectSeams(slides: Slide[]): SeamAnchors[] {
	const seams: SeamAnchors[] = [];
	for (let i = 0; i < slides.length - 1; i++) {
		const anchors = computeSeamGeometry(slides[i], slides[i + 1], i);
		if (anchors) seams.push(anchors);
	}
	return seams;
}

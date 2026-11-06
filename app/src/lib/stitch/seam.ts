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
	const out = left.continuity.outgoing;
	const incoming = right.continuity.incoming;
	if (!out || !incoming) return null;
	if (out.id !== incoming.id) return null;
	if (left.continuity.inset !== right.continuity.inset) return null;

	const deviceLeft = DEVICES[left.device];
	const inset = left.continuity.inset;
	const imageWidth = out.naturalWidth;
	const imageHeight = out.naturalHeight;
	const half = Math.floor(imageWidth / 2);
	const y = Math.round((deviceLeft.height - imageHeight) / 2);

	return {
		slideIndex,
		leftSlideId: left.id,
		rightSlideId: right.id,
		imageWidth,
		imageHeight,
		y,
		leftX: deviceLeft.width - half + inset,
		rightX: -half + inset,
		inset
	};
}

/**
 * Verifies structural requirements that a valid seam must satisfy:
 *  - the adjacent slides share the same height (strip assembly would crack otherwise)
 *  - the image has positive dimensions
 *  - the continuity invariant `rightX = leftX - deviceWidth` holds, which is what
 *    guarantees no visible seam when the two canvases are placed edge-to-edge.
 */
export function validateSeamIntegrity(
	anchors: SeamAnchors,
	left: Slide,
	right: Slide
): SeamValidation {
	const deviceLeft = DEVICES[left.device];
	const deviceRight = DEVICES[right.device];
	if (deviceLeft.height !== deviceRight.height) {
		return { valid: false, reason: 'device heights differ across seam' };
	}
	if (anchors.imageWidth <= 0 || anchors.imageHeight <= 0) {
		return { valid: false, reason: 'continuity image has non-positive dimensions' };
	}
	if (anchors.rightX !== anchors.leftX - deviceLeft.width) {
		return { valid: false, reason: 'continuity invariant violated: rightX != leftX - deviceWidth' };
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

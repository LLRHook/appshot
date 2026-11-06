const MIB = 1024 * 1024;

export const MAX_PROJECT_BYTES = 60 * MIB;
/** Frames per campaign, and per display size on the App Store. */
export const MAX_FRAMES = 10;
/** A layer keeps one uniform scale through editing, painting and portable storage. */
export const MIN_LAYER_SCALE = 0.01;
export const MAX_LAYER_SCALE = 16;
/** Tiny pixel artwork can be enlarged further than real UI. */
export const MAX_ART_SCALE = 64;
export const MAX_SLIDE_LAYERS = 12;

/**
 * Multi-target campaigns keep one capture per frame per display, so they outgrow the single-target
 * file limit. These bound the unique image bytes of a campaign and the base64 file holding them.
 */
export const MAX_CAMPAIGN_IMAGE_BYTES = 180 * MIB;
export const MAX_PORTABLE_PROJECT_BYTES = 256 * MIB;
export const MAX_CAMPAIGN_ASSETS = 300;

/** Apply the same portable-file limit to imports and manifest conversions. */
export function validateProjectSize(serialized: string): void {
	if (
		serialized.length > MAX_PROJECT_BYTES ||
		new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES
	) {
		throw new Error('This project is too large. Keep it under 60 MB.');
	}
}

export const MAX_PROJECT_BYTES = 60 * 1024 * 1024;

/** Apply the same portable-file limit to imports and manifest conversions. */
export function validateProjectSize(serialized: string): void {
	if (
		serialized.length > MAX_PROJECT_BYTES ||
		new TextEncoder().encode(serialized).byteLength > MAX_PROJECT_BYTES
	) {
		throw new Error('This project is too large. Keep it under 60 MB.');
	}
}

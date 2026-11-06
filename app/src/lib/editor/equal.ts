/**
 * Structural equality for immutable editor documents (JSON-shaped values).
 *
 * Unchanged subtrees share references, so the common edit only walks the changed path. A key
 * holding `undefined` equals a missing key, matching what `JSON.stringify` would persist.
 */
export function documentsEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
		return a !== a && b !== b; // NaN is the only value not equal to itself.
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, index) => documentsEqual(item, b[index]));
	}
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	for (const key of Object.keys(left)) if (!documentsEqual(left[key], right[key])) return false;
	for (const key of Object.keys(right)) {
		if (right[key] !== undefined && !Object.hasOwn(left, key)) return false;
	}
	return true;
}

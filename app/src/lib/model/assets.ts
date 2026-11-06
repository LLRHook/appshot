import type { AssetId, ProjectAsset } from './contracts';
import { isBundledSampleUrl, isKnownSampleHash } from './image';
import type { ImageRef } from './types';

/**
 * Image bytes as values: data URL conversion, content hashes and the asset records built from
 * them. No storage here; `editor/campaign-persistence.ts` owns where the bytes live.
 */

export type AssetMime = ProjectAsset['mime'];

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,/;

export function dataUrlMime(url: string): AssetMime | null {
	return (DATA_URL.exec(url)?.[1] as AssetMime | undefined) ?? null;
}

/** Decoded size of a base64 data URL without decoding it. */
export function dataUrlByteLength(url: string): number {
	const length = url.length - url.indexOf(',') - 1;
	const padding = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0;
	return (length / 4) * 3 - padding;
}

export function bytesFromDataUrl(url: string): { mime: AssetMime; bytes: Uint8Array<ArrayBuffer> } {
	const mime = dataUrlMime(url);
	if (!mime) throw new Error('This is not an embedded PNG, JPEG, or WebP image.');
	const binary = atob(url.slice(url.indexOf(',') + 1));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return { mime, bytes };
}

/** A multiple of 3, so each chunk's base64 can be joined without inner padding. */
const BASE64_CHUNK = 32766;

export function dataUrlFromBytes(bytes: Uint8Array, mime: AssetMime): string {
	const chunks: string[] = [`data:${mime};base64,`];
	for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
		const chunk = bytes.subarray(start, start + BASE64_CHUNK);
		chunks.push(btoa(String.fromCharCode(...chunk)));
	}
	return chunks.join('');
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Identical bytes get the same id, so adding a capture twice cannot create a second record. */
export function assetIdForHash(sha256: string): AssetId {
	return `asset-${sha256.slice(0, 32)}`;
}

/** The record a resolved document's image reference comes from. */
export function imageRefForAsset(asset: ProjectAsset): ImageRef {
	return {
		id: asset.id,
		blobUrl: asset.url,
		naturalWidth: asset.naturalWidth,
		naturalHeight: asset.naturalHeight,
		...(isSampleAsset(asset) ? { sample: true } : {})
	};
}

/** Origin is retained even if a bundled image is embedded, renamed or re-uploaded unchanged. */
export function isSampleAsset(asset: Pick<ProjectAsset, 'url' | 'sha256' | 'provenance'>): boolean {
	return (
		isBundledSampleUrl(asset.url) ||
		isKnownSampleHash(asset.sha256) ||
		asset.provenance?.tool === 'appshot-sample'
	);
}

export function markSampleOrigin(asset: ProjectAsset): ProjectAsset {
	return isSampleAsset(asset) && asset.provenance?.tool !== 'appshot-sample'
		? { ...asset, provenance: { ...asset.provenance, tool: 'appshot-sample' } }
		: asset;
}

/** Bundled samples ship with the app, so their bytes are neither stored nor counted. */
export function isBundledAsset(asset: Pick<ProjectAsset, 'url'>): boolean {
	return isBundledSampleUrl(asset.url);
}

import { dataUrlByteLength, dataUrlMime, isBundledAsset, type AssetMime } from './assets';
import { parseCheckSettingsPatch } from './check';
import type {
	AssetId,
	CaptureProvenance,
	ImageLayer,
	PanoramaVariant,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	SourceBinding,
	StoredPanorama,
	StoredSlide
} from './contracts';
import { isDeviceId, type DeviceId } from './devices';
import {
	imageUrl,
	isBundledImageUrl,
	MAX_IMAGE_BYTES,
	MAX_IMAGE_ID_LENGTH,
	MAX_IMAGE_PIXELS,
	MAX_IMAGE_SIDE
} from './image';
import {
	MAX_CAMPAIGN_ASSETS,
	MAX_CAMPAIGN_IMAGE_BYTES,
	MAX_FRAMES,
	MAX_PORTABLE_PROJECT_BYTES,
	validateProjectSize
} from './limits';
import { defaultLinenSettings, parseLinenPhone, parseLinenSettings } from './linen';
import type { LinenSettings } from './linen';
import {
	choice,
	color,
	id,
	INVALID_PROJECT,
	LAYOUT_IDS,
	number,
	parseComposition,
	parseImageLayers,
	parsePanoramaPlacement,
	parseSlideCopy,
	parseSlideTreatment,
	record,
	string
} from './project';
import { createBlank, createDemo, STYLES } from './studio';
import type { Composition, ImageRef } from './types';

/**
 * The Project v2 file boundary and the path from older documents to it. Nothing here touches
 * storage. Two forms of a v2 document exist:
 * - portable (`parseProjectV2`): self-contained, with every image embedded or bundled;
 * - stored (`parseStoredProject`): autosave metadata with no image bytes, whose assets are looked
 *   up by hash and hydrated by persistence.
 * Parsers return only known fields, and neither accepts `blob:` or external URLs.
 */

export const CURRENT_PROJECT_VERSION = 2;
const INVALID_ASSET = 'The project contains an invalid image.';

function newerProject(version: number): Error {
	return new Error(
		`This project was saved by a newer version of Appshot (project version ${version}). Update Appshot to open it.`
	);
}

function assetMimeOfUrl(url: string): AssetMime {
	return isBundledImageUrl(url) ? 'image/png' : (dataUrlMime(url) as AssetMime);
}

/* ---------------------------------------------------------------------------- v1 -> v2 migration */

/**
 * Turn a parsed v1 document into a one-target v2 document. Images with identical bytes become one
 * asset, whatever their ids; a repeated id with different bytes stays two assets. The printed name
 * is pinned as `appName` so retitling the campaign later cannot change the artwork.
 *
 * `Slide.continuity` is not carried over: no renderer reads it, and `projectForTarget` always
 * returns `{ inset: 0 }`, per the frozen contract.
 */
export function migrateCompositionToV2(composition: Composition): ProjectV2 {
	const assets = new Map<AssetId, ProjectAsset>();
	const idsByUrl = new Map<string, AssetId>();
	function assetId(ref: ImageRef): AssetId {
		const known = idsByUrl.get(ref.blobUrl);
		if (known !== undefined) return known;
		let unique = ref.id;
		for (let suffix = 2; assets.has(unique); suffix++) {
			unique = `${ref.id.slice(0, MAX_IMAGE_ID_LENGTH - 8)}~${suffix}`;
		}
		idsByUrl.set(ref.blobUrl, unique);
		assets.set(unique, {
			id: unique,
			mime: assetMimeOfUrl(ref.blobUrl),
			byteLength: isBundledImageUrl(ref.blobUrl) ? 0 : dataUrlByteLength(ref.blobUrl),
			url: ref.blobUrl,
			naturalWidth: ref.naturalWidth,
			naturalHeight: ref.naturalHeight,
			...(ref.blobUrl.startsWith('/demo/') ? { provenance: { tool: 'appshot-sample' } } : {})
		});
		return unique;
	}
	const target = composition.device;
	const slides = composition.slides.map((slide): StoredSlide => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- fields v2 does not store
		const { device, primaryImage, continuity, layers, ...shared } = slide;
		const variant: SlideVariant = {
			...(primaryImage ? { source: { asset: assetId(primaryImage) } } : {}),
			...(layers?.length
				? {
						layers: layers.map(
							(layer): ImageLayer<AssetId> => ({ ...layer, image: assetId(layer.image) })
						)
					}
				: {})
		};
		return {
			...shared,
			...(Object.keys(variant).length ? { variants: { [target]: variant } } : {})
		};
	});
	let panorama: StoredPanorama | undefined;
	if (composition.panorama) {
		const { image, ...placement } = composition.panorama;
		panorama = { ...placement, variants: { [target]: { source: { asset: assetId(image) } } } };
	}
	return {
		version: 2,
		name: composition.name,
		appName: composition.name,
		style: composition.style,
		accent: composition.accent,
		targets: [target],
		assets: Object.fromEntries(assets),
		continuityMode: composition.continuityMode,
		slides,
		...(panorama ? { panorama } : {})
	};
}

/* ------------------------------------------------------------------------------ strict v2 parsing */

type AssetForm = 'portable' | 'stored';

function optionalText(value: unknown, max: number): string | undefined {
	return value === undefined ? undefined : string(value, max, INVALID_ASSET);
}

function parseSyntheticFlag(value: unknown): Pick<CaptureProvenance, 'synthetic'> {
	if (value === undefined) return {};
	if (typeof value !== 'boolean') throw new Error(INVALID_ASSET);
	return { synthetic: value };
}

function parseProvenance(value: unknown): CaptureProvenance {
	const provenance = record(value, INVALID_ASSET);
	const text = (key: keyof CaptureProvenance) => {
		const parsed = optionalText(provenance[key], 200);
		return parsed === undefined ? {} : { [key]: parsed };
	};
	return {
		...text('device'),
		...text('os'),
		...text('appVersion'),
		...text('build'),
		...text('commit'),
		...(provenance.appearance !== undefined
			? { appearance: choice(provenance.appearance, ['light', 'dark'] as const) }
			: {}),
		...text('capturedAt'),
		...text('tool'),
		...parseSyntheticFlag(provenance.synthetic),
		...(provenance.fictionalData !== undefined
			? { fictionalData: choice(provenance.fictionalData, ['confirmed', 'unconfirmed'] as const) }
			: {})
	};
}

function parseAsset(value: unknown, key: string, form: AssetForm): ProjectAsset {
	const asset = record(value, INVALID_ASSET);
	const assetId = id(asset.id, INVALID_ASSET);
	if (assetId !== key || assetId.length > MAX_IMAGE_ID_LENGTH) throw new Error(INVALID_ASSET);
	const naturalWidth = number(asset.naturalWidth, 1, MAX_IMAGE_SIDE);
	const naturalHeight = number(asset.naturalHeight, 1, MAX_IMAGE_SIDE);
	if (
		!Number.isInteger(naturalWidth) ||
		!Number.isInteger(naturalHeight) ||
		naturalWidth * naturalHeight > MAX_IMAGE_PIXELS
	)
		throw new Error(INVALID_ASSET);
	const mime = choice(asset.mime, ['image/png', 'image/jpeg', 'image/webp'] as const);
	const byteLength = number(asset.byteLength, 0, MAX_IMAGE_BYTES);
	if (!Number.isInteger(byteLength)) throw new Error(INVALID_ASSET);
	const sha256 = asset.sha256 === undefined ? undefined : string(asset.sha256, 64, INVALID_ASSET);
	if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(INVALID_ASSET);

	let url: string;
	if (form === 'portable') {
		url = imageUrl(asset.url);
		if (
			!isBundledImageUrl(url) &&
			(dataUrlMime(url) !== mime || dataUrlByteLength(url) !== byteLength)
		)
			throw new Error(INVALID_ASSET);
	} else {
		// A stored asset either names a bundled image or is found by hash. Its session URL is added by
		// persistence after this parse, so an autosave can never carry bytes or a dead blob: URL.
		if (asset.url !== undefined) {
			url = string(asset.url, 200, INVALID_ASSET);
			if (!isBundledImageUrl(url)) throw new Error(INVALID_ASSET);
		} else {
			if (sha256 === undefined) throw new Error(INVALID_ASSET);
			url = '';
		}
	}
	const name = optionalText(asset.name, 255);
	return {
		id: assetId,
		...(sha256 !== undefined ? { sha256 } : {}),
		mime,
		byteLength,
		url,
		naturalWidth,
		naturalHeight,
		...(name !== undefined ? { name } : {}),
		...(asset.provenance !== undefined || url.startsWith('/demo/')
			? {
					provenance: {
						...(asset.provenance !== undefined ? parseProvenance(asset.provenance) : {}),
						...(url.startsWith('/demo/') ? { tool: 'appshot-sample' } : {})
					}
				}
			: {})
	};
}

function parseAssets(value: unknown, form: AssetForm): Record<AssetId, ProjectAsset> {
	const entries = Object.entries(record(value, INVALID_ASSET));
	if (entries.length > MAX_CAMPAIGN_ASSETS) throw new Error(INVALID_ASSET);
	const assets = entries.map(([key, asset]) => [key, parseAsset(asset, key, form)] as const);
	const total = assets.reduce((sum, [, asset]) => sum + asset.byteLength, 0);
	if (total > MAX_CAMPAIGN_IMAGE_BYTES)
		throw new Error('This project has too many image bytes. Keep them under 180 MB.');
	return Object.fromEntries(assets);
}

function parseBinding(value: unknown, assets: Record<AssetId, ProjectAsset>): SourceBinding {
	const binding = record(value, INVALID_ASSET);
	const asset = id(binding.asset, INVALID_ASSET);
	if (!Object.hasOwn(assets, asset)) throw new Error(INVALID_ASSET);
	if (binding.nonNative === undefined) return { asset };
	const reason = string(record(binding.nonNative, INVALID_ASSET).reason, 500, INVALID_ASSET);
	if (!reason.trim()) throw new Error(INVALID_ASSET);
	return { asset, nonNative: { reason } };
}

/** `Partial<LinenSettings>` with only known groups, each validated in full. */
function parseLinenGroups(value: unknown): Partial<LinenSettings> {
	const groups = record(value, 'The project contains invalid Table Linen settings.');
	const complete = parseLinenSettings({ ...defaultLinenSettings('teal'), ...groups });
	return Object.fromEntries(
		(['colors', 'layout', 'phone', 'band'] as const)
			.filter((key) => groups[key] !== undefined)
			.map((key) => [key, complete[key]])
	);
}

function parseVariant(
	value: unknown,
	assets: Record<AssetId, ProjectAsset>,
	targets: readonly DeviceId[],
	key: string
): SlideVariant {
	if (!isDeviceId(key) || !targets.includes(key))
		throw new Error('The project has settings for an output it does not declare.');
	const variant = record(value);
	return {
		...(variant.source !== undefined ? { source: parseBinding(variant.source, assets) } : {}),
		...(variant.linen !== undefined ? { linen: parseLinenGroups(variant.linen) } : {}),
		...(variant.check !== undefined ? { check: parseCheckSettingsPatch(variant.check) } : {}),
		...(variant.scale !== undefined ? { scale: number(variant.scale, 0.6, 1.4) } : {}),
		...(variant.tilt !== undefined ? { tilt: number(variant.tilt, -30, 30) } : {}),
		...(variant.fontScale !== undefined ? { fontScale: number(variant.fontScale, 0.7, 1.3) } : {}),
		...(variant.layout !== undefined ? { layout: choice(variant.layout, LAYOUT_IDS) } : {}),
		...(variant.layers !== undefined
			? {
					layers: parseImageLayers<AssetId>(variant.layers, (raw) => {
						const assetId = id(raw, INVALID_ASSET);
						if (!Object.hasOwn(assets, assetId)) throw new Error(INVALID_ASSET);
						const { naturalWidth, naturalHeight } = assets[assetId];
						return { image: assetId, naturalWidth, naturalHeight };
					})
				}
			: {})
	};
}

function parsePanoramaVariant(
	value: unknown,
	assets: Record<AssetId, ProjectAsset>,
	targets: readonly DeviceId[],
	key: string
): PanoramaVariant {
	if (!isDeviceId(key) || !targets.includes(key))
		throw new Error('The project has settings for an output it does not declare.');
	const variant = record(value);
	return {
		...(variant.source !== undefined ? { source: parseBinding(variant.source, assets) } : {}),
		...(variant.linenPhone !== undefined
			? { linenPhone: parseLinenPhone(variant.linenPhone) }
			: {}),
		...(variant.offset !== undefined ? { offset: number(variant.offset, -400, 400) } : {}),
		...(variant.scale !== undefined ? { scale: number(variant.scale, 0.6, 1.4) } : {}),
		...(variant.tilt !== undefined ? { tilt: number(variant.tilt, -30, 30) } : {})
	};
}

function parseVariantMap<T>(
	value: unknown,
	parse: (entry: unknown, key: string) => T
): Partial<Record<DeviceId, T>> | undefined {
	if (value === undefined) return undefined;
	const entries = Object.entries(record(value));
	return Object.fromEntries(entries.map(([key, entry]) => [key, parse(entry, key)]));
}

function parseV2(value: Record<string, unknown>, form: AssetForm): ProjectV2 {
	if (
		!Array.isArray(value.targets) ||
		value.targets.length < 1 ||
		!Array.isArray(value.slides) ||
		value.slides.length < 1 ||
		value.slides.length > MAX_FRAMES
	)
		throw new Error(INVALID_PROJECT);
	const targets = value.targets.map((target) => {
		if (!isDeviceId(target)) throw new Error(INVALID_PROJECT);
		return target;
	});
	if (new Set(targets).size !== targets.length) throw new Error(INVALID_PROJECT);
	const assets = parseAssets(value.assets, form);

	const slides = value.slides.map((entry): StoredSlide => {
		const slide = record(entry);
		const variants = parseVariantMap(slide.variants, (variant, key) =>
			parseVariant(variant, assets, targets, key)
		);
		return {
			...parseSlideCopy(slide),
			...parseSlideTreatment(slide),
			...(variants ? { variants } : {})
		};
	});
	if (new Set(slides.map((slide) => slide.id)).size !== slides.length)
		throw new Error('The project contains an invalid screenshot.');

	const project: ProjectV2 = {
		version: 2,
		name: string(value.name, 200, INVALID_PROJECT),
		...(value.appName !== undefined
			? { appName: string(value.appName, 200, INVALID_PROJECT) }
			: {}),
		style: choice(
			value.style,
			STYLES.map((style) => style.id)
		),
		accent: color(value.accent),
		targets,
		assets,
		continuityMode: choice(value.continuityMode, ['none', 'paired'] as const),
		slides
	};
	if (value.panorama !== undefined) {
		const panorama = record(value.panorama, 'The connected composition is invalid.');
		const variants = parseVariantMap(panorama.variants, (variant, key) =>
			parsePanoramaVariant(variant, assets, targets, key)
		);
		project.panorama = {
			...parsePanoramaPlacement(panorama, slides),
			...(variants ? { variants } : {})
		};
	}
	return project;
}

/**
 * Open a project file of any supported version as a v2 document. Rejects anything malformed,
 * `blob:` or external image URLs, and versions newer than this build can read. The result has no
 * `campaignId`; persistence assigns one, so a file can never select an autosave slot.
 */
export function parseProjectV2(text: string): ProjectV2 {
	if (text.length > MAX_PORTABLE_PROJECT_BYTES)
		throw new Error('This project is too large. Keep it under 256 MB.');
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(INVALID_PROJECT);
	}
	const value = record(parsed, INVALID_PROJECT);
	if (value.version === 1) {
		validateProjectSize(text);
		return migrateCompositionToV2(parseComposition(value));
	}
	if (value.version === 2) return parseV2(value, 'portable');
	if (typeof value.version === 'number' && value.version > CURRENT_PROJECT_VERSION)
		throw newerProject(value.version);
	throw new Error(INVALID_PROJECT);
}

/* -------------------------------------------------------------------------------- stored form */

/** Autosave metadata for a document: no session URLs, no bytes, no slot id. Cheap to call. */
export function serializeStoredProject(project: ProjectV2): string {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberately not persisted
	const { campaignId, assets, ...rest } = project;
	const stored = Object.fromEntries(
		Object.entries(assets).map(([key, asset]) => {
			if (isBundledAsset(asset)) return [key, asset];
			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- found by hash on restore
			const { url, ...metadata } = asset;
			return [key, metadata];
		})
	);
	return JSON.stringify({ ...rest, assets: stored });
}

/** Read autosave metadata. Non-bundled assets come back with `url: ''` for persistence to fill. */
export function parseStoredProject(text: string): ProjectV2 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(INVALID_PROJECT);
	}
	const value = record(parsed, INVALID_PROJECT);
	if (typeof value.version === 'number' && value.version > CURRENT_PROJECT_VERSION)
		throw newerProject(value.version);
	if (value.version !== 2) throw new Error(INVALID_PROJECT);
	return parseV2(value, 'stored');
}

/**
 * A complete portable file as Blob parts, so its images never need one giant string. Every asset
 * must already be embedded or bundled, and the whole document is validated the same way opening it
 * will be, so a file that saves can always be reopened.
 */
export function serializePortableProject(project: ProjectV2): string[] {
	parseV2(project as unknown as Record<string, unknown>, 'portable');
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a file never selects a slot
	const { campaignId, assets, ...rest } = project;
	const parts = [`${JSON.stringify(rest).slice(0, -1)},"assets":{`];
	Object.values(assets).forEach((asset, index) => {
		parts.push(`${index ? ',' : ''}${JSON.stringify(asset.id)}:`, JSON.stringify(asset));
	});
	parts.push('}}');
	return parts;
}

/* ------------------------------------------------------------------------------- new documents */

/** A one-frame document for New campaign. With no `appName`, its title prints until one is set. */
export function createBlankProjectV2(targets?: readonly DeviceId[]): ProjectV2 {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a blank campaign has no brand yet
	const { appName, ...project } = migrateCompositionToV2(createBlank());
	return targets?.length ? { ...project, targets: [...targets] } : project;
}

/** The bundled example campaign as a v2 document. */
export function createDemoProjectV2(): ProjectV2 {
	return migrateCompositionToV2(createDemo());
}

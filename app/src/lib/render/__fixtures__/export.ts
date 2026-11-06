import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type {
	CaptureProvenance,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	StoredSlide
} from '../../model/contracts';
import { DEVICES, type DeviceId } from '../../model/devices';
import { crc32 } from '../zip';

/**
 * Test fixtures for the export specs, written without the module under test. PNGs are assembled
 * by hand with `node:zlib`, so a reader bug cannot agree with a writer bug.
 */

export const RECOMMENDED: DeviceId[] = ['iphone-di-medium-1206x2622', 'iphone-6.9', 'ipad-13'];

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
	const output = new Uint8Array(12 + data.length);
	const view = new DataView(output.buffer);
	view.setUint32(0, data.length);
	for (let index = 0; index < 4; index++) output[4 + index] = type.charCodeAt(index);
	output.set(data, 8);
	view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)));
	return output;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
	const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		output.set(part, at);
		at += part.length;
	}
	return output;
}

export function ihdr(
	width: number,
	height: number,
	colorType = 2,
	bitDepth = 8,
	interlace = 0
): Uint8Array {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = bitDepth;
	header[9] = colorType;
	header[12] = interlace;
	return header;
}

interface PngOptions {
	/** Bytes per pixel in `pixels`; 3 is RGB and 4 is RGBA. */
	channels?: 3 | 4;
	/** Chunks between the header and the pixels. */
	extra?: Uint8Array[];
	/** Filter byte for each row; the pixels are written as filtered by the caller. */
	filter?: number;
	level?: number;
}

/** A valid PNG from tightly packed pixels, with every row unfiltered. */
export function pngFile(
	width: number,
	height: number,
	pixels: Uint8Array,
	options: PngOptions = {}
): Uint8Array<ArrayBuffer> {
	const channels = options.channels ?? 3;
	const stride = width * channels;
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = options.filter ?? 0;
		raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}
	return concat([
		SIGNATURE,
		pngChunk('IHDR', ihdr(width, height, channels === 3 ? 2 : 6)),
		...(options.extra ?? []),
		pngChunk('IDAT', deflateSync(raw, { level: options.level ?? 6 })),
		pngChunk('IEND')
	]);
}

/** Pixels that are not all the same, repeatable from `seed`. */
export function patternPixels(width: number, height: number, seed = 1, channels: 3 | 4 = 3) {
	const pixels = new Uint8Array(width * height * channels);
	for (let at = 0; at < pixels.length; at += channels) {
		pixels[at] = (at * 7 + seed) & 0xff;
		pixels[at + 1] = (at * 13 + seed * 3) & 0xff;
		pixels[at + 2] = (at * 29 + seed * 5) & 0xff;
		if (channels === 4) pixels[at + 3] = 255;
	}
	return pixels;
}

const cachedRows = new Map<string, Uint8Array<ArrayBuffer>>();

/** A full-size frame's file. Fast enough for many frames, since it is stored, not compressed. */
export function framePng(target: DeviceId, seed = 1): Uint8Array<ArrayBuffer> {
	const { width, height } = DEVICES[target];
	const key = `${width}x${height}:${seed}`;
	const known = cachedRows.get(key);
	if (known) return known.slice();
	const pixels = new Uint8Array(width * height * 3);
	pixels[0] = 1 + (seed & 0x7f);
	pixels[1] = (seed >> 7) & 0xff;
	const file = pngFile(width, height, pixels, { level: 0 });
	cachedRows.set(key, file);
	return file.slice();
}

const TINY_PNG = pngFile(2, 2, patternPixels(2, 2));

function base64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}

export function assetOf(
	id: string,
	width: number,
	height: number,
	overrides: Partial<ProjectAsset> = {},
	bytes: Uint8Array = Uint8Array.from([...TINY_PNG, id.length % 251])
): ProjectAsset {
	return {
		id,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		mime: 'image/png',
		byteLength: bytes.length,
		url: `data:image/png;base64,${base64(bytes)}`,
		naturalWidth: width,
		naturalHeight: height,
		...overrides
	};
}

export const FULL_RECORD: CaptureProvenance = {
	device: 'iPhone 18 Pro',
	os: 'iOS 27.2',
	appVersion: '1.0',
	build: '100',
	commit: 'abc123',
	appearance: 'light',
	capturedAt: '2026-11-05T12:00:00Z',
	tool: 'simctl',
	fictionalData: 'confirmed'
};

export function storedSlide(id: string, overrides: Partial<StoredSlide> = {}): StoredSlide {
	return {
		id,
		label: `Frame ${id}`,
		background: { kind: 'solid', colors: ['#123456'] },
		frame: 'none',
		layout: 'text-above',
		typography: { headline: `Headline ${id}`, fontColor: '#FFFFFF', fontWeight: 700 },
		effects: { shadow: 'none', glow: 0 },
		scale: 1,
		tilt: 0,
		fontScale: 1,
		...overrides
	};
}

/** Device names for a capture's record, as a capture tool would write them. */
const DEVICE_NAME = (target: DeviceId): string =>
	DEVICES[target].classId === 'iphone-duo'
		? 'iPhone Duo'
		: DEVICES[target].platform === 'ipad'
			? 'iPad Pro 13-inch (M5)'
			: 'iPhone 18 Pro';

/**
 * A campaign where every frame has a real-sized capture of its own on every output, with a full
 * record, so a test only sees what it changes. Each asset has distinct bytes and id.
 */
export function campaign(
	targets: readonly DeviceId[] = RECOMMENDED,
	frames = 2,
	change: (target: DeviceId, slideIndex: number) => Partial<SlideVariant> | null = () => ({})
): ProjectV2 {
	const assets: Record<string, ProjectAsset> = {};
	const slides = Array.from({ length: frames }, (_, slideIndex) => {
		const id = `s${slideIndex + 1}`;
		const variants: StoredSlide['variants'] = {};
		for (const target of targets) {
			const { width, height } = DEVICES[target];
			const assetId = `${target}:${id}`;
			assets[assetId] = assetOf(assetId, width, height, {
				name: `${id}.png`,
				provenance: { ...FULL_RECORD, device: DEVICE_NAME(target) }
			});
			const extra = change(target, slideIndex);
			if (extra === null) continue;
			variants[target] = { source: { asset: assetId }, ...extra };
		}
		return storedSlide(id, { variants });
	});
	return {
		version: 2,
		name: 'Working title',
		appName: 'Billington',
		style: 'cobalt',
		accent: '#DAF975',
		targets: [...targets],
		assets,
		continuityMode: 'none',
		slides
	};
}

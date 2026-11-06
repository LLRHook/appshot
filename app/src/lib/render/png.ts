import type { InspectPng, PngInspection } from '../model/contracts';
import { crc32 } from './zip';

/**
 * What an encoded PNG really is, from its bytes. A canvas setting or a header is only a claim, so
 * nothing is called a store file here until every row of its pixels has been decoded by this
 * strict reader. It runs without a DOM, which is also what lets its failures be tested.
 */

/** The bytes are not a PNG Appshot can call a store file. The message says why. */
export class PngError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PngError';
	}
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_BYTES = 13;
const CHUNK_OVERHEAD = 12;
const COLOR_RGB = 2;
const COLOR_RGBA = 6;
/** Far beyond any output size; bounds what a damaged header can make the decoder allocate. */
const MAX_DECODED_BYTES = 512 * 1024 * 1024;
const COLOR_DEPTHS: Record<number, readonly number[]> = {
	0: [1, 2, 4, 8, 16],
	[COLOR_RGB]: [8, 16],
	3: [1, 2, 4, 8],
	4: [8, 16],
	[COLOR_RGBA]: [8, 16]
};
const KNOWN_CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
/** What a pixel means and how large it is; survives conversion from RGBA unchanged. */
const COLOR_CHUNKS = new Set(['cHRM', 'gAMA', 'iCCP', 'sRGB', 'pHYs']);

export interface PngChunk {
	type: string;
	data: Uint8Array;
}

export interface PngStructure extends PngInspection {
	interlace: number;
	/** `tRNS` makes even a no-alpha color type transparent. */
	transparency: boolean;
	chunks: PngChunk[];
}

function chunkType(bytes: Uint8Array, at: number): string {
	return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/**
 * Walk the whole file: signature, each chunk's bounds and CRC, the required order, and no trailing
 * bytes. Throws `PngError` on anything malformed, so a truncated or padded file is never trusted.
 */
export function readPngStructure(bytes: Uint8Array): PngStructure {
	if (bytes.length < SIGNATURE.length || SIGNATURE.some((value, index) => bytes[index] !== value))
		throw new PngError('It is not a PNG file.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: PngChunk[] = [];
	let at = SIGNATURE.length;
	let ended = false;
	while (at < bytes.length) {
		if (ended) throw new PngError('It has data after the end of the image.');
		if (at + CHUNK_OVERHEAD > bytes.length) throw new PngError('The file is cut off.');
		const length = view.getUint32(at);
		if (at + CHUNK_OVERHEAD + length > bytes.length) throw new PngError('The file is cut off.');
		const type = chunkType(bytes, at + 4);
		if (!/^[A-Za-z]{4}$/.test(type)) throw new PngError('It has an invalid chunk.');
		const crc = view.getUint32(at + 8 + length);
		if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== crc)
			throw new PngError(`Its ${type} chunk is damaged (checksum mismatch).`);
		if (type[0] === type[0].toUpperCase() && !KNOWN_CRITICAL.has(type))
			throw new PngError(`It has an unknown required chunk, ${type}.`);
		if (type === 'IEND') {
			if (length !== 0) throw new PngError('Its end marker is malformed.');
			ended = true;
		}
		chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
		at += CHUNK_OVERHEAD + length;
	}
	if (!ended) throw new PngError('The file is cut off: it has no end marker.');
	const header = chunks[0];
	if (header?.type !== 'IHDR' || header.data.length !== IHDR_BYTES)
		throw new PngError('It does not start with an image header.');
	if (chunks.filter((chunk) => chunk.type === 'IHDR').length !== 1)
		throw new PngError('It has more than one image header.');
	const firstData = chunks.findIndex((chunk) => chunk.type === 'IDAT');
	const dataCount = chunks.filter((chunk) => chunk.type === 'IDAT').length;
	if (firstData < 0) throw new PngError('It has no image data.');
	if (chunks.slice(firstData, firstData + dataCount).some((chunk) => chunk.type !== 'IDAT'))
		throw new PngError('Its image data is split apart.');

	const fields = new DataView(header.data.buffer, header.data.byteOffset, IHDR_BYTES);
	const width = fields.getUint32(0);
	const height = fields.getUint32(4);
	const bitDepth = header.data[8];
	const colorType = header.data[9];
	const interlace = header.data[12];
	if (width < 1 || height < 1 || width > 0x7fffffff || height > 0x7fffffff)
		throw new PngError('Its header has an impossible size.');
	if (!COLOR_DEPTHS[colorType]?.includes(bitDepth))
		throw new PngError('Its header has an impossible color format.');
	if (header.data[10] !== 0 || header.data[11] !== 0 || interlace > 1)
		throw new PngError('Its header uses an unknown PNG method.');
	return {
		width,
		height,
		bitDepth,
		colorType,
		interlace,
		transparency: chunks.some((chunk) => chunk.type === 'tRNS'),
		chunks
	};
}

/** See `InspectPng` in `contracts.ts`. Reads the structure only; `decodePng` reads the pixels. */
export const inspectPng: InspectPng = (bytes) => {
	const { width, height, bitDepth, colorType } = readPngStructure(bytes);
	return { width, height, bitDepth, colorType };
};

/* -------------------------------------------------------------------------------- real decoding */

function paeth(left: number, up: number, upLeft: number): number {
	const estimate = left + up - upLeft;
	const a = Math.abs(estimate - left);
	const b = Math.abs(estimate - up);
	const c = Math.abs(estimate - upLeft);
	return a <= b && a <= c ? left : b <= c ? up : upLeft;
}

/** Undo the per-row filters in place. Each row is one filter byte, then `stride` bytes. */
function unfilterRows(raw: Uint8Array, stride: number, pixel: number, height: number): void {
	for (let y = 0; y < height; y++) {
		const start = y * (stride + 1);
		const row = start + 1;
		const above = row - stride - 1;
		const filter = raw[start];
		switch (filter) {
			case 0:
				break;
			case 1:
				for (let i = pixel; i < stride; i++) raw[row + i] += raw[row + i - pixel];
				break;
			case 2:
				if (y > 0) for (let i = 0; i < stride; i++) raw[row + i] += raw[above + i];
				break;
			case 3:
				for (let i = 0; i < stride; i++) {
					const left = i >= pixel ? raw[row + i - pixel] : 0;
					const up = y > 0 ? raw[above + i] : 0;
					raw[row + i] += (left + up) >> 1;
				}
				break;
			case 4:
				for (let i = 0; i < stride; i++) {
					const left = i >= pixel ? raw[row + i - pixel] : 0;
					const up = y > 0 ? raw[above + i] : 0;
					const upLeft = y > 0 && i >= pixel ? raw[above + i - pixel] : 0;
					raw[row + i] += paeth(left, up, upLeft);
				}
				break;
			default:
				throw new PngError(`Row ${y + 1} has an unknown PNG filter (${filter}).`);
		}
	}
}

/** Inflate into exactly `expected` bytes; the zlib stream's own checksum is verified on the way. */
async function inflateExact(
	parts: readonly Uint8Array[],
	expected: number
): Promise<Uint8Array<ArrayBuffer>> {
	const output = new Uint8Array(expected);
	const reader = new Blob([...parts] as BlobPart[])
		.stream()
		.pipeThrough(new DecompressionStream('deflate'))
		.getReader();
	let written = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (written + value.length > expected)
				throw new PngError('It holds more image data than its size allows.');
			output.set(value, written);
			written += value.length;
		}
	} catch (error) {
		if (error instanceof PngError) throw error;
		throw new PngError('Its compressed image data is damaged.');
	} finally {
		reader.cancel().catch(() => {});
	}
	if (written !== expected) throw new PngError('Its image data ends early.');
	return output;
}

export interface DecodedPng extends PngStructure {
	/** Tightly packed rows of RGB or RGBA. */
	pixels: Uint8Array<ArrayBuffer>;
	channels: 3 | 4;
	/** 255 for RGB. */
	minAlpha: number;
	/** Every pixel is the same, which no real frame is. */
	uniform: boolean;
}

function pixelStats(pixels: Uint8Array, channels: 3 | 4): { minAlpha: number; uniform: boolean } {
	let minAlpha = 255;
	let uniform = true;
	const [r, g, b] = pixels;
	const a = pixels[3];
	for (let at = 0; at < pixels.length; at += channels) {
		if (channels === 4) {
			if (pixels[at + 3] < minAlpha) minAlpha = pixels[at + 3];
			if (uniform && pixels[at + 3] !== a) uniform = false;
		}
		if (uniform && (pixels[at] !== r || pixels[at + 1] !== g || pixels[at + 2] !== b))
			uniform = false;
	}
	return { minAlpha, uniform };
}

/**
 * Decode every pixel of an 8-bit RGB or RGBA, non-interlaced PNG. That covers everything a browser
 * canvas writes. Anything else throws `PngError` rather than being half understood.
 */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
	const structure = readPngStructure(bytes);
	const { width, height, bitDepth, colorType, interlace } = structure;
	if (colorType !== COLOR_RGB && colorType !== COLOR_RGBA)
		throw new PngError(`Its color type is ${colorType}, not RGB.`);
	if (bitDepth !== 8) throw new PngError(`It is ${bitDepth}-bit, not 8-bit.`);
	if (interlace !== 0) throw new PngError('It is interlaced.');
	const channels = colorType === COLOR_RGB ? 3 : 4;
	const stride = width * channels;
	const rawSize = (stride + 1) * height;
	if (rawSize > MAX_DECODED_BYTES) throw new PngError('Its size is too large to decode.');
	const raw = await inflateExact(
		structure.chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
		rawSize
	);
	unfilterRows(raw, stride, channels, height);
	for (let y = 0; y < height; y++) {
		const row = y * (stride + 1) + 1;
		raw.copyWithin(y * stride, row, row + stride);
	}
	const pixels = raw.subarray(0, stride * height);
	return { ...structure, pixels, channels, ...pixelStats(pixels, channels) };
}

/* ----------------------------------------------------------------------- writing opaque RGB PNGs */

const PNG_TYPE_BYTES = 4;

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
	const output = new Uint8Array(CHUNK_OVERHEAD + data.length);
	const view = new DataView(output.buffer);
	view.setUint32(0, data.length);
	for (let index = 0; index < PNG_TYPE_BYTES; index++) output[4 + index] = type.charCodeAt(index);
	output.set(data, 8);
	view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)));
	return output;
}

/** The usual per-row heuristic: the filter whose output is closest to zero compresses best. */
function filterRgbRows(rgb: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
	const stride = width * 3;
	const output = new Uint8Array((stride + 1) * height);
	const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride));
	const [none, sub, up, average, predicted] = candidates;
	const magnitude = (byte: number) => (byte < 128 ? byte : 256 - byte);
	for (let y = 0; y < height; y++) {
		const row = y * stride;
		const above = row - stride;
		const costs = [0, 0, 0, 0, 0];
		for (let i = 0; i < stride; i++) {
			const value = rgb[row + i];
			const a = i >= 3 ? rgb[row + i - 3] : 0;
			const b = y > 0 ? rgb[above + i] : 0;
			const c = y > 0 && i >= 3 ? rgb[above + i - 3] : 0;
			none[i] = value;
			sub[i] = value - a;
			up[i] = value - b;
			average[i] = value - ((a + b) >> 1);
			predicted[i] = value - paeth(a, b, c);
			costs[0] += magnitude(none[i]);
			costs[1] += magnitude(sub[i]);
			costs[2] += magnitude(up[i]);
			costs[3] += magnitude(average[i]);
			costs[4] += magnitude(predicted[i]);
		}
		const best = costs.indexOf(Math.min(...costs));
		const start = y * (stride + 1);
		output[start] = best;
		output.set(candidates[best], start + 1);
	}
	return output;
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Write tightly packed 8-bit RGB as a color type 2 PNG. `extra` chunks go before the pixels. */
export async function encodeRgbPng(
	rgb: Uint8Array,
	width: number,
	height: number,
	extra: readonly PngChunk[] = []
): Promise<Uint8Array<ArrayBuffer>> {
	if (rgb.length !== width * height * 3)
		throw new PngError(`${rgb.length} bytes cannot be a ${width} × ${height} RGB image.`);
	const header = new Uint8Array(IHDR_BYTES);
	const fields = new DataView(header.buffer);
	fields.setUint32(0, width);
	fields.setUint32(4, height);
	header[8] = 8;
	header[9] = COLOR_RGB;
	const parts = [
		Uint8Array.from(SIGNATURE),
		chunk('IHDR', header),
		...extra.map((item) => chunk(item.type, item.data)),
		chunk('IDAT', await deflate(filterRgbRows(rgb, width, height))),
		chunk('IEND', new Uint8Array())
	];
	const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		output.set(part, at);
		at += part.length;
	}
	return output;
}

function rgbFromRgba(rgba: Uint8Array): Uint8Array<ArrayBuffer> {
	const rgb = new Uint8Array((rgba.length / 4) * 3);
	for (let from = 0, to = 0; from < rgba.length; from += 4, to += 3) {
		rgb[to] = rgba[from];
		rgb[to + 1] = rgba[from + 1];
		rgb[to + 2] = rgba[from + 2];
	}
	return rgb;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
	return true;
}

/* --------------------------------------------------------------------------------- verification */

export interface VerifiedPng extends PngInspection {
	/** The file to ship. Its pixels have been decoded and are known to be `width` × `height` RGB. */
	bytes: Uint8Array<ArrayBuffer>;
	/** The browser wrote opaque RGBA, so the alpha channel was removed and the file rewritten. */
	converted: boolean;
}

/**
 * Prove an encoded file can ship: decode all of it, then require the exact size, 8-bit RGB, and no
 * transparency. Opaque RGBA loses its unused channel and is decoded again. RGBA with any transparent
 * pixel is refused, not flattened here, because the color behind it was never painted. A file with
 * one flat color is refused too: a canvas past the browser's memory limit stays blank without error.
 */
export async function verifyOpaquePng(
	encoded: Uint8Array,
	expected: { width: number; height: number }
): Promise<VerifiedPng> {
	const decoded = await decodePng(encoded);
	const { width, height, bitDepth, colorType } = decoded;
	if (width !== expected.width || height !== expected.height)
		throw new PngError(
			`It is ${width} × ${height} pixels, not the required ${expected.width} × ${expected.height}.`
		);
	if (decoded.transparency) throw new PngError('It declares a transparent color.');
	if (decoded.minAlpha < 255)
		throw new PngError(`It has transparent pixels (lowest alpha ${decoded.minAlpha}).`);
	if (decoded.uniform) throw new PngError('Every pixel is the same color, so nothing was painted.');
	const inspection: PngInspection = { width, height, bitDepth, colorType };
	if (colorType === COLOR_RGB) return { ...inspection, bytes: encoded.slice(), converted: false };

	const rgb = rgbFromRgba(decoded.pixels);
	const rewritten = await encodeRgbPng(
		rgb,
		width,
		height,
		decoded.chunks.filter((item) => COLOR_CHUNKS.has(item.type))
	);
	const check = await decodePng(rewritten);
	if (check.colorType !== COLOR_RGB || !sameBytes(check.pixels, rgb))
		throw new PngError('Removing its alpha channel changed the image.');
	return { ...inspection, colorType: COLOR_RGB, bytes: rewritten, converted: true };
}

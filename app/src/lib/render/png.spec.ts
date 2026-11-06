import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { concat, ihdr, patternPixels, pngChunk, pngFile } from './__fixtures__/export';
import { decodePng, encodeRgbPng, inspectPng, PngError, verifyOpaquePng } from './png';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TARGET = { width: 12, height: 9 };

function raw(rows: number[][]): Buffer {
	return deflateSync(Uint8Array.from(rows.flat()));
}

function withIdat(idat: Uint8Array, header = ihdr(2, 1), extra: Uint8Array[] = []) {
	return concat([
		SIGNATURE,
		pngChunk('IHDR', header),
		...extra,
		pngChunk('IDAT', idat),
		pngChunk('IEND')
	]);
}

/** Decoded here with zlib and the PNG spec's formulas, so the module has a second opinion. */
function independentRgb(file: Uint8Array) {
	let at = 8;
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
	const idat: Uint8Array[] = [];
	let width = 0;
	let height = 0;
	while (at < file.length) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
		const data = file.subarray(at + 8, at + 8 + length);
		if (type === 'IHDR') {
			width = view.getUint32(at + 8);
			height = view.getUint32(at + 12);
			expect(data[8]).toBe(8);
			expect(data[9]).toBe(2);
		}
		if (type === 'IDAT') idat.push(data);
		at += 12 + length;
	}
	const inflated = inflateSync(concat(idat));
	const stride = width * 3;
	expect(inflated.length).toBe((stride + 1) * height);
	const pixels = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = inflated[y * (stride + 1)];
		for (let i = 0; i < stride; i++) {
			const value = inflated[y * (stride + 1) + 1 + i];
			const left = i >= 3 ? pixels[y * stride + i - 3] : 0;
			const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
			const corner = y > 0 && i >= 3 ? pixels[(y - 1) * stride + i - 3] : 0;
			const p = left + up - corner;
			const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
			const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
			pixels[y * stride + i] = value + [0, left, up, (left + up) >> 1, paeth][filter];
		}
	}
	return { width, height, pixels };
}

describe('inspectPng reads what the bytes say', () => {
	it('reads the size and format from the header', () => {
		const file = pngFile(12, 9, patternPixels(12, 9));
		expect(inspectPng(file)).toEqual({ width: 12, height: 9, bitDepth: 8, colorType: 2 });
		const rgba = pngFile(3, 2, patternPixels(3, 2, 1, 4), { channels: 4 });
		expect(inspectPng(rgba).colorType).toBe(6);
	});

	const good = pngFile(4, 4, patternPixels(4, 4));
	const flipped = good.slice();
	flipped[45] ^= 0xff;
	const damaged: [string, Uint8Array, RegExp][] = [
		['bytes that are not a PNG', new TextEncoder().encode('<html>not a png</html>'), /not a PNG/],
		['an empty file', new Uint8Array(), /not a PNG/],
		['a file cut off mid-chunk', good.subarray(0, good.length - 20), /cut off/],
		['a file cut off before its end marker', good.subarray(0, good.length - 12), /cut off/],
		['a damaged checksum', flipped, /checksum/],
		['bytes after the end marker', concat([good, Uint8Array.from([1, 2, 3])]), /after the end/],
		[
			'image data before the header',
			concat([SIGNATURE, pngChunk('IDAT', raw([[0, 0, 0, 0]])), pngChunk('IEND')]),
			/image header/
		],
		[
			'two headers',
			concat([
				SIGNATURE,
				pngChunk('IHDR', ihdr(2, 1)),
				pngChunk('IHDR', ihdr(2, 1)),
				pngChunk('IDAT', raw([[0, 0, 0, 0]])),
				pngChunk('IEND')
			]),
			/more than one/
		],
		[
			'no image data',
			concat([SIGNATURE, pngChunk('IHDR', ihdr(2, 1)), pngChunk('IEND')]),
			/no image data/
		],
		[
			'split image data',
			concat([
				SIGNATURE,
				pngChunk('IHDR', ihdr(2, 1)),
				pngChunk('IDAT', raw([[0, 0, 0, 0]])),
				pngChunk('tEXt', Uint8Array.from([65, 0, 65])),
				pngChunk('IDAT', raw([[0, 0, 0, 0]])),
				pngChunk('IEND')
			]),
			/split apart/
		],
		[
			'an unknown required chunk',
			withIdat(raw([[0, 0, 0, 0]]), ihdr(2, 1), [pngChunk('WXYZ', Uint8Array.from([1]))]),
			/unknown required chunk/
		],
		[
			'an impossible color format',
			withIdat(raw([[0, 0, 0, 0]]), ihdr(2, 1, 2, 4)),
			/impossible color/
		],
		['a zero width', withIdat(raw([[0]]), ihdr(0, 1)), /impossible size/]
	];
	it.each(damaged)('refuses %s', (_, bytes, reason) => {
		expect(() => inspectPng(bytes)).toThrow(PngError);
		expect(() => inspectPng(bytes)).toThrow(reason);
	});
});

describe('decodePng really decodes', () => {
	it('undoes each of the five row filters', async () => {
		// One 2x6 image, each row with a different filter, computed here from the PNG spec.
		const pixels = patternPixels(2, 6, 9);
		const stride = 6;
		const rows: number[][] = [];
		for (let y = 0; y < 6; y++) {
			const filter = y === 5 ? 0 : y;
			const row = [filter];
			for (let i = 0; i < stride; i++) {
				const value = pixels[y * stride + i];
				const left = i >= 3 ? pixels[y * stride + i - 3] : 0;
				const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
				const corner = y > 0 && i >= 3 ? pixels[(y - 1) * stride + i - 3] : 0;
				const p = left + up - corner;
				const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
				const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
				const predicted = [0, left, up, (left + up) >> 1, paeth][filter];
				row.push((value - predicted) & 0xff);
			}
			rows.push(row);
		}
		const decoded = await decodePng(withIdat(raw(rows), ihdr(2, 6)));
		expect(decoded.pixels).toEqual(pixels);
		expect(decoded.minAlpha).toBe(255);
	});

	it('finds the lowest alpha of RGBA and accepts split image data', async () => {
		const pixels = patternPixels(3, 3, 1, 4);
		pixels[7 * 4 + 3] = 17;
		const stride = 12;
		const inflated = new Uint8Array((stride + 1) * 3);
		for (let y = 0; y < 3; y++)
			inflated.set(pixels.subarray(y * stride, (y + 1) * stride), y * 13 + 1);
		const compressed = deflateSync(inflated);
		const split = concat([
			SIGNATURE,
			pngChunk('IHDR', ihdr(3, 3, 6)),
			pngChunk('IDAT', compressed.subarray(0, 5)),
			pngChunk('IDAT', compressed.subarray(5)),
			pngChunk('IEND')
		]);
		const decoded = await decodePng(split);
		expect(decoded.minAlpha).toBe(17);
		expect(decoded.pixels).toEqual(pixels);
	});

	const compressed = raw([[0, 1, 2, 3, 4, 5, 6]]);
	const headerOnly: [string, Uint8Array, RegExp][] = [
		// Each of these has a perfectly valid header. Only decoding finds out.
		['image data that is not zlib', withIdat(Uint8Array.from([1, 2, 3, 4])), /damaged/],
		[
			'truncated zlib data',
			withIdat(compressed.subarray(0, compressed.length - 6)),
			/damaged|early/
		],
		['too few rows', withIdat(raw([[0, 1, 2, 3, 4, 5, 6]]), ihdr(2, 2)), /early/],
		[
			'too many rows',
			withIdat(
				raw([
					[0, 1, 2, 3, 4, 5, 6],
					[0, 1, 2, 3, 4, 5, 6]
				])
			),
			/more image data/
		],
		['an unknown row filter', withIdat(raw([[9, 1, 2, 3, 4, 5, 6]])), /unknown PNG filter/],
		['16-bit pixels', withIdat(raw([[0, 1, 2, 3, 4, 5, 6]]), ihdr(2, 1, 2, 16)), /16-bit/],
		['a palette image', withIdat(raw([[0, 1, 1]]), ihdr(2, 1, 3)), /color type is 3/],
		['grayscale', withIdat(raw([[0, 1, 1]]), ihdr(2, 1, 0)), /color type is 0/],
		['an interlaced image', withIdat(raw([[0, 1, 2, 3]]), ihdr(2, 1, 2, 8, 1)), /interlaced/]
	];
	it.each(headerOnly)('refuses %s', async (_, bytes, reason) => {
		expect(inspectPng(bytes).width).toBeGreaterThan(0);
		await expect(decodePng(bytes)).rejects.toThrow(reason);
	});
});

describe('verifyOpaquePng decides what can ship', () => {
	it('passes real RGB through byte-identical', async () => {
		const file = pngFile(TARGET.width, TARGET.height, patternPixels(TARGET.width, TARGET.height));
		const verified = await verifyOpaquePng(file, TARGET);
		expect(verified.bytes).toEqual(file);
		expect(verified.converted).toBe(false);
		expect(verified).toMatchObject({ width: 12, height: 9, bitDepth: 8, colorType: 2 });
	});

	it('rewrites opaque RGBA as real RGB with the same pixels', async () => {
		const rgba = patternPixels(TARGET.width, TARGET.height, 3, 4);
		const srgb = pngChunk('sRGB', Uint8Array.from([0]));
		const file = pngFile(TARGET.width, TARGET.height, rgba, { channels: 4, extra: [srgb] });
		expect(inspectPng(file).colorType).toBe(6);
		const verified = await verifyOpaquePng(file, TARGET);
		expect(verified.converted).toBe(true);
		expect(verified.colorType).toBe(2);
		expect(inspectPng(verified.bytes)).toEqual({ width: 12, height: 9, bitDepth: 8, colorType: 2 });
		const decoded = independentRgb(verified.bytes);
		expect(decoded.pixels).toEqual(rgba.filter((_, index) => index % 4 !== 3));
		expect(new TextDecoder().decode(verified.bytes)).toContain('sRGB');
	});

	it('refuses RGBA with any transparent pixel rather than inventing a color behind it', async () => {
		const rgba = patternPixels(TARGET.width, TARGET.height, 3, 4);
		rgba[20 * 4 + 3] = 254;
		const file = pngFile(TARGET.width, TARGET.height, rgba, { channels: 4 });
		await expect(verifyOpaquePng(file, TARGET)).rejects.toThrow(
			/transparent pixels \(lowest alpha 254\)/
		);
	});

	it('refuses a color type 2 file that declares a transparent color', async () => {
		const file = pngFile(TARGET.width, TARGET.height, patternPixels(TARGET.width, TARGET.height), {
			extra: [pngChunk('tRNS', new Uint8Array(6))]
		});
		await expect(verifyOpaquePng(file, TARGET)).rejects.toThrow(/transparent color/);
	});

	it('refuses the wrong size, saying both', async () => {
		const file = pngFile(9, 12, patternPixels(9, 12));
		await expect(verifyOpaquePng(file, TARGET)).rejects.toThrow(
			'9 × 12 pixels, not the required 12 × 9'
		);
	});

	it('refuses a blank canvas, however valid the file', async () => {
		const file = pngFile(
			TARGET.width,
			TARGET.height,
			new Uint8Array(TARGET.width * TARGET.height * 3)
		);
		await expect(verifyOpaquePng(file, TARGET)).rejects.toThrow(/same color/);
	});

	it('refuses a header-only forgery: a correct RGB header over no real pixels', async () => {
		const forged = withIdat(Uint8Array.from([0x78, 0x9c]), ihdr(TARGET.width, TARGET.height));
		expect(inspectPng(forged)).toEqual({ ...TARGET, bitDepth: 8, colorType: 2 });
		await expect(verifyOpaquePng(forged, TARGET)).rejects.toThrow(PngError);
	});
});

describe('encodeRgbPng writes what other decoders read', () => {
	it.each([
		['a pattern', patternPixels(17, 11, 5)],
		['flat rows', new Uint8Array(17 * 11 * 3).fill(200)]
	])('round-trips %s through zlib and the PNG spec', async (_, pixels) => {
		const file = await encodeRgbPng(pixels, 17, 11);
		const decoded = independentRgb(file);
		expect(decoded).toMatchObject({ width: 17, height: 11 });
		expect(decoded.pixels).toEqual(pixels);
	});

	it('refuses pixels of the wrong length', async () => {
		await expect(encodeRgbPng(new Uint8Array(5), 2, 2)).rejects.toThrow(/cannot be a 2 × 2/);
	});
});

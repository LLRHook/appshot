import { describe, expect, it, vi } from 'vitest';
import {
	aspectFamilyOf,
	assetFromCapture,
	CaptureError,
	classifyCapture,
	readCapture,
	readCaptures,
	sniffImage,
	sourceCompatibility,
	type ReadCaptureOptions
} from './capture';
import { DEVICES, OUTPUT_TARGETS, type DeviceId } from './devices';
import { MAX_IMAGE_BYTES } from './image';

function png(width: number, height: number, colorType = 2): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	const view = new DataView(bytes.buffer);
	view.setUint32(8, 13);
	bytes.set([0x49, 0x48, 0x44, 0x52], 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	bytes[24] = 8;
	bytes[25] = colorType;
	return bytes;
}

/** A JPEG whose frame header sits after an application segment, as real files have. */
function jpeg(width: number, height: number): Uint8Array<ArrayBuffer> {
	return new Uint8Array([
		0xff,
		0xd8,
		0xff,
		0xe0,
		0x00,
		0x04,
		0x00,
		0x00,
		0xff,
		0xc0,
		0x00,
		0x11,
		0x08,
		height >> 8,
		height & 0xff,
		width >> 8,
		width & 0xff,
		0x03
	]);
}

const riff = (chunk: string, payload: number[]) =>
	new Uint8Array([
		...new TextEncoder().encode('RIFF'),
		0,
		0,
		0,
		0,
		...new TextEncoder().encode('WEBP'),
		...new TextEncoder().encode(chunk),
		...payload
	]);

function webpVp8x(width: number, height: number) {
	const w = width - 1;
	const h = height - 1;
	return riff('VP8X', [
		10,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		w & 0xff,
		(w >> 8) & 0xff,
		w >> 16,
		h & 0xff,
		(h >> 8) & 0xff,
		h >> 16
	]);
}

function webpVp8l(width: number, height: number) {
	const bits = (width - 1) | ((height - 1) << 14);
	return riff('VP8L', [
		0,
		0,
		0,
		0,
		0x2f,
		bits & 0xff,
		(bits >> 8) & 0xff,
		(bits >> 16) & 0xff,
		(bits >>> 24) & 0xff
	]);
}

function webpVp8(width: number, height: number) {
	return riff('VP8 ', [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0x9d,
		0x01,
		0x2a,
		width & 0xff,
		width >> 8,
		height & 0xff,
		height >> 8
	]);
}

const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type = '') =>
	new File([bytes], name, { type });
const decodesTo = (width: number, height: number): ReadCaptureOptions => ({
	decode: async () => ({ width, height })
});

describe('sniffImage reads the format from the bytes', () => {
	it.each([
		['PNG', png(1320, 2868), 'image/png', 1320, 2868],
		['JPEG', jpeg(400, 800), 'image/jpeg', 400, 800],
		['WebP VP8X', webpVp8x(2064, 2752), 'image/webp', 2064, 2752],
		['WebP VP8L', webpVp8l(1206, 2622), 'image/webp', 1206, 2622],
		['WebP VP8', webpVp8(1179, 2556), 'image/webp', 1179, 2556]
	] as const)('%s', (_label, bytes, mime, width, height) => {
		expect(sniffImage(bytes)).toMatchObject({ mime, width, height });
	});

	it('reports whether a PNG format has alpha', () => {
		expect(sniffImage(png(1, 1, 2))?.hasAlpha).toBe(false);
		expect(sniffImage(png(1, 1, 6))?.hasAlpha).toBe(true);
		expect(sniffImage(png(1, 1, 4))?.hasAlpha).toBe(true);
	});

	it.each([
		['text', new TextEncoder().encode('Not an image at all')],
		['empty', new Uint8Array()],
		['GIF', new TextEncoder().encode('GIF89a')],
		['bare RIFF', new TextEncoder().encode('RIFF....WAVE')],
		['SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')]
	])('refuses %s', (_label, bytes) => {
		expect(sniffImage(bytes)).toBeNull();
	});

	it('still recognizes a truncated header, without inventing a size', () => {
		expect(sniffImage(png(10, 10).slice(0, 12))).toMatchObject({
			mime: 'image/png',
			width: null,
			height: null
		});
		expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff]))).toMatchObject({
			mime: 'image/jpeg',
			width: null
		});
	});

	it('does not read a garbage segment length past the end of a JPEG', () => {
		expect(
			sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0, 0, 0, 0, 0, 0]))
		).toMatchObject({ mime: 'image/jpeg', width: null });
	});
});

describe('classifyCapture', () => {
	it('finds every class accepting an exact size', () => {
		expect(classifyCapture(1320, 2868)).toEqual({
			classIds: ['iphone-di-large'],
			orientation: 'portrait',
			aspectFamily: 'phone-tall'
		});
		expect(classifyCapture(2048, 2732).classIds).toEqual(['ipad-13', 'ipad-12.9']);
		expect(classifyCapture(2868, 1320)).toMatchObject({
			orientation: 'landscape',
			aspectFamily: 'phone-landscape'
		});
	});

	it('names the Duo posture from the verified sizes', () => {
		expect(classifyCapture(1398, 2034)).toEqual({
			classIds: ['iphone-duo'],
			orientation: 'portrait',
			aspectFamily: 'duo-portrait',
			posture: 'outer'
		});
		expect(classifyCapture(2007, 2853).posture).toBe('inner');
		expect(classifyCapture(2853, 2007)).toMatchObject({
			posture: 'inner',
			orientation: 'landscape',
			aspectFamily: 'wide-landscape'
		});
	});

	it('does not classify the Duo tech-spec panel size as Duo', () => {
		const panel = classifyCapture(1878, 2670);
		expect(panel.classIds).toEqual([]);
		expect(panel.posture).toBeUndefined();
		expect(panel.aspectFamily).toBe('duo-portrait');
	});

	it('returns no class, and no family when nothing is close', () => {
		expect(classifyCapture(400, 800)).toEqual({
			classIds: [],
			orientation: 'portrait',
			aspectFamily: 'phone-tall'
		});
		expect(classifyCapture(1000, 1000)).toEqual({
			classIds: [],
			orientation: 'square',
			aspectFamily: null
		});
		expect(classifyCapture(3000, 1000).aspectFamily).toBeNull();
		expect(aspectFamilyOf(0, 100)).toBeNull();
		expect(aspectFamilyOf(Number.NaN, 100)).toBeNull();
	});

	it('classifies every catalog size under its own class', () => {
		for (const target of OUTPUT_TARGETS) {
			expect(classifyCapture(target.width, target.height).classIds).toContain(target.classId);
		}
	});
});

describe('sourceCompatibility', () => {
	const check = (width: number, height: number, target: DeviceId, placed?: number) =>
		sourceCompatibility({ naturalWidth: width, naturalHeight: height }, DEVICES[target], placed);

	it.each(OUTPUT_TARGETS.map((target) => [target.id, target] as const))(
		'accepts %s exact size as native, without claiming native UI',
		(_id, target) => {
			const result = sourceCompatibility(
				{ naturalWidth: target.width, naturalHeight: target.height },
				target
			);
			expect(result).toMatchObject({ level: 'native', severity: 'ok' });
			expect(result.message).toMatch(/does not prove/);
		}
	);

	it.each<[string, number, number, DeviceId, string]>([
		['phone on tablet', 1320, 2868, 'ipad-13', 'wrong-class'],
		['phone on Duo inner', 1320, 2868, 'iphone-duo-inner-2007x2853', 'wrong-class'],
		['phone on Duo outer', 1320, 2868, 'iphone-duo-outer-1398x2034', 'wrong-class'],
		['tablet on phone', 2064, 2752, 'iphone-6.9', 'wrong-class'],
		['tablet on Duo', 2064, 2752, 'iphone-duo-inner-2007x2853', 'wrong-class'],
		['Duo inner on phone', 2007, 2853, 'iphone-6.9', 'wrong-class'],
		['Duo inner on tablet', 2007, 2853, 'ipad-13', 'wrong-class'],
		['Duo outer on tablet', 1398, 2034, 'ipad-13', 'wrong-class'],
		['Duo inner on outer', 2007, 2853, 'iphone-duo-outer-1398x2034', 'wrong-class'],
		['Duo outer on inner', 1398, 2034, 'iphone-duo-inner-2007x2853', 'wrong-class'],
		['Duo inner landscape on outer', 2853, 2007, 'iphone-duo-outer-1398x2034', 'wrong-class'],
		['large iPhone on medium', 1320, 2868, 'iphone-di-medium-1206x2622', 'wrong-class'],
		['medium iPhone on large', 1206, 2622, 'iphone-6.9', 'wrong-class'],
		['Face ID on Dynamic Island', 1284, 2778, 'iphone-6.9', 'wrong-class'],
		['landscape phone on portrait', 2868, 1320, 'iphone-6.9', 'wrong-orientation'],
		['portrait phone on landscape', 1320, 2868, 'iphone-di-large-2868x1320', 'wrong-orientation'],
		['Duo outer rotated', 2034, 1398, 'iphone-duo-outer-1398x2034', 'wrong-orientation'],
		['Duo inner rotated', 2007, 2853, 'iphone-duo-inner-2853x2007', 'wrong-orientation'],
		['tablet rotated', 2752, 2064, 'ipad-13', 'wrong-orientation'],
		['unlisted landscape on portrait', 2000, 1500, 'ipad-13', 'wrong-orientation'],
		['unlisted phone shape on tablet', 1000, 2170, 'ipad-13', 'wrong-class'],
		['unlisted phone shape on Duo', 1000, 2170, 'iphone-duo-inner-2007x2853', 'wrong-class'],
		['unlisted tablet shape on phone', 1500, 2000, 'iphone-6.9', 'wrong-class'],
		['low-res phone on tablet', 400, 800, 'ipad-13', 'wrong-class']
	])('blocks %s', (_label, width, height, target, level) => {
		const result = check(width, height, target);
		expect(result).toMatchObject({ level, severity: 'block' });
		expect(result.message).toContain(`${width} × ${height}`);
		expect(result.message).toContain('Add a');
	});

	it('names both displays for a Duo posture mismatch', () => {
		const { message } = check(2007, 2853, 'iphone-duo-outer-1398x2034');
		expect(message).toContain('inner');
		expect(message).toContain('outer');
	});

	it('says which class a wrong capture came from', () => {
		expect(check(1320, 2868, 'ipad-13').message).toContain('iPhone Dynamic Island, large');
		expect(check(1320, 2868, 'ipad-13').message).toContain('iPad 13"');
	});

	it('flags a small capture as far too small, with and without a placement', () => {
		expect(check(400, 800, 'iphone-6.9')).toMatchObject({ level: 'upscaled', severity: 'block' });
		expect(check(400, 800, 'iphone-6.9').message).toContain('3.3×');
		const placed = check(400, 800, 'iphone-6.9', 984);
		expect(placed).toMatchObject({ level: 'upscaled', severity: 'block' });
		expect(placed.upscale).toBeCloseTo(2.46, 2);
	});

	it('warns on a slight enlargement and blocks an excessive one, even of an exact size', () => {
		expect(check(1320, 2868, 'iphone-6.9', 1320)).toMatchObject({
			level: 'native',
			severity: 'ok',
			upscale: 1
		});
		expect(check(1320, 2868, 'iphone-6.9', 1848)).toMatchObject({
			level: 'upscaled',
			severity: 'warn'
		});
		expect(check(1320, 2868, 'iphone-6.9', 2700)).toMatchObject({
			level: 'upscaled',
			severity: 'block'
		});
	});

	it('accepts another size of the same class, noting resampling', () => {
		expect(check(1290, 2796, 'iphone-6.9')).toMatchObject({ level: 'same-class', severity: 'ok' });
		expect(check(2048, 2732, 'ipad-13')).toMatchObject({ level: 'same-class', severity: 'ok' });
		expect(check(1179, 2556, 'iphone-di-medium-1206x2622')).toMatchObject({
			level: 'same-class',
			severity: 'ok'
		});
	});

	it('warns when a same-class size has a different shape', () => {
		const result = check(1488, 2266, 'ipad-11-1668x2388');
		expect(result).toMatchObject({ level: 'same-class', severity: 'warn' });
		expect(result.message).toMatch(/cropped/);
	});

	it('keeps every same-class pair same-class or upscaled, never wrong-class', () => {
		for (const target of OUTPUT_TARGETS) {
			for (const other of OUTPUT_TARGETS) {
				if (
					other.classId !== target.classId ||
					other.orientation !== target.orientation ||
					other.posture !== target.posture ||
					other === target
				)
					continue;
				const { level } = sourceCompatibility(
					{ naturalWidth: other.width, naturalHeight: other.height },
					target
				);
				expect(['same-class', 'upscaled', 'native']).toContain(level);
			}
		}
	});

	it('warns that an unlisted size of the right shape cannot be verified', () => {
		const result = check(1878, 2670, 'iphone-duo-inner-2007x2853');
		expect(result).toMatchObject({ level: 'unknown', severity: 'warn' });
		expect(result.message).toMatch(/not an accepted App Store size/);
	});

	it('blocks an image shaped like no device screen', () => {
		for (const [width, height] of [
			[1000, 1000],
			[4000, 1000]
		]) {
			expect(check(width, height, 'iphone-6.9').severity).toBe('block');
		}
		expect(check(1000, 1000, 'iphone-6.9').level).toBe('unknown');
	});

	it('blocks an image with no usable size, and ignores a meaningless placement', () => {
		expect(check(0, 0, 'iphone-6.9')).toMatchObject({ level: 'unknown', severity: 'block' });
		expect(check(1320, 2868, 'iphone-6.9', Number.NaN).upscale).toBeUndefined();
		expect(check(1320, 2868, 'iphone-6.9', -5).upscale).toBeUndefined();
	});

	it('lets size alone pass for a resized capture, so it never claims native UI', () => {
		const resized = sourceCompatibility(
			{ naturalWidth: 1398, naturalHeight: 2034 },
			DEVICES['iphone-duo-outer-1398x2034']
		);
		expect(resized.level).toBe('native');
		expect(resized.message).toContain('Size alone does not prove');
	});
});

describe('readCapture', () => {
	it('accepts a JPEG named .png as the JPEG it is, and says so by name', async () => {
		const capture = await readCapture(
			file(jpeg(400, 800), 'mislabeled.png', 'image/png'),
			decodesTo(400, 800)
		);
		expect(capture.mime).toBe('image/jpeg');
		expect(capture.blob.type).toBe('image/jpeg');
		expect(capture.mislabeled).toBe(true);
		expect(capture.notes[0]).toContain('mislabeled.png is really a JPEG');
		expect(capture.notes[1]).toContain('400 × 800');
		expect(capture.notes[1]).toContain('mislabeled.png');
		expect(capture.notes.join(' ')).not.toMatch(/project/i);
	});

	it('flags a mislabeled low-res capture against a target', async () => {
		const capture = await readCapture(file(jpeg(400, 800), 'low.png', 'image/png'), {
			...decodesTo(400, 800),
			target: DEVICES['iphone-6.9']
		});
		expect(capture.compatibility).toMatchObject({ level: 'upscaled', severity: 'block' });
	});

	it('takes the size from decoding, over the header and the file name', async () => {
		const capture = await readCapture(file(png(10, 10), 'wide-1320x2868.png'), decodesTo(640, 960));
		expect([capture.naturalWidth, capture.naturalHeight]).toEqual([640, 960]);
		expect(capture.classification.classIds).toEqual(['iphone-home-3.5in']);
	});

	it('records a correctly named file as correct', async () => {
		const capture = await readCapture(
			file(png(1320, 2868), 'home.png', 'image/png'),
			decodesTo(1320, 2868)
		);
		expect(capture.mislabeled).toBe(false);
		expect(capture.notes).toEqual([]);
		expect(capture.classification.classIds).toEqual(['iphone-di-large']);
		expect(capture.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(capture.byteLength).toBe(33);
	});

	it.each<[string, File, ReadCaptureOptions, string, RegExp]>([
		[
			'a text file',
			new File(['Not an image'], 'notes.txt', { type: 'text/plain' }),
			{},
			'unsupported-format',
			/notes\.txt.*Choose a PNG, JPG, or WebP screenshot\./
		],
		[
			'a text file claiming to be a PNG',
			new File(['Not an image'], 'fake.png', { type: 'image/png' }),
			{},
			'unsupported-format',
			/fake\.png/
		],
		[
			'a corrupt image',
			file(png(10, 10), 'broken.png'),
			{ decode: () => Promise.reject(new Error('bad')) },
			'undecodable',
			/broken\.png looks like a PNG/
		],
		[
			'an image with no pixels',
			file(png(10, 10), 'empty.png'),
			decodesTo(0, 0),
			'undecodable',
			/empty\.png/
		],
		[
			'too many pixels once decoded',
			file(jpeg(10, 10), 'huge.jpg'),
			decodesTo(6000, 6000),
			'too-many-pixels',
			/huge\.jpg.*24 megapixels/
		]
	])('rejects %s, naming the file', async (_label, input, options, code, message) => {
		const error: unknown = await readCapture(input, options).catch((reason) => reason);
		expect(error).toBeInstanceOf(CaptureError);
		expect((error as CaptureError).code).toBe(code);
		expect((error as CaptureError).fileName).toBe(input.name);
		expect((error as CaptureError).message).toMatch(message);
		expect((error as CaptureError).message).not.toMatch(/project/i);
	});

	it('refuses an oversized file without reading it', async () => {
		const big = file(png(10, 10), 'big.png');
		Object.defineProperty(big, 'size', { value: MAX_IMAGE_BYTES + 1 });
		const read = vi.spyOn(big, 'arrayBuffer');
		await expect(readCapture(big, decodesTo(10, 10))).rejects.toThrow('big.png is too large');
		expect(read).not.toHaveBeenCalled();
	});

	it('refuses oversized dimensions from the header without decoding', async () => {
		const decode = vi.fn();
		await expect(readCapture(file(png(9000, 100), 'wide.png'), { decode })).rejects.toThrow(
			'wide.png is too large'
		);
		await expect(readCapture(file(png(6000, 6000), 'big.png'), { decode })).rejects.toThrow(
			'24 megapixels'
		);
		expect(decode).not.toHaveBeenCalled();
	});

	it('builds an asset whose id comes from its bytes', async () => {
		const first = await readCapture(file(png(1320, 2868), 'a.png'), decodesTo(1320, 2868));
		const second = await readCapture(file(png(1320, 2868), 'b.png'), decodesTo(1320, 2868));
		expect(first.sha256).toBe(second.sha256);
		const asset = assetFromCapture(first, 'blob:session');
		expect(asset).toEqual({
			id: assetFromCapture(second, 'blob:other').id,
			sha256: first.sha256,
			mime: 'image/png',
			byteLength: 33,
			url: 'blob:session',
			naturalWidth: 1320,
			naturalHeight: 2868,
			name: 'a.png'
		});
	});
});

describe('readCaptures', () => {
	it('keeps every valid file when others fail, in order, naming each failure', async () => {
		const batch = await readCaptures(
			[
				file(png(1320, 2868), 'one.png'),
				new File(['x'], 'notes.txt'),
				file(jpeg(400, 800), 'two.png', 'image/png'),
				new File(['x'], 'other.pdf'),
				file(png(2064, 2752), 'three.png')
			],
			decodesTo(1320, 2868)
		);
		expect(batch.accepted.map((capture) => capture.name)).toEqual([
			'one.png',
			'two.png',
			'three.png'
		]);
		expect(batch.rejected.map((rejection) => rejection.name)).toEqual(['notes.txt', 'other.pdf']);
		expect(batch.rejected[0].message).toContain('notes.txt');
		expect(batch.rejected[1].message).toContain('other.pdf');
	});

	it('names a file that fails in an unexpected way', async () => {
		const bad = file(png(1, 1), 'odd.png');
		vi.spyOn(bad, 'arrayBuffer').mockRejectedValue(new Error('disk'));
		const batch = await readCaptures([bad], decodesTo(1, 1));
		expect(batch.accepted).toEqual([]);
		expect(batch.rejected).toEqual([
			{ name: 'odd.png', code: 'unreadable', message: expect.stringContaining('odd.png') }
		]);
	});

	it('reads one file at a time, for bounded memory', async () => {
		let active = 0;
		let peak = 0;
		await readCaptures(
			[file(png(1, 1), 'a.png'), file(png(1, 1), 'b.png'), file(png(1, 1), 'c.png')],
			{
				decode: async () => {
					active++;
					peak = Math.max(peak, active);
					await Promise.resolve();
					active--;
					return { width: 1, height: 1 };
				}
			}
		);
		expect(peak).toBe(1);
	});
});

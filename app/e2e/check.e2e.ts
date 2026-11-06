import { expect, test } from '@playwright/test';
import { build } from 'vite';
import path from 'node:path';
import type * as Harness from './check-harness';

declare global {
	interface Window {
		CheckHarness: typeof Harness;
	}
}

let harness: string;
test.beforeAll(async () => {
	const bundle = await build({
		configFile: false,
		logLevel: 'silent',
		build: {
			write: false,
			lib: {
				entry: path.resolve('e2e/check-harness.ts'),
				name: 'CheckHarness',
				formats: ['iife']
			}
		}
	});
	const result = Array.isArray(bundle) ? bundle[0] : bundle;
	if (!('output' in result)) throw new Error('Could not build the check harness.');
	const chunk = result.output.find((entry) => entry.type === 'chunk');
	if (!chunk) throw new Error('The check harness produced no JavaScript.');
	harness = chunk.code;
});

/** Fixtures shared by the in-page tests. Each page gets a fresh copy from a script tag. */
const pageHelpers = `
window.scene = {
	/** A capture where every pixel's color encodes its own position, so a crop can be proven exact. */
	addressable(width, height) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		const image = ctx.createImageData(width, height);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4;
				image.data[i] = x & 255;
				image.data[i + 1] = y & 255;
				image.data[i + 2] = ((x >> 8) << 4) | (y >> 8);
				image.data[i + 3] = 255;
			}
		}
		ctx.putImageData(image, 0, 0);
		return { id: 'addressable-' + width + 'x' + height, blobUrl: canvas.toDataURL(), naturalWidth: width, naturalHeight: height };
	},
	solid(width, height, color, id) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, width, height);
		return { id: id || color + width, blobUrl: canvas.toDataURL(), naturalWidth: width, naturalHeight: height };
	},
	frame(device, overrides) {
		const { DEVICES } = window.CheckHarness;
		const target = DEVICES[device];
		return {
			version: 1,
			name: 'Billington',
			device,
			style: 'the-check',
			accent: '#F2CE6B',
			continuityMode: 'none',
			slides: [
				Object.assign(
					{
						id: 'one',
						device,
						background: { kind: 'solid', colors: ['#1E5B57'] },
						frame: 'none',
						layout: 'text-above',
						typography: { headline: 'Split the bill.\\n*Fairly.*', subtitle: 'Everyone pays for what they had.', fontColor: '#FBF6EF', fontWeight: 400 },
						effects: { shadow: 'none', glow: 0 },
						continuity: { inset: 0 },
						check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: false }
					},
					overrides
				)
			]
		};
	},
	async pixels(composition, index = 0, options = {}) {
		const { renderSlide } = window.CheckHarness;
		const canvas = document.createElement('canvas');
		await renderSlide(canvas, composition, index, options);
		const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
		const result = { width: canvas.width, height: canvas.height, data };
		canvas.width = canvas.height = 0;
		return result;
	},
	/** Bounding box of pixels that differ between two same-size renders. */
	diffBox(a, b) {
		let left = Infinity, top = Infinity, right = -1, bottom = -1, count = 0;
		for (let y = 0; y < a.height; y++) {
			for (let x = 0; x < a.width; x++) {
				const i = (y * a.width + x) * 4;
				if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
					count++;
					if (x < left) left = x;
					if (x > right) right = x;
					if (y < top) top = y;
					if (y > bottom) bottom = y;
				}
			}
		}
		return { left, top, right, bottom, count };
	}
};`;

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.addScriptTag({ content: harness });
	await page.addScriptTag({ content: pageHelpers });
});

interface SceneHelpers {
	addressable(width: number, height: number): Harness.ReturnImage;
	solid(width: number, height: number, color: string, id?: string): Harness.ReturnImage;
	frame(device: string, overrides?: object): Harness.Composition;
	pixels(
		composition: Harness.Composition,
		index?: number,
		options?: { width?: number }
	): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
	diffBox(
		a: { width: number; height: number; data: Uint8ClampedArray },
		b: { width: number; height: number; data: Uint8ClampedArray }
	): { left: number; top: number; right: number; bottom: number; count: number };
}
declare const scene: SceneHelpers;

test('a callout at scale 1 is the exact source pixels, and keeps one scale otherwise', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const image = scene.addressable(1320, 2868);
		const crop = { x: 131, y: 1407, width: 640, height: 500 };
		const composition = scene.frame('iphone-6.9', {
			primaryImage: image,
			check: { canvas: 'cream', preset: 'detail', panel: false, wordmark: false },
			typography: { headline: 'Real pixels.', fontColor: '#16302D', fontWeight: 400 },
			layers: [{ id: 'real', kind: 'source-crop', image, crop, x: 300, y: 1200, scale: 1 }]
		});
		const { data, width } = await scene.pixels(composition);
		let wrong = 0;
		for (let y = 0; y < crop.height; y++) {
			for (let x = 0; x < crop.width; x++) {
				const i = ((y + 1200) * width + x + 300) * 4;
				const sx = crop.x + x;
				const sy = crop.y + y;
				if (
					data[i] !== (sx & 255) ||
					data[i + 1] !== (sy & 255) ||
					data[i + 2] !== (((sx >> 8) << 4) | (sy >> 8))
				)
					wrong++;
			}
		}
		// Scale 2 doubles both axes and nothing else.
		const doubled = scene.frame('iphone-6.9', {
			primaryImage: image,
			check: { canvas: 'cream', preset: 'detail', panel: false, wordmark: false },
			typography: { headline: 'Real pixels.', fontColor: '#16302D', fontWeight: 400 },
			layers: [
				{
					id: 'real',
					kind: 'source-crop',
					image,
					crop: { x: 200, y: 1500, width: 100, height: 50 },
					x: 200,
					y: 1200,
					scale: 2,
					sampling: 'pixelated'
				}
			]
		});
		const big = await scene.pixels(doubled);
		const probe = (x: number, y: number) => {
			const i = (y * big.width + x) * 4;
			return [big.data[i], big.data[i + 1]];
		};
		return {
			wrong,
			topLeft: probe(200, 1200),
			bottomRight: probe(399, 1299),
			mid: probe(300, 1250),
			outside: probe(199, 1200)
		};
	});
	expect(result.wrong).toBe(0);
	expect(result.topLeft).toEqual([200 & 255, 1500 & 255]);
	expect(result.bottomRight).toEqual([299 & 255, 1549 & 255]);
	expect(result.mid).toEqual([250 & 255, 1525 & 255]);
	expect(result.outside).not.toEqual([199 & 255, 1500 & 255]);
});

test('a torn layer loses only its teeth, and only the layer it names', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const image = scene.addressable(1320, 2868);
		const crop = { x: 100, y: 1000, width: 1000, height: 400 };
		const frame = (tear?: string) =>
			scene.frame('iphone-6.9', {
				primaryImage: image,
				check: {
					canvas: 'cream',
					preset: 'detail',
					panel: false,
					wordmark: false,
					...(tear ? { tear } : {})
				},
				typography: { headline: 'Real pixels.', fontColor: '#16302D', fontWeight: 400 },
				layers: [{ id: 'real', kind: 'source-crop', image, crop, x: 160, y: 1200, scale: 1 }]
			});
		const whole = await scene.pixels(frame());
		const torn = await scene.pixels(frame('real'));
		const other = await scene.pixels(frame('not-a-layer'));
		const isSource = (data: Uint8ClampedArray, x: number, y: number) => {
			const i = (y * whole.width + x) * 4;
			const sx = crop.x + (x - 160);
			const sy = crop.y + (y - 1200);
			return data[i] === (sx & 255) && data[i + 1] === (sy & 255);
		};
		const bottom = 1599;
		// Near the deepest tips the row is mostly canvas, with real pixels only inside the teeth.
		const nearTips = 1594;
		const row = { source: 0, canvas: 0 };
		for (let x = 160; x < 1160; x++) {
			if (isSource(torn.data, x, nearTips)) row.source++;
			else row.canvas++;
		}
		let bodyWrong = 0;
		for (let y = 1200; y < 1560; y += 7)
			for (let x = 160; x < 1160; x += 7) if (!isSource(torn.data, x, y)) bodyWrong++;
		let wholeRow = 0;
		for (let x = 160; x < 1160; x++) if (isSource(whole.data, x, bottom)) wholeRow++;
		let otherDiffers = 0;
		for (let i = 0; i < whole.data.length; i += 4)
			if (whole.data[i] !== other.data[i] || whole.data[i + 1] !== other.data[i + 1])
				otherDiffers++;
		return { row, bodyWrong, wholeRow, otherDiffers };
	});
	expect(result.bodyWrong).toBe(0);
	expect(result.wholeRow).toBe(1000);
	expect(result.row.canvas).toBeGreaterThan(800);
	expect(result.row.source).toBeGreaterThan(0);
	expect(result.otherDiffers).toBe(0);
});

test('a layer that runs off the bottom keeps square corners there, and only there', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const image = scene.addressable(1320, 2868);
		const render = (y: number) =>
			scene.pixels(
				scene.frame('iphone-6.9', {
					primaryImage: image,
					check: { canvas: 'cream', preset: 'detail', panel: false, wordmark: false },
					typography: { headline: 'Real pixels.', fontColor: '#16302D', fontWeight: 400 },
					layers: [
						{
							id: 'sheet',
							kind: 'source-crop',
							image,
							crop: { x: 100, y: 1000, width: 1000, height: 500 },
							x: 160,
							y,
							scale: 1,
							radius: 72
						}
					]
				})
			);
		const isSource = (
			frame: { data: Uint8ClampedArray; width: number },
			x: number,
			y: number,
			top: number
		) => {
			const i = (y * frame.width + x) * 4;
			return (
				frame.data[i] === ((100 + x - 160) & 255) && frame.data[i + 1] === ((1000 + y - top) & 255)
			);
		};
		const sheet = await render(2368);
		const floating = await render(2200);
		return {
			runsOffBottomLeft: isSource(sheet, 161, 2867, 2368),
			runsOffBottomRight: isSource(sheet, 1158, 2867, 2368),
			runsOffTopLeft: isSource(sheet, 161, 2369, 2368),
			floatingBottomLeft: isSource(floating, 161, 2698, 2200),
			floatingBody: isSource(floating, 660, 2400, 2200)
		};
	});
	expect(result.runsOffBottomLeft).toBe(true);
	expect(result.runsOffBottomRight).toBe(true);
	expect(result.runsOffTopLeft).toBe(false);
	expect(result.floatingBottomLeft).toBe(false);
	expect(result.floatingBody).toBe(true);
});

test('nearest-neighbor art shows only its own colors, and smoothing is restored', async ({
	page
}) => {
	const result = await page.evaluate(async () => {
		const art = document.createElement('canvas');
		art.width = art.height = 8;
		const ctx = art.getContext('2d')!;
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++) {
				ctx.fillStyle = (x + y) % 2 ? '#000000' : '#FFFFFF';
				ctx.fillRect(x, y, 1, 1);
			}
		const image = {
			id: 'checker',
			blobUrl: art.toDataURL(),
			naturalWidth: 8,
			naturalHeight: 8
		};
		const compose = (sampling: 'pixelated' | 'smooth') =>
			scene.frame('iphone-6.9', {
				check: { canvas: 'cream', preset: 'closer', panel: false, wordmark: false },
				typography: { headline: 'Art.', fontColor: '#16302D', fontWeight: 400 },
				layers: [
					{
						id: 'art',
						kind: 'art',
						image,
						crop: { x: 0, y: 0, width: 8, height: 8 },
						x: 400,
						y: 1200,
						scale: 40,
						sampling
					}
				]
			});
		const count = async (sampling: 'pixelated' | 'smooth') => {
			const { data, width } = await scene.pixels(compose(sampling));
			const seen = new Set<number>();
			for (let y = 1200; y < 1520; y++)
				for (let x = 400; x < 720; x++) seen.add(data[(y * width + x) * 4]);
			return seen.size;
		};
		return { pixelated: await count('pixelated'), smooth: await count('smooth') };
	});
	expect(result.pixelated).toBe(2);
	expect(result.smooth).toBeGreaterThan(10);
});

test('layers are checked against real bitmaps and named when they cannot be painted', async ({
	page
}) => {
	const failures = await page.evaluate(async () => {
		const { renderSlide } = window.CheckHarness;
		const image = scene.addressable(1320, 2868);
		const crop = { x: 0, y: 1000, width: 400, height: 300 };
		const good = { id: 'real', kind: 'source-crop', image, crop, x: 200, y: 1500, scale: 1 };
		const cases: [string, object][] = [
			['lying image size', { layers: [{ ...good, image: { ...image, naturalWidth: 1000 } }] }],
			['crop outside', { layers: [{ ...good, crop: { ...crop, x: 1200 } }] }],
			['fractional crop', { layers: [{ ...good, crop: { ...crop, width: 10.5 } }] }],
			['off the frame', { layers: [{ ...good, x: 5000 }] }],
			['over the copy', { layers: [{ ...good, y: 200 }] }],
			[
				'mark on a missing layer',
				{
					layers: [good],
					check: {
						canvas: 'teal',
						preset: 'hero',
						panel: true,
						wordmark: false,
						mark: { kind: 'ring', anchor: 'gone', rect: crop, seed: 1 }
					}
				}
			],
			[
				'mark outside its crop',
				{
					layers: [good],
					check: {
						canvas: 'teal',
						preset: 'hero',
						panel: true,
						wordmark: false,
						mark: {
							kind: 'ring',
							anchor: 'real',
							rect: { x: 900, y: 1000, width: 50, height: 50 },
							seed: 1
						}
					}
				}
			],
			[
				'mark hidden by a later layer',
				{
					layers: [good, { ...good, id: 'cover' }],
					check: {
						canvas: 'teal',
						preset: 'hero',
						panel: true,
						wordmark: false,
						mark: {
							kind: 'ring',
							anchor: 'real',
							rect: { x: 100, y: 1100, width: 50, height: 50 },
							seed: 1
						}
					}
				}
			]
		];
		const out: { name: string; message: string }[] = [];
		const canvas = document.createElement('canvas');
		await renderSlide(
			canvas,
			scene.frame('iphone-6.9', { primaryImage: image, layers: [good] }),
			0
		);
		for (const [name, overrides] of cases) {
			try {
				await renderSlide(
					canvas,
					scene.frame('iphone-6.9', { primaryImage: image, ...overrides }),
					0
				);
				out.push({ name, message: '' });
			} catch (error) {
				out.push({ name, message: String(error) });
			}
		}
		return out;
	});
	for (const { name, message } of failures) {
		expect(message, name).not.toBe('');
		expect(message.length, name).toBeGreaterThan(30);
	}
	expect(failures.find((f) => f.name === 'lying image size')!.message).toContain('project lists');
	expect(failures.find((f) => f.name === 'over the copy')!.message).toContain('overlaps the copy');
});

test('a failed font load recovers on the next render, without a reload', async ({ browser }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.route('**/*.ttf', (route) => route.abort());
	await page.goto('/');
	await page.addScriptTag({ content: harness });
	await page.addScriptTag({ content: pageHelpers });
	const first = await page.evaluate(async () => {
		const { renderSlide } = window.CheckHarness;
		const canvas = document.createElement('canvas');
		try {
			await renderSlide(canvas, scene.frame('iphone-6.9'), 0, { width: 200 });
			return 'rendered';
		} catch (error) {
			return String(error);
		}
	});
	expect(first).toContain('fonts could not be loaded');
	await page.unroute('**/*.ttf');
	const second = await page.evaluate(async () => {
		const { renderSlide } = window.CheckHarness;
		const canvas = document.createElement('canvas');
		await renderSlide(canvas, scene.frame('iphone-6.9'), 0, { width: 200 });
		const metrics = (font: string) => {
			const ctx = document.createElement('canvas').getContext('2d')!;
			ctx.font = font;
			return ctx.measureText('Fairly').width;
		};
		return {
			width: canvas.width,
			loaded: [...document.fonts]
				.filter((face) => face.status === 'loaded')
				.map((face) => `${face.family} ${face.style}`.replace(/"/g, ''))
				.sort(),
			// The real faces, not a fallback that happens to report as loaded.
			differs: metrics('italic 400 100px "Instrument Serif"') !== metrics('italic 400 100px serif')
		};
	});
	expect(second).toEqual({
		width: 200,
		loaded: ['DM Sans normal', 'Instrument Serif italic', 'Instrument Serif normal'],
		differs: true
	});
	await context.close();
});

test('real glyph metrics keep long headlines and italic overhang inside every family', async ({
	page
}) => {
	const report = await page.evaluate(async () => {
		const { DEVICES } = window.CheckHarness;
		const devices = [
			'iphone-6.9',
			'iphone-di-medium-1206x2622',
			'iphone-duo-outer-1398x2034',
			'iphone-duo-inner-2007x2853',
			'ipad-13',
			'ipad-13-2752x2064'
		] as (keyof typeof DEVICES)[];
		const headlines = [
			'*Fy fj gj.*',
			'Shared the fries?\n*Split just those.*',
			'Everyone at the table paid for exactly what they ordered tonight',
			'*Everything fifty friends fairly figured*'
		];
		const out: { where: string; left: number; right: number; bottom: number; width: number }[] = [];
		for (const device of devices) {
			const target = DEVICES[device];
			for (const headline of headlines) {
				const compose = (text: string) =>
					scene.frame(device, {
						check: { canvas: 'cream', preset: 'hero', panel: false, wordmark: false },
						typography: { headline: text, fontColor: '#16302D', fontWeight: 400 }
					});
				const blank = await scene.pixels(compose(''));
				const set = await scene.pixels(compose(headline));
				const box = scene.diffBox(blank, set);
				out.push({
					where: `${device} / ${headline}`,
					left: box.left,
					right: box.right,
					bottom: box.bottom,
					width: target.width
				});
			}
		}
		return out;
	});
	expect(report.length).toBe(24);
	for (const item of report) {
		const margin = item.width * 0.03;
		expect(item.left, item.where).toBeGreaterThan(margin);
		expect(item.right, item.where).toBeLessThan(item.width - margin);
	}
});

test('every family and layout paints opaque, exact-size frames from one renderer', async ({
	page
}) => {
	const report = await page.evaluate(async () => {
		const { DEVICES } = window.CheckHarness;
		const devices = [
			'iphone-6.9',
			'iphone-6.7',
			'iphone-di-medium-1206x2622',
			'iphone-duo-outer-1398x2034',
			'iphone-duo-inner-2007x2853',
			'iphone-duo-inner-2853x2007',
			'ipad-13',
			'ipad-13-2752x2064',
			'iphone-di-large-2868x1320'
		] as (keyof typeof DEVICES)[];
		const out: { where: string; ok: string }[] = [];
		for (const device of devices.filter((id) => id in DEVICES)) {
			const target = DEVICES[device];
			const image = scene.solid(target.width, target.height, '#EAF2F0', `solid-${device}`);
			for (const preset of ['hero', 'detail', 'editorial', 'closer']) {
				const composition = scene.frame(device, {
					primaryImage: image,
					frame: 'wireframe',
					effects: { shadow: 'soft', glow: 0 },
					check: { canvas: 'teal', preset, panel: true, wordmark: true }
				});
				try {
					const { width, height, data } = await scene.pixels(composition);
					const opaque = data.every((value, index) => index % 4 !== 3 || value === 255);
					out.push({
						where: `${device}/${preset}`,
						ok: `${width === target.width && height === target.height && opaque}`
					});
				} catch (error) {
					out.push({ where: `${device}/${preset}`, ok: String(error) });
				}
			}
		}
		return out;
	});
	expect(report.length).toBeGreaterThanOrEqual(28);
	for (const { where, ok } of report) expect(ok, where).toBe('true');
});

test('a preview is the export at a smaller size, shadows included', async ({ page }) => {
	const report = await page.evaluate(async () => {
		const { renderSlide, createDemo, STYLES } = window.CheckHarness;
		async function difference(composition: Parameters<typeof renderSlide>[1], width: number) {
			const preview = document.createElement('canvas');
			await renderSlide(preview, composition, 0, { width });
			const exported = document.createElement('canvas');
			await renderSlide(exported, composition, 0);
			const scaled = document.createElement('canvas');
			scaled.width = preview.width;
			scaled.height = preview.height;
			const ctx = scaled.getContext('2d')!;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(exported, 0, 0, scaled.width, scaled.height);
			const a = preview.getContext('2d')!.getImageData(0, 0, scaled.width, scaled.height).data;
			const b = ctx.getImageData(0, 0, scaled.width, scaled.height).data;
			let total = 0;
			for (let i = 0; i < a.length; i += 4)
				total +=
					Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
			return total / ((a.length / 4) * 3);
		}
		const check = scene.frame('iphone-6.9', {
			primaryImage: scene.solid(1320, 2868, '#F4F7F5'),
			frame: 'wireframe',
			effects: { shadow: 'dramatic', glow: 0 },
			check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: true }
		});
		const flatCheck = structuredClone(check);
		flatCheck.slides[0].effects.shadow = 'none';
		const demo = createDemo();
		demo.continuityMode = 'none';
		demo.panorama = undefined;
		demo.slides[0].effects.shadow = 'dramatic';
		const flatDemo = structuredClone(demo);
		flatDemo.slides[0].effects.shadow = 'none';
		return {
			styles: STYLES.map((style) => style.id),
			check: await difference(check, 396),
			checkFlat: await difference(flatCheck, 396),
			classic: await difference(demo, 396),
			classicFlat: await difference(flatDemo, 396)
		};
	});
	expect(report.styles).toContain('the-check');
	expect(report.check).toBeLessThan(3);
	// Turning the shadow on must not add meaningful error: it scales with the frame.
	expect(report.check).toBeLessThan(report.checkFlat * 1.25 + 0.2);
	expect(report.classic).toBeLessThan(report.classicFlat * 1.25 + 0.2);
});

test('a connected pair in The Check reconstructs its world on every family', async ({ page }) => {
	const results = await page.evaluate(async () => {
		const { applyCheckStyle, createDemo, DEVICES, renderPanoramaPair, renderSlide } =
			window.CheckHarness;
		const out = [];
		for (const device of [
			'iphone-6.9',
			'iphone-duo-outer-1398x2034',
			'ipad-13'
		] as (keyof typeof DEVICES)[]) {
			const demo = createDemo();
			demo.panorama = { ...demo.panorama!, leftId: demo.slides[3].id, rightId: demo.slides[4].id };
			demo.device = device;
			demo.slides.forEach((slide) => {
				slide.device = device;
			});
			const composition = applyCheckStyle(demo);
			const target = DEVICES[device];
			const sourceImage = scene.addressable(target.width, target.height);
			composition.panorama!.image = sourceImage;
			// A layer overhanging its frame is clipped there, so it cannot cross the seam.
			composition.slides[3].layers = [
				{
					id: 'overhang',
					kind: 'source-crop',
					image: sourceImage,
					crop: { x: 0, y: target.height - 300, width: 400, height: 200 },
					x: target.width - 200,
					y: target.height - 400,
					scale: 1
				}
			];
			const left = document.createElement('canvas');
			const right = document.createElement('canvas');
			const world = document.createElement('canvas');
			await renderSlide(left, composition, 3);
			await renderSlide(right, composition, 4);
			await renderPanoramaPair(world, composition, 3);
			const width = left.width;
			const l = left.getContext('2d')!.getImageData(0, 0, width, left.height).data;
			const r = right.getContext('2d')!.getImageData(0, 0, width, right.height).data;
			const w = world.getContext('2d')!.getImageData(0, 0, width * 2, world.height).data;
			let differing = 0;
			for (let y = 0; y < left.height; y++) {
				for (let x = 0; x < width * 2; x++) {
					const panel = x < width ? l : r;
					const local = (y * width + (x % width)) * 4;
					const global = (y * width * 2 + x) * 4;
					for (let channel = 0; channel < 4; channel++)
						if (panel[local + channel] !== w[global + channel]) differing++;
				}
			}
			out.push({ device, differing, size: [left.width, left.height, target.width, target.height] });
		}
		return out;
	});
	for (const result of results) {
		expect(result.differing, result.device).toBe(0);
		expect(result.size[0]).toBe(result.size[2]);
		expect(result.size[1]).toBe(result.size[3]);
	}
});

test('italic markup is never drawn by a style without an accent, and stays stored', async ({
	page
}) => {
	const report = await page.evaluate(async () => {
		const { createDemo, STYLES } = window.CheckHarness;
		const out: { style: string; differs: number; stored: string }[] = [];
		for (const style of STYLES.filter(
			(item) => item.id !== 'table-linen' && item.id !== 'the-check'
		)) {
			const base = createDemo();
			base.continuityMode = 'none';
			base.panorama = undefined;
			base.style = style.id;
			const marked = structuredClone(base);
			marked.slides[0].typography.headline = 'One bill.\n*Fair shares.*';
			marked.slides[0].typography.subtitle = 'Keep *this* plain.';
			const plain = structuredClone(base);
			plain.slides[0].typography.headline = 'One bill.\nFair shares.';
			plain.slides[0].typography.subtitle = 'Keep this plain.';
			const a = await scene.pixels(marked, 0, { width: 396 });
			const b = await scene.pixels(plain, 0, { width: 396 });
			out.push({
				style: style.id,
				differs: scene.diffBox(a, b).count,
				stored: marked.slides[0].typography.headline
			});
		}
		return out;
	});
	expect(report.length).toBeGreaterThanOrEqual(5);
	for (const { style, differs, stored } of report) {
		expect(differs, style).toBe(0);
		expect(stored).toContain('*Fair shares.*');
	}
});

test('sample styles never draw copy, pagination or a footer over the phone', async ({ page }) => {
	const report = await page.evaluate(async () => {
		const { createDemo, STYLES } = window.CheckHarness;
		const out: { where: string; touched: number; rendered: number }[] = [];
		const magenta = scene.solid(1320, 2868, '#FF00FF', 'magenta');
		const variants: { name: string; device: keyof typeof Harness.DEVICES; patch: object }[] = [
			{ name: 'default', device: 'iphone-6.9', patch: {} },
			{ name: 'large phone', device: 'iphone-6.9', patch: { scale: 1.4 } },
			{ name: 'text below', device: 'iphone-6.9', patch: { layout: 'text-below', tilt: 0 } },
			{ name: 'tablet', device: 'ipad-13', patch: {} }
		];
		for (const style of STYLES.filter((item) => !['table-linen', 'the-check'].includes(item.id))) {
			for (const variant of variants) {
				const base = createDemo();
				base.continuityMode = 'none';
				base.panorama = undefined;
				base.style = style.id;
				base.device = variant.device;
				base.slides.forEach((slide) => {
					slide.device = variant.device;
					slide.primaryImage = magenta;
					slide.effects = { shadow: 'none', glow: 0 };
					Object.assign(slide, variant.patch);
				});
				// The badge reserves copy space, so both renders keep it and the phone stays put.
				const withCopy = await scene.pixels(base, 0, { width: 660 });
				const bare = structuredClone(base);
				bare.slides[0].typography.headline = '';
				bare.slides[0].typography.subtitle = '';
				const noCopy = await scene.pixels(bare, 0, { width: 660 });
				let touched = 0;
				let phone = 0;
				for (let i = 0; i < noCopy.data.length; i += 4) {
					const isUi = noCopy.data[i] > 240 && noCopy.data[i + 1] < 16 && noCopy.data[i + 2] > 240;
					if (isUi) {
						phone++;
						if (
							withCopy.data[i] !== noCopy.data[i] ||
							withCopy.data[i + 1] !== noCopy.data[i + 1] ||
							withCopy.data[i + 2] !== noCopy.data[i + 2]
						)
							touched++;
					}
				}
				out.push({ where: `${style.id}/${variant.name}`, touched, rendered: phone });
			}
		}
		return out;
	});
	expect(report.length).toBe(20);
	for (const { where, touched, rendered } of report) {
		expect(rendered, where).toBeGreaterThan(1000);
		expect(touched, where).toBe(0);
	}
});

test('measured hardware is refused off its class, and The Check never draws any', async ({
	page
}) => {
	const report = await page.evaluate(async () => {
		const { tableLinenFromManifest, renderSlide } = window.CheckHarness;
		const image = scene.solid(1320, 2868, '#FFFFFF', 'white');
		const project = tableLinenFromManifest(
			{
				version: 1,
				name: 'Hardware',
				style: 'table-linen',
				phone: { hardware: 'iphone-17-pro-max', dynamicIsland: 'draw', hardwareButtons: true },
				slides: [
					{ id: 'one', image: 'capture', theme: 'teal', headline: ['One phone.'], subtitle: [] }
				]
			},
			{ capture: image }
		);
		const canvas = document.createElement('canvas');
		await renderSlide(canvas, project, 0, { width: 200 });
		const messages: Record<string, string> = {};
		for (const device of [
			'ipad-13',
			'iphone-duo-outer-1398x2034',
			'iphone-duo-inner-2007x2853'
		] as (keyof typeof Harness.DEVICES)[]) {
			const moved = structuredClone(project);
			moved.device = device;
			moved.slides.forEach((slide) => {
				slide.device = device;
			});
			try {
				await renderSlide(canvas, moved, 0, { width: 200 });
				messages[device] = '';
			} catch (error) {
				messages[device] = String(error);
			}
		}
		// Whatever a stale frame field says, The Check's panel has no hardware.
		const frame = (style: string) =>
			scene.frame('iphone-6.9', {
				primaryImage: image,
				frame: style,
				check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: false }
			});
		const edge = await scene.pixels(frame('wireframe'));
		const bezel = await scene.pixels(frame('bezel'));
		const clay = await scene.pixels(frame('clay'));
		return {
			messages,
			bezelDiff: scene.diffBox(edge, bezel).count,
			clayDiff: scene.diffBox(edge, clay).count
		};
	});
	for (const [device, message] of Object.entries(report.messages)) {
		expect(message, device).toContain('Simple frame');
		expect(message, device).toContain('iPhone 17 Pro Max');
	}
	expect(report.bezelDiff).toBe(0);
	expect(report.clayDiff).toBe(0);
});

test('a slow layer cannot overwrite a newer render', async ({ page }) => {
	await page.route('**/slow-art.png', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 200));
		await route.fulfill({ path: path.resolve('static/brand/billy.png'), contentType: 'image/png' });
	});
	const differences = await page.evaluate(async () => {
		const { renderSlide } = window.CheckHarness;
		const old = scene.frame('iphone-6.9', {
			typography: { headline: 'Old.', fontColor: '#FBF6EF', fontWeight: 400 },
			check: { canvas: 'gold', preset: 'closer', panel: false, wordmark: false },
			layers: [
				{
					id: 'art',
					kind: 'art',
					image: { id: 'slow', blobUrl: '/slow-art.png', naturalWidth: 1024, naturalHeight: 1536 },
					crop: { x: 230, y: 375, width: 566, height: 786 },
					x: 300,
					y: 900,
					scale: 1
				}
			]
		});
		const latest = scene.frame('iphone-6.9', {
			typography: { headline: 'New.', fontColor: '#FBF6EF', fontWeight: 400 },
			check: { canvas: 'teal', preset: 'closer', panel: false, wordmark: false }
		});
		const canvas = document.createElement('canvas');
		const expected = document.createElement('canvas');
		await Promise.all([
			renderSlide(canvas, old, 0, { width: 330 }),
			renderSlide(canvas, latest, 0, { width: 330 })
		]);
		await renderSlide(expected, latest, 0, { width: 330 });
		const a = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		const b = expected.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
		let count = 0;
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
		return count;
	});
	expect(differences).toBe(0);
});

test('a pen mark leaves what it marks untouched and repeats exactly', async ({ page }) => {
	const report = await page.evaluate(async () => {
		const image = scene.addressable(1320, 2868);
		const crop = { x: 80, y: 1519, width: 1060, height: 1000 };
		const rect = { x: 896, y: 1606, width: 220, height: 96 };
		const layer = { id: 'shares', kind: 'source-crop', image, crop, x: 30, y: 1640, scale: 1 };
		const compose = (mark?: object) =>
			scene.frame('iphone-6.9', {
				primaryImage: image,
				layers: [layer],
				check: {
					canvas: 'teal',
					preset: 'hero',
					panel: true,
					wordmark: false,
					...(mark ? { mark } : {})
				}
			});
		const none = await scene.pixels(compose());
		const ring = { kind: 'ring', anchor: 'shares', rect, seed: 11 };
		const marked = await scene.pixels(compose(ring));
		const again = await scene.pixels(compose(ring));
		const other = await scene.pixels(compose({ ...ring, seed: 12 }));
		const box = scene.diffBox(none, marked);
		// The number's own rectangle in output pixels.
		const left = 30 + (rect.x - crop.x);
		const top = 1640 + (rect.y - crop.y);
		let inside = 0;
		for (let y = top; y < top + rect.height; y++)
			for (let x = left; x < left + rect.width; x++) {
				const i = (y * none.width + x) * 4;
				if (none.data[i] !== marked.data[i] || none.data[i + 1] !== marked.data[i + 1]) inside++;
			}
		return {
			changed: box.count,
			inside,
			wrapsLeft: box.left < left,
			wrapsRight: box.right > left + rect.width,
			wrapsTop: box.top < top,
			wrapsBottom: box.bottom > top + rect.height,
			repeat: scene.diffBox(marked, again).count,
			seedDiffers: scene.diffBox(marked, other).count > 0
		};
	});
	expect(report.changed).toBeGreaterThan(1000);
	expect(report.inside).toBe(0);
	expect(report).toMatchObject({
		wrapsLeft: true,
		wrapsRight: true,
		wrapsTop: true,
		wrapsBottom: true,
		repeat: 0,
		seedDiffers: true
	});
});

test('copy has the same gray edges at every type size, on the opaque frame buffer', async ({
	page
}) => {
	const spread = await page.evaluate(async () => {
		// Below the browser's path size limit an opaque canvas would give this text LCD edges.
		const measure = async (fontScale: number, width?: number) => {
			const shot = await scene.pixels(
				scene.frame('iphone-6.9', {
					fontScale,
					check: { canvas: 'teal', preset: 'hero', panel: false, wordmark: false }
				}),
				0,
				width ? { width } : {}
			);
			const ink = [0xfb, 0xf6, 0xef];
			const spreads: number[] = [];
			const scale = shot.width / 1320;
			for (let y = Math.round(140 * scale); y < Math.round(320 * scale); y += 3) {
				const row = y * shot.width * 4;
				const bg = [shot.data[row + 8], shot.data[row + 9], shot.data[row + 10]];
				for (let x = 4; x < shot.width - 4; x++) {
					const i = row + x * 4;
					const cover = [0, 1, 2].map((c) => (shot.data[i + c] - bg[c]) / (ink[c] - bg[c]));
					const mean = (cover[0] + cover[1] + cover[2]) / 3;
					if (mean > 0.2 && mean < 0.8) spreads.push(Math.max(...cover) - Math.min(...cover));
				}
			}
			spreads.sort((a, b) => a - b);
			return { edges: spreads.length, median: spreads[Math.floor(spreads.length / 2)] };
		};
		return [
			await measure(1, 660),
			await measure(1.12, 660),
			await measure(0.8),
			await measure(1.12)
		];
	});
	for (const { edges, median } of spread) {
		expect(edges).toBeGreaterThan(100);
		// LCD edges measure about 0.4 here. Cloth texture adds a little noise at full size.
		expect(median).toBeLessThan(0.08);
	}
});

test('canvas texture stays invisible at store size and leaves the color alone', async ({
	page
}) => {
	const report = await page.evaluate(async () => {
		const { renderSlide } = window.CheckHarness;
		const out: Record<string, { rowSpread: number; meanShift: number }> = {};
		for (const canvasName of ['teal', 'cream', 'gold'] as const) {
			const composition = scene.frame('iphone-6.9', {
				typography: { headline: '', fontColor: '#16302D', fontWeight: 400 },
				check: { canvas: canvasName, preset: 'hero', panel: false, wordmark: false }
			});
			const full = document.createElement('canvas');
			await renderSlide(full, composition, 0);
			const noTexture = document.createElement('canvas');
			await renderSlide(noTexture, composition, 0, { width: 396 });
			const small = document.createElement('canvas');
			small.width = 131;
			small.height = 285;
			const ctx = small.getContext('2d')!;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(full, 0, 0, small.width, small.height);
			const data = ctx.getImageData(0, 0, small.width, small.height).data;
			let rowSpread = 0;
			for (let y = 0; y < small.height; y++) {
				const row = [];
				for (let x = 0; x < small.width; x++) row.push(data[(y * small.width + x) * 4 + 1]);
				rowSpread = Math.max(rowSpread, Math.max(...row) - Math.min(...row));
			}
			const flat = noTexture.getContext('2d')!.getImageData(0, 0, noTexture.width, 1).data[1];
			const textured = full.getContext('2d')!.getImageData(0, 0, full.width, 2);
			let mean = 0;
			for (let i = 1; i < textured.data.length; i += 4) mean += textured.data[i];
			mean /= textured.data.length / 4;
			out[canvasName] = { rowSpread, meanShift: Math.abs(mean - flat) };
		}
		return out;
	});
	for (const [name, { rowSpread, meanShift }] of Object.entries(report)) {
		expect(rowSpread, name).toBeLessThanOrEqual(4);
		expect(meanShift, name).toBeLessThanOrEqual(2);
	}
});

test('bundled artwork stays inside its positioned source crop', async ({ page }) => {
	const painted = await page.evaluate(async () => {
		const billy = {
			id: 'brand-billy',
			blobUrl: '/brand/billy.png',
			naturalWidth: 1024,
			naturalHeight: 1536
		};
		const compose = (layers: object[]) =>
			scene.frame('iphone-6.9', {
				check: { canvas: 'gold', preset: 'closer', panel: false, wordmark: false },
				// Isolate artwork geometry from the independent text-raster checks above.
				typography: { headline: '', subtitle: '', fontColor: '#16302D', fontWeight: 400 },
				layers
			});
		const without = await scene.pixels(compose([]));
		const withArt = await scene.pixels(
			compose([
				{
					id: 'billy',
					kind: 'art',
					image: billy,
					crop: { x: 230, y: 375, width: 566, height: 786 },
					x: 377,
					y: 1000,
					scale: 1
				}
			])
		);
		return scene.diffBox(without, withArt);
	});
	expect(painted.count).toBeGreaterThan(100_000);
	expect(painted).toMatchObject({ left: 377, top: 1000, right: 942, bottom: 1785 });
});

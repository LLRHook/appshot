import { expect, test } from '@playwright/test';
import { build } from 'vite';
import path from 'node:path';
import type * as RendererHarness from './renderer-harness';

declare global {
	interface Window {
		AppshotRendererTests: typeof RendererHarness;
	}
}

let rendererBundle: string;
test.beforeAll(async () => {
	const bundle = await build({
		configFile: false,
		logLevel: 'silent',
		build: {
			write: false,
			lib: {
				entry: path.resolve('e2e/renderer-harness.ts'),
				name: 'AppshotRendererTests',
				formats: ['iife']
			}
		}
	});
	const result = Array.isArray(bundle) ? bundle[0] : bundle;
	if (!('output' in result)) throw new Error('Could not build renderer test harness.');
	const chunk = result.output.find((entry) => entry.type === 'chunk');
	if (!chunk) throw new Error('Renderer test harness produced no JavaScript.');
	rendererBundle = chunk.code;
});

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.addScriptTag({ content: rendererBundle });
});

test('exported adjacent panels exactly reconstruct their canonical panorama', async ({ page }) => {
	test.setTimeout(90_000);
	const results = await page.evaluate(async () => {
		const { createDemo, STYLES, renderSlide, renderPanoramaPair, exportSlide } =
			window.AppshotRendererTests;
		const scenarios = STYLES.map((style) => ({
			style,
			device: 'iphone-6.9' as const,
			offset: 0,
			tilt: -14,
			scale: 1
		}));
		const all = [
			...scenarios,
			{ style: STYLES[0], device: 'iphone-6.7' as const, offset: 173, tilt: -27, scale: 1.1 },
			{ style: STYLES[0], device: 'ipad-13' as const, offset: -212, tilt: 18, scale: 0.83 }
		];
		const results = [];
		for (const scenario of all) {
			const composition = createDemo();
			composition.style = scenario.style.id;
			composition.accent = scenario.style.accent;
			composition.device = scenario.device;
			Object.assign(composition.panorama!, {
				offset: scenario.offset,
				tilt: scenario.tilt,
				scale: scenario.scale
			});
			composition.slides.forEach((slide) => {
				slide.background.colors = [scenario.style.background];
				slide.typography.fontColor = scenario.style.foreground;
			});
			const left = document.createElement('canvas');
			const right = document.createElement('canvas');
			const world = document.createElement('canvas');
			await renderSlide(left, composition, 0);
			await renderSlide(right, composition, 1);
			await renderPanoramaPair(world, composition, 0);
			const width = left.width;
			const l = left.getContext('2d')!.getImageData(0, 0, width, left.height).data;
			const r = right.getContext('2d')!.getImageData(0, 0, width, right.height).data;
			const w = world.getContext('2d')!.getImageData(0, 0, width * 2, world.height).data;
			let differingChannels = 0;
			for (let y = 0; y < left.height; y++) {
				for (let x = 0; x < width * 2; x++) {
					const panel = x < width ? l : r;
					const local = (y * width + (x % width)) * 4;
					const global = (y * width * 2 + x) * 4;
					for (let channel = 0; channel < 4; channel++) {
						if (panel[local + channel] !== w[global + channel]) differingChannels++;
					}
				}
			}
			const png = await exportSlide(composition, 0);
			const bitmap = await createImageBitmap(png);
			results.push({
				style: scenario.style.id,
				device: scenario.device,
				differingChannels,
				dimensions: [left.width, left.height],
				pngDimensions: [bitmap.width, bitmap.height]
			});
			bitmap.close();
			left.width = right.width = world.width = 0;
		}
		return results;
	});
	const dimensions = {
		'iphone-6.9': [1320, 2868],
		'iphone-6.7': [1284, 2778],
		'ipad-13': [2064, 2752]
	};
	for (const result of results) {
		expect(result.differingChannels, `${result.style} / ${result.device} seam`).toBe(0);
		expect(result.dimensions).toEqual(dimensions[result.device]);
		expect(result.pngDimensions).toEqual(dimensions[result.device]);
	}
});

test('a slow earlier screenshot cannot overwrite the latest preview', async ({ page }) => {
	await page.route('**/slow-screen.png', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 150));
		await route.fulfill({ path: path.resolve('static/demo/home.png'), contentType: 'image/png' });
	});
	const matchesLatest = await page.evaluate(async () => {
		const { createDemo, renderSlide } = window.AppshotRendererTests;
		const old = createDemo();
		old.slides[2].primaryImage!.blobUrl = '/slow-screen.png';
		old.slides[2].typography.headline = 'Old preview';
		const latest = createDemo();
		latest.slides[2].typography.headline = 'The newest edit';
		const canvas = document.createElement('canvas');
		const expected = document.createElement('canvas');
		await Promise.all([
			renderSlide(canvas, old, 2, { width: 330 }),
			renderSlide(canvas, latest, 2, { width: 330 })
		]);
		await renderSlide(expected, latest, 2, { width: 330 });
		// Compare the headline region: image resampling/shadow kernels can vary by
		// a few channel levels between a cold first draw and a cached draw.
		const actualPixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, 200).data;
		const expectedPixels = expected.getContext('2d')!.getImageData(0, 0, expected.width, 200).data;
		let differences = 0,
			maxDelta = 0;
		for (let i = 0; i < actualPixels.length; i++) {
			const delta = Math.abs(actualPixels[i] - expectedPixels[i]);
			if (delta) differences++;
			maxDelta = Math.max(maxDelta, delta);
		}
		return { differences, maxDelta };
	});
	expect(matchesLatest).toEqual({ differences: 0, maxDelta: 0 });
});

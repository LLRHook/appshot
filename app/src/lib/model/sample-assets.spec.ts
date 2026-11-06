import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, readPngStructure } from '../render/png';
import { isBundledSampleUrl, SAMPLE_MARK_URL } from './image';
import { createDemo } from './studio';

/** The committed sample files, read as a browser would be given them. */
const FOLDER = path.resolve('static/sample');
const SCREENS = ['today', 'plant', 'schedule', 'journal', 'insights'];
const file = (name: string) => new Uint8Array(readFileSync(path.join(FOLDER, name)));

/** Tests paint this box of the mark and expect its ink at each edge. */
const MARK_INK = { x: 85, y: 89, width: 430, height: 511 };

describe('the bundled sample files', () => {
	it('are exactly what the app allows, and nothing else', () => {
		const names = readdirSync(FOLDER)
			.filter((name) => !name.startsWith('.'))
			.sort();
		expect(names).toEqual(
			[...SCREENS.map((name) => `${name}.png`), 'README.md', 'mark.png'].sort()
		);
		for (const name of names.filter((item) => item.endsWith('.png')))
			expect(isBundledSampleUrl(`/sample/${name}`), name).toBe(true);
		expect(SAMPLE_MARK_URL).toBe('/sample/mark.png');
	});

	it('say they are generated, fictional and not store-ready', () => {
		const readme = readFileSync(path.join(FOLDER, 'README.md'), 'utf8');
		expect(readme).toMatch(/generate\.mjs/);
		expect(readme).toMatch(/fictional/);
		expect(readme).toMatch(/not store-ready/);
	});

	it.each(SCREENS)('has %s as an opaque native screen with no metadata', async (name) => {
		const bytes = file(`${name}.png`);
		const structure = readPngStructure(bytes);
		expect(structure).toMatchObject({ width: 1320, height: 2868, colorType: 2, bitDepth: 8 });
		expect(structure.transparency).toBe(false);
		expect(new Set(structure.chunks.map((chunk) => chunk.type))).toEqual(
			new Set(['IHDR', 'IDAT', 'IEND'])
		);
	});

	it('has a mark with real transparency, no metadata, and the ink box tests rely on', async () => {
		const bytes = file('mark.png');
		const structure = readPngStructure(bytes);
		expect(structure).toMatchObject({ width: 640, height: 640, colorType: 6, bitDepth: 8 });
		expect(new Set(structure.chunks.map((chunk) => chunk.type))).toEqual(
			new Set(['IHDR', 'IDAT', 'IEND'])
		);
		const { pixels } = await decodePng(bytes);
		let [left, top, right, bottom, ink] = [640, 640, -1, -1, 0];
		for (let y = 0; y < 640; y++)
			for (let x = 0; x < 640; x++) {
				if (!pixels[(y * 640 + x) * 4 + 3]) continue;
				ink++;
				left = Math.min(left, x);
				right = Math.max(right, x);
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
			}
		expect({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }).toEqual(
			MARK_INK
		);
		expect(ink).toBeGreaterThan(100_000);
		expect(pixels[3]).toBe(0);
	});

	it('are what the first-run campaign shows', () => {
		const demo = createDemo();
		expect(demo.slides.map((slide) => slide.primaryImage?.blobUrl)).toEqual(
			SCREENS.map((name) => `/sample/${name}.png`)
		);
		expect(demo.panorama?.image.blobUrl).toBe('/sample/plant.png');
		expect(demo.slides.map((slide) => slide.badge).every(Boolean)).toBe(true);
		expect(demo.slides.map((slide) => slide.tilt)).toEqual([0, 0, 7, -6, 0]);
		const copy = demo.slides.flatMap((slide) => [
			slide.typography.subtitle ?? '',
			slide.badge ?? ''
		]);
		expect(copy.join(' ')).toMatch(/made-up/);
	});
});

import { describe, expect, it } from 'vitest';
import { tableLinenFromManifest } from './linen';
import { parseProject } from './project';
import { computePanoramaGeometry } from '../stitch/panorama';
import type { ImageRef } from './types';

const images: Record<string, ImageRef> = {
	'capture.png': {
		id: 'authentic-capture',
		blobUrl: '/demo/home.png',
		naturalWidth: 1320,
		naturalHeight: 2868
	}
};

function manifest() {
	return {
		version: 1,
		name: 'At the table',
		style: 'table-linen',
		phone: { top: 760, bottom: 2740, centerX: 660, shell: 24, radius: 60 },
		slides: ['first', 'second', 'third'].map((id) => ({
			id,
			image: 'capture.png',
			theme: 'teal',
			headline: ['One bill.', '*Fair shares.*'],
			subtitle: ['Every detail stays clear.']
		})),
		panorama: { enabled: true, leftId: 'first', rightId: 'second', image: 'capture.png' }
	};
}

describe('native Table Linen contract', () => {
	it('round-trips native text, raw images and the primary first-two pair', () => {
		const project = tableLinenFromManifest(manifest(), images);
		const reopened = parseProject(JSON.stringify(project));
		expect(reopened).toEqual(project);
		expect(reopened.style).toBe('table-linen');
		expect(reopened.slides[0].typography.headline).toBe('One bill.\n*Fair shares.*');
		expect(reopened.slides[0].linen?.colors.canvas).toBe('#2A736E');
		expect(reopened.panorama).toMatchObject({
			leftId: reopened.slides[0].id,
			rightId: reopened.slides[1].id,
			image: images['capture.png']
		});
		expect(reopened.slides.every((slide) => slide.primaryImage?.blobUrl === '/demo/home.png')).toBe(
			true
		);
	});

	it('centers a shared phone in the two-panel world when the manifest only gives a single-panel center', () => {
		const project = tableLinenFromManifest(manifest(), images);
		const left = computePanoramaGeometry(project, 0)!;
		const right = computePanoramaGeometry(project, 1)!;
		expect(left.phone.centerX).toBe(1320);
		expect(left.phone).toEqual(right.phone);
		expect(right.viewportX).toBe(1320);
		const screenWidth = left.phone.width - 48;
		const screenHeight = left.phone.height - 48;
		expect(screenWidth / screenHeight).toBeCloseTo(1320 / 2868, 10);
	});

	it('resolves global and per-panel overrides without spreading one panel’s palette to its neighbor', () => {
		const source = manifest();
		Object.assign(source, { colors: { subtitle: '#123456' }, layout: { headlineTop: 260 } });
		Object.assign(source.slides[1], {
			theme: 'cream',
			colors: { subtitle: '#654321' },
			layout: { headlineTop: 280 },
			band: false
		});
		Object.assign(source.panorama, { phone: { centerX: 1100, top: 800 } });
		const project = tableLinenFromManifest(source, images);
		expect(project.slides[0].linen?.colors.subtitle).toBe('#123456');
		expect(project.slides[1].linen?.colors.subtitle).toBe('#654321');
		expect(project.slides[1].linen?.colors.canvas).toBe('#FBF6EF');
		expect(project.slides[1].linen?.band).toBe(false);
		expect(project.slides[0].linen?.layout.headlineTop).toBe(260);
		expect(project.slides[1].linen?.layout.headlineTop).toBe(280);
		expect(project.panorama?.linenPhone).toMatchObject({ centerX: 1100, top: 800 });
	});

	it('keeps the authored rotation in canonical shared geometry and portable state', () => {
		const source = manifest();
		Object.assign(source.panorama, {
			phone: { top: 751, bottom: 2803, maxWidth: 944, centerX: 1152, rotation: -4.8 }
		});
		const project = parseProject(JSON.stringify(tableLinenFromManifest(source, images)));
		expect(project.panorama?.linenPhone?.rotation).toBe(-4.8);
		const geometry = computePanoramaGeometry(project, 0)!.phone;
		expect(geometry.rotation).toBeCloseTo((-4.8 * Math.PI) / 180, 12);
		expect(geometry.centerX).toBe(1152);
		expect(geometry.centerY).toBeCloseTo(1776.5272727272727, 10);
		expect(geometry.width).toBe(992);
		expect(geometry.height).toBeCloseTo(2099.0545454545454, 10);
		expect(computePanoramaGeometry(project, 0)?.phone).toEqual(
			computePanoramaGeometry(project, 1)?.phone
		);
	});

	for (const [name, modify] of [
		[
			'a nonadjacent pair',
			(value: ReturnType<typeof manifest>) => (value.panorama.rightId = 'third')
		],
		[
			'an unknown image',
			(value: ReturnType<typeof manifest>) => (value.slides[0].image = 'missing.png')
		],
		['duplicate IDs', (value: ReturnType<typeof manifest>) => (value.slides[1].id = 'first')],
		[
			'an invalid theme',
			(value: ReturnType<typeof manifest>) => (value.slides[0].theme = 'unknown')
		],
		[
			'unbalanced emphasis',
			(value: ReturnType<typeof manifest>) => (value.slides[0].headline = ['*Unclosed emphasis'])
		],
		['inverted phone bounds', (value: ReturnType<typeof manifest>) => (value.phone.top = 2800)],
		[
			'a nonfinite phone coordinate',
			(value: ReturnType<typeof manifest>) => (value.phone.centerX = Infinity)
		],
		[
			'an unsafe CSS color',
			(value: ReturnType<typeof manifest>) =>
				Object.assign(value.slides[0], { colors: { canvas: 'url(https://example.com)' } })
		]
	] as const) {
		it(`rejects ${name} before it becomes a portable project`, () => {
			const source = manifest();
			modify(source);
			expect(() => tableLinenFromManifest(source, images)).toThrow();
		});
	}

	for (const [name, patch] of [
		['remote image URL', { blobUrl: 'https://example.com/capture.png' }],
		['bogus embedded image', { blobUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAA' }],
		['image above the pixel limit', { naturalWidth: 8000, naturalHeight: 8000 }]
	] as const) {
		it(`rejects a ${name} at conversion rather than losing it during save`, () => {
			const invalid = { 'capture.png': { ...images['capture.png'], ...patch } };
			expect(() => tableLinenFromManifest(manifest(), invalid)).toThrow();
		});
	}

	it('rejects a slide ID too long for portable projects', () => {
		const source = manifest();
		source.slides[2].id = 'a'.repeat(201);
		expect(() => tableLinenFromManifest(source, images)).toThrow();
	});

	it('rejects an aggregate project above 60 MB even when each image is within its limit', () => {
		const source = manifest();
		source.slides = Array.from({ length: 8 }, (_, index) => ({
			...source.slides[0],
			id: `panel-${index}`
		}));
		Object.assign(source.panorama, { enabled: false });
		const largeImage = {
			...images['capture.png'],
			blobUrl: `data:image/png;base64,iVBORw0KGgoAAAAA${'A'.repeat(8 * 1024 * 1024)}`
		};
		expect(() => tableLinenFromManifest(source, { 'capture.png': largeImage })).toThrow(
			'Keep it under 60 MB'
		);
	});

	it('preserves the explicit iPhone hardware and duplicate-island preference', () => {
		const source = manifest();
		Object.assign(source.phone, {
			hardware: 'iphone-17-pro-max',
			dynamicIsland: 'draw',
			hardwareButtons: true
		});
		const project = parseProject(JSON.stringify(tableLinenFromManifest(source, images)));
		expect(project.panorama?.linenPhone).toMatchObject({
			hardware: 'iphone-17-pro-max',
			dynamicIsland: 'draw',
			hardwareButtons: true
		});
		expect(project.slides[2].linen?.phone).toMatchObject({
			hardware: 'iphone-17-pro-max',
			dynamicIsland: 'draw',
			hardwareButtons: true
		});
	});
});

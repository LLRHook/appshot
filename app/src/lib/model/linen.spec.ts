import { describe, expect, it } from 'vitest';
import {
	LINEN_LAYOUT,
	LINEN_PALETTES,
	LINEN_PHONE,
	LINEN_SHARED_PHONE,
	defaultLinenTheme,
	linenDefaultsForSlide,
	linenHeadlineSpans,
	linenLines,
	linenPhoneBox,
	linenPhoneFitError,
	linenScale,
	linenShadowCss,
	parseLinenPhone,
	parseLinenSettings,
	parseShadowColor,
	tableLinenFromManifest
} from './linen';
import { parseProject } from './project';
import { createDemo, createSlide } from './studio';
import { computePanoramaGeometry } from '../stitch/panorama';
import { DEVICES } from './devices';
import type { ImageRef } from './types';

const capture: ImageRef = {
	id: 'completed-split',
	blobUrl: '/demo/split.png',
	naturalWidth: 1320,
	naturalHeight: 2868
};
const images = { 'captures/02-completed-split.png': capture, 'captures/03.png': capture };

/** Geometry of the finalized connected-primary Billington manifest. */
const billington = () => ({
	version: 1,
	status: 'final',
	name: 'Billington',
	style: 'table-linen',
	phone: {
		mode: 'full',
		top: 760,
		bottom: 2740,
		maxWidth: 1038,
		centerX: 660,
		shell: 24,
		radius: 60
	},
	slides: [
		{
			id: 'shared-bill',
			label: 'Shared bill',
			image: 'captures/02-completed-split.png',
			theme: 'teal',
			headline: ['Dinner for four.', '*One shared bill.*'],
			subtitle: ['One dinner bill.', 'Each person pays their share.']
		},
		{
			id: 'fair-shares',
			image: 'captures/02-completed-split.png',
			theme: 'teal',
			headline: ['Four fair shares.', '*Exactly what’s owed.*'],
			subtitle: ['Each person’s share, based on', 'what they actually had.']
		},
		{
			id: 'person-detail',
			image: 'captures/03.png',
			theme: 'cream',
			headline: ['Leo’s share,', '*line by line.*'],
			subtitle: []
		}
	],
	panorama: {
		enabled: true,
		primary: true,
		leftId: 'shared-bill',
		rightId: 'fair-shares',
		image: 'captures/02-completed-split.png',
		phone: { mode: 'full', top: 751, bottom: 2803, maxWidth: 944, centerX: 1152, rotation: -4.8 },
		seamClearance: [{ label: 'status bar', sourceRow: 97, min: 997, max: 1020 }]
	}
});

describe('Table Linen phone geometry', () => {
	it('fits the whole capture between top and bottom at the reference size', () => {
		const box = linenPhoneBox(LINEN_PHONE, capture, linenScale(1320, 2868));
		const expectedWidth = Math.min(1038, (2740 - 760) * (1320 / 2868));
		expect(box.screenWidth).toBeCloseTo(expectedWidth, 10);
		expect(box.screenHeight).toBeCloseTo(2740 - 760, 10);
		expect(box.centerX).toBe(660);
		expect(box.centerY).toBeCloseTo(760 + (2740 - 760) / 2, 10);
		expect(box.shellWidth).toBeCloseTo(expectedWidth + 48, 10);
		expect(box.bounds.top).toBeCloseTo(760 - 24, 10);
		expect(box.bounds.bottom).toBeCloseTo(2740 + 24, 10);
		expect(linenPhoneFitError(box, LINEN_PHONE, 1320, 2868)).toBeNull();
	});

	it('rotates shell and screen together about the screen centre, matching the source renderer', () => {
		const phone = {
			...LINEN_SHARED_PHONE,
			top: 751,
			bottom: 2803,
			maxWidth: 944,
			centerX: 1152,
			rotation: -4.8
		};
		const box = linenPhoneBox(phone, capture, linenScale(1320, 2868));
		const screenWidth = Math.min(944, (2803 - 751) * (1320 / 2868));
		const screenHeight = screenWidth / (1320 / 2868);
		const theta = (-4.8 * Math.PI) / 180;
		const half = { w: (screenWidth + 48) / 2, h: (screenHeight + 48) / 2 };
		const right = Math.max(
			...[
				[-half.w, -half.h],
				[half.w, -half.h],
				[half.w, half.h],
				[-half.w, half.h]
			].map(([x, y]) => 1152 + x * Math.cos(theta) - y * Math.sin(theta))
		);
		expect(box.rotation).toBeCloseTo(theta, 12);
		expect(box.centerY).toBeCloseTo(751 + screenHeight / 2, 10);
		expect(box.bounds.right).toBeCloseTo(right, 8);
		expect(box.bounds.left).toBeLessThan(1320);
		expect(box.bounds.right).toBeGreaterThan(1320);
		expect(linenPhoneFitError(box, phone, 2640, 2868)).toBeNull();
	});

	it('preserves the capture aspect ratio at every export size and never stretches', () => {
		for (const device of Object.values(DEVICES)) {
			const box = linenPhoneBox(LINEN_PHONE, capture, linenScale(device.width, device.height));
			expect(box.screenWidth / box.screenHeight).toBeCloseTo(1320 / 2868, 10);
			expect(box.screenWidth).toBeLessThanOrEqual((1038 * device.width) / 1320 + 1e-9);
			expect(box.bounds.bottom).toBeLessThanOrEqual(device.height + 1e-9);
		}
	});

	it('reports a phone that leaves the canvas instead of clamping it', () => {
		const wide = { ...LINEN_PHONE, centerX: 100 };
		const box = linenPhoneBox(wide, capture, linenScale(1320, 2868));
		expect(linenPhoneFitError(box, wide, 1320, 2868)).toMatch(/does not fit/);
		const cropped = { ...LINEN_PHONE, mode: 'bottom-crop' as const, cropReason: 'Show the list' };
		const box2 = linenPhoneBox(cropped, capture, linenScale(1320, 2868));
		expect(box2.screenWidth).toBe(1038);
		expect(box2.bounds.bottom).toBeGreaterThan(2868);
		expect(linenPhoneFitError(box2, cropped, 1320, 2868)).toBeNull();
	});
});

describe('Table Linen validators', () => {
	it('converts renderer rgba shadows to strict hex plus exact opacity', () => {
		expect(parseShadowColor('rgba(0,0,0,0.30)')).toEqual({ shadow: '#000000', shadowOpacity: 0.3 });
		expect(parseShadowColor('rgba(42,115,110,0.18)')).toEqual({
			shadow: '#2A736E',
			shadowOpacity: 0.18
		});
		expect(parseShadowColor('#123456')).toEqual({ shadow: '#123456', shadowOpacity: 1 });
		for (const bad of [
			'red',
			'url(https://example.com)',
			'rgba(300,0,0,1)',
			'rgba(0,0,0,2)',
			'hsl(1,2%,3%)'
		])
			expect(() => parseShadowColor(bad)).toThrow();
		expect(linenShadowCss(LINEN_PALETTES.teal)).toBe('rgba(0,0,0,0.3)');
		expect(linenShadowCss(LINEN_PALETTES.cream)).toBe('rgba(42,115,110,0.18)');
	});

	it.each([
		['top above bottom', { top: 2800 }],
		['rotation beyond ±8', { rotation: 8.5 }],
		['nonfinite center', { centerX: Number.NaN }],
		['a crop without a reason', { mode: 'bottom-crop' }],
		['an unknown mode', { mode: 'zoom' }],
		['a string shell', { shell: '24' }]
	])('rejects a phone with %s', (_name, patch) => {
		expect(() => parseLinenPhone({ ...LINEN_PHONE, ...patch })).toThrow();
	});

	it('accepts complete settings and rejects unsafe colors', () => {
		const settings = {
			colors: LINEN_PALETTES.cream,
			layout: LINEN_LAYOUT,
			phone: LINEN_PHONE,
			band: true
		};
		expect(parseLinenSettings(settings)).toEqual(settings);
		expect(() =>
			parseLinenSettings({ ...settings, colors: { ...settings.colors, canvas: 'url(x)' } })
		).toThrow(/color/);
		expect(() =>
			parseLinenSettings({ ...settings, layout: { ...settings.layout, headlineSize: Infinity } })
		).toThrow();
	});

	it('parses italic accent markup strictly and ignores a trailing newline while typing', () => {
		expect(linenHeadlineSpans('Dinner for four.')).toEqual([
			{ text: 'Dinner for four.', italic: false }
		]);
		expect(linenHeadlineSpans('*One shared bill.*')).toEqual([
			{ text: '', italic: false },
			{ text: 'One shared bill.', italic: true },
			{ text: '', italic: false }
		]);
		expect(() => linenHeadlineSpans('*Unclosed')).toThrow(/unbalanced/);
		expect(linenLines('One\nTwo\n')).toEqual(['One', 'Two']);
		expect(linenLines(undefined)).toEqual([]);
	});
});

describe('Table Linen manifest conversion', () => {
	it('mirrors the renderer defaults and merges global, per-slide and panorama overrides', () => {
		const project = tableLinenFromManifest(billington(), images);
		expect(project.style).toBe('table-linen');
		expect(project.slides.map((slide) => slide.linen?.colors.canvas)).toEqual([
			'#2A736E',
			'#2A736E',
			'#FBF6EF'
		]);
		expect(project.slides[0].linen?.colors).toEqual(LINEN_PALETTES.teal);
		expect(project.slides[2].linen?.colors).toEqual(LINEN_PALETTES.cream);
		expect(project.slides[0].linen?.layout).toEqual(LINEN_LAYOUT);
		expect(project.slides[0].linen?.phone).toEqual(LINEN_PHONE);
		expect(project.slides[0].typography.headline).toBe('Dinner for four.\n*One shared bill.*');
		expect(project.slides[2].typography.subtitle).toBeUndefined();
		expect(project.slides[1].label).toBeUndefined();
		expect(project.panorama).toMatchObject({
			leftId: 'shared-bill',
			rightId: 'fair-shares',
			image: capture,
			offset: 0,
			scale: 1,
			tilt: 0,
			linenPhone: {
				...LINEN_PHONE,
				top: 751,
				bottom: 2803,
				maxWidth: 944,
				centerX: 1152,
				rotation: -4.8
			}
		});
		expect(project.continuityMode).toBe('paired');
		expect(project.slides[0].primaryImage).toEqual(capture);
		expect(project.slides[1].primaryImage).toEqual(capture);
	});

	it('survives the project boundary unchanged and drives canonical pair geometry', () => {
		const project = tableLinenFromManifest(billington(), images);
		const reopened = parseProject(JSON.stringify(project));
		expect(reopened).toEqual(project);
		const left = computePanoramaGeometry(reopened, 0)!;
		const right = computePanoramaGeometry(reopened, 1)!;
		const box = linenPhoneBox(reopened.panorama!.linenPhone!, capture, linenScale(1320, 2868));
		expect(left.phone).toEqual(right.phone);
		expect(left.phone).toEqual({
			centerX: box.centerX,
			centerY: box.centerY,
			width: box.shellWidth,
			height: box.shellHeight,
			rotation: box.rotation
		});
		expect(left.phone.centerX).toBe(1152);
		expect(left.phone.rotation).toBeCloseTo((-4.8 * Math.PI) / 180, 12);
		expect(right.viewportX).toBe(1320);
	});

	it('treats linen-quiet as cream without a band and honours explicit band and rgba shadows', () => {
		const source = billington();
		source.style = 'linen-quiet';
		Object.assign(source.slides[0], { colors: { shadow: 'rgba(10,20,30,0.5)' } });
		const quiet = tableLinenFromManifest(source, images);
		expect(quiet.slides.every((slide) => slide.linen?.band === false)).toBe(true);
		expect(quiet.slides[0].linen?.colors.canvas).toBe('#FBF6EF');
		expect(quiet.slides[0].linen?.colors.shadow).toBe('#0A141E');
		expect(quiet.slides[0].linen?.colors.shadowOpacity).toBe(0.5);
		const banded = billington();
		Object.assign(banded.slides[2], { band: false });
		const project = tableLinenFromManifest(banded, images);
		expect(project.slides.map((slide) => slide.linen?.band)).toEqual([true, true, false]);
	});

	it.each([
		['version 2', (m: ReturnType<typeof billington>) => (m.version = 2)],
		['an unknown style', (m: ReturnType<typeof billington>) => (m.style = 'paper')],
		[
			'an unknown image key',
			(m: ReturnType<typeof billington>) => (m.slides[2].image = 'captures/none.png')
		],
		[
			'a missing panorama image',
			(m: ReturnType<typeof billington>) => (m.panorama.image = 'nope.png')
		],
		['a non-kebab id', (m: ReturnType<typeof billington>) => (m.slides[0].id = 'Shared Bill')],
		[
			'three headline lines',
			(m: ReturnType<typeof billington>) => (m.slides[0].headline = ['a', 'b', 'c'])
		],
		[
			'an empty subtitle line',
			(m: ReturnType<typeof billington>) => (m.slides[0].subtitle = ['ok', ' '])
		],
		[
			'a reversed pair',
			(m: ReturnType<typeof billington>) =>
				Object.assign(m.panorama, { leftId: 'fair-shares', rightId: 'shared-bill' })
		],
		[
			'an unsupported layout key',
			(m: ReturnType<typeof billington>) => Object.assign(m, { layout: { headlineTopp: 1 } })
		],
		[
			'a layout value out of bounds',
			(m: ReturnType<typeof billington>) => Object.assign(m, { layout: { headlineSize: 5000 } })
		],
		[
			'a panorama rotation beyond ±8',
			(m: ReturnType<typeof billington>) => (m.panorama.phone.rotation = -9)
		],
		[
			'a bottom crop without reason',
			(m: ReturnType<typeof billington>) => (m.panorama.phone.mode = 'bottom-crop')
		]
	])('rejects a manifest with %s', (_name, modify) => {
		const source = billington();
		modify(source);
		expect(() => tableLinenFromManifest(source, images)).toThrow();
	});

	it('does not require a panorama and defaults first and last panels to teal', () => {
		const source = billington();
		delete (source as { panorama?: unknown }).panorama;
		for (const slide of source.slides) delete (slide as { theme?: string }).theme;
		const project = tableLinenFromManifest(source, images);
		expect(project.panorama).toBeUndefined();
		expect(project.continuityMode).toBe('none');
		expect(project.slides.map((slide) => slide.linen?.colors.canvas)).toEqual([
			'#2A736E',
			'#FBF6EF',
			'#2A736E'
		]);
		expect(defaultLinenTheme(1, 5, [0, 1])).toBe('teal');
		expect(defaultLinenTheme(2, 5, [0, 1])).toBe('cream');
	});
});

describe('Table Linen studio defaults', () => {
	it('keeps the connected demo round-trippable when switched to Table Linen', () => {
		const demo = createDemo();
		demo.style = 'table-linen';
		demo.slides = demo.slides.map((slide, index) => ({
			...slide,
			linen: linenDefaultsForSlide(slide, defaultLinenTheme(index, demo.slides.length, [0, 1]))
		}));
		demo.panorama = { ...demo.panorama!, tilt: 0, linenPhone: { ...LINEN_SHARED_PHONE } };
		expect(parseProject(JSON.stringify(demo))).toEqual(demo);
		expect(computePanoramaGeometry(demo, 0)!.phone.centerX).toBe(1320);
		expect(computePanoramaGeometry(demo, 0)!.phone.rotation).toBe(0);
	});

	it('moves the copy and phone down for a three-line headline instead of erroring later', () => {
		const slide = createSlide(0);
		slide.typography.headline = 'Split it.\nShare it.\nSorted.';
		const settings = linenDefaultsForSlide(slide, 'teal');
		expect(settings.layout.subtitleTop).toBeGreaterThanOrEqual(
			LINEN_LAYOUT.headlineTop + 3 * LINEN_LAYOUT.headlineLeading
		);
		expect(settings.phone.top).toBeGreaterThan(LINEN_PHONE.top);
		expect(settings.phone.top).toBeLessThan(settings.phone.bottom);
		expect(() => parseLinenSettings(settings)).not.toThrow();
	});
});

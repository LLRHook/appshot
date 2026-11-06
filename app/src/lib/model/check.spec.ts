import { describe, expect, it } from 'vitest';
import {
	applyCheckPatch,
	applyCheckStyle,
	CHECK_CANVASES,
	CHECK_PALETTES,
	CHECK_PRESETS,
	checkFamily,
	checkLayout,
	checkLint,
	checkMarkStroke,
	checkPairPanel,
	checkStrokeClearance,
	checkStrokeOutline,
	checkTornEdge,
	contrastRatio,
	defaultCheckMark,
	defaultCheckSettings,
	parseCheckSettings,
	parseCheckSettingsPatch,
	resolveCheckSettings,
	type CheckBounds,
	type CheckFont,
	type CheckLayoutInput,
	type CheckMeasure,
	type CheckSettings
} from './check';
import { DEVICES, OUTPUT_TARGETS } from './devices';
import { parseProject } from './project';
import { createDemo } from './studio';

/** Glyph metrics with the features that matter: italic overhang and real descenders. */
const metrics: CheckMeasure = (text, font) => {
	const glyph = font.role === 'display' ? 0.41 : 0.5;
	const advance = text.length * font.size * glyph;
	const overhang = font.italic ? font.size * 0.09 : 0;
	return {
		advance,
		left: font.italic ? font.size * 0.03 : -font.size * 0.02,
		right: advance + overhang - font.size * 0.01,
		ascent: font.size * 0.72,
		descent: /[gjpqy,]/.test(text) ? font.size * 0.22 : font.size * 0.01
	};
};

const SETTINGS: CheckSettings = { canvas: 'teal', preset: 'hero', panel: true, wordmark: true };

function input(overrides: Partial<CheckLayoutInput> = {}): CheckLayoutInput {
	return {
		width: 1320,
		height: 2868,
		settings: SETTINGS,
		headline: 'Fjord gym quay.\n*Hefty jigsaw.*',
		support: 'Five quick wizards box a jumpy fog.',
		name: 'Sample App',
		frame: 'wireframe',
		source: { naturalWidth: 1320, naturalHeight: 2868 },
		measure: metrics,
		...overrides
	};
}

function overlaps(a: CheckBounds, b: CheckBounds): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe('CheckSettings parsing', () => {
	const valid = {
		canvas: 'gold',
		preset: 'detail',
		panel: false,
		wordmark: true,
		mark: { kind: 'ring', anchor: 'panel', rect: { x: 1, y: 2, width: 3, height: 4 }, seed: 9 }
	};

	it('accepts the published shape and returns only supported fields', () => {
		expect(parseCheckSettings(valid)).toEqual(valid);
		expect(parseCheckSettings({ ...valid, mark: undefined })).not.toHaveProperty('mark');
	});

	for (const [name, bad] of [
		['an unknown key', { ...valid, surprise: 1 }],
		['an unknown canvas', { ...valid, canvas: 'cobalt' }],
		['an unknown layout', { ...valid, preset: 'banner' }],
		['a non-boolean panel', { ...valid, panel: 1 }],
		['a non-boolean wordmark', { ...valid, wordmark: 'yes' }],
		['a mark without an anchor', { ...valid, mark: { ...valid.mark, anchor: ' ' } }],
		['an unknown stroke', { ...valid, mark: { ...valid.mark, kind: 'scribble' } }],
		['a mark with extra keys', { ...valid, mark: { ...valid.mark, color: 'red' } }],
		[
			'a fractional region',
			{ ...valid, mark: { ...valid.mark, rect: { ...valid.mark.rect, x: 1.5 } } }
		],
		[
			'an empty region',
			{ ...valid, mark: { ...valid.mark, rect: { ...valid.mark.rect, width: 0 } } }
		],
		['a fractional seed', { ...valid, mark: { ...valid.mark, seed: 0.5 } }],
		['a torn edge that names nothing', { ...valid, tear: '' }],
		['a torn edge that is not a name', { ...valid, tear: 3 }],
		['a torn edge with a huge name', { ...valid, tear: 'x'.repeat(129) }],
		['not an object', 'teal']
	] as const) {
		it(`rejects ${name}`, () => {
			expect(() => parseCheckSettings(bad)).toThrow();
		});
	}

	it('parses a target override with only the keys it has', () => {
		expect(parseCheckSettingsPatch({ preset: 'editorial' })).toEqual({ preset: 'editorial' });
		expect(parseCheckSettingsPatch({ mark: null })).toEqual({ mark: null });
		expect(parseCheckSettingsPatch({ tear: 'strip' })).toEqual({ tear: 'strip' });
		expect(parseCheckSettingsPatch({ tear: null })).toEqual({ tear: null });
		expect(() => parseCheckSettingsPatch({ tear: 7 })).toThrow();
		expect(() => parseCheckSettingsPatch({ canvas: 'blue' })).toThrow();
		expect(() => parseCheckSettingsPatch({ other: true })).toThrow();
	});

	it('merges a target override by whole keys without mutating, and can clear a mark', () => {
		const base = parseCheckSettings(valid);
		const frozen = structuredClone(base);
		expect(applyCheckPatch(base, undefined)).toBe(base);
		expect(applyCheckPatch(undefined, undefined)).toBeUndefined();
		expect(applyCheckPatch(base, { canvas: 'teal' })?.canvas).toBe('teal');
		expect(applyCheckPatch(base, { canvas: 'teal' })?.mark).toEqual(base.mark);
		expect(applyCheckPatch(base, { mark: null })).not.toHaveProperty('mark');
		expect(base).toEqual(frozen);
		expect(applyCheckPatch(undefined, { canvas: 'cream' })?.canvas).toBe('cream');
	});

	it('keeps, replaces and clears a torn edge by target', () => {
		const base = parseCheckSettings({ ...valid, tear: 'strip' });
		expect(base.tear).toBe('strip');
		expect(applyCheckPatch(base, { canvas: 'teal' })?.tear).toBe('strip');
		expect(applyCheckPatch(base, { tear: 'other' })?.tear).toBe('other');
		expect(applyCheckPatch(base, { tear: null })).not.toHaveProperty('tear');
		expect(applyCheckPatch(base, { tear: null })?.mark).toEqual(base.mark);
	});

	it('survives a project round trip', () => {
		const composition = applyCheckStyle(createDemo());
		composition.slides[0].check = parseCheckSettings(valid);
		const reopened = parseProject(JSON.stringify(composition));
		expect(reopened.slides[0].check).toEqual(valid);
		expect(reopened.style).toBe('the-check');
	});
});

describe('palette', () => {
	it('meets the contrast the direction promises, on every canvas', () => {
		for (const canvas of CHECK_CANVASES) {
			const palette = CHECK_PALETTES[canvas];
			expect(contrastRatio(palette.headline, palette.canvas), canvas).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(palette.support, palette.canvas), canvas).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(palette.accent, palette.canvas), canvas).toBeGreaterThanOrEqual(3);
		}
		expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
	});

	it('keeps pen ink visible on pale surfaces', () => {
		for (const canvas of CHECK_CANVASES)
			for (const surface of ['#FFFFFF', '#EEF1F6', '#F3EFE6', '#EAF3EC', '#F4ECF4'])
				expect(
					contrastRatio(CHECK_PALETTES[canvas].pen, surface),
					`${canvas} on ${surface}`
				).toBeGreaterThanOrEqual(3);
	});
});

describe('defaults and rhythm', () => {
	it('opens teal, cream, gold, and never repeats a canvas or a canvas-and-layout pair', () => {
		const settings = Array.from({ length: 10 }, (_, i) => defaultCheckSettings(i, 10));
		expect(settings.slice(0, 3).map((item) => item.canvas)).toEqual(['teal', 'cream', 'gold']);
		for (let i = 1; i < settings.length; i++)
			expect(settings[i].canvas === settings[i - 1].canvas, `frame ${i}`).toBe(false);
	});

	it('falls back per frame when nothing was saved', () => {
		const demo = createDemo();
		expect(resolveCheckSettings(demo, 1).canvas).toBe('cream');
		demo.slides[1].check = { ...SETTINGS, canvas: 'gold' };
		expect(resolveCheckSettings(demo, 1).canvas).toBe('gold');
	});
});

describe('aspect families', () => {
	it('agrees with every catalog target', () => {
		for (const target of OUTPUT_TARGETS)
			expect(checkFamily(target.width, target.height), target.id).toBe(target.layoutFamily);
	});
});

describe('layout', () => {
	it('sets real hierarchy and an 84% hero panel cropped by the bottom', () => {
		const scene = checkLayout(input());
		expect(scene.family).toBe('phone-tall');
		expect(scene.headline.font.size).toBeGreaterThanOrEqual(170);
		expect(scene.support.font.size).toBeGreaterThanOrEqual(50);
		expect(scene.panel!.width / 1320).toBeCloseTo(0.84, 5);
		expect(scene.panel!.y + scene.panel!.height).toBeGreaterThan(2868);
		expect(scene.panel!.y).toBeGreaterThan(scene.copyBounds!.bottom);
	});

	it('never moves copy off the frame, including italic overhang', () => {
		const scene = checkLayout(input({ headline: 'Much *longer italic line here.*' }));
		for (const box of scene.copyBoxes) {
			expect(box.left).toBeGreaterThanOrEqual(0);
			expect(box.right).toBeLessThanOrEqual(1320 - 84 + 0.001);
		}
	});

	it('aligns each line’s ink, not its origin, to the margin', () => {
		const scene = checkLayout(input());
		for (const line of scene.headline.lines) expect(line.bounds.left).toBeCloseTo(84, 5);
	});

	it('shrinks before wrapping and only breaks lines at spaces', () => {
		const long = 'Quartz ridges climbing above the old glacier';
		const scene = checkLayout(input({ headline: long }));
		expect(scene.headline.lines.length).toBeGreaterThan(1);
		const words = scene.headline.lines.flatMap((line) =>
			line.runs.flatMap((run) => run.text.split(' '))
		);
		expect(words.join(' ')).toBe(long);
		const short = checkLayout(input({ headline: 'Fjords at dawn' }));
		expect(short.headline.lines).toHaveLength(1);
	});

	it('keeps a legitimate two-line headline on its authored lines', () => {
		const scene = checkLayout(input({ headline: 'Fog by noon\n*clear by dusk.*' }));
		expect(scene.headline.lines).toHaveLength(2);
		expect(scene.headline.lines[1].runs[0].italic).toBe(true);
	});

	it('names the fix when copy cannot fit, instead of clipping it', () => {
		expect(() => checkLayout(input({ headline: 'W'.repeat(120) }))).toThrow(/Shorten it/);
		expect(() =>
			checkLayout(input({ support: Array.from({ length: 60 }, () => 'word').join(' ') }))
		).toThrow(/Shorten it/);
		expect(() => checkLayout(input({ name: 'W'.repeat(120) }))).toThrow(/wordmark/);
	});

	it('reports unbalanced italic markup instead of drawing it', () => {
		expect(() => checkLayout(input({ headline: '*Unclosed' }))).toThrow(/italic/);
	});

	it('never shows markup in supporting text', () => {
		const scene = checkLayout(input({ support: 'Keep *this* plain.' }));
		expect(scene.support.lines.flatMap((line) => line.runs.map((run) => run.text)).join('')).toBe(
			'Keep this plain.'
		);
	});

	it('scales a panel by one factor, whatever the capture', () => {
		for (const source of [
			{ naturalWidth: 1320, naturalHeight: 2868 },
			{ naturalWidth: 2064, naturalHeight: 2752 },
			{ naturalWidth: 2868, naturalHeight: 1320 }
		]) {
			const panel = checkLayout(input({ source })).panel!;
			expect(panel.width / source.naturalWidth).toBeCloseTo(panel.height / source.naturalHeight, 8);
			expect(panel.scale).toBeCloseTo(panel.width / source.naturalWidth, 8);
		}
	});

	it('gives each preset a purposefully different composition', () => {
		const panels = CHECK_PRESETS.map(
			(preset) => checkLayout(input({ settings: { ...SETTINGS, preset } })).panel!
		);
		const [hero, detail, editorial] = panels;
		expect(detail.width).toBeGreaterThan(hero.width);
		const editorialScene = checkLayout(input({ settings: { ...SETTINGS, preset: 'editorial' } }));
		expect(editorial.y).toBeLessThan(hero.y);
		expect(editorialScene.copyBounds!.top).toBeGreaterThan(editorial.cut! - 1);
		expect(editorial.edge).toBe(0);
		const closer = checkLayout(
			input({ settings: { ...SETTINGS, preset: 'closer', panel: false } })
		);
		const center =
			(closer.headline.lines[0].bounds.left + closer.headline.lines[0].bounds.right) / 2;
		expect(center).toBeCloseTo(660, 5);
		expect(closer.support.lines[0].bounds.bottom).toBeGreaterThan(2600);
	});

	it('draws no panel when layers carry the UI, and leaves its space to them', () => {
		const scene = checkLayout(input({ settings: { ...SETTINGS, panel: false } }));
		expect(scene.panel).toBeUndefined();
	});

	it('honors the existing scale, type-scale, tilt and frame fields', () => {
		const base = checkLayout(input()).panel!;
		expect(checkLayout(input({ panelScale: 0.8 })).panel!.width).toBeCloseTo(base.width * 0.8, 6);
		const small = checkLayout(input({ fontScale: 0.7 }));
		expect(small.headline.font.size).toBeLessThan(checkLayout(input()).headline.font.size);
		expect(checkLayout(input({ frame: 'none' })).panel!.edge).toBe(0);
		const tilted = checkLayout(input({ tilt: 6 }));
		expect(tilted.panel!.bounds.top).toBeGreaterThanOrEqual(tilted.copyBounds!.bottom);
	});

	it('keeps the copy clear of brand art at the top', () => {
		const scene = checkLayout(
			input({ settings: { ...SETTINGS, wordmark: false }, artBottom: 300 })
		);
		expect(scene.headline.lines[0].bounds.top).toBeGreaterThan(300);
	});

	it('lays out every catalog target without clipped copy, stretching or copy on the panel', () => {
		for (const target of OUTPUT_TARGETS) {
			for (const preset of CHECK_PRESETS) {
				const scene = checkLayout(
					input({
						width: target.width,
						height: target.height,
						family: target.layoutFamily,
						settings: { ...SETTINGS, preset },
						source: { naturalWidth: target.width, naturalHeight: target.height },
						frame: 'wireframe'
					})
				);
				const where = `${target.id}/${preset}`;
				for (const box of scene.copyBoxes) {
					expect(box.left, where).toBeGreaterThanOrEqual(0);
					expect(box.right, where).toBeLessThanOrEqual(target.width);
					expect(box.top, where).toBeGreaterThanOrEqual(0);
					expect(box.bottom, where).toBeLessThanOrEqual(target.height);
				}
				const panel = scene.panel!;
				expect(panel.width / target.width, where).toBeCloseTo(panel.height / target.height, 6);
				for (const box of scene.copyBoxes)
					expect(overlaps(box, panel.bounds), `${where} copy on panel`).toBe(false);
			}
		}
	});

	it('authors families rather than stretching one frame', () => {
		const phone = checkLayout(input());
		const tablet = checkLayout(input({ width: 2064, height: 2752, source: undefined }));
		const landscape = checkLayout(input({ width: 2752, height: 2064, source: undefined }));
		expect(tablet.family).toBe('tablet-portrait');
		expect(landscape.family).toBe('wide-landscape');
		// Same glyph, same unit in both axes.
		expect(tablet.headline.font.size / tablet.unit).not.toBeCloseTo(phone.headline.font.size, 0);
		// Beside the copy in landscape, under it in portrait.
		expect(landscape.panel!.x).toBeGreaterThan(landscape.copyBounds!.right);
		expect(tablet.panel!.y).toBeGreaterThan(tablet.copyBounds!.bottom);
	});
});

describe('stacked headline ink', () => {
	const measure = (text: string, font: CheckFont) => ({
		advance: text.length * font.size * 0.4,
		left: 0,
		right: text.length * font.size * 0.4,
		// Deliberately tall, so tight leading alone would collide.
		ascent: font.size * 0.8,
		descent: /[gjpqy,]/.test(text) ? font.size * 0.3 : font.size * 0.01
	});

	it('keeps at least 12 px between stacked lines at 1320, scaled with the frame', () => {
		for (const [width, height] of [
			[1320, 2868],
			[1206, 2622],
			[2064, 2752],
			[2007, 2853]
		]) {
			const scene = checkLayout({
				width,
				height,
				settings: { canvas: 'teal', preset: 'detail', panel: false, wordmark: false },
				headline: 'Happy gypsy\n*Happy gypsy*',
				support: '',
				name: 'x',
				frame: 'none',
				measure
			});
			const [first, second] = scene.headline.lines;
			expect(second.bounds.top - first.bounds.bottom).toBeGreaterThanOrEqual((12 * width) / 1320);
		}
	});
});

describe('connected pair panel', () => {
	it('is metric-free and centered on the seam, with copy kept above it', () => {
		const panel = checkPairPanel(
			1320,
			2868,
			{ naturalWidth: 1320, naturalHeight: 2868 },
			{
				offset: 0,
				scale: 1,
				tilt: 0,
				frame: 'none'
			}
		);
		expect(panel.x + panel.width / 2).toBeCloseTo(1320, 8);
		const scene = checkLayout(
			input({ settings: { ...SETTINGS, panel: false }, sharedPanel: panel })
		);
		expect(scene.panel).toBe(panel);
		for (const box of scene.copyBoxes) expect(box.bottom).toBeLessThanOrEqual(panel.bounds.top);
	});

	it('contains invalid numbers', () => {
		const panel = checkPairPanel(
			1320,
			2868,
			{ naturalWidth: 1320, naturalHeight: 2868 },
			{
				offset: NaN,
				scale: Infinity,
				tilt: NaN,
				frame: 'none'
			}
		);
		for (const value of [panel.x, panel.y, panel.width, panel.height, panel.rotation])
			expect(Number.isFinite(value)).toBe(true);
	});
});

describe('pen mark', () => {
	const rect = { x: 1000, y: 1700, width: 260, height: 113 };

	it('never covers what it marks, across seeds, kinds and sizes', () => {
		for (const kind of ['ring', 'underline'] as const)
			for (const unit of [0.9, 1, 1.56])
				for (let seed = 0; seed < 50; seed++) {
					const stroke = checkMarkStroke(kind, rect, seed, unit);
					expect(checkStrokeClearance(stroke, rect), `${kind}/${seed}`).toBeGreaterThan(0);
				}
	});

	it('is the same stroke for the same seed, and a different one otherwise', () => {
		expect(checkMarkStroke('ring', rect, 7, 1)).toEqual(checkMarkStroke('ring', rect, 7, 1));
		expect(checkMarkStroke('ring', rect, 7, 1)).not.toEqual(checkMarkStroke('ring', rect, 8, 1));
	});

	it('closes as a loop around the region, with overlap and tapered ends', () => {
		const { points } = checkMarkStroke('ring', rect, 11, 1);
		const cx = rect.x + rect.width / 2;
		const cy = rect.y + rect.height / 2;
		let winding = 0;
		for (let i = 1; i < points.length; i++) {
			const a = Math.atan2(points[i - 1].y - cy, points[i - 1].x - cx);
			const b = Math.atan2(points[i].y - cy, points[i].x - cx);
			let delta = b - a;
			if (delta > Math.PI) delta -= Math.PI * 2;
			if (delta < -Math.PI) delta += Math.PI * 2;
			winding += delta;
		}
		expect(Math.abs(winding)).toBeGreaterThan(Math.PI * 2);
		const middle = points[Math.floor(points.length / 2)].width;
		expect(points[0].width).toBeLessThan(middle);
		expect(points[points.length - 1].width).toBeLessThan(middle);
		expect(checkStrokeOutline(points)).toHaveLength(points.length * 2);
	});

	it('holds a 12 to 14 pixel pen at 1320, scaled with the frame', () => {
		for (const kind of ['ring', 'underline'] as const)
			for (const unit of [0.9136, 1, 1.5636])
				for (let seed = 0; seed < 25; seed++) {
					const { points } = checkMarkStroke(kind, rect, seed, unit);
					const body = points.slice(
						Math.ceil(points.length * 0.2),
						Math.floor(points.length * 0.8)
					);
					for (const point of body) {
						expect(point.width / unit, `${kind}/${seed}`).toBeGreaterThanOrEqual(12);
						expect(point.width / unit, `${kind}/${seed}`).toBeLessThanOrEqual(14);
					}
				}
	});

	it('wanders like a hand, so the loop is not a clean geometric shape', () => {
		const { points } = checkMarkStroke('ring', { x: 500, y: 500, width: 200, height: 200 }, 5, 1);
		const reach = points.map((point) => Math.hypot(point.x - 600, point.y - 600));
		expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(6);
	});

	it('sits an underline below its region', () => {
		const stroke = checkMarkStroke('underline', rect, 3, 1);
		expect(Math.min(...stroke.points.map((p) => p.y))).toBeGreaterThan(rect.y + rect.height);
	});

	it('starts a new mark inside the anchor area', () => {
		const area = { x: 100, y: 200, width: 900, height: 300 };
		const mark = defaultCheckMark('callout', area, 4);
		expect(mark.rect.x).toBeGreaterThanOrEqual(area.x);
		expect(mark.rect.x + mark.rect.width).toBeLessThanOrEqual(area.x + area.width);
		expect(Number.isInteger(mark.rect.width)).toBe(true);
		expect(parseCheckSettings({ ...SETTINGS, mark }).mark).toEqual(mark);
	});
});

describe('torn edge', () => {
	it('spans the panel and stays above the cut', () => {
		const teeth = checkTornEdge(100, 1200, 2000, 1);
		expect(teeth[0].x).toBe(100);
		expect(teeth[teeth.length - 1].x).toBeCloseTo(1200, 6);
		expect(Math.max(...teeth.map((point) => point.y))).toBe(2000);
		expect(Math.min(...teeth.map((point) => point.y))).toBeLessThan(2000);
	});

	it('tears unevenly and deeply enough to survive store scale, the same way every time', () => {
		const teeth = checkTornEdge(0, 1320, 0, 1);
		expect(teeth).toEqual(checkTornEdge(0, 1320, 0, 1));
		const tips = teeth.filter((_, index) => index % 2 === 1);
		const gaps = tips.slice(1).map((tip, index) => tip.x - tips[index].x);
		expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(4);
		expect(-Math.min(...teeth.map((point) => point.y))).toBeGreaterThanOrEqual(26);
	});
});

describe('applyCheckStyle', () => {
	it('keeps copy and images, and is pure', () => {
		const demo = createDemo();
		const snapshot = structuredClone(demo);
		const styled = applyCheckStyle(demo);
		expect(demo).toEqual(snapshot);
		expect(styled.style).toBe('the-check');
		expect(styled.slides.map((slide) => slide.typography.headline)).toEqual(
			demo.slides.map((slide) => slide.typography.headline)
		);
		expect(styled.slides.map((slide) => slide.primaryImage)).toEqual(
			demo.slides.map((slide) => slide.primaryImage)
		);
		expect(styled.slides.every((slide) => slide.tilt === 0 && slide.frame === 'none')).toBe(true);
		expect(parseProject(JSON.stringify(styled)).slides[2].check?.canvas).toBe('gold');
	});

	it('disconnects a pair in the first three, which must each work alone', () => {
		const styled = applyCheckStyle(createDemo());
		expect(styled.continuityMode).toBe('none');
		expect(styled.panorama).toBeUndefined();
	});

	it('keeps a later pair connected on one canvas, upright', () => {
		const demo = createDemo();
		demo.panorama = { ...demo.panorama!, leftId: demo.slides[3].id, rightId: demo.slides[4].id };
		const styled = applyCheckStyle(demo);
		expect(styled.continuityMode).toBe('paired');
		expect(styled.panorama?.tilt).toBe(0);
		expect(styled.slides[3].check?.canvas).toBe(styled.slides[4].check?.canvas);
	});
});

describe('checkLint', () => {
	it('warns about a seam in the first three frames and a repeated composition', () => {
		const demo = applyCheckStyle(createDemo());
		expect(checkLint(demo).filter((issue) => issue.severity === 'block')).toEqual([]);
		const paired = {
			...demo,
			continuityMode: 'paired' as const,
			panorama: createDemo().panorama
		};
		paired.panorama = {
			...paired.panorama!,
			leftId: demo.slides[0].id,
			rightId: demo.slides[1].id
		};
		expect(checkLint(paired).map((issue) => issue.code)).toContain('check-first-three-seam');
		const repeated = structuredClone(demo);
		repeated.slides[1].check = { ...repeated.slides[0].check! };
		expect(checkLint(repeated).map((issue) => issue.code)).toContain('check-repeated-frame');
	});

	it('warns about long supporting text and hands back the slide', () => {
		const demo = applyCheckStyle(createDemo());
		demo.slides[2].typography.subtitle = Array.from({ length: 14 }, () => 'word').join(' ');
		const issue = checkLint(demo).find((item) => item.code === 'check-long-support');
		expect(issue?.slideIndex).toBe(2);
		expect(issue?.severity).toBe('warn');
	});
});

describe('catalog use', () => {
	it('resolves targets through the shared device table', () => {
		expect(DEVICES['iphone-6.9'].layoutFamily).toBe('phone-tall');
		expect(DEVICES['iphone-duo-inner-2007x2853'].layoutFamily).toBe('duo-portrait');
	});
});

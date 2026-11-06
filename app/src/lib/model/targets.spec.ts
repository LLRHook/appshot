import { describe, expect, it } from 'vitest';
import type { ProjectAsset, ProjectV2, StoredSlide } from './contracts';
import { DEVICES } from './devices';
import { defaultLinenSettings, defaultLinenTheme } from './linen';
import { parseProject } from './project';
import { activeTargets, normalizeProjectV2, projectForTarget, sourceIssues } from './targets';

const asset = (
	id: string,
	width: number,
	height: number,
	url = '/sample/today.png'
): ProjectAsset => ({
	id,
	mime: 'image/png',
	byteLength: 1,
	url,
	naturalWidth: width,
	naturalHeight: height
});

const shared: Omit<StoredSlide, 'id'> = {
	background: { kind: 'solid', colors: ['#123456'] },
	frame: 'none',
	layout: 'text-above',
	typography: { headline: 'Low tide.', fontColor: '#FFFFFF', fontWeight: 700 },
	effects: { shadow: 'none', glow: 0 },
	scale: 1,
	tilt: 2,
	fontScale: 1
};

function fixture(): ProjectV2 {
	return {
		version: 2,
		name: 'Working title',
		appName: 'Sample App',
		style: 'cobalt',
		accent: '#DAF975',
		targets: ['iphone-6.9', 'iphone-di-medium-1206x2622', 'ipad-13'],
		assets: {
			large: asset('large', 1320, 2868),
			medium: asset('medium', 1206, 2622),
			tablet: asset('tablet', 2064, 2752)
		},
		continuityMode: 'paired',
		slides: [
			{
				...shared,
				id: 'left',
				variants: {
					'iphone-6.9': { source: { asset: 'large' }, scale: 1.2 },
					'iphone-di-medium-1206x2622': { source: { asset: 'medium' } }
				}
			},
			{ ...shared, id: 'right', variants: { 'iphone-6.9': { source: { asset: 'large' } } } }
		],
		panorama: {
			leftId: 'left',
			rightId: 'right',
			offset: 0,
			scale: 1,
			tilt: 0,
			variants: { 'iphone-6.9': { source: { asset: 'large' }, tilt: -5 } }
		}
	};
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

describe('projectForTarget', () => {
	it('returns a v1-shaped document for each target that the legacy parser accepts', () => {
		const project = deepFreeze(fixture());
		for (const target of project.targets) {
			const composition = projectForTarget(project, target);
			expect(parseProject(JSON.stringify(composition))).toEqual(composition);
			expect(composition).toMatchObject({ version: 1, device: target, name: 'Sample App' });
			expect(composition.slides.every((slide) => slide.device === target)).toBe(true);
			expect(composition.slides.every((slide) => slide.continuity.inset === 0)).toBe(true);
		}
	});

	it('is pure: a frozen input gives equal results and is never touched', () => {
		const project = deepFreeze(fixture());
		const before = JSON.stringify(project);
		expect(projectForTarget(project, 'ipad-13')).toEqual(projectForTarget(project, 'ipad-13'));
		expect(JSON.stringify(project)).toBe(before);
	});

	it('uses exactly this target’s source, and leaves a missing one absent', () => {
		const project = fixture();
		const image = (target: ProjectV2['targets'][number]) =>
			projectForTarget(project, target).slides[0].primaryImage?.id;
		expect(image('iphone-6.9')).toBe('large');
		expect(image('iphone-di-medium-1206x2622')).toBe('medium');
		expect(image('ipad-13')).toBeUndefined();
		expect(
			projectForTarget(project, 'iphone-di-medium-1206x2622').slides[1].primaryImage
		).toBeUndefined();
	});

	it('never substitutes a source from a same-size target in another class', () => {
		const project: ProjectV2 = {
			...fixture(),
			targets: ['ipad-13-2048x2732', 'ipad-12.9-2048x2732'],
			assets: { tablet: asset('tablet', 2048, 2732) },
			panorama: undefined,
			continuityMode: 'none',
			slides: [
				{ ...shared, id: 'one', variants: { 'ipad-13-2048x2732': { source: { asset: 'tablet' } } } }
			]
		};
		expect(projectForTarget(project, 'ipad-13-2048x2732').slides[0].primaryImage?.id).toBe(
			'tablet'
		);
		expect(projectForTarget(project, 'ipad-12.9-2048x2732').slides[0].primaryImage).toBeUndefined();
	});

	it('keeps overrides on their own target and reads the shared value elsewhere', () => {
		const project = fixture();
		project.slides[0].variants!['iphone-6.9']!.tilt = 9;
		project.slides[0].variants!['iphone-6.9']!.fontScale = 1.2;
		project.slides[0].variants!['iphone-6.9']!.layout = 'text-below';
		const phone = projectForTarget(project, 'iphone-6.9').slides[0];
		expect(phone).toMatchObject({ scale: 1.2, tilt: 9, fontScale: 1.2, layout: 'text-below' });
		const other = projectForTarget(project, 'iphone-di-medium-1206x2622').slides[0];
		expect(other).toMatchObject({ scale: 1, tilt: 2, fontScale: 1, layout: 'text-above' });
	});

	it('refuses an undeclared target instead of falling back', () => {
		expect(() => projectForTarget(fixture(), 'iphone-6.7')).toThrow(/not one of/);
	});

	it('resolves stored layers to image references, with one uniform scale', () => {
		const project = fixture();
		project.slides[0].variants!['iphone-6.9']!.layers = [
			{
				id: 'callout',
				kind: 'source-crop',
				image: 'large',
				crop: { x: 40, y: 900, width: 1240, height: 320 },
				x: 30,
				y: 1800,
				scale: 1.02,
				radius: 24,
				rotation: 3,
				shadow: 'soft',
				sampling: 'pixelated'
			}
		];
		const [layer] = projectForTarget(project, 'iphone-6.9').slides[0].layers!;
		expect(layer.image).toEqual({
			id: 'large',
			blobUrl: '/sample/today.png',
			naturalWidth: 1320,
			naturalHeight: 2868
		});
		expect(layer).toMatchObject({ radius: 24, rotation: 3, shadow: 'soft', sampling: 'pixelated' });
		expect(projectForTarget(project, 'ipad-13').slides[0].layers).toBeUndefined();
	});

	it('keeps a projected crop inside the real source, and drops one with nothing left', () => {
		const project = fixture();
		const base = { kind: 'source-crop' as const, image: 'large', x: 0, y: 0, scale: 1 };
		project.slides[0].variants!['iphone-6.9']!.layers = [
			{ ...base, id: 'trimmed', crop: { x: 1300, y: 2800, width: 100, height: 100 } },
			{ ...base, id: 'outside', crop: { x: 1320, y: 0, width: 10, height: 10 } },
			{ ...base, id: 'no-image', image: 'gone', crop: { x: 0, y: 0, width: 1, height: 1 } }
		];
		const layers = projectForTarget(project, 'iphone-6.9').slides[0].layers!;
		expect(layers.map((layer) => layer.id)).toEqual(['trimmed']);
		expect(layers[0].crop).toEqual({ x: 1300, y: 2800, width: 20, height: 68 });
	});

	it('omits an empty layer list', () => {
		const project = fixture();
		project.slides[0].variants!['iphone-6.9']!.layers = [];
		expect(projectForTarget(project, 'iphone-6.9').slides[0]).not.toHaveProperty('layers');
	});

	it('merges Table Linen groups per target and falls back to defaults with no base', () => {
		const project = fixture();
		const base = defaultLinenSettings('teal');
		const layout = defaultLinenSettings('cream').layout;
		project.slides[0].linen = base;
		project.slides[0].variants!['iphone-6.9']!.linen = {
			layout: { ...layout, margin: 12 },
			band: false
		};
		project.slides[1].variants!['iphone-6.9']!.linen = { band: false };
		const [left, right] = projectForTarget(project, 'iphone-6.9').slides;
		expect(left.linen).toEqual({ ...base, layout: { ...layout, margin: 12 }, band: false });
		expect(projectForTarget(project, 'ipad-13').slides[0].linen).toEqual(base);
		expect(right.linen).toEqual({
			...defaultLinenSettings(defaultLinenTheme(1, 2, [0, 1])),
			band: false
		});
		expect(projectForTarget(project, 'ipad-13').slides[1]).not.toHaveProperty('linen');
	});

	it('applies The Check target overrides, including removing a mark on one target', () => {
		const mark = {
			kind: 'ring' as const,
			anchor: 'panel',
			rect: { x: 1, y: 2, width: 3, height: 4 },
			seed: 5
		};
		const project = fixture();
		project.slides[0].check = { canvas: 'teal', preset: 'hero', panel: true, wordmark: true, mark };
		project.slides[0].variants!['iphone-6.9']!.check = { canvas: 'gold', mark: null };
		project.slides[1].variants!['iphone-6.9']!.check = { preset: 'detail' };
		const [left, right] = projectForTarget(project, 'iphone-6.9').slides;
		expect(left.check).toEqual({ canvas: 'gold', preset: 'hero', panel: true, wordmark: true });
		expect(right.check?.preset).toBe('detail');
		expect(projectForTarget(project, 'ipad-13').slides[0].check?.mark).toEqual(mark);
		expect(projectForTarget(project, 'ipad-13').slides[1]).not.toHaveProperty('check');
	});

	it('projects a pair only where this target has its source', () => {
		const project = fixture();
		project.panorama!.linenPhone = defaultLinenSettings('teal').phone;
		const phone = projectForTarget(project, 'iphone-6.9');
		expect(phone.continuityMode).toBe('paired');
		expect(phone.panorama).toMatchObject({
			leftId: 'left',
			rightId: 'right',
			tilt: -5,
			image: { id: 'large' }
		});
		expect(phone.panorama?.linenPhone).toEqual(project.panorama!.linenPhone);
		const tablet = projectForTarget(project, 'ipad-13');
		expect(tablet.panorama).toBeUndefined();
		expect(tablet.continuityMode).toBe('none');
		expect(() => parseProject(JSON.stringify(tablet))).not.toThrow();
	});

	it('prints appName, falling back to the working title only when it is unset', () => {
		const project = fixture();
		expect(projectForTarget({ ...project, name: 'Other' }, 'ipad-13').name).toBe('Sample App');
		const withoutBrand: ProjectV2 = { ...project };
		delete withoutBrand.appName;
		expect(projectForTarget(withoutBrand, 'ipad-13').name).toBe('Working title');
	});

	it('does not leak the slot id or stored-only fields into the renderer document', () => {
		const composition = projectForTarget({ ...fixture(), campaignId: 'slot' }, 'iphone-6.9');
		expect(composition).not.toHaveProperty('campaignId');
		expect(composition).not.toHaveProperty('assets');
		expect(composition).not.toHaveProperty('targets');
		expect(composition.slides[0]).not.toHaveProperty('variants');
	});
});

describe('activeTargets', () => {
	it('returns the declared outputs in order, from the catalog', () => {
		expect(activeTargets(fixture())).toEqual([
			DEVICES['iphone-6.9'],
			DEVICES['iphone-di-medium-1206x2622'],
			DEVICES['ipad-13']
		]);
	});
});

describe('normalizeProjectV2', () => {
	it('leaves an intact document untouched', () => {
		const project = fixture();
		expect(normalizeProjectV2(project)).toBe(project);
	});

	it('disconnects a pair whose frames are no longer adjacent', () => {
		const project = fixture();
		const reordered = {
			...project,
			slides: [{ ...shared, id: 'new' }, ...project.slides.reverse()]
		};
		const repaired = normalizeProjectV2(reordered);
		expect(repaired.panorama).toBeUndefined();
		expect(repaired.continuityMode).toBe('none');
	});
});

describe('sourceIssues', () => {
	function single(
		variant: NonNullable<StoredSlide['variants']>,
		assets: ProjectAsset[]
	): ProjectV2 {
		return {
			...fixture(),
			targets: Object.keys(variant) as ProjectV2['targets'],
			assets: Object.fromEntries(assets.map((item) => [item.id, item])),
			panorama: undefined,
			continuityMode: 'none',
			slides: [{ ...shared, id: 'one', variants: variant }]
		};
	}

	it('finds nothing when each frame has its exact native-size source', () => {
		const project = single(
			{
				'iphone-6.9': { source: { asset: 'large' } },
				'iphone-di-medium-1206x2622': { source: { asset: 'medium' } }
			},
			[asset('large', 1320, 2868), asset('medium', 1206, 2622)]
		);
		expect(sourceIssues(project)).toEqual([]);
	});

	it('blocks a missing source per target and names the frame and output', () => {
		const issues = sourceIssues(fixture());
		const missing = issues.filter((issue) => issue.code === 'missing-source');
		expect(missing.map((issue) => [issue.target, issue.slideIndex])).toEqual([
			['iphone-di-medium-1206x2622', 1],
			['ipad-13', 0],
			['ipad-13', 1]
		]);
		expect(missing[1].severity).toBe('block');
		expect(missing[1].message).toContain('Frame 1');
		expect(missing[1].message).toContain('iPad 13"');
	});

	it.each([
		['phone on tablet', 'ipad-13', 1320, 2868, 'wrong-class', 'block'],
		['phone on Duo', 'iphone-duo-inner-2007x2853', 1320, 2868, 'wrong-class', 'block'],
		['Duo inner on outer', 'iphone-duo-outer-1398x2034', 2007, 2853, 'wrong-class', 'block'],
		['rotated', 'iphone-6.9', 2868, 1320, 'wrong-orientation', 'block'],
		['low-res', 'iphone-6.9', 400, 800, 'upscaled', 'block'],
		['unlisted size', 'iphone-duo-inner-2007x2853', 1878, 2670, 'unknown', 'warn']
	] as const)('reports %s', (_label, target, width, height, code, severity) => {
		const issues = sourceIssues(
			single({ [target]: { source: { asset: 'x' } } }, [asset('x', width, height)])
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ code, severity, target, slideIndex: 0 });
	});

	it('keeps an accepted override blocked for store use, quoting the reason', () => {
		const [issue, ...rest] = sourceIssues(
			single(
				{ 'ipad-13': { source: { asset: 'x', nonNative: { reason: 'Mockup for review' } } } },
				[asset('x', 1320, 2868)]
			)
		);
		expect(rest).toEqual([]);
		expect(issue).toMatchObject({ code: 'non-native-source', severity: 'block' });
		expect(issue.message).toContain('Mockup for review');
		expect(issue.message).toContain('never read store-ready');
	});

	it('blocks synthetic captures from ever reading store-ready, even at an exact size', () => {
		const synthetic = { ...asset('x', 1398, 2034), provenance: { synthetic: true } };
		const issues = sourceIssues(
			single({ 'iphone-duo-outer-1398x2034': { source: { asset: 'x' } } }, [synthetic])
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ code: 'synthetic-source', severity: 'block' });
	});

	it('reports a binding whose asset is gone instead of throwing', () => {
		const issues = sourceIssues(single({ 'iphone-6.9': { source: { asset: 'gone' } } }, []));
		expect(issues[0]).toMatchObject({ code: 'missing-asset', severity: 'block' });
	});

	it('uses the pair’s source for both halves of a connected pair', () => {
		const project = fixture();
		project.targets = ['iphone-6.9'];
		project.slides = project.slides.map((slide) => {
			const unbound = { ...slide };
			delete unbound.variants;
			return unbound;
		});
		expect(sourceIssues(project)).toEqual([]);
	});

	it('checks only the requested targets', () => {
		const issues = sourceIssues(fixture(), ['iphone-6.9']);
		expect(issues).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import type { CheckMark, CheckSettings } from './check';
import type { ImageLayer, ProjectAsset, ProjectV2, StoredSlide } from './contracts';
import type { DeviceId } from './devices';
import {
	addAssets,
	addSlide,
	addTarget,
	applyProjectedEdit,
	assetUsage,
	bindPanoramaSource,
	bindSource,
	connectPair,
	disconnectPair,
	duplicateSlide,
	moveSlide,
	patchPanoramaVariant,
	patchSlide,
	patchSlideVariant,
	removeAsset,
	removeSlide,
	removeTarget,
	replaceAsset,
	rewriteAssetIds,
	setAppName,
	setSlideLayers,
	setSourceOverride,
	setWorkingTitle,
	unbindSource
} from './edits';
import { defaultLinenSettings, LINEN_SHARED_PHONE } from './linen';
import { parseProjectV2, serializePortableProject } from './migrate';
import { createSlide } from './studio';
import { normalizeProjectV2, projectForTarget } from './targets';
import type { Composition, Slide } from './types';

const PHONE = 'iphone-6.9' as const;
const MEDIUM = 'iphone-di-medium-1206x2622' as const;
const TABLET = 'ipad-13' as const;

const asset = (id: string, width = 1320, height = 2868, sha256?: string): ProjectAsset => ({
	id,
	...(sha256 ? { sha256 } : {}),
	mime: 'image/png',
	byteLength: 10,
	url: `blob:http://appshot.test/${id}`,
	naturalWidth: width,
	naturalHeight: height
});

const slide = (id: string, variants?: StoredSlide['variants']): StoredSlide => ({
	id,
	background: { kind: 'solid', colors: ['#123456'] },
	frame: 'none',
	layout: 'text-above',
	typography: { headline: id, fontColor: '#FFFFFF', fontWeight: 700 },
	effects: { shadow: 'none', glow: 0 },
	scale: 1,
	tilt: 0,
	fontScale: 1,
	...(variants ? { variants } : {})
});

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

/** Frozen, so any helper that mutated its input would throw. */
function project(): ProjectV2 {
	return deepFreeze<ProjectV2>({
		version: 2,
		name: 'Working title',
		appName: 'Billington',
		style: 'cobalt',
		accent: '#DAF975',
		targets: [PHONE, MEDIUM, TABLET],
		assets: {
			large: asset('large', 1320, 2868, 'a'.repeat(64)),
			medium: asset('medium', 1206, 2622, 'b'.repeat(64)),
			tablet: asset('tablet', 2064, 2752, 'c'.repeat(64))
		},
		continuityMode: 'none',
		slides: [
			slide('one', {
				[PHONE]: { source: { asset: 'large' }, scale: 1.2 },
				[MEDIUM]: { source: { asset: 'medium' } }
			}),
			slide('two', { [PHONE]: { source: { asset: 'large' } } }),
			slide('three')
		]
	});
}

const stored = (document: ProjectV2, id: string) =>
	document.slides.find((candidate) => candidate.id === id)!;

describe('campaign identity', () => {
	it('keeps the working title and the printed brand independent', () => {
		const retitled = setWorkingTitle(project(), 'Autumn test');
		expect(retitled.name).toBe('Autumn test');
		expect(projectForTarget(retitled, PHONE).name).toBe('Billington');
		const rebranded = setAppName(project(), 'Billy');
		expect(rebranded.name).toBe('Working title');
		expect(projectForTarget(rebranded, PHONE).name).toBe('Billy');
	});

	it('clears a blank brand, so the title prints again', () => {
		const cleared = setAppName(project(), '   ');
		expect(cleared).not.toHaveProperty('appName');
		expect(projectForTarget(cleared, PHONE).name).toBe('Working title');
	});
});

describe('targets', () => {
	it('adds an output with no sources copied from another target', () => {
		const original = project();
		const next = addTarget(original, 'iphone-duo-inner-2007x2853');
		expect(next.targets.at(-1)).toBe('iphone-duo-inner-2007x2853');
		expect(next.slides).toBe(original.slides);
		expect(next.assets).toBe(original.assets);
		const projected = projectForTarget(next, 'iphone-duo-inner-2007x2853');
		expect(projected.slides.every((frame) => !frame.primaryImage)).toBe(true);
	});

	it('does nothing for an output already declared, and refuses unknown ids', () => {
		const original = project();
		expect(addTarget(original, PHONE)).toBe(original);
		expect(() => addTarget(original, 'android-phone' as DeviceId)).toThrow(/catalog/);
	});

	it('removes an output and everything stored for it, and keeps its images in the library', () => {
		const withPair = bindPanoramaSource(
			connectPair(project(), 'one', { offset: 0, scale: 1, tilt: 0 }),
			PHONE,
			'large'
		);
		const next = removeTarget(withPair, PHONE);
		expect(next.targets).toEqual([MEDIUM, TABLET]);
		expect(Object.keys(stored(next, 'one').variants!)).toEqual([MEDIUM]);
		expect(stored(next, 'two')).not.toHaveProperty('variants');
		expect(next.panorama).not.toHaveProperty('variants');
		expect(next.assets.large).toBeDefined();
		expect(() => projectForTarget(next, PHONE)).toThrow(/not one of/);
	});

	it('refuses to remove the last output', () => {
		const one = removeTarget(removeTarget(project(), MEDIUM), TABLET);
		expect(() => removeTarget(one, PHONE)).toThrow(/at least one output/);
	});

	it('does not disturb other targets', () => {
		const before = project();
		const next = removeTarget(before, TABLET);
		for (const target of [PHONE, MEDIUM]) {
			expect(projectForTarget(next, target)).toEqual(projectForTarget(before, target));
		}
	});
});

describe('editing a frame', () => {
	it('sends shared copy to every target', () => {
		const next = patchSlide(project(), 'one', {
			typography: { headline: 'New', fontColor: '#000000', fontWeight: 400 }
		});
		for (const target of next.targets) {
			expect(projectForTarget(next, target).slides[0].typography.headline).toBe('New');
		}
	});

	it('clears an optional shared field with undefined', () => {
		const labeled = patchSlide(project(), 'one', { label: 'Hook' });
		expect(stored(labeled, 'one').label).toBe('Hook');
		expect(stored(patchSlide(labeled, 'one', { label: undefined }), 'one')).not.toHaveProperty(
			'label'
		);
	});

	it('keeps one target’s setting on that target', () => {
		const next = patchSlideVariant(project(), 'one', MEDIUM, { tilt: 7, layout: 'text-below' });
		expect(projectForTarget(next, MEDIUM).slides[0]).toMatchObject({
			tilt: 7,
			layout: 'text-below'
		});
		expect(projectForTarget(next, PHONE).slides[0]).toMatchObject({
			tilt: 0,
			layout: 'text-above',
			scale: 1.2
		});
		expect(projectForTarget(next, TABLET).slides[0].tilt).toBe(0);
	});

	it('restores the shared value when an override is removed, leaving no empty entries', () => {
		const set = patchSlideVariant(project(), 'three', TABLET, { tilt: 7 });
		expect(stored(set, 'three').variants?.[TABLET]).toEqual({ tilt: 7 });
		const cleared = patchSlideVariant(set, 'three', TABLET, { tilt: undefined });
		expect(stored(cleared, 'three')).not.toHaveProperty('variants');
		expect(cleared).toEqual(project());
	});

	it.each([
		['patchSlide', () => patchSlide(project(), 'gone', { label: 'x' })],
		['removeSlide', () => removeSlide(project(), 'gone')],
		['moveSlide', () => moveSlide(project(), 'gone', 1)],
		['duplicateSlide', () => duplicateSlide(project(), 'gone', 'copy')],
		['bindSource', () => bindSource(project(), 'gone', PHONE, 'large')]
	])('%s refuses a frame that no longer exists', (_name, edit) => {
		expect(edit).toThrow(/no longer in this campaign/);
	});

	it('refuses an output the campaign does not declare', () => {
		expect(() => patchSlideVariant(project(), 'one', 'iphone-6.7', { tilt: 1 })).toThrow(
			/not one of/
		);
		expect(() => bindSource(project(), 'one', 'iphone-6.7', 'large')).toThrow(/not one of/);
	});
});

describe('source bindings', () => {
	it('binds and unbinds a capture on one target only', () => {
		const bound = bindSource(project(), 'three', TABLET, 'tablet');
		expect(projectForTarget(bound, TABLET).slides[2].primaryImage?.id).toBe('tablet');
		expect(projectForTarget(bound, PHONE).slides[2].primaryImage).toBeUndefined();
		const unbound = unbindSource(bound, 'three', TABLET);
		expect(projectForTarget(unbound, TABLET).slides[2].primaryImage).toBeUndefined();
		expect(stored(unbound, 'three')).not.toHaveProperty('variants');
	});

	it('refuses an image not in the library', () => {
		expect(() => bindSource(project(), 'one', PHONE, 'gone')).toThrow(/Add it first/);
	});

	it('records an accepted override with its reason, and clears it when asked or rebound', () => {
		const accepted = setSourceOverride(project(), 'one', MEDIUM, 'Scaled for a draft');
		expect(stored(accepted, 'one').variants?.[MEDIUM]?.source).toEqual({
			asset: 'medium',
			nonNative: { reason: 'Scaled for a draft' }
		});
		expect(
			stored(setSourceOverride(accepted, 'one', MEDIUM, null), 'one').variants?.[MEDIUM]?.source
		).toEqual({ asset: 'medium' });
		expect(
			stored(bindSource(accepted, 'one', MEDIUM, 'large'), 'one').variants?.[MEDIUM]?.source
		).toEqual({ asset: 'large' });
	});

	it('requires a reason and an existing binding for an override', () => {
		expect(() => setSourceOverride(project(), 'one', MEDIUM, '  ')).toThrow(/Say why/);
		expect(() => setSourceOverride(project(), 'three', MEDIUM, 'x')).toThrow(/Add a capture/);
	});

	it('binding the same capture to many frames adds no asset', () => {
		const before = project();
		const next = bindSource(bindSource(before, 'two', MEDIUM, 'medium'), 'three', MEDIUM, 'medium');
		expect(next.assets).toBe(before.assets);
		expect(assetUsage(next).get('medium')).toBe(3);
	});
});

describe('image layers', () => {
	const layer: ImageLayer<string> = {
		id: 'callout',
		kind: 'source-crop',
		image: 'large',
		crop: { x: 40, y: 900, width: 1240, height: 320 },
		x: 30,
		y: 1800,
		scale: 1.02
	};

	it('stores layers per target and resolves them for projection', () => {
		const next = setSlideLayers(project(), 'one', PHONE, [layer]);
		expect(projectForTarget(next, PHONE).slides[0].layers?.[0].image.id).toBe('large');
		expect(projectForTarget(next, MEDIUM).slides[0].layers).toBeUndefined();
		expect(
			stored(setSlideLayers(next, 'one', PHONE, []), 'one').variants?.[PHONE]
		).not.toHaveProperty('layers');
	});

	it.each([
		[
			'a crop past the source',
			{ ...layer, crop: { ...layer.crop, width: 1281 } },
			/inside its image/
		],
		['a fractional crop', { ...layer, crop: { ...layer.crop, x: 0.5 } }, /whole pixels/],
		['a missing image', { ...layer, image: 'gone' }, /Add it first/],
		['no scale', { ...layer, scale: 0 }, /scale/]
	])('refuses %s', (_label, bad, message) => {
		expect(() => setSlideLayers(project(), 'one', PHONE, [bad])).toThrow(message);
	});

	it('refuses two layers with one id', () => {
		expect(() => setSlideLayers(project(), 'one', PHONE, [layer, layer])).toThrow(/own id/);
	});
});

describe('frame order', () => {
	it('adds, with a limit of ten frames', () => {
		let next = project();
		for (let index = 3; index < 10; index++) next = addSlide(next, slide(`extra-${index}`));
		expect(next.slides).toHaveLength(10);
		expect(() => addSlide(next, slide('eleven'))).toThrow(/up to 10/);
		expect(() => addSlide(project(), slide('one'))).toThrow(/already/);
		expect(addSlide(project(), slide('first'), 0).slides[0].id).toBe('first');
	});

	it('duplicates a frame with every target’s source', () => {
		const original = project();
		const next = duplicateSlide(original, 'one', 'copy');
		expect(next.slides.map((frame) => frame.id)).toEqual(['one', 'copy', 'two', 'three']);
		expect(stored(next, 'copy').variants).toEqual(stored(next, 'one').variants);
		expect(stored(next, 'copy').label).toBe('Screenshot copy');
		expect(next.assets).toBe(original.assets);
	});

	it('moves within bounds and refuses to remove the last frame', () => {
		expect(moveSlide(project(), 'one', 1).slides.map((frame) => frame.id)).toEqual([
			'two',
			'one',
			'three'
		]);
		const original = project();
		expect(moveSlide(original, 'one', -1)).toBe(original);
		const single = removeSlide(removeSlide(project(), 'two'), 'three');
		expect(() => removeSlide(single, 'one')).toThrow(/at least one/);
	});
});

describe('connected pair', () => {
	const placement = { offset: 0, scale: 1, tilt: -14 };

	it('connects a frame to its right neighbor, projecting only where it has a source', () => {
		const paired = bindPanoramaSource(connectPair(project(), 'one', placement), PHONE, 'large');
		const phone = projectForTarget(paired, PHONE);
		expect(phone.continuityMode).toBe('paired');
		expect(phone.panorama?.image.id).toBe('large');
		expect(projectForTarget(paired, TABLET).panorama).toBeUndefined();
		expect(() => connectPair(project(), 'three', placement)).toThrow(/to its right/);
	});

	it('linking a pair adds no image bytes', () => {
		const before = project();
		const paired = bindPanoramaSource(connectPair(before, 'one', placement), PHONE, 'large');
		expect(paired.assets).toBe(before.assets);
	});

	it('keeps pair placement per target', () => {
		const paired = bindPanoramaSource(
			bindPanoramaSource(connectPair(project(), 'one', placement), PHONE, 'large'),
			MEDIUM,
			'medium'
		);
		const moved = patchPanoramaVariant(paired, MEDIUM, { tilt: 5 });
		expect(projectForTarget(moved, MEDIUM).panorama?.tilt).toBe(5);
		expect(projectForTarget(moved, PHONE).panorama?.tilt).toBe(-14);
		expect(moved.panorama?.tilt).toBe(-14);
	});

	it('disconnects everywhere, and normalize disconnects a broken pair', () => {
		const paired = bindPanoramaSource(connectPair(project(), 'one', placement), PHONE, 'large');
		const off = disconnectPair(paired);
		expect(off).not.toHaveProperty('panorama');
		expect(off.continuityMode).toBe('none');
		const broken = normalizeProjectV2(moveSlide(paired, 'one', 2));
		expect(broken.panorama).toBeUndefined();
		expect(broken.continuityMode).toBe('none');
		expect(() => patchPanoramaVariant(project(), PHONE, { tilt: 1 })).toThrow(/Connect/);
	});
});

describe('the library', () => {
	const sha = (letter: string) => letter.repeat(64);

	it('adds new images and reuses a record for identical bytes', () => {
		const added = addAssets(project(), [
			asset('fresh', 1320, 2868, sha('d')),
			asset('same-bytes', 1320, 2868, sha('a')),
			asset('fresh-again', 1320, 2868, sha('d'))
		]);
		expect(added.ids).toEqual(['fresh', 'large', 'fresh']);
		expect(Object.keys(added.project.assets)).toEqual(['large', 'medium', 'tablet', 'fresh']);
	});

	it('returns the same document when nothing is new', () => {
		const original = project();
		const added = addAssets(original, [original.assets.large]);
		expect(added.project).toBe(original);
		expect(added.ids).toEqual(['large']);
	});

	it('adds a name or provenance the existing record lacks, keeping what it has', () => {
		const original = project();
		const named = addAssets(original, [
			{ ...asset('dup', 1320, 2868, sha('a')), name: 'home.png', provenance: { device: 'x' } }
		]);
		expect(named.project.assets.large).toMatchObject({
			id: 'large',
			url: original.assets.large.url,
			name: 'home.png',
			provenance: { device: 'x' }
		});
		const renamed = addAssets(named.project, [
			{ ...asset('dup', 1320, 2868, sha('a')), name: 'other.png' }
		]);
		expect(renamed.project).toBe(named.project);
	});

	it('counts each use across frames, layers and pairs', () => {
		const next = bindPanoramaSource(
			setSlideLayers(
				connectPair(project(), 'one', { offset: 0, scale: 1, tilt: 0 }),
				'two',
				MEDIUM,
				[
					{
						id: 'l',
						kind: 'art',
						image: 'tablet',
						crop: { x: 0, y: 0, width: 1, height: 1 },
						x: 0,
						y: 0,
						scale: 1
					}
				]
			),
			PHONE,
			'large'
		);
		expect([...assetUsage(next)]).toEqual([
			['large', 3],
			['medium', 1],
			['tablet', 1]
		]);
	});

	it('removes an image everywhere, leaving frames without a source', () => {
		const next = removeAsset(project(), 'large');
		expect(next.assets).not.toHaveProperty('large');
		expect(stored(next, 'one').variants).toEqual({
			[PHONE]: { scale: 1.2 },
			[MEDIUM]: { source: { asset: 'medium' } }
		});
		expect(stored(next, 'two')).not.toHaveProperty('variants');
		expect(projectForTarget(next, PHONE).slides[0].primaryImage).toBeUndefined();
		const original = project();
		expect(removeAsset(original, 'gone')).toBe(original);
	});

	it('removes a layer whose image is removed, and the pair’s binding', () => {
		const withBoth = bindPanoramaSource(
			setSlideLayers(
				connectPair(project(), 'one', { offset: 0, scale: 1, tilt: 0 }),
				'one',
				PHONE,
				[
					{
						id: 'l',
						kind: 'source-crop',
						image: 'large',
						crop: { x: 0, y: 0, width: 1, height: 1 },
						x: 0,
						y: 0,
						scale: 1
					}
				]
			),
			PHONE,
			'large'
		);
		const next = removeAsset(withBoth, 'large');
		expect(stored(next, 'one').variants?.[PHONE]).toEqual({ scale: 1.2 });
		expect(next.panorama).not.toHaveProperty('variants');
		expect(projectForTarget(next, PHONE).panorama).toBeUndefined();
	});

	it('replaces a capture everywhere, trimming crops to the new image and clearing overrides', () => {
		const set = setSlideLayers(project(), 'one', MEDIUM, [
			{
				id: 'fits',
				kind: 'source-crop',
				image: 'medium',
				crop: { x: 0, y: 2000, width: 1206, height: 622 },
				x: 0,
				y: 0,
				scale: 1
			},
			{
				id: 'outside',
				kind: 'source-crop',
				image: 'medium',
				crop: { x: 1100, y: 0, width: 100, height: 10 },
				x: 0,
				y: 0,
				scale: 1
			}
		]);
		const accepted = setSourceOverride(set, 'one', MEDIUM, 'old reason');
		const next = replaceAsset(accepted, 'medium', asset('new', 1000, 2200, sha('e')));
		const variant = stored(next, 'one').variants?.[MEDIUM];
		expect(variant?.source).toEqual({ asset: 'new' });
		expect(variant?.layers?.map((layer) => [layer.id, layer.image, layer.crop])).toEqual([
			['fits', 'new', { x: 0, y: 2000, width: 1000, height: 200 }]
		]);
		expect(next.assets).not.toHaveProperty('medium');
		expect(next.assets.new).toBeDefined();
	});

	it('treats replacing with the same bytes as no change', () => {
		const original = project();
		expect(replaceAsset(original, 'large', asset('dup', 1320, 2868, sha('a')))).toBe(original);
	});

	it('merges two records of one image, keeping an accepted override', () => {
		const accepted = setSourceOverride(project(), 'one', MEDIUM, 'kept reason');
		const merged = rewriteAssetIds(accepted, new Map([['medium', 'large']]));
		expect(stored(merged, 'one').variants?.[MEDIUM]?.source).toEqual({
			asset: 'large',
			nonNative: { reason: 'kept reason' }
		});
	});

	it('still reopens after every library edit', () => {
		const portable = (document: ProjectV2): ProjectV2 => ({
			...document,
			assets: Object.fromEntries(
				Object.values(document.assets).map((item) => [
					item.id,
					{ ...item, url: '/demo/home.png', byteLength: 0 }
				])
			)
		});
		const edited = replaceAsset(
			removeAsset(project(), 'tablet'),
			'medium',
			asset('new', 1206, 2622, sha('e'))
		);
		expect(() => parseProjectV2(serializePortableProject(portable(edited)).join(''))).not.toThrow();
	});
});

describe('applyProjectedEdit: writing a single-target edit back', () => {
	const refOf = (document: ProjectV2, id: string) => ({
		id,
		blobUrl: document.assets[id].url,
		naturalWidth: document.assets[id].naturalWidth,
		naturalHeight: document.assets[id].naturalHeight
	});
	const editSlide = (composition: Composition, id: string, patch: Partial<Slide>): Composition => ({
		...composition,
		slides: composition.slides.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame))
	});

	/** The law every edit obeys: projecting the result gives back exactly what was edited. */
	function expectRoundTrip(
		document: ProjectV2,
		target: DeviceId,
		edit: (composition: Composition) => Composition
	): ProjectV2 {
		const edited = edit(projectForTarget(document, target));
		const next = applyProjectedEdit(document, target, edited);
		expect(projectForTarget(next, target)).toEqual(edited);
		return next;
	}

	it('changes nothing when nothing was edited', () => {
		const original = project();
		const next = applyProjectedEdit(original, PHONE, projectForTarget(original, PHONE));
		expect(next).toEqual(original);
	});

	it('sends copy and frame treatment to every target', () => {
		const next = expectRoundTrip(project(), PHONE, (view) =>
			editSlide(view, 'one', {
				typography: { headline: 'Shared', fontColor: '#000000', fontWeight: 400 },
				frame: 'clay',
				badge: 'New',
				effects: { shadow: 'soft', glow: 0.5 },
				background: { kind: 'solid', colors: ['#654321'] }
			})
		);
		const other = projectForTarget(next, MEDIUM).slides[0];
		expect(other).toMatchObject({
			typography: { headline: 'Shared' },
			frame: 'clay',
			badge: 'New',
			effects: { glow: 0.5 },
			background: { colors: ['#654321'] }
		});
		expect(other.primaryImage?.id).toBe('medium');
	});

	it('keeps placement on the active target', () => {
		const next = expectRoundTrip(project(), MEDIUM, (view) =>
			editSlide(view, 'one', { scale: 0.8, tilt: -6, fontScale: 1.1, layout: 'text-below' })
		);
		expect(stored(next, 'one').variants?.[MEDIUM]).toMatchObject({
			scale: 0.8,
			tilt: -6,
			fontScale: 1.1,
			layout: 'text-below'
		});
		expect(projectForTarget(next, PHONE).slides[0]).toMatchObject({
			scale: 1.2,
			tilt: 0,
			fontScale: 1,
			layout: 'text-above'
		});
		expect(stored(next, 'one').scale).toBe(1);
	});

	it('removes an override when a target returns to the shared value', () => {
		const edited = expectRoundTrip(project(), PHONE, (view) =>
			editSlide(view, 'one', { scale: 1 })
		);
		expect(stored(edited, 'one').variants?.[PHONE]).toEqual({ source: { asset: 'large' } });
	});

	it('binds an image on the active target only, keeping an override on an unchanged image', () => {
		const original = project();
		const bound = expectRoundTrip(original, TABLET, (view) =>
			editSlide(view, 'three', { primaryImage: refOf(original, 'tablet') })
		);
		expect(stored(bound, 'three').variants).toEqual({ [TABLET]: { source: { asset: 'tablet' } } });
		const accepted = setSourceOverride(original, 'one', MEDIUM, 'kept');
		const edited = expectRoundTrip(accepted, MEDIUM, (view) => editSlide(view, 'one', { tilt: 3 }));
		expect(stored(edited, 'one').variants?.[MEDIUM]?.source?.nonNative?.reason).toBe('kept');
		const rebound = expectRoundTrip(accepted, MEDIUM, (view) =>
			editSlide(view, 'one', { primaryImage: refOf(accepted, 'large') })
		);
		expect(stored(rebound, 'one').variants?.[MEDIUM]?.source).toEqual({ asset: 'large' });
	});

	it('refuses an image that has not been added to the library', () => {
		const original = project();
		expect(() =>
			applyProjectedEdit(
				original,
				PHONE,
				editSlide(projectForTarget(original, PHONE), 'one', {
					primaryImage: { id: 'loose', blobUrl: 'blob:x', naturalWidth: 1, naturalHeight: 1 }
				})
			)
		).toThrow(/Add it first/);
	});

	it('removes an image from the active target only', () => {
		const next = expectRoundTrip(project(), PHONE, (view) => {
			const frames = view.slides.map((frame) => {
				const without = { ...frame };
				delete without.primaryImage;
				return without;
			});
			return { ...view, slides: frames };
		});
		expect(projectForTarget(next, MEDIUM).slides[0].primaryImage?.id).toBe('medium');
		expect(projectForTarget(next, PHONE).slides[0].primaryImage).toBeUndefined();
	});

	it('writes layers with asset ids on the active target', () => {
		const original = project();
		const next = expectRoundTrip(original, PHONE, (view) =>
			editSlide(view, 'one', {
				layers: [
					{
						id: 'callout',
						kind: 'source-crop',
						image: refOf(original, 'large'),
						crop: { x: 0, y: 0, width: 10, height: 10 },
						x: 1,
						y: 2,
						scale: 1
					}
				]
			})
		);
		expect(stored(next, 'one').variants?.[PHONE]?.layers?.[0].image).toBe('large');
		expect(projectForTarget(next, MEDIUM).slides[0].layers).toBeUndefined();
		const cleared = expectRoundTrip(next, PHONE, (view) => {
			const frames = view.slides.map((frame) => {
				const without = { ...frame };
				delete without.layers;
				return without;
			});
			return { ...view, slides: frames };
		});
		expect(stored(cleared, 'one').variants?.[PHONE]).not.toHaveProperty('layers');
	});

	it('updates style, accent and the printed brand for the whole campaign', () => {
		const next = expectRoundTrip(project(), PHONE, (view) => ({
			...view,
			name: 'Billy',
			style: 'paper',
			accent: '#C65F3B'
		}));
		expect(next).toMatchObject({ appName: 'Billy', name: 'Working title', style: 'paper' });
		expect(projectForTarget(next, TABLET)).toMatchObject({ name: 'Billy', accent: '#C65F3B' });
	});

	describe('Table Linen settings', () => {
		const linen = defaultLinenSettings('teal');
		const withLinen = () => patchSlide(project(), 'one', { linen });

		it('makes the first settings on a frame the base for every target', () => {
			const next = expectRoundTrip(project(), PHONE, (view) => editSlide(view, 'one', { linen }));
			expect(stored(next, 'one').linen).toEqual(linen);
			expect(projectForTarget(next, TABLET).slides[0].linen).toEqual(linen);
		});

		it('shares the palette but keeps positions on the active target', () => {
			const colors = { ...linen.colors, canvas: '#000000' };
			const layout = { ...linen.layout, headlineTop: 300 };
			const phone = { ...linen.phone, top: 800 };
			const next = expectRoundTrip(withLinen(), MEDIUM, (view) =>
				editSlide(view, 'one', { linen: { ...linen, colors, layout, phone, band: false } })
			);
			expect(stored(next, 'one').linen).toEqual({ ...linen, colors, band: false });
			expect(stored(next, 'one').variants?.[MEDIUM]?.linen).toEqual({ layout, phone });
			expect(projectForTarget(next, TABLET).slides[0].linen).toEqual({
				...linen,
				colors,
				band: false
			});
		});

		it('keeps writing a group this target already overrides to this target', () => {
			const colors = { ...linen.colors, canvas: '#111111' };
			const overridden = patchSlideVariant(withLinen(), 'one', MEDIUM, { linen: { colors } });
			const next = expectRoundTrip(overridden, MEDIUM, (view) =>
				editSlide(view, 'one', {
					linen: { ...view.slides[0].linen!, colors: { ...colors, canvas: '#222222' } }
				})
			);
			expect(stored(next, 'one').linen).toEqual(linen);
			expect(stored(next, 'one').variants?.[MEDIUM]?.linen?.colors?.canvas).toBe('#222222');
		});

		it('drops an override that returns to the shared group', () => {
			const layout = { ...linen.layout, margin: 12 };
			const set = expectRoundTrip(withLinen(), PHONE, (view) =>
				editSlide(view, 'one', { linen: { ...linen, layout } })
			);
			const back = expectRoundTrip(set, PHONE, (view) => editSlide(view, 'one', { linen }));
			expect(stored(back, 'one').variants?.[PHONE]).not.toHaveProperty('linen');
		});
	});

	describe('The Check settings', () => {
		const check: CheckSettings = { canvas: 'teal', preset: 'hero', panel: true, wordmark: true };
		const mark: CheckMark = {
			kind: 'ring',
			anchor: 'panel',
			rect: { x: 1, y: 2, width: 3, height: 4 },
			seed: 5
		};
		const withCheck = () => patchSlide(project(), 'one', { check });

		it('makes the first settings the shared base', () => {
			const next = expectRoundTrip(project(), PHONE, (view) => editSlide(view, 'one', { check }));
			expect(stored(next, 'one').check).toEqual(check);
			expect(stored(next, 'one').variants?.[PHONE]).not.toHaveProperty('check');
		});

		it.each([false, true])(
			'keeps the first mark and torn edge on their own target (prior override: %s)',
			(priorOverride) => {
				const original = priorOverride
					? patchSlideVariant(project(), 'one', MEDIUM, { check: { preset: 'detail' } })
					: project();
				const next = expectRoundTrip(original, MEDIUM, (view) =>
					editSlide(view, 'one', { check: { ...check, mark, tear: 'proof-crop' } })
				);
				expect(projectForTarget(next, MEDIUM).slides[0].check).toEqual({
					...check,
					mark,
					tear: 'proof-crop'
				});
				expect(projectForTarget(next, PHONE).slides[0].check).not.toHaveProperty('mark');
				expect(projectForTarget(next, PHONE).slides[0].check).not.toHaveProperty('tear');
			}
		);

		it('shares a canvas change and keeps a pen mark on the active target', () => {
			const next = expectRoundTrip(withCheck(), MEDIUM, (view) =>
				editSlide(view, 'one', { check: { ...check, canvas: 'gold', mark } })
			);
			expect(stored(next, 'one').check).toEqual({ ...check, canvas: 'gold' });
			expect(stored(next, 'one').variants?.[MEDIUM]?.check).toEqual({ mark });
			expect(projectForTarget(next, PHONE).slides[0].check).toEqual({ ...check, canvas: 'gold' });
		});

		it('removes a shared mark on just the active target', () => {
			const marked = patchSlide(project(), 'one', { check: { ...check, mark } });
			const next = expectRoundTrip(marked, MEDIUM, (view) => editSlide(view, 'one', { check }));
			expect(stored(next, 'one').check?.mark).toEqual(mark);
			expect(stored(next, 'one').variants?.[MEDIUM]?.check).toEqual({ mark: null });
			expect(projectForTarget(next, PHONE).slides[0].check?.mark).toEqual(mark);
		});

		it('keeps a torn edge on its target without discarding existing overrides', () => {
			const original = patchSlideVariant(withCheck(), 'one', MEDIUM, {
				check: { preset: 'detail', mark }
			});
			const next = expectRoundTrip(original, MEDIUM, (view) =>
				editSlide(view, 'one', { check: { ...view.slides[0].check!, tear: 'proof-crop' } })
			);
			expect(stored(next, 'one').variants?.[MEDIUM]?.check).toEqual({
				preset: 'detail',
				mark,
				tear: 'proof-crop'
			});
			expect(projectForTarget(next, PHONE).slides[0].check).toEqual(check);
		});

		it('removes a shared torn edge only for the active target', () => {
			const original = patchSlide(project(), 'one', { check: { ...check, tear: 'proof-crop' } });
			const next = expectRoundTrip(original, MEDIUM, (view) => editSlide(view, 'one', { check }));
			expect(stored(next, 'one').variants?.[MEDIUM]?.check).toEqual({ tear: null });
			expect(projectForTarget(next, PHONE).slides[0].check?.tear).toBe('proof-crop');
		});

		it('keeps writing a key this target already overrides to this target', () => {
			const overridden = patchSlideVariant(withCheck(), 'one', MEDIUM, {
				check: { preset: 'detail' }
			});
			const next = expectRoundTrip(overridden, MEDIUM, (view) =>
				editSlide(view, 'one', { check: { ...view.slides[0].check!, preset: 'closer' } })
			);
			expect(stored(next, 'one').check?.preset).toBe('hero');
			expect(stored(next, 'one').variants?.[MEDIUM]?.check?.preset).toBe('closer');
		});
	});

	describe('frame order', () => {
		it('adds a new frame with its image on this target and its copy shared', () => {
			const original = project();
			const fresh = {
				...createSlide(3, refOf(original, 'medium')),
				id: 'fresh',
				device: MEDIUM,
				continuity: { inset: 0 }
			};
			const next = expectRoundTrip(original, MEDIUM, (view) => ({
				...view,
				slides: [...view.slides, fresh]
			}));
			expect(stored(next, 'fresh').variants).toEqual({ [MEDIUM]: { source: { asset: 'medium' } } });
			expect(projectForTarget(next, PHONE).slides[3].typography).toEqual(fresh.typography);
			expect(projectForTarget(next, PHONE).slides[3].primaryImage).toBeUndefined();
		});

		it('keeps other targets’ data through a reorder and a removal', () => {
			const original = project();
			const reordered = expectRoundTrip(original, PHONE, (view) => ({
				...view,
				slides: [view.slides[1], view.slides[0]]
			}));
			expect(reordered.slides.map((frame) => frame.id)).toEqual(['two', 'one']);
			expect(stored(reordered, 'one').variants?.[MEDIUM]).toEqual(
				stored(original, 'one').variants?.[MEDIUM]
			);
		});
	});

	describe('connected pair', () => {
		const paired = () =>
			bindPanoramaSource(
				connectPair(project(), 'one', { offset: 0, scale: 1, tilt: -14 }),
				PHONE,
				'large'
			);

		it('stores a new pair for the active target', () => {
			const original = project();
			const next = expectRoundTrip(original, PHONE, (view) => ({
				...view,
				continuityMode: 'paired',
				panorama: {
					leftId: 'one',
					rightId: 'two',
					image: refOf(original, 'large'),
					offset: 5,
					scale: 1,
					tilt: -14,
					linenPhone: LINEN_SHARED_PHONE
				}
			}));
			expect(next.continuityMode).toBe('paired');
			expect(next.panorama?.variants).toEqual({ [PHONE]: { source: { asset: 'large' } } });
			expect(next.panorama?.offset).toBe(5);
		});

		it('keeps placement per target', () => {
			const twoTargets = bindPanoramaSource(paired(), MEDIUM, 'medium');
			const next = expectRoundTrip(twoTargets, MEDIUM, (view) => ({
				...view,
				panorama: { ...view.panorama!, tilt: 7, offset: 9 }
			}));
			expect(next.panorama).toMatchObject({ tilt: -14, offset: 0 });
			expect(projectForTarget(next, MEDIUM).panorama).toMatchObject({ tilt: 7, offset: 9 });
			expect(projectForTarget(next, PHONE).panorama).toMatchObject({ tilt: -14, offset: 0 });
		});

		it('does not disturb a pair that this target has no source for', () => {
			const original = paired();
			const next = expectRoundTrip(original, TABLET, (view) => editSlide(view, 'one', { tilt: 3 }));
			expect(next.panorama).toEqual(original.panorama);
			expect(next.continuityMode).toBe('paired');
			expect(projectForTarget(next, PHONE).continuityMode).toBe('paired');
		});

		it('disconnects for every target when removed on one', () => {
			const next = expectRoundTrip(paired(), PHONE, (view) => {
				const without = { ...view, continuityMode: 'none' as const };
				delete without.panorama;
				return without;
			});
			expect(next).not.toHaveProperty('panorama');
			expect(next.continuityMode).toBe('none');
		});

		it('gives a different pair a fresh start, without another pair’s placements', () => {
			const twoTargets = bindPanoramaSource(paired(), MEDIUM, 'medium');
			const original = project();
			const next = expectRoundTrip(twoTargets, PHONE, (view) => ({
				...view,
				panorama: {
					leftId: 'two',
					rightId: 'three',
					image: refOf(original, 'large'),
					offset: 0,
					scale: 1,
					tilt: 0
				}
			}));
			expect(Object.keys(next.panorama!.variants!)).toEqual([PHONE]);
			expect(projectForTarget(next, MEDIUM).panorama).toBeUndefined();
		});
	});

	it('refuses to switch outputs through an edit', () => {
		const original = project();
		expect(() =>
			applyProjectedEdit(original, PHONE, { ...projectForTarget(original, PHONE), device: MEDIUM })
		).toThrow(/target selector/);
	});

	it('leaves other targets exactly as they were, across a mix of edits', () => {
		const original = bindPanoramaSource(
			connectPair(project(), 'one', { offset: 0, scale: 1, tilt: -14 }),
			MEDIUM,
			'medium'
		);
		const next = expectRoundTrip(original, PHONE, (view) =>
			editSlide(editSlide(view, 'one', { scale: 0.9, tilt: 3 }), 'two', { layout: 'centered' })
		);
		for (const target of [MEDIUM, TABLET]) {
			expect(projectForTarget(next, target)).toEqual(projectForTarget(original, target));
		}
	});
});

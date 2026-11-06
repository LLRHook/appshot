import { describe, expect, it, vi } from 'vitest';
import type { Issue, ProjectAsset, ProjectV2 } from '../model/contracts';
import { DEVICES, type DeviceId } from '../model/devices';
import { defaultLinenSettings } from '../model/linen';
import { createSlide } from '../model/studio';
import { assetOf, campaign, FULL_RECORD, RECOMMENDED, storedSlide } from './__fixtures__/export';
import { createPreflight, hasBlockingIssue, type PreflightRuntime } from './preflight';

const DUO: DeviceId[] = ['iphone-duo-outer-1398x2034', 'iphone-duo-inner-2007x2853'];
const NOW = new Date('2026-11-06T00:00:00Z');

/** Static checks only, unless a test gives it a painter. */
const check = (project: ProjectV2, runtime: PreflightRuntime = {}, targets?: readonly DeviceId[]) =>
	createPreflight({ now: () => NOW, ...runtime })(project, {
		layout: Boolean(runtime.dryRun),
		...(targets ? { targets } : {})
	});

const codes = (issues: readonly Issue[], severity?: Issue['severity']) =>
	issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.code);

const only = (issues: readonly Issue[], code: string) =>
	issues.filter((issue) => issue.code === code);

/** The same frame with `asset` swapped in for one output's capture. */
function bind(
	project: ProjectV2,
	target: DeviceId,
	slideIndex: number,
	asset: ProjectAsset,
	nonNative?: { reason: string }
): ProjectV2 {
	const slides = project.slides.map((slide, index) =>
		index !== slideIndex
			? slide
			: {
					...slide,
					variants: {
						...slide.variants,
						[target]: {
							...slide.variants?.[target],
							source: { asset: asset.id, ...(nonNative ? { nonNative } : {}) }
						}
					}
				}
	);
	return { ...project, slides, assets: { ...project.assets, [asset.id]: asset } };
}

const record = (device: string) => ({ provenance: { ...FULL_RECORD, device } });

describe('a campaign with everything in place', () => {
	it('has no blocking finding, and says what it still cannot prove', async () => {
		const issues = await check(campaign());
		expect(hasBlockingIssue(issues)).toBe(false);
		expect(codes(issues, 'block')).toEqual([]);
		expect(only(issues, 'capture-crop-unmeasured').length).toBeGreaterThan(0);
	});

	it('never words a result as compliant or approved (A21)', async () => {
		const failing = bind(
			{ ...campaign(['iphone-6.9', 'ipad-13']), slides: [] },
			'ipad-13',
			0,
			assetOf('x', 10, 10)
		);
		const issues = [...(await check(failing)), ...(await check(campaign()))];
		expect(issues.length).toBeGreaterThan(3);
		for (const issue of issues) expect(issue.message).not.toMatch(/compliant|approved/i);
	});
});

describe('required, conditional and future classes (E24)', () => {
	it('blocks an iPhone and iPad campaign with no 1206 × 2622, in Apple words', async () => {
		const issues = await check(campaign(['iphone-6.9', 'ipad-13']));
		const [missing] = only(issues, 'required-class-missing');
		expect(missing).toMatchObject({ severity: 'block', control: 'additional-output' });
		expect(missing.message).toContain('iPhone with Dynamic Island (medium display)');
		expect(missing.message).toContain('1206 × 2622');
		expect(only(issues, 'required-class-missing')).toHaveLength(1);
	});

	it('accepts the other size of that class, and a landscape one', async () => {
		for (const target of [
			'iphone-di-medium-1179x2556',
			'iphone-di-medium-2622x1206'
		] as DeviceId[]) {
			expect(DEVICES[target].classId).toBe('iphone-di-medium');
			const issues = await check(campaign([target, 'iphone-6.9']));
			expect(only(issues, 'required-class-missing')).toEqual([]);
		}
	});

	it('reports Duo as future, April 2027, never as blocking', async () => {
		for (const project of [campaign(), campaign([...RECOMMENDED, ...DUO])]) {
			const issues = await check(project);
			const [future] = only(issues, 'future-class');
			expect(future.severity).toBe('info');
			expect(future.message).toContain('April 2027');
			expect(hasBlockingIssue(issues)).toBe(false);
		}
	});

	it('requires iPad 13" only once the campaign has an iPad output', async () => {
		const phoneOnly = await check(campaign(['iphone-di-medium-1206x2622', 'iphone-6.9']));
		expect(hasBlockingIssue(phoneOnly)).toBe(false);
		expect(only(phoneOnly, 'ipad-not-declared')[0].severity).toBe('info');
		const smallerIpad = await check(
			campaign(['iphone-di-medium-1206x2622', 'iphone-6.9', 'ipad-11-1668x2388'] as DeviceId[])
		);
		const [missing] = only(smallerIpad, 'required-class-missing');
		expect(missing.message).toContain('iPad 13-inch display');
	});

	it('does not assume an iPad-only campaign needs iPhone sizes', async () => {
		const issues = await check(campaign(['ipad-13']));
		expect(hasBlockingIssue(issues)).toBe(false);
		expect(only(issues, 'iphone-not-declared')[0].severity).toBe('info');
	});

	it('wants a large iPhone class once iPhone is declared', async () => {
		const issues = await check(campaign(['iphone-di-medium-1206x2622', 'ipad-13']));
		const [conditional] = only(issues, 'conditional-class-missing');
		expect(conditional.severity).toBe('block');
		expect(conditional.message).toContain('1320 × 2868');
		const faceId = await check(campaign(['iphone-di-medium-1206x2622', 'iphone-6.7']));
		expect(only(faceId, 'conditional-class-missing')).toEqual([]);
	});

	it('treats inner and outer as two displays', async () => {
		const issues = await check(campaign([...RECOMMENDED, 'iphone-duo-outer-1398x2034']));
		const [one] = only(issues, 'duo-display-missing');
		expect(one.severity).toBe('warn');
		expect(one.message).toContain('inner');
		expect(only(await check(campaign([...RECOMMENDED, ...DUO])), 'duo-display-missing')).toEqual(
			[]
		);
	});

	it('warns once the specification it knows has aged past 90 days', async () => {
		const later = () => new Date('2027-03-01T00:00:00Z');
		expect(codes(await check(campaign()))).not.toContain('spec-stale');
		expect(codes(await check(campaign(), { now: later }))).toContain('spec-stale');
	});
});

describe('1 to 10 per device size (A5)', () => {
	it('blocks no frames and an eleventh frame', async () => {
		const empty = await check({ ...campaign(), slides: [] });
		expect(only(empty, 'no-frames')[0].severity).toBe('block');
		const eleven = await check(campaign(RECOMMENDED, 11));
		expect(only(eleven, 'too-many-frames')[0].message).toContain('remove 1');
		expect(hasBlockingIssue(await check(campaign(RECOMMENDED, 10)))).toBe(false);
	});
});

describe('sources (A6, E26)', () => {
	const iphone = assetOf('phone', 1320, 2868, record('iPhone 18 Pro Max'));
	const tablet = assetOf('tablet', 2064, 2752, record('iPad Pro'));
	const landscape = assetOf('wide', 2868, 1320, record('iPhone 18 Pro Max'));
	const outer = assetOf('outer', 1398, 2034, record('iPhone Duo'));

	it.each([
		['iPhone on iPad', 'ipad-13', iphone, 'wrong-class'],
		['iPhone on Duo', 'iphone-duo-inner-2007x2853', iphone, 'wrong-class'],
		['iPad on iPhone', 'iphone-6.9', tablet, 'wrong-class'],
		['Duo outer on Duo inner', 'iphone-duo-inner-2007x2853', outer, 'wrong-class'],
		['landscape on portrait', 'iphone-6.9', landscape, 'wrong-orientation']
	] as const)('blocks %s', async (_, target, asset, code) => {
		const issues = await check(bind(campaign([...RECOMMENDED, ...DUO]), target, 1, asset));
		const [found] = only(issues, code);
		expect(found).toMatchObject({
			severity: 'block',
			target,
			slideIndex: 1,
			control: 'frame-source'
		});
	});

	it('never substitutes a capture when a frame has none for an output', async () => {
		const project = campaign(RECOMMENDED, 2, (target, slideIndex) =>
			target === 'ipad-13' && slideIndex === 0 ? null : {}
		);
		const [missing] = only(await check(project), 'missing-source');
		expect(missing).toMatchObject({ severity: 'block', target: 'ipad-13', slideIndex: 0 });
	});

	it('keeps a synthetic Duo capture out of store export, even at the exact size', async () => {
		const synthetic = assetOf('fake', 1398, 2034, {
			provenance: { synthetic: true, tool: 'layout probe' }
		});
		const project = bind(
			campaign([...RECOMMENDED, ...DUO]),
			'iphone-duo-outer-1398x2034',
			0,
			synthetic
		);
		const [found] = only(await check(project), 'synthetic-source');
		expect(found.severity).toBe('block');
		expect(found.message).toContain('never read store-ready');
	});

	it('keeps an accepted non-native capture out of store export', async () => {
		const project = bind(campaign(), 'ipad-13', 0, iphone, { reason: 'layout review' });
		const issues = await check(project);
		expect(only(issues, 'non-native-source')[0].severity).toBe('block');
		expect(only(issues, 'non-native-source')[0].message).toContain('layout review');
	});

	it('says an exact size proves size only, as "unverified source"', async () => {
		const bare = assetOf('bare', 2064, 2752);
		const [unverified] = only(
			await check(bind(campaign(), 'ipad-13', 0, bare)),
			'unverified-source'
		);
		expect(unverified).toMatchObject({ severity: 'warn', target: 'ipad-13' });
		expect(unverified.message).toContain('unverified source');
		expect(unverified.message).toContain('Frame 1');
		expect(only(await check(campaign()), 'unverified-source')).toEqual([]);
	});

	it('blocks a capture whose own record names another kind of device', async () => {
		const resized = assetOf('resized', 1398, 2034, record('iPhone 18 Pro'));
		const project = bind(
			campaign([...RECOMMENDED, ...DUO]),
			'iphone-duo-outer-1398x2034',
			0,
			resized
		);
		const [found] = only(await check(project), 'provenance-device-mismatch');
		expect(found.severity).toBe('block');
		expect(found.message).toContain('iPhone 18 Pro');
	});

	it.each([
		['an iPhone record on iPad', 'ipad-13', 2064, 2752, 'iPhone 18 Pro Max'],
		['a Duo record on iPad', 'ipad-13', 2064, 2752, 'iPhone Duo'],
		['an iPad record on iPhone', 'iphone-6.9', 1320, 2868, 'iPad Pro'],
		['a Duo record on iPhone', 'iphone-6.9', 1320, 2868, 'iPhone Duo'],
		['an iPad record on Duo', 'iphone-duo-inner-2007x2853', 2007, 2853, 'iPad Pro']
	] as const)('blocks %s, whatever its size says', async (_, target, width, height, device) => {
		const asset = assetOf('claimed', width, height, record(device));
		const project = bind(campaign([...RECOMMENDED, ...DUO]), target, 0, asset);
		const [found] = only(await check(project), 'provenance-device-mismatch');
		expect(found).toMatchObject({ severity: 'block', target, slideIndex: 0 });
	});

	it('does not read a device it cannot place', async () => {
		const unknown = assetOf('unknown', 1320, 2868, record('Simulator'));
		const issues = await check(bind(campaign(), 'iphone-6.9', 0, unknown));
		expect(only(issues, 'provenance-device-mismatch')).toEqual([]);
	});

	it('does not guess between devices of the same kind', async () => {
		const other = assetOf('other', 1320, 2868, record('iPhone 17 Pro Max'));
		const issues = await check(bind(campaign(), 'iphone-6.9', 0, other));
		expect(only(issues, 'provenance-device-mismatch')).toEqual([]);
	});

	it('flags an unconfirmed fictional-data check', async () => {
		const unconfirmed = assetOf('u', 2064, 2752, {
			provenance: { ...FULL_RECORD, device: 'iPad Pro', fictionalData: 'unconfirmed' }
		});
		const [found] = only(
			await check(bind(campaign(), 'ipad-13', 1, unconfirmed)),
			'fictional-data-unconfirmed'
		);
		expect(found.message).toContain('Frame 2');
	});

	it('flags captures from more than one build, once', async () => {
		const older = assetOf('old', 2064, 2752, {
			provenance: { ...FULL_RECORD, device: 'iPad Pro', build: '99' }
		});
		const issues = await check(bind(campaign(), 'ipad-13', 0, older));
		expect(only(issues, 'mixed-builds')).toHaveLength(1);
		expect(only(issues, 'mixed-builds')[0].message).toContain('build (100, 99)');
	});

	it('blocks a bundled sample standing in for the app', async () => {
		const sample = assetOf('sample', 1320, 2868, { url: '/demo/home.png' });
		const [found] = only(await check(bind(campaign(), 'iphone-6.9', 0, sample)), 'sample-source');
		expect(found).toMatchObject({ severity: 'block', slideIndex: 0 });
	});
});

describe('image layers', () => {
	const crop = { x: 0, y: 0, width: 100, height: 100 };
	const callout = (image: string, overrides: object = {}) => ({
		id: 'callout',
		kind: 'source-crop' as const,
		image,
		crop,
		x: 40,
		y: 900,
		scale: 1,
		...overrides
	});
	const withLayer = (target: DeviceId, layer: ReturnType<typeof callout>, extra?: ProjectAsset) => {
		const project = campaign(RECOMMENDED, 2, (id, slideIndex) =>
			id === target && slideIndex === 1 ? { layers: [layer] } : {}
		);
		return extra ? { ...project, assets: { ...project.assets, [extra.id]: extra } } : project;
	};

	it('blocks a layer whose image is gone, which would otherwise silently vanish', async () => {
		const [found] = only(await check(withLayer('ipad-13', callout('gone'))), 'layer-missing-asset');
		expect(found).toMatchObject({
			severity: 'block',
			target: 'ipad-13',
			slideIndex: 1,
			control: 'frame-layers'
		});
	});

	it.each([
		[
			'a crop outside its image',
			{ crop: { x: 0, y: 0, width: 5000, height: 100 } },
			/crops outside/
		],
		[
			'a fractional crop',
			{ crop: { x: 0.5, y: 0, width: 100, height: 100 } },
			/whole source pixels/
		],
		['a zero scale', { scale: 0 }, /one scale/],
		['a layer entirely off the frame', { x: 9000 }, /entirely outside/]
	])('blocks %s', async (_, overrides, reason) => {
		const layer = callout('ipad-13:s2', overrides);
		const [found] = only(await check(withLayer('ipad-13', layer)), 'layer-invalid');
		expect(found.severity).toBe('block');
		expect(found.message).toMatch(reason);
	});

	it('blocks real pixels lifted from another display', async () => {
		const project = withLayer('ipad-13', callout('iphone-6.9:s2'));
		const [found] = only(await check(project), 'layer-wrong-class');
		expect(found.severity).toBe('block');
		expect(found.message).toContain('another screen');
	});

	it('blocks a callout cropped from a synthetic image', async () => {
		const fake = assetOf('fake', 2064, 2752, { provenance: { synthetic: true } });
		const [found] = only(
			await check(withLayer('ipad-13', callout('fake'), fake)),
			'synthetic-source'
		);
		expect(found.severity).toBe('block');
	});

	it('warns when a callout is enlarged so far it softens, but keeps it legal', async () => {
		const project = withLayer('ipad-13', callout('ipad-13:s2', { scale: 2.6 }));
		const issues = await check(project);
		expect(only(issues, 'layer-upscaled')[0].severity).toBe('warn');
		expect(hasBlockingIssue(issues)).toBe(false);
	});

	describe('a callout can come from a different capture than its frame', () => {
		const otherCapture = (overrides: Partial<ProjectAsset>) =>
			assetOf('rest', 2064, 2752, overrides);
		const provenanceOf = async (asset: ProjectAsset) =>
			check(withLayer('ipad-13', callout('rest'), asset));

		it('traces where that capture came from too', async () => {
			const issues = await provenanceOf(otherCapture({}));
			const [unverified] = only(issues, 'unverified-source');
			expect(unverified.message).toContain('Frame 2');
			expect(only(issues, 'fictional-data-unconfirmed')[0].message).toContain('Frame 2');
		});

		it('blocks one whose record names another kind of device', async () => {
			const issues = await provenanceOf(otherCapture(record('iPhone 18 Pro')));
			expect(only(issues, 'provenance-device-mismatch')[0]).toMatchObject({
				severity: 'block',
				target: 'ipad-13',
				slideIndex: 1
			});
		});

		it('notices it came from another build', async () => {
			const issues = await provenanceOf(
				otherCapture({ provenance: { ...FULL_RECORD, device: 'iPad Pro', build: '99' } })
			);
			expect(only(issues, 'mixed-builds')[0].message).toContain('build (100, 99)');
		});

		it('names a frame once, however many of its captures lack a record', async () => {
			const bare = assetOf('bare', 2064, 2752);
			const project = bind(
				withLayer('ipad-13', callout('rest'), otherCapture({})),
				'ipad-13',
				1,
				bare
			);
			const [unverified] = only(await check(project), 'unverified-source');
			expect(unverified.message).toMatch(/^Frame 2 on/);
		});

		it('leaves art with no record alone', async () => {
			const art = assetOf('art', 300, 300);
			const layer = { ...callout('art'), kind: 'art' as const };
			const issues = await check(withLayer('ipad-13', layer as never, art));
			expect(only(issues, 'unverified-source')).toEqual([]);
		});
	});

	it('leaves art layers to be art', async () => {
		const art = assetOf('art', 300, 300);
		const layer = { ...callout('art'), kind: 'art' as const };
		const issues = await check(withLayer('ipad-13', layer as never, art));
		expect(hasBlockingIssue(issues)).toBe(false);
	});
});

describe('frames and hardware (E17)', () => {
	const linen = (phone: Partial<ReturnType<typeof defaultLinenSettings>['phone']>) => {
		const settings = defaultLinenSettings('teal');
		return { ...settings, phone: { ...settings.phone, ...phone } };
	};
	const linenCampaign = (phone: Parameters<typeof linen>[0]) => {
		const project = campaign();
		return {
			...project,
			style: 'table-linen' as const,
			slides: project.slides.map((slide) => ({ ...slide, linen: linen(phone) }))
		};
	};

	it('blocks iPhone hardware on another display, naming the control', async () => {
		const issues = await check(linenCampaign({ hardware: 'iphone-17-pro-max' }));
		const blocked = only(issues, 'frame-profile');
		expect(new Set(blocked.map((issue) => issue.target))).toEqual(
			new Set(['iphone-di-medium-1206x2622', 'ipad-13'])
		);
		expect(blocked[0]).toMatchObject({ severity: 'block', control: 'phone-hardware' });
		const [risk] = only(issues, 'device-illustration');
		expect(risk).toMatchObject({ severity: 'warn', target: 'iphone-6.9' });
		expect(risk.message).toContain('risk, not a known rejection');
	});

	it('blocks a drawn phone frame on iPad and Duo, and warns about it on iPhone', async () => {
		const project = campaign([...RECOMMENDED, ...DUO], 1);
		const bezel = {
			...project,
			slides: project.slides.map((s) => ({ ...s, frame: 'bezel' as const }))
		};
		const issues = await check(bezel);
		expect(
			only(issues, 'frame-profile')
				.map((issue) => issue.target)
				.sort()
		).toEqual(['ipad-13', ...DUO].sort());
		expect(only(issues, 'frame-profile')[0].control).toBe('frame-style');
		expect(
			only(issues, 'device-illustration')
				.map((issue) => issue.target)
				.sort()
		).toEqual(['iphone-6.9', 'iphone-di-medium-1206x2622'].sort());
		const neutral = await check(campaign([...RECOMMENDED, ...DUO], 1));
		expect(only(neutral, 'frame-profile')).toEqual([]);
	});
});

describe('crops are reported, intent is not assumed (E16)', () => {
	const linenCrop = (cropReason?: string) => {
		const project = campaign(['iphone-6.9', 'iphone-di-medium-1206x2622'], 1);
		const settings = defaultLinenSettings('teal');
		return {
			...project,
			style: 'table-linen' as const,
			slides: project.slides.map((slide) => ({
				...slide,
				linen: {
					...settings,
					phone: {
						...settings.phone,
						mode: 'bottom-crop' as const,
						top: 900,
						maxWidth: 1100,
						...(cropReason ? { cropReason } : {})
					}
				}
			}))
		};
	};

	it('notes a bottom crop someone explained, with the hidden share', async () => {
		const issues = await check(linenCrop('keep the amounts large'));
		const [found] = only(issues, 'capture-crop');
		expect(found.severity).toBe('info');
		expect(found.message).toMatch(/hides about \d+%/);
		expect(found.message).toContain('keep the amounts large');
	});

	it('flags the same crop with no reason, pointing at the reason field', async () => {
		const [found] = only(await check(linenCrop()), 'capture-crop');
		expect(found).toMatchObject({ severity: 'warn', control: 'crop-reason' });
	});

	it('says nothing about a whole capture placed whole', async () => {
		const project = campaign(['iphone-6.9'], 1);
		const issues = await check({
			...project,
			style: 'table-linen',
			slides: project.slides.map((slide) => ({ ...slide, linen: defaultLinenSettings('teal') }))
		});
		expect(only(issues, 'capture-crop')).toEqual([]);
	});

	it('does not bless a default placement it could not measure', async () => {
		const [found] = only(await check(campaign(['iphone-6.9'], 1)), 'capture-crop-unmeasured');
		expect(found).toMatchObject({ severity: 'warn', target: 'iphone-6.9' });
		expect(found.message).toContain('not measured');
	});

	it('still says it did not measure a chosen The Check layout, only less loudly', async () => {
		const project = campaign(['iphone-6.9'], 1);
		const chosen: ProjectV2 = {
			...project,
			style: 'the-check',
			slides: project.slides.map((slide) => ({
				...slide,
				check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: true }
			}))
		};
		const [found] = only(await check(chosen), 'capture-crop-unmeasured');
		expect(found.severity).toBe('info');
		const unchosen: ProjectV2 = { ...project, style: 'the-check' };
		expect(only(await check(unchosen), 'capture-crop-unmeasured')[0].severity).toBe('warn');
	});

	describe('with a painter that reports where the capture landed', () => {
		const placed = (visibleHeight: number) => ({
			dryRun: async () => {},
			capturePlacement: async () => ({ width: 1000, height: 2000, visibleHeight, scale: 0.75 })
		});

		it('reports the share a default placement hides', async () => {
			const issues = await check(campaign(['iphone-6.9'], 1), placed(1500));
			expect(only(issues, 'capture-crop-unmeasured')).toEqual([]);
			const [found] = only(issues, 'capture-crop');
			expect(found).toMatchObject({ severity: 'warn', control: 'device-scale' });
			expect(found.message).toContain('about 25%');
		});

		it('notes a chosen layout, unless it hides most of the screen', async () => {
			const project = campaign(['iphone-6.9'], 1);
			const chosen: ProjectV2 = {
				...project,
				style: 'the-check',
				slides: project.slides.map((slide) => ({
					...slide,
					check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: true }
				}))
			};
			const mild = only(await check(chosen, placed(1500)), 'capture-crop')[0];
			expect(mild.severity).toBe('info');
			expect(mild.message).toContain('hero');
			const heavy = only(await check(chosen, placed(600)), 'capture-crop')[0];
			expect(heavy.severity).toBe('warn');
			expect(heavy.message).toContain('most of the screen');
		});

		it('is silent when the whole capture shows', async () => {
			expect(only(await check(campaign(['iphone-6.9'], 1), placed(2000)), 'capture-crop')).toEqual(
				[]
			);
		});
	});
});

describe('art-only frames and the in-use share (A10)', () => {
	const artFrames = (total: number, art: number): ProjectV2 => {
		const project = campaign(RECOMMENDED, total, (_, slideIndex) => (slideIndex < art ? null : {}));
		return {
			...project,
			style: 'the-check',
			slides: project.slides.map((slide, index) => ({
				...slide,
				check: {
					canvas: 'teal',
					preset: 'hero',
					panel: index >= art,
					wordmark: true
				}
			}))
		};
	};

	it('does not ask an art-only frame for a capture', async () => {
		expect(only(await check(artFrames(3, 1)), 'missing-source')).toEqual([]);
		// The same frame with its panel on does need one.
		const project = artFrames(3, 1);
		const panelOn = {
			...project,
			slides: project.slides.map((slide) => ({
				...slide,
				check: { ...slide.check!, panel: true }
			}))
		};
		expect(only(await check(panelOn), 'missing-source')).toHaveLength(3);
	});

	it.each([
		[3, 1, false],
		[3, 2, true],
		[4, 1, false],
		[4, 2, true]
	])('of %i frames, %i with no UI: blocked is %s', async (total, art, blocked) => {
		const issues = only(await check(artFrames(total, art)), 'in-use-minority');
		expect(issues.length > 0).toBe(blocked);
		if (blocked) expect(issues[0].severity).toBe('block');
	});

	it('counts a real-UI crop as showing the app', async () => {
		const crop = { x: 0, y: 0, width: 100, height: 100 };
		const project = campaign(RECOMMENDED, 3, (target, slideIndex) => ({
			layers: [
				{
					id: `crop-${slideIndex}`,
					kind: 'source-crop',
					image: `${target}:s${slideIndex + 1}`,
					crop,
					x: 10,
					y: 1000,
					scale: 1
				}
			]
		}));
		const issues = await check({
			...project,
			style: 'the-check',
			slides: project.slides.map((slide) => ({
				...slide,
				check: { canvas: 'teal', preset: 'detail', panel: false, wordmark: true }
			}))
		});
		expect(only(issues, 'in-use-minority')).toEqual([]);
	});
});

describe('copy (A12)', () => {
	const withCopy = (text: string, field: 'headline' | 'subtitle' | 'badge' = 'headline') => {
		const project = campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 1);
		return {
			...project,
			slides: project.slides.map((slide) =>
				field === 'badge'
					? { ...slide, badge: text }
					: { ...slide, typography: { ...slide.typography, [field]: text } }
			)
		};
	};

	it.each([
		['Visit https://example.com', 'copy-url'],
		['See billington.app', 'copy-url'],
		['Only $4.99 a month', 'copy-price'],
		['Totally free', 'copy-price'],
		['© 2026 Billington', 'copy-copyright'],
		['Award-winning splits', 'copy-award'],
		['Apple Editors’ Choice', 'copy-award'],
		['The #1 bill splitter', 'copy-ranking'],
		['The best way to split', 'copy-ranking'],
		['Top 10 in Finance', 'copy-ranking'],
		['★★★★★', 'copy-rating'],
		['Rated 4.9', 'copy-rating'],
		['Also on Android', 'copy-other-platform'],
		['Now on Google Play', 'copy-other-platform'],
		['Great for kids', 'copy-for-kids']
	])('flags %j as %s', async (text, code) => {
		const [found] = only(await check(withCopy(text)), code);
		expect(found).toMatchObject({ severity: 'warn', slideIndex: 0, control: 'headline' });
		expect(found.target).toBeUndefined();
	});

	it.each([
		['Split any bill in seconds'],
		['Everyone pays their share'],
		['One bill.\nEveryone’s *share*.'],
		['Freedom from the math'],
		['Topped with fairness']
	])('leaves %j alone', async (text) => {
		const issues = await check(withCopy(text));
		expect(codes(issues).filter((code) => code.startsWith('copy-'))).toEqual([]);
	});

	it('reads every printed field, and names the control', async () => {
		expect(only(await check(withCopy('Only $4', 'subtitle')), 'copy-price')[0].control).toBe(
			'subtitle'
		);
		expect(only(await check(withCopy('Only $4', 'badge')), 'copy-price')[0].control).toBe('badge');
	});

	it('flags the sample headline', async () => {
		const [found] = only(
			await check(withCopy(createSlide(0).typography.headline)),
			'placeholder-copy'
		);
		expect(found.control).toBe('headline');
	});
});

describe('contrast', () => {
	it('warns about a headline close to its background, across gradient stops', async () => {
		const project = campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 2);
		const low: ProjectV2 = {
			...project,
			slides: project.slides.map((slide, index) =>
				index === 1
					? {
							...slide,
							background: { kind: 'linear', colors: ['#000000', '#EEEEEE'] },
							typography: { ...slide.typography, fontColor: '#FFFFFF' }
						}
					: slide
			)
		};
		const found = only(await check(low), 'low-contrast');
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ severity: 'warn', slideIndex: 1 });
		expect(found[0].message).toContain('not an Apple rule');
		// The same on every output, so it reads as one finding about the frame.
		expect(found[0].target).toBeUndefined();
	});

	it('finds every shipped The Check canvas legible', async () => {
		const project = campaign(['iphone-6.9'], 3);
		const canvases = ['teal', 'cream', 'gold'] as const;
		const issues = await check({
			...project,
			style: 'the-check',
			slides: project.slides.map((slide, index) => ({
				...slide,
				check: { canvas: canvases[index], preset: 'hero', panel: true, wordmark: true }
			}))
		});
		expect(only(issues, 'low-contrast')).toEqual([]);
	});
});

describe('selection', () => {
	it('blocks a target the campaign does not declare, and an empty selection', async () => {
		const unknown = await check(campaign(), {}, ['ipad-11-1668x2388'] as DeviceId[]);
		expect(only(unknown, 'undeclared-output')[0].severity).toBe('block');
		expect(only(await check(campaign(), {}, []), 'no-outputs')[0].severity).toBe('block');
	});

	it('says a subset is a subset, and judges coverage on the whole campaign', async () => {
		const issues = await check(campaign(), {}, ['ipad-13']);
		expect(only(issues, 'subset-export')[0].severity).toBe('info');
		expect(only(issues, 'required-class-missing')).toEqual([]);
	});

	it('checks only the selected outputs', async () => {
		const project = campaign(RECOMMENDED, 2, (target) => (target === 'iphone-6.9' ? null : {}));
		expect(only(await check(project, {}, ['ipad-13']), 'missing-source')).toEqual([]);
		expect(only(await check(project, {}, ['iphone-6.9']), 'missing-source')).toHaveLength(2);
	});
});

describe('the dry run (E22)', () => {
	const painter = (fail: (device: DeviceId, index: number) => string | null) => ({
		loadFonts: async () => {},
		dryRun: vi.fn(async (composition: { device: DeviceId }, index: number) => {
			const message = fail(composition.device, index);
			if (message) throw new Error(message);
		})
	});

	it('paints every frame of every output and reports all failures, not the first', async () => {
		const runtime = painter((device, index) =>
			(device === 'ipad-13' && index === 0) || (device === 'iphone-6.9' && index === 1)
				? 'This headline does not fit the frame at a readable size. Shorten it.'
				: null
		);
		const issues = await check(campaign(), runtime);
		expect(runtime.dryRun).toHaveBeenCalledTimes(6);
		const found = only(issues, 'layout-error');
		expect(found.map((issue) => [issue.target, issue.slideIndex])).toEqual([
			['iphone-6.9', 1],
			['ipad-13', 0]
		]);
		expect(found[0]).toMatchObject({ severity: 'block', control: 'headline' });
		expect(found[0].message).toContain('Frame 2 on');
		expect(found[0].message).toContain('1320 × 2868');
	});

	it.each([
		['The phone overlaps the copy. Move the phone top down.', 'phone-top'],
		['Supporting text lines overlap. Increase the supporting leading.', 'subtitle'],
		['Callout "a" overlaps the copy. Move it down.', 'frame-layers'],
		['The pen mark overlaps the copy.', 'check-mark-kind'],
		['A screenshot could not be loaded. Add it again.', 'frame-source'],
		['The campaign name "x" is too long for the wordmark.', 'app-name']
	])('points %j at %s', async (text, control) => {
		const issues = await check(
			campaign(['iphone-6.9'], 1),
			painter(() => text)
		);
		const found = issues.filter((issue) => issue.message.includes(text));
		expect(found).toHaveLength(1);
		expect(found[0].control).toBe(control);
	});

	it('names an unreadable or mislabelled capture as a source problem', async () => {
		const issues = await check(
			campaign(['iphone-6.9'], 1),
			painter(() => 'A screenshot is 1 × 1 pixels but the project lists it as 2 × 2.')
		);
		expect(only(issues, 'source-unreadable')[0].severity).toBe('block');
	});

	it('does not report a refusal twice when static checks already found it', async () => {
		const settings = defaultLinenSettings('teal');
		const project = campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 1);
		const linen: ProjectV2 = {
			...project,
			style: 'table-linen',
			slides: project.slides.map((slide) => ({
				...slide,
				linen: { ...settings, phone: { ...settings.phone, hardware: 'iphone-17-pro-max' } }
			}))
		};
		const profileError =
			'The iPhone 17 Pro Max frame was measured from a 1320 × 2868 capture, so it cannot appear on iPhone Dynamic Island, medium (1206 × 2622). Choose Simple frame in the Composition tab.';
		const issues = await check(
			linen,
			painter((device) => (device === 'iphone-di-medium-1206x2622' ? profileError : null))
		);
		expect(only(issues, 'frame-profile')).toHaveLength(1);
		expect(only(issues, 'layout-error')).toEqual([]);
	});

	it('stops at one finding when the fonts cannot load', async () => {
		const dryRun = vi.fn(async () => {});
		const issues = await check(campaign(), {
			dryRun,
			loadFonts: () => Promise.reject(new Error('The app fonts could not be loaded.'))
		});
		expect(only(issues, 'fonts-unavailable')).toHaveLength(1);
		expect(only(issues, 'fonts-unavailable')[0].severity).toBe('block');
		expect(dryRun).not.toHaveBeenCalled();
	});

	it('says so when layout could not be checked at all', async () => {
		const issues = await createPreflight({ now: () => NOW })(campaign());
		expect(only(issues, 'layout-not-checked')[0].severity).toBe('warn');
		expect(codes(await check(campaign()))).not.toContain('layout-not-checked');
	});

	it('reports progress and honors cancellation', async () => {
		const controller = new AbortController();
		const onProgress = vi.fn(() => {
			if (onProgress.mock.calls.length === 2) controller.abort();
		});
		const runtime = painter(() => null);
		const run = createPreflight({ now: () => NOW, ...runtime })(campaign(), {
			signal: controller.signal,
			onProgress
		});
		await expect(run).rejects.toMatchObject({ name: 'AbortError' });
		expect(runtime.dryRun).toHaveBeenCalledTimes(2);
		expect(onProgress).toHaveBeenLastCalledWith({ done: 2, total: 6 });
	});
});

describe('assembling findings', () => {
	it('keeps a finding on its output when it differs by output', async () => {
		const project = campaign(RECOMMENDED, 1, (target) => (target === 'ipad-13' ? null : {}));
		const issues = await check(project);
		expect(only(issues, 'missing-source')[0].target).toBe('ipad-13');
	});

	it('warns about a connected pair inside the first three frames, and when a pair lacks a capture', async () => {
		const project = campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 2);
		const paired: ProjectV2 = {
			...project,
			continuityMode: 'paired',
			panorama: {
				leftId: 's1',
				rightId: 's2',
				offset: 0,
				scale: 1,
				tilt: 0,
				variants: {
					'iphone-6.9': { source: { asset: 'iphone-6.9:s1' } }
				}
			}
		};
		const issues = await check(paired);
		expect(only(issues, 'first-three-seam')[0].severity).toBe('warn');
		expect(only(issues, 'pair-not-connected')).toEqual([
			expect.objectContaining({ severity: 'info', target: 'iphone-di-medium-1206x2622' })
		]);
		// A frame with no variants at all is a plain missing source.
		const bare = { ...project, slides: [storedSlide('s1')] };
		expect(only(await check(bare), 'missing-source')).toHaveLength(2);
	});

	it('merges The Check style lint without repeating it per output', async () => {
		const project = campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 2);
		const issues = await check({
			...project,
			style: 'the-check',
			slides: project.slides.map((slide) => ({
				...slide,
				check: { canvas: 'teal', preset: 'hero', panel: true, wordmark: true }
			}))
		});
		const repeated = only(issues, 'check-repeated-frame');
		expect(repeated).toHaveLength(1);
		expect(repeated[0].target).toBeUndefined();
	});
});

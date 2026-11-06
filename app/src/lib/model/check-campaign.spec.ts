import { describe, expect, it } from 'vitest';
import {
	BILLINGTON_SCENES,
	BRAND_ART,
	campaignTargets,
	createCheckDemo,
	createCheckProject,
	type BillingtonAssets,
	type BillingtonSources
} from './check-campaign';
import {
	CHECK_PALETTES,
	checkLint,
	checkMarkStroke,
	checkStrokeClearance,
	contrastRatio
} from './check';
import { DEVICES, type DeviceId } from './devices';
import { parseProject } from './project';
import { projectForTarget } from './targets';
import { imageLayerError, layerBounds, layerRegionToOutput } from '../render/frames';
import type { Composition } from './types';

/** A valid PNG signature is all the project parser reads; pixels come later, from real captures. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAA';

function sources(device: DeviceId): BillingtonSources {
	const { width, height } = DEVICES[device];
	return Object.fromEntries(
		BILLINGTON_SCENES.map((scene) => [
			scene,
			{ id: `${device}-${scene}`, blobUrl: PNG, naturalWidth: width, naturalHeight: height }
		])
	) as BillingtonSources;
}

function assets(device: DeviceId): BillingtonAssets {
	const { width, height } = DEVICES[device];
	return Object.fromEntries(
		BILLINGTON_SCENES.map((scene) => [
			scene,
			{
				id: `${device}-${scene}`,
				mime: 'image/png',
				byteLength: 1000,
				url: PNG,
				naturalWidth: width,
				naturalHeight: height
			}
		])
	) as BillingtonAssets;
}

const campaign = (device: DeviceId): Composition => createCheckDemo(device, sources(device));

/** At the frozen search geometry a 128 pt wide frame is 384 physical pixels at @3x. */
const physical = (nativeHeight: number, device: DeviceId) =>
	(nativeHeight * 384) / DEVICES[device].width;

/** Glyph heights measured from each class's native captures. Scale turns them into output pixels. */
const HERO_GLYPHS: Partial<Record<DeviceId, { total: number; share: number }>> = {
	'iphone-6.9': { total: 68, share: 35 },
	'iphone-di-medium-1206x2622': { total: 68, share: 35 }
};
const SHARE_DIGITS: Partial<Record<DeviceId, number>> = {
	'iphone-6.9': 31,
	'iphone-di-medium-1206x2622': 31
};

describe('Billington campaign', () => {
	it('covers both required iPhone sizes, iPad and both iPhone Duo displays', () => {
		expect(campaignTargets()).toEqual(
			expect.arrayContaining([
				'iphone-6.9',
				'iphone-di-medium-1206x2622',
				'ipad-13',
				'iphone-duo-outer-1398x2034',
				'iphone-duo-inner-2007x2853'
			])
		);
	});

	for (const device of campaignTargets()) {
		describe(device, () => {
			it('paints only real crops, within each source and the frame', () => {
				const composition = campaign(device);
				const frame = DEVICES[device];
				expect(composition.slides).toHaveLength(5);
				for (const slide of composition.slides) {
					expect(slide.layers?.length, slide.id).toBeGreaterThan(0);
					for (const layer of slide.layers ?? []) {
						expect(layer.kind, `${slide.id}/${layer.id}`).toBe('source-crop');
						expect(imageLayerError(layer, frame), `${slide.id}/${layer.id}`).toBeNull();
					}
				}
			});

			it('shows no device: the layers carry the UI, frameless', () => {
				for (const slide of campaign(device).slides) {
					expect(slide.frame, slide.id).toBe('none');
					expect(slide.check?.panel, slide.id).toBe(false);
				}
			});

			it('points every pen mark at real pixels inside its anchor', () => {
				for (const slide of campaign(device).slides) {
					const mark = slide.check?.mark;
					expect(mark, slide.id).toBeDefined();
					const area = slide.layers!.find((layer) => layer.id === mark!.anchor)!.crop;
					expect(mark!.rect.x, slide.id).toBeGreaterThanOrEqual(area.x);
					expect(mark!.rect.y, slide.id).toBeGreaterThanOrEqual(area.y);
					expect(mark!.rect.x + mark!.rect.width, slide.id).toBeLessThanOrEqual(
						area.x + area.width
					);
					expect(mark!.rect.y + mark!.rect.height, slide.id).toBeLessThanOrEqual(
						area.y + area.height
					);
				}
			});

			it('keeps every pen mark clear of the frame, centered and proportional', () => {
				const { width, height } = DEVICES[device];
				const unit = width / 1320;
				for (const slide of campaign(device).slides) {
					const mark = slide.check!.mark!;
					const anchor = slide.layers!.find((layer) => layer.id === mark.anchor)!;
					const region = layerRegionToOutput(anchor, mark.rect);
					const stroke = checkMarkStroke(mark.kind, region, mark.seed, unit);
					const { left, right, top, bottom } = stroke.bounds;
					const edge = Math.min(left, top, width - right, height - bottom);
					expect(edge, slide.id).toBeGreaterThanOrEqual(width * 0.018);
					expect(checkStrokeClearance(stroke, region), slide.id).toBeGreaterThan(0);
					const middle = stroke.points[Math.floor(stroke.points.length / 2)].width;
					expect(middle / unit, slide.id).toBeGreaterThanOrEqual(12);
					expect(middle / unit, slide.id).toBeLessThanOrEqual(14);
					// A ring is centered on its target; an underline only across it, since it sits below.
					const off = Math.hypot(
						(left + right) / 2 - (region.x + region.width / 2),
						mark.kind === 'ring' ? (top + bottom) / 2 - (region.y + region.height / 2) : 0
					);
					expect(off / Math.max(right - left, bottom - top), slide.id).toBeLessThanOrEqual(0.06);
				}
			});

			it('lifts one real element per frame and leaves no twin of it showing', () => {
				for (const slide of campaign(device).slides) {
					const layers = slide.layers ?? [];
					for (const [index, lifted] of layers.entries()) {
						for (const under of layers.slice(0, index)) {
							if (under.image.id !== lifted.image.id) continue;
							const { crop } = lifted;
							const contained =
								crop.x >= under.crop.x &&
								crop.y >= under.crop.y &&
								crop.x + crop.width <= under.crop.x + under.crop.width &&
								crop.y + crop.height <= under.crop.y + under.crop.height;
							if (!contained) continue;
							const twin = layerRegionToOutput(under, crop);
							const cover = layerBounds(lifted);
							// The lifted element's own ink is what must not repeat; a crop's margin may peek.
							const inset = Math.min(crop.width, crop.height) * under.scale * 0.14;
							expect(cover.left, `${slide.id}/${lifted.id}`).toBeLessThanOrEqual(twin.x + inset);
							expect(cover.top, `${slide.id}/${lifted.id}`).toBeLessThanOrEqual(twin.y + inset);
							expect(cover.right, `${slide.id}/${lifted.id}`).toBeGreaterThanOrEqual(
								twin.x + twin.width - inset
							);
							expect(cover.bottom, `${slide.id}/${lifted.id}`).toBeGreaterThanOrEqual(
								twin.y + twin.height - inset
							);
						}
					}
				}
			});

			it('runs layers clearly off the frame or clear of its edges, never nearly', () => {
				const { width, height } = DEVICES[device];
				const margin = width * 0.017;
				for (const slide of campaign(device).slides) {
					for (const layer of slide.layers ?? []) {
						const { left, right, bottom } = layerBounds(layer);
						const name = `${slide.id}/${layer.id}`;
						expect(left <= 0 || left >= margin, `${name} left ${left}`).toBe(true);
						expect(right >= width || width - right >= margin, `${name} right ${right}`).toBe(true);
						expect(bottom >= height - 0.5 || height - bottom >= margin, `${name} foot`).toBe(true);
					}
				}
			});

			it('round-trips as an ordinary editable project', () => {
				const composition = campaign(device);
				const reopened = parseProject(JSON.stringify(composition));
				expect(reopened).toEqual(composition);
			});

			it('opens teal, gold, teal with no cream, no seam and no lint', () => {
				const composition = campaign(device);
				expect(composition.slides.map((slide) => slide.check?.canvas)).toEqual([
					'teal',
					'gold',
					'teal',
					'cream',
					'gold'
				]);
				expect(composition.continuityMode).toBe('none');
				expect(checkLint(composition)).toEqual([]);
			});

			it('takes every frame’s source from this target, never another', () => {
				for (const slide of campaign(device).slides) {
					expect(slide.primaryImage!.id.startsWith(device), slide.id).toBe(true);
					for (const layer of slide.layers ?? [])
						expect(layer.image.id.startsWith(`${device}-`), `${slide.id}/${layer.id}`).toBe(true);
				}
			});
		});
	}

	it('gives the first three frames a real UI hero large enough for search', () => {
		for (const [device, glyphs] of Object.entries(HERO_GLYPHS) as [
			DeviceId,
			{ total: number; share: number }
		][]) {
			const slides = campaign(device).slides;
			const layer = (frame: string, id: string) =>
				slides.find((slide) => slide.id === frame)!.layers!.find((item) => item.id === id)!;
			expect(physical(glyphs.total * layer('result', 'total').scale, device)).toBeGreaterThan(24);
			expect(physical(glyphs.share * layer('shared', 'share').scale, device)).toBeGreaterThan(24);
			// A person's disc: 107 source pixels on these classes.
			expect(physical(107 * layer('assign', 'people').scale, device)).toBeGreaterThan(24);
			expect(
				physical(SHARE_DIGITS[device]! * layer('result', 'shares').scale, device)
			).toBeGreaterThan(10.8);
		}
	});

	it('tells one story on every display, built only on what the release can reach', () => {
		for (const device of campaignTargets())
			expect(campaign(device).slides.map((slide) => slide.id)).toEqual([
				'result',
				'assign',
				'shared',
				'line-by-line',
				'entry'
			]);
		expect([...BILLINGTON_SCENES].sort()).toEqual(
			['assign', 'breakdown', 'entry', 'result', 'split', 'summary'].sort()
		);
	});

	it('tears only a layer that exists on that frame', () => {
		for (const device of campaignTargets()) {
			const torn = campaign(device).slides.filter((slide) => slide.check?.tear);
			expect(
				torn.map((slide) => slide.id),
				device
			).toEqual(['line-by-line']);
			for (const slide of torn)
				expect(
					slide.layers?.map((layer) => layer.id),
					device
				).toContain(slide.check?.tear);
		}
	});

	it('drops a torn edge and a mark when their capture is missing', () => {
		const composition = createCheckDemo('iphone-6.9', {});
		for (const slide of composition.slides) {
			expect(slide.check?.mark, slide.id).toBeUndefined();
			expect(slide.check?.tear, slide.id).toBeUndefined();
			expect(slide.layers, slide.id).toBeUndefined();
		}
	});

	it('never shows the Duo outer status column in a crop', () => {
		// On the outer display the system column sits at x 1150 and up, down to y 340.
		for (const slide of campaign('iphone-duo-outer-1398x2034').slides) {
			for (const layer of slide.layers ?? []) {
				const { x, y, width } = layer.crop;
				expect(x + width <= 1150 || y >= 340, `${slide.id}/${layer.id}`).toBe(true);
			}
		}
	});

	it('never makes a claim the build cannot back up', () => {
		const copy = campaign('iphone-6.9')
			.slides.flatMap((slide) => [slide.typography.headline, slide.typography.subtitle ?? ''])
			.join(' ')
			.toLowerCase();
		for (const banned of [
			'scan',
			'link',
			'account',
			'publish',
			'instant',
			'exactly',
			'to the cent',
			'get paid',
			'paid',
			'payment',
			'secure',
			'private',
			'duo',
			'spliq',
			'best',
			'#1',
			'currency',
			'perfect',
			'accurate',
			'offline',
			'real-time',
			'trip'
		])
			expect(copy, banned).not.toContain(banned);
	});

	it('keeps support lines short and inks readable on their canvases', () => {
		for (const slide of campaign('iphone-6.9').slides) {
			expect(slide.typography.subtitle!.split(/\s+/).length, slide.id).toBeLessThanOrEqual(10);
			const palette = CHECK_PALETTES[slide.check!.canvas];
			expect(contrastRatio(palette.support, palette.canvas), slide.id).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('keeps the real bundled marks available, and uses none by default', () => {
		expect(BRAND_ART.billy.blobUrl).toBe('/brand/billy.png');
		expect(BRAND_ART.wordmark.blobUrl).toBe('/brand/billington-wordmark.png');
		const urls = campaign('iphone-6.9').slides.flatMap((slide) =>
			(slide.layers ?? []).map((layer) => layer.image.blobUrl)
		);
		expect(urls).not.toContain(BRAND_ART.billy.blobUrl);
	});

	it('refuses to borrow a source of the wrong size', () => {
		const wrong = sources('iphone-6.9');
		expect(() => createCheckDemo('ipad-13', wrong)).toThrow(/2064 × 2752/);
	});
});

describe('multi-target project', () => {
	it('keeps a torn edge and a second capture through projection', () => {
		const device = 'iphone-di-medium-1206x2622';
		const project = createCheckProject({ [device]: assets(device) });
		const composition = projectForTarget(project, device);
		const direct = campaign(device);
		const pick = (slides: Composition['slides'], id: string) =>
			slides.find((slide) => slide.id === id)!;
		expect(pick(composition.slides, 'line-by-line').check?.tear).toBe('receipt');
		expect(pick(composition.slides, 'result').layers?.map((layer) => layer.image.id)).toEqual(
			pick(direct.slides, 'result').layers?.map((layer) => layer.image.id)
		);
		expect(pick(composition.slides, 'result').layers?.[1].image.id).toBe(`${device}-breakdown`);
	});

	it('stores one story, each target with its own source, layers and mark', () => {
		const project = createCheckProject({
			'iphone-6.9': assets('iphone-6.9'),
			'ipad-13': assets('ipad-13')
		});
		expect(project.version).toBe(2);
		expect(project.targets).toEqual(['iphone-6.9', 'ipad-13']);
		const first = project.slides[0];
		expect(first.variants?.['iphone-6.9']?.source?.asset).not.toBe(
			first.variants?.['ipad-13']?.source?.asset
		);
		expect(first.variants?.['iphone-6.9']?.check?.mark).toBeTruthy();
		expect(first.variants?.['ipad-13']?.check?.mark).toBeTruthy();
		expect(first.typography.headline).toContain('Fairly');
		const stored = Object.values(project.assets);
		expect(new Set(stored.map((asset) => asset.id)).size).toBe(stored.length);
		expect(project.assets['brand-billy']).toBeUndefined();
	});

	it('embeds only the captures a frame uses', () => {
		const device = 'iphone-6.9';
		const project = createCheckProject({
			[device]: {
				...assets(device),
				// A capture of a screen this campaign does not show stays out of the file.
				...({
					paid: {
						id: `${device}-paid`,
						mime: 'image/png',
						byteLength: 1000,
						url: PNG,
						naturalWidth: 1320,
						naturalHeight: 2868
					}
				} as BillingtonAssets)
			}
		});
		expect(Object.keys(project.assets).sort()).toEqual(
			BILLINGTON_SCENES.map((scene) => `${device}-${scene}`).sort()
		);
	});

	it('projects each target to its own frames, matching the single-target campaign', () => {
		const project = createCheckProject({
			'iphone-6.9': assets('iphone-6.9'),
			'ipad-13': assets('ipad-13')
		});
		for (const target of project.targets) {
			const composition = projectForTarget(project, target);
			const direct = createCheckDemo(target, sources(target));
			expect(composition.slides.map((slide) => slide.check)).toEqual(
				direct.slides.map((slide) => slide.check)
			);
			expect(composition.slides.map((slide) => slide.typography)).toEqual(
				direct.slides.map((slide) => slide.typography)
			);
			expect(composition.slides[0].layers?.map((layer) => layer.crop)).toEqual(
				direct.slides[0].layers?.map((layer) => layer.crop)
			);
			expect(composition.slides[0].primaryImage?.id).toBe(`${target}-result`);
		}
	});

	it('leaves a frame with no capture unbound rather than borrowing one', () => {
		const partial = { ...assets('iphone-duo-inner-2007x2853') };
		delete partial.result;
		delete partial.breakdown;
		const project = createCheckProject({ 'iphone-duo-inner-2007x2853': partial });
		const composition = projectForTarget(project, 'iphone-duo-inner-2007x2853');
		expect(composition.slides[0].primaryImage).toBeUndefined();
		expect(composition.slides[0].layers ?? []).toEqual([]);
		expect(composition.slides[0].check?.mark).toBeUndefined();
	});
});

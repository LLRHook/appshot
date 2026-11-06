import { describe, expect, it } from 'vitest';
import {
	CAMPAIGN_SCENES,
	CAMPAIGN_TARGETS,
	campaignTargets,
	createCampaignDemo,
	createCampaignProject,
	LIFTED_LAYERS,
	ringNeighbors,
	type CampaignAssets,
	type CampaignSources
} from './__fixtures__/sample-campaign';
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

/** A valid PNG signature is all the project parser reads; these tests never paint. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAA';

function sources(device: DeviceId): CampaignSources {
	const { width, height } = DEVICES[device];
	return Object.fromEntries(
		CAMPAIGN_SCENES.map((scene) => [
			scene,
			{ id: `${device}-${scene}`, blobUrl: PNG, naturalWidth: width, naturalHeight: height }
		])
	) as CampaignSources;
}

function assets(device: DeviceId): CampaignAssets {
	const { width, height } = DEVICES[device];
	return Object.fromEntries(
		CAMPAIGN_SCENES.map((scene) => [
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
	) as CampaignAssets;
}

const campaign = (device: DeviceId): Composition => createCampaignDemo(device, sources(device));

const ALL_TARGETS = [...CAMPAIGN_TARGETS];
const frameOf = (device: DeviceId, id: string) =>
	campaign(device).slides.find((slide) => slide.id === id)!;

describe('multi-target campaign', () => {
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

			it('lifts a real element in place and leaves no twin of it showing', () => {
				let lifts = 0;
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
							lifts++;
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
				expect(lifts).toBeGreaterThan(0);
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

			it('keeps its canvases in rhythm with no seam and no lint', () => {
				const composition = campaign(device);
				expect(composition.slides.map((slide) => slide.check?.canvas)).toEqual([
					'gold',
					'teal',
					'cream',
					'teal',
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

	it('keeps a frame to its own capture unless a layer names another', () => {
		for (const device of ALL_TARGETS) {
			const slide = frameOf(device, 'summit');
			expect(slide.primaryImage?.id, device).toBe(`${device}-summit`);
			for (const layer of slide.layers!)
				expect(layer.image.id, `${device}/${layer.id}`).toBe(`${device}-summit`);
		}
	});

	it('overhangs its panel on purpose or not at all', () => {
		for (const device of ALL_TARGETS) {
			for (const slide of campaign(device).slides) {
				const layers = slide.layers ?? [];
				for (const lifted of layers.filter((layer) => LIFTED_LAYERS.includes(layer.id))) {
					const box = layerBounds(lifted);
					const under = layers
						.slice(0, layers.indexOf(lifted))
						.map((layer) => layerBounds(layer))
						.filter(
							(other) =>
								other.left < box.right &&
								other.right > box.left &&
								other.top < box.bottom &&
								other.bottom > box.top
						);
					const name = `${device}/${slide.id}/${lifted.id}`;
					expect(under.length, name).toBeGreaterThan(0);
					const past = box.right - Math.max(...under.map((other) => other.right));
					expect(past <= 1 || past >= 32, `${name} right ${past}`).toBe(true);
					const below = box.bottom - Math.max(...under.map((other) => other.bottom));
					expect(below <= 1 || below >= 32, `${name} foot ${below}`).toBe(true);
				}
			}
		}
	});

	it('rings a region without crossing the rows next to it', () => {
		for (const device of ALL_TARGETS) {
			const slide = frameOf(device, 'almanac');
			const mark = slide.check!.mark!;
			const anchor = slide.layers!.find((layer) => layer.id === mark.anchor)!;
			const region = layerRegionToOutput(anchor, mark.rect);
			const unit = DEVICES[device].width / 1320;
			const { points } = checkMarkStroke(mark.kind, region, mark.seed, unit);
			for (const neighbor of ringNeighbors(device)) {
				const box = layerRegionToOutput(anchor, neighbor);
				const gap = Math.min(
					...points.map(
						(point) =>
							Math.hypot(
								Math.max(box.x - point.x, 0, point.x - box.x - box.width),
								Math.max(box.y - point.y, 0, point.y - box.y - box.height)
							) -
							point.width / 2
					)
				);
				expect(gap, device).toBeGreaterThan(2);
			}
		}
	});

	it('keeps a raised detail’s pen mark half a stroke inside that detail', () => {
		const unit = (device: DeviceId) => DEVICES[device].width / 1320;
		for (const device of ALL_TARGETS) {
			let marks = 0;
			for (const slide of campaign(device).slides) {
				const mark = slide.check!.mark!;
				if (!LIFTED_LAYERS.includes(mark.anchor) || mark.kind !== 'ring') continue;
				marks++;
				const anchor = slide.layers!.find((layer) => layer.id === mark.anchor)!;
				const region = layerRegionToOutput(anchor, mark.rect);
				const { bounds } = checkMarkStroke(mark.kind, region, mark.seed, unit(device));
				const box = layerBounds(anchor);
				const name = `${device}/${slide.id}`;
				const gap = 7 * unit(device);
				expect(bounds.left - box.left, name).toBeGreaterThanOrEqual(gap);
				expect(bounds.top - box.top, name).toBeGreaterThanOrEqual(gap);
				expect(box.right - bounds.right, name).toBeGreaterThanOrEqual(gap);
				expect(box.bottom - bounds.bottom, name).toBeGreaterThanOrEqual(gap);
			}
			expect(marks, device).toBeGreaterThan(0);
		}
	});

	it('squares the right edge of stacked cards', () => {
		for (const device of ALL_TARGETS) {
			const edges = frameOf(device, 'season').layers!.map((layer) => layerBounds(layer).right);
			expect(Math.max(...edges) - Math.min(...edges), device).toBeLessThanOrEqual(1);
		}
	});

	it('keeps the same frames on every display', () => {
		for (const device of campaignTargets())
			expect(campaign(device).slides.map((slide) => slide.id)).toEqual([
				'almanac',
				'season',
				'gear',
				'trail',
				'summit'
			]);
	});

	it('tears only a layer that exists on that frame', () => {
		for (const device of campaignTargets()) {
			const torn = campaign(device).slides.filter((slide) => slide.check?.tear);
			expect(
				torn.map((slide) => slide.id),
				device
			).toEqual(['almanac']);
			for (const slide of torn)
				expect(
					slide.layers?.map((layer) => layer.id),
					device
				).toContain(slide.check?.tear);
		}
	});

	it('drops a torn edge and a mark when their capture is missing', () => {
		const composition = createCampaignDemo('iphone-6.9', {});
		for (const slide of composition.slides) {
			expect(slide.check?.mark, slide.id).toBeUndefined();
			expect(slide.check?.tear, slide.id).toBeUndefined();
			expect(slide.layers, slide.id).toBeUndefined();
		}
	});

	it('keeps support lines short and inks readable on their canvases', () => {
		for (const slide of campaign('iphone-6.9').slides) {
			expect(slide.typography.subtitle!.split(/\s+/).length, slide.id).toBeLessThanOrEqual(10);
			const palette = CHECK_PALETTES[slide.check!.canvas];
			expect(contrastRatio(palette.support, palette.canvas), slide.id).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('refuses to borrow a source of the wrong size', () => {
		const wrong = sources('iphone-6.9');
		expect(() => createCampaignDemo('ipad-13', wrong)).toThrow(/2064 × 2752/);
		expect(() =>
			createCampaignProject({
				'ipad-13': assets('iphone-6.9')
			})
		).toThrow(/2064 × 2752/);
	});
});

describe('multi-target project', () => {
	it('keeps a torn edge and a second capture through projection', () => {
		const device = 'iphone-di-medium-1206x2622';
		const project = createCampaignProject({ [device]: assets(device) });
		const composition = projectForTarget(project, device);
		const direct = campaign(device);
		const pick = (slides: Composition['slides'], id: string) =>
			slides.find((slide) => slide.id === id)!;
		expect(pick(composition.slides, 'almanac').check?.tear).toBe('strip');
		expect(pick(composition.slides, 'trail').layers?.map((layer) => layer.image.id)).toEqual(
			pick(direct.slides, 'trail').layers?.map((layer) => layer.image.id)
		);
		expect(pick(composition.slides, 'trail').layers?.[1].image.id).toBe(`${device}-extra`);
	});

	it('stores one set of frames, each target with its own source, layers and mark', () => {
		const project = createCampaignProject({
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
		expect(first.typography.headline).toContain('quietly kept');
		const stored = Object.values(project.assets);
		expect(new Set(stored.map((asset) => asset.id)).size).toBe(stored.length);
	});

	it('embeds only the captures a frame uses', () => {
		const device = 'iphone-6.9';
		const project = createCampaignProject({
			[device]: {
				...assets(device),
				// A capture of a screen this campaign does not show stays out of the file.
				...({
					spare: {
						id: `${device}-spare`,
						mime: 'image/png',
						byteLength: 1000,
						url: PNG,
						naturalWidth: 1320,
						naturalHeight: 2868
					}
				} as CampaignAssets)
			}
		});
		expect(Object.keys(project.assets).sort()).toEqual(
			CAMPAIGN_SCENES.map((scene) => `${device}-${scene}`).sort()
		);
	});

	it('projects each target to its own frames, matching the single-target campaign', () => {
		const project = createCampaignProject({
			'iphone-6.9': assets('iphone-6.9'),
			'ipad-13': assets('ipad-13')
		});
		for (const target of project.targets) {
			const composition = projectForTarget(project, target);
			const direct = createCampaignDemo(target, sources(target));
			expect(composition.slides.map((slide) => slide.check)).toEqual(
				direct.slides.map((slide) => slide.check)
			);
			expect(composition.slides.map((slide) => slide.typography)).toEqual(
				direct.slides.map((slide) => slide.typography)
			);
			expect(composition.slides.map((slide) => slide.layers?.map((layer) => layer.crop))).toEqual(
				direct.slides.map((slide) => slide.layers?.map((layer) => layer.crop))
			);
			expect(composition.slides[0].primaryImage?.id).toBe(`${target}-almanac`);
		}
	});

	it('leaves a frame with no capture unbound rather than borrowing one', () => {
		const partial = { ...assets('iphone-duo-inner-2007x2853') };
		delete partial.almanac;
		delete partial.extra;
		const project = createCampaignProject({ 'iphone-duo-inner-2007x2853': partial });
		const composition = projectForTarget(project, 'iphone-duo-inner-2007x2853');
		expect(composition.slides[0].primaryImage).toBeUndefined();
		expect(composition.slides[0].layers ?? []).toEqual([]);
		expect(composition.slides[0].check?.mark).toBeUndefined();
		const trail = composition.slides.find((slide) => slide.id === 'trail')!;
		expect(trail.layers?.map((layer) => layer.id)).not.toContain('extra');
		expect(trail.layers?.map((layer) => layer.id)).toContain('panel');
	});
});

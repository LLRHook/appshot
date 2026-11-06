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

/** Measured from each target's native captures, in source pixels. */
const ALL_TARGETS: DeviceId[] = [
	'iphone-6.9',
	'iphone-di-medium-1206x2622',
	'ipad-13',
	'iphone-duo-outer-1398x2034',
	'iphone-duo-inner-2007x2853'
];
const PHONES: DeviceId[] = ALL_TARGETS.filter((device) => device !== 'ipad-13');
/** Tallest glyph of a dish name. */
const DISH_GLYPH = (device: DeviceId) => (device === 'ipad-13' ? 24 : 36);
/** Digits of a share chip. */
const CHIP_GLYPH = (device: DeviceId) => (device === 'ipad-13' ? 20 : 30);
/** Dish rows repeat this often. */
const ROW_PITCH = (device: DeviceId) => (device === 'ipad-13' ? 200 : 300);
/** Lowest ink of the total card's digits, for targets that show that card as its own layer. */
const TOTAL_INK_BOTTOM: Partial<Record<DeviceId, number>> = {
	'iphone-6.9': 715,
	'iphone-di-medium-1206x2622': 714,
	'iphone-duo-inner-2007x2853': 775
};
/** Real edges and parts of the Steak frites row in each target's Assign Items capture. */
const STEAK_ROW: Record<
	string,
	{
		left: number;
		right: number;
		top: number;
		bottom: number;
		avatar: { x: number; y: number; width: number; height: number };
	}
> = {
	'iphone-6.9': {
		left: 48,
		right: 1271,
		top: 1351,
		bottom: 1612,
		avatar: { x: 1143, y: 1495, width: 66, height: 67 }
	},
	'iphone-di-medium-1206x2622': {
		left: 48,
		right: 1157,
		top: 1351,
		bottom: 1612,
		avatar: { x: 1028, y: 1495, width: 68, height: 67 }
	},
	'ipad-13': {
		left: 32,
		right: 2031,
		top: 840,
		bottom: 1015,
		avatar: { x: 1946, y: 937, width: 44, height: 45 }
	},
	'iphone-duo-outer-1398x2034': {
		left: 48,
		right: 1349,
		top: 1165,
		bottom: 1426,
		avatar: { x: 1220, y: 1309, width: 68, height: 67 }
	},
	'iphone-duo-inner-2007x2853': {
		left: 48,
		right: 1958,
		top: 1411,
		bottom: 1672,
		avatar: { x: 1829, y: 1555, width: 68, height: 67 }
	}
};
/** The Truffle fries line of Leo's breakdown: its amount and share. */
const FRIES_LINE: Record<string, { left: number; right: number; top: number; bottom: number }> = {
	'iphone-6.9': { left: 980, right: 1203, top: 1999, bottom: 2034 },
	'iphone-di-medium-1206x2622': { left: 866, right: 1089, top: 1999, bottom: 2034 },
	'ipad-13': { left: 1837, right: 1986, top: 1273, bottom: 1296 },
	'iphone-duo-outer-1398x2034': { left: 806, right: 1029, top: 1396, bottom: 1431 },
	'iphone-duo-inner-2007x2853': { left: 1667, right: 1890, top: 2059, bottom: 2094 }
};
/** Subtotal's top to Tax's foot on each target's Enter Bill Details capture. */
const BILL_FIELDS: Record<string, { top: number; bottom: number }> = {
	'iphone-6.9': { top: 1303, bottom: 1697 },
	'iphone-di-medium-1206x2622': { top: 1303, bottom: 1697 },
	'ipad-13': { top: 809, bottom: 1071 },
	'iphone-duo-outer-1398x2034': { top: 1117, bottom: 1511 },
	'iphone-duo-inner-2007x2853': { top: 1363, bottom: 1757 }
};
/** Leo's share chip on each target's result capture, as left, top, right, bottom. */
const LEO_CHIP: Record<string, readonly [number, number, number, number]> = {
	'iphone-6.9': [896, 1606, 1116, 1702],
	'iphone-di-medium-1206x2622': [782, 1356, 1002, 1452],
	'ipad-13': [1782, 1011, 1928, 1074],
	'iphone-duo-outer-1398x2034': [722, 730, 942, 826],
	'iphone-duo-inner-2007x2853': [1583, 1573, 1803, 1669]
};
/** The Truffle fries line's 25% tag on each target's breakdown capture, and the next line's. */
const FRIES_TAG: Record<string, { tag: readonly number[]; next: readonly number[] }> = {
	'iphone-6.9': { tag: [1118, 1990, 1224, 2047], next: [1118, 2077, 1224, 2134] },
	'iphone-di-medium-1206x2622': { tag: [1004, 1990, 1110, 2047], next: [1004, 2077, 1110, 2134] },
	'ipad-13': { tag: [1929, 1267, 2000, 1304], next: [1929, 1325, 2000, 1362] },
	'iphone-duo-outer-1398x2034': { tag: [944, 1388, 1050, 1444], next: [944, 1475, 1050, 1531] },
	'iphone-duo-inner-2007x2853': { tag: [1805, 2050, 1911, 2107], next: [1805, 2137, 1911, 2194] }
};
/** Bill Summary on each target's capture: heading, divider, Total's value and the card's foot. */
const SUMMARY: Record<
	string,
	{
		heading: number;
		divider: number;
		foot: number;
		value: { x: number; y: number; width: number; height: number };
	}
> = {
	'iphone-6.9': {
		heading: 1952,
		divider: 2327,
		foot: 2493,
		value: { x: 989, y: 2380, width: 195, height: 41 }
	},
	'iphone-di-medium-1206x2622': {
		heading: 1944,
		divider: 2319,
		foot: 2485,
		value: { x: 875, y: 2372, width: 195, height: 41 }
	},
	'ipad-13': {
		heading: 2141,
		divider: 2391,
		foot: 2502,
		value: { x: 1843, y: 2427, width: 130, height: 27 }
	},
	'iphone-duo-outer-1398x2034': {
		heading: 1121,
		divider: 1496,
		foot: 1662,
		value: { x: 1067, y: 1549, width: 195, height: 41 }
	},
	'iphone-duo-inner-2007x2853': {
		heading: 1937,
		divider: 2312,
		foot: 2478,
		value: { x: 1676, y: 2365, width: 195, height: 41 }
	}
};

/** Layers lifted above another layer of the same frame. */
const LIFTS = ['share', 'owner', 'dish', 'names', 'lines', 'grand-total'];

const pickLayer = (device: DeviceId, frame: string, id: string) =>
	campaign(device)
		.slides.find((slide) => slide.id === frame)!
		.layers!.find((layer) => layer.id === id)!;

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
			// The ringed person's avatar on a real dish row: 66 source pixels on these classes.
			expect(physical(66 * layer('assign', 'owner').scale, device)).toBeGreaterThan(24);
			expect(
				physical(SHARE_DIGITS[device]! * layer('result', 'shares').scale, device)
			).toBeGreaterThan(10.8);
		}
	});

	it('shows who had what from one real Assign Items capture and no other screen', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'assign')!;
			expect(slide.primaryImage?.id, device).toBe(`${device}-assign`);
			for (const layer of slide.layers!)
				expect(layer.image.id, `${device}/${layer.id}`).toBe(`${device}-assign`);
			const ids = slide.layers!.map((layer) => layer.id);
			expect(ids, device).not.toContain('people');
		}
	});

	it('keeps every dish row whole, with both real edges inside the crop and the frame', () => {
		for (const device of ALL_TARGETS) {
			const dishes = pickLayer(device, 'assign', 'dishes');
			const { left, right, top, bottom } = STEAK_ROW[device];
			expect(dishes.crop.x, device).toBeLessThan(left);
			expect(dishes.crop.x + dishes.crop.width, device).toBeGreaterThan(right);
			const row = layerRegionToOutput(dishes, {
				x: left,
				y: top,
				width: right - left,
				height: bottom - top
			});
			expect(row.x, device).toBeGreaterThan(0);
			expect(row.x + row.width, device).toBeLessThan(DEVICES[device].width);
			// The base view stays at or below its real size. Only plainly raised details go larger.
			expect(dishes.scale, device).toBeLessThanOrEqual(1);
		}
	});

	it('reads the marked dish at search scale, from a real detail where the row is too wide', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'assign')!;
			const named =
				slide.layers!.find((layer) => layer.id === 'dish') ?? pickLayer(device, 'assign', 'dishes');
			expect(physical(DISH_GLYPH(device) * named.scale, device), device).toBeGreaterThanOrEqual(
				9.8
			);
		}
	});

	it('marks a real assignment: the avatar on the row it belongs to', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'assign')!;
			const mark = slide.check!.mark!;
			expect(mark.anchor, device).toBe('owner');
			expect(mark.kind, device).toBe('ring');
			const { avatar, top, bottom, left, right } = STEAK_ROW[device];
			const owner = pickLayer(device, 'assign', 'owner');
			const cx = mark.rect.x + mark.rect.width / 2;
			const cy = mark.rect.y + mark.rect.height / 2;
			expect(cx, device).toBeGreaterThan(avatar.x);
			expect(cx, device).toBeLessThan(avatar.x + avatar.width);
			expect(cy, device).toBeGreaterThan(avatar.y);
			expect(cy, device).toBeLessThan(avatar.y + avatar.height);
			// The owner detail is cropped from inside that row, so no row edge or neighbor comes with it.
			expect(owner.crop.x, device).toBeGreaterThan(left);
			expect(owner.crop.x + owner.crop.width, device).toBeLessThan(right);
			expect(owner.crop.y, device).toBeGreaterThan(top);
			expect(owner.crop.y + owner.crop.height, device).toBeLessThan(bottom);
		}
	});

	it('never splices a row into a compact one: its two ends stay apart', () => {
		for (const device of ['ipad-13', 'iphone-duo-inner-2007x2853'] as DeviceId[]) {
			const dish = layerBounds(pickLayer(device, 'assign', 'dish'));
			const owner = layerBounds(pickLayer(device, 'assign', 'owner'));
			expect((owner.left - dish.right) / DEVICES[device].width, device).toBeGreaterThanOrEqual(
				0.15
			);
			const detail = pickLayer(device, 'assign', 'owner');
			// Cover the original row end, so its avatar, percentage and progress bar appear only once.
			const original = layerRegionToOutput(pickLayer(device, 'assign', 'dishes'), detail.crop);
			expect(owner.left, device).toBeLessThanOrEqual(original.x);
			expect(owner.top, device).toBeLessThanOrEqual(original.y);
			expect(owner.right, device).toBeGreaterThanOrEqual(original.x + original.width);
			expect(owner.bottom, device).toBeGreaterThanOrEqual(original.y + original.height);
		}
		for (const device of PHONES.filter((item) => item !== 'iphone-duo-inner-2007x2853'))
			expect(
				campaign(device)
					.slides.find((item) => item.id === 'assign')!
					.layers!.map((layer) => layer.id),
				device
			).toEqual(['dishes', 'owner']);
	});

	it('shows the result as one real card with a ringed share large enough to read', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'result')!;
			const ids = slide.layers!.map((layer) => layer.id);
			expect(ids, device).not.toContain('people');
			expect(
				ids.filter((id) => id === 'shares'),
				device
			).toHaveLength(1);
			const ringed = slide.layers!.find((layer) => layer.id === slide.check!.mark!.anchor)!;
			expect(physical(CHIP_GLYPH(device) * ringed.scale, device), device).toBeGreaterThanOrEqual(
				10.98
			);
			// All four rows stay in the one crop, so the shares still add up to the total.
			const { crop } = pickLayer(device, 'result', 'shares');
			expect(crop.height, device).toBeGreaterThanOrEqual(ROW_PITCH(device) === 200 ? 725 : 995);
		}
	});

	it('keeps the total clear of its card foot', () => {
		for (const [device, ink] of Object.entries(TOTAL_INK_BOTTOM) as [DeviceId, number][]) {
			const total = pickLayer(device, 'result', 'total');
			const foot = (total.crop.y + total.crop.height - ink) * total.scale;
			expect(foot, device).toBeGreaterThanOrEqual(60);
		}
	});

	it('overhangs its panel on purpose or not at all', () => {
		for (const device of ALL_TARGETS) {
			for (const slide of campaign(device).slides) {
				const layers = slide.layers ?? [];
				for (const lifted of layers.filter((layer) => LIFTS.includes(layer.id))) {
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

	it('marks an item line on every display, not a person’s total', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'line-by-line')!;
			const mark = slide.check!.mark!;
			const line = FRIES_LINE[device];
			expect(mark.kind, device).toBe('ring');
			expect(mark.rect.y, device).toBeLessThanOrEqual(line.top + 2);
			expect(mark.rect.y + mark.rect.height, device).toBeGreaterThanOrEqual(line.bottom - 2);
			expect(mark.rect.x, device).toBeLessThanOrEqual(line.left + 2);
			expect(mark.rect.x + mark.rect.width, device).toBeGreaterThanOrEqual(line.right - 2);
			expect(
				slide.layers!.map((layer) => layer.id),
				device
			).not.toContain('share');
		}
	});

	it('keeps an item line’s two ends on one scale and one line on the wide displays', () => {
		for (const device of ['ipad-13', 'iphone-duo-inner-2007x2853'] as DeviceId[]) {
			const names = pickLayer(device, 'line-by-line', 'names');
			const lines = pickLayer(device, 'line-by-line', 'lines');
			expect(names.scale, device).toBe(lines.scale);
			expect(names.y, device).toBe(lines.y);
			expect(names.crop.y, device).toBe(lines.crop.y);
			expect(names.crop.height, device).toBe(lines.crop.height);
			// The lines' blank middle stays open, so neither detail reads as a compact native row.
			const gap = layerBounds(lines).left - layerBounds(names).right;
			expect(gap / DEVICES[device].width, device).toBeGreaterThanOrEqual(0.2);
			// The ringed line reads at search scale. Its digits are 20 and 30 source pixels here.
			const digits = device === 'ipad-13' ? 20 : 30;
			expect(physical(digits * lines.scale, device), device).toBeGreaterThanOrEqual(11);
		}
	});

	it('runs the wide receipt behind the last enlarged item line before tearing', () => {
		for (const device of ['ipad-13', 'iphone-duo-inner-2007x2853'] as DeviceId[]) {
			const receipt = layerBounds(pickLayer(device, 'line-by-line', 'receipt'));
			for (const id of ['names', 'lines']) {
				const detail = layerBounds(pickLayer(device, 'line-by-line', id));
				expect(receipt.bottom, `${device}/${id}`).toBeGreaterThanOrEqual(detail.bottom + 3);
			}
		}
	});

	it('keeps the result’s header and people on one coherent scale on the wide displays', () => {
		const tablet = pickLayer('ipad-13', 'result', 'shares');
		// One real view: the bill's card and its people come from one crop at one scale.
		expect(tablet.crop.y, 'ipad-13').toBeLessThanOrEqual(168);
		const header = pickLayer('iphone-duo-inner-2007x2853', 'result', 'total');
		const people = pickLayer('iphone-duo-inner-2007x2853', 'result', 'shares');
		expect(header.scale / people.scale, 'inner').toBeLessThanOrEqual(1.3);
	});

	it('rings a share inside its real chip, so no chip edge shows beyond the pen', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'result')!;
			const mark = slide.check!.mark!;
			const anchor = slide.layers!.find((layer) => layer.id === mark.anchor)!;
			const [left, top, right, bottom] = LEO_CHIP[device];
			const chip = layerRegionToOutput(anchor, {
				x: left,
				y: top,
				width: right - left,
				height: bottom - top
			});
			const region = layerRegionToOutput(anchor, mark.rect);
			const unit = DEVICES[device].width / 1320;
			const { bounds } = checkMarkStroke(mark.kind, region, mark.seed, unit);
			expect(bounds.left, device).toBeGreaterThanOrEqual(chip.x);
			expect(bounds.top, device).toBeGreaterThanOrEqual(chip.y);
			expect(bounds.right, device).toBeLessThanOrEqual(chip.x + chip.width);
			expect(bounds.bottom, device).toBeLessThanOrEqual(chip.y + chip.height);
		}
	});

	it('rings a line’s amount and tag without crossing that tag or the next line’s', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'line-by-line')!;
			const mark = slide.check!.mark!;
			const anchor = slide.layers!.find((layer) => layer.id === mark.anchor)!;
			const region = layerRegionToOutput(anchor, mark.rect);
			const unit = DEVICES[device].width / 1320;
			const { points } = checkMarkStroke(mark.kind, region, mark.seed, unit);
			for (const [left, top, right, bottom] of Object.values(FRIES_TAG[device])) {
				const box = layerRegionToOutput(anchor, {
					x: left,
					y: top,
					width: right - left,
					height: bottom - top
				});
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
			for (const slide of campaign(device).slides) {
				const mark = slide.check!.mark!;
				if (!LIFTS.includes(mark.anchor) || mark.kind !== 'ring') continue;
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
		}
	});

	it('shows Subtotal and Tax together and all of Bill Summary on every display', () => {
		for (const device of ALL_TARGETS) {
			const bill = pickLayer(device, 'entry', 'bill');
			const fields = BILL_FIELDS[device];
			expect(bill.image.id, device).toBe(`${device}-entry`);
			expect(bill.crop.y, device).toBeLessThanOrEqual(fields.top);
			expect(bill.crop.y + bill.crop.height, device).toBeGreaterThanOrEqual(fields.bottom);
			const summary = pickLayer(device, 'entry', 'summary');
			const { heading, foot, value } = SUMMARY[device];
			expect(summary.crop.y, device).toBeLessThanOrEqual(heading);
			expect(summary.crop.y + summary.crop.height, device).toBeGreaterThanOrEqual(foot);
			expect(summary.crop.y + summary.crop.height, device).toBeGreaterThan(value.y + value.height);
		}
	});

	it('raises the entered total as a callout, below the divider and past the card’s foot', () => {
		for (const device of ALL_TARGETS) {
			const summary = pickLayer(device, 'entry', 'summary');
			const total = pickLayer(device, 'entry', 'grand-total');
			const { divider, foot, value } = SUMMARY[device];
			const box = layerBounds(total);
			const card = layerBounds(summary);
			const rule = layerRegionToOutput(summary, { x: value.x, y: divider, width: 1, height: 1 });
			// A plate with its own shadow, not a value restyled inline.
			expect(total.shadow, device).toBe('soft');
			expect(box.top, device).toBeGreaterThanOrEqual(rule.y + rule.height + 8);
			expect(box.bottom - card.bottom, device).toBeGreaterThanOrEqual(32);
			// Its crop stays between the rules, so neither comes with it.
			expect(total.crop.y, device).toBeGreaterThan(divider);
			expect(total.crop.y + total.crop.height, device).toBeLessThan(foot);
			expect(total.crop.x, device).toBeLessThanOrEqual(value.x);
			expect(total.crop.x + total.crop.width, device).toBeGreaterThanOrEqual(value.x + value.width);
			// Stepped in from the card's edge, so it reads as a raised card and never as a tab of it.
			expect(card.right - box.right, device).toBeGreaterThanOrEqual(16);
			const slide = campaign(device).slides.find((item) => item.id === 'entry')!;
			expect(slide.check?.mark?.kind, device).toBe('underline');
		}
	});

	it('squares the right edge of every entry card', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'entry')!;
			const cards = slide.layers!.filter((layer) => layer.id !== 'grand-total');
			const edges = cards.map((layer) => layerBounds(layer).right);
			expect(Math.max(...edges) - Math.min(...edges), device).toBeLessThanOrEqual(1);
		}
	});

	it('claims on the entry frame only what its Bill Summary shows, on every display', () => {
		for (const device of ALL_TARGETS) {
			const slide = campaign(device).slides.find((item) => item.id === 'entry')!;
			expect(slide.typography.subtitle, device).toBe('Billington adds up subtotal, tax and tip.');
		}
	});

	it('starts every split dialog crop inside the dialog, so no dimmed backdrop shows', () => {
		const dialogTop: Record<string, number> = {
			'iphone-6.9': 329,
			'iphone-di-medium-1206x2622': 304,
			'ipad-13': 482,
			'iphone-duo-outer-1398x2034': 153,
			'iphone-duo-inner-2007x2853': 357
		};
		for (const device of ALL_TARGETS)
			expect(pickLayer(device, 'shared', 'dialog').crop.y, device).toBeGreaterThanOrEqual(
				dialogTop[device]
			);
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

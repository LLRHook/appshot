import { describe, expect, it } from 'vitest';
import { applyCheckStyle } from '../model/check';
import { createDemo } from '../model/studio';
import {
	classicCopyBand,
	clearClassicCopy,
	computePanoramaGeometry,
	panoramaPointToSlide
} from './panorama';

describe('canonical panorama geometry', () => {
	it('preserves every rotated phone coordinate across the exported seam', () => {
		const composition = createDemo();
		composition.panorama!.scale = 1.19;
		composition.panorama!.tilt = -27;
		composition.panorama!.offset = 170;
		const left = computePanoramaGeometry(composition, 0)!;
		const right = computePanoramaGeometry(composition, 1)!;
		expect(left.phone).toEqual(right.phone);
		for (const [x, y] of [
			[0, 0],
			[-400, -900],
			[400, 900],
			[-300, 200]
		]) {
			const a = panoramaPointToSlide(left, x, y);
			const b = panoramaPointToSlide(right, x, y);
			expect(a.x - b.x).toBeCloseTo(left.panelWidth, 8);
			expect(a.y).toBe(b.y);
		}
	});
	it('does not connect a removed, reordered, or unrelated slide', () => {
		const composition = createDemo();
		expect(computePanoramaGeometry(composition, 2)).toBeNull();
		[composition.slides[0], composition.slides[1]] = [composition.slides[1], composition.slides[0]];
		expect(computePanoramaGeometry(composition, 0)).toBeNull();
		composition.slides.shift();
		expect(computePanoramaGeometry(composition, 0)).toBeNull();
	});
	it('turns off with continuity and rejects invalid image geometry', () => {
		const composition = createDemo();
		composition.continuityMode = 'none';
		expect(computePanoramaGeometry(composition, 0)).toBeNull();
		composition.continuityMode = 'paired';
		composition.panorama!.image.naturalWidth = 0;
		expect(computePanoramaGeometry(composition, 0)).toBeNull();
	});
	it('scales the world to each exact supported App Store size', () => {
		const composition = createDemo();
		composition.device = 'iphone-6.7';
		const geometry = computePanoramaGeometry(composition, 1)!;
		expect([
			geometry.panelWidth,
			geometry.panelHeight,
			geometry.worldWidth,
			geometry.viewportX
		]).toEqual([1284, 2778, 2568, 1284]);
		composition.device = 'ipad-13';
		const tablet = computePanoramaGeometry(composition, 0)!;
		expect([tablet.panelWidth, tablet.panelHeight, tablet.worldWidth]).toEqual([2064, 2752, 4128]);
	});
	it('preserves screenshot aspect through each shared frame and changes the shared layout', () => {
		const composition = createDemo();
		for (const frame of ['bezel', 'clay', 'wireframe', 'none'] as const) {
			composition.slides[0].frame = frame;
			const { phone } = computePanoramaGeometry(composition, 0)!;
			const inset = frame === 'none' ? 0 : phone.width * (frame === 'clay' ? 0.035 : 0.022);
			expect((phone.height - inset * 2) / (phone.width - inset * 2)).toBeCloseTo(
				composition.panorama!.image.naturalHeight / composition.panorama!.image.naturalWidth,
				8
			);
		}
		const above = computePanoramaGeometry(composition, 0)!;
		composition.slides[0].layout = 'text-below';
		const below = computePanoramaGeometry(composition, 0)!;
		expect(below.phone.centerY).toBeLessThan(above.phone.centerY);
		expect(computePanoramaGeometry(composition, 1)!.phone).toEqual(below.phone);
	});
	it('contains invalid numeric controls without breaking rendering', () => {
		const composition = createDemo();
		composition.panorama!.offset = NaN;
		composition.panorama!.scale = Infinity;
		composition.panorama!.tilt = NaN;
		const geometry = computePanoramaGeometry(composition, 0)!;
		for (const value of Object.values(geometry.phone)) expect(Number.isFinite(value)).toBe(true);
	});
	describe('live-path safeguards', () => {
		const pair = () => {
			const composition = createDemo();
			expect(computePanoramaGeometry(composition, 0)).not.toBeNull();
			return composition;
		};
		it('rejects a slide index that is not a whole number', () => {
			const composition = pair();
			for (const index of [0.5, NaN, Infinity])
				expect(computePanoramaGeometry(composition, index)).toBeNull();
		});
		it('rejects a device the catalog does not have', () => {
			const composition = pair();
			(composition as { device: string }).device = 'constructor';
			expect(computePanoramaGeometry(composition, 0)).toBeNull();
			const slide = pair();
			(slide.slides[1] as { device: string }).device = '__proto__';
			expect(computePanoramaGeometry(slide, 0)).toBeNull();
		});
		it('rejects panels of different sizes, which could not make one world', () => {
			const composition = pair();
			composition.slides[1].device = 'ipad-13';
			expect(computePanoramaGeometry(composition, 0)).toBeNull();
		});
		it('rejects an image with a fractional or missing size, or no bitmap', () => {
			for (const patch of [
				{ naturalWidth: 12.5 },
				{ naturalHeight: Number.POSITIVE_INFINITY },
				{ naturalWidth: -1 },
				{ blobUrl: '' }
			]) {
				const composition = pair();
				composition.panorama!.image = { ...composition.panorama!.image, ...patch };
				expect(computePanoramaGeometry(composition, 0)).toBeNull();
			}
		});
		it('holds the same two-panel invariant on every size a pair can use', () => {
			for (const device of ['iphone-duo-outer-1398x2034', 'iphone-di-medium-1206x2622'] as const) {
				const composition = pair();
				composition.device = device;
				composition.slides.forEach((slide) => (slide.device = device));
				const left = computePanoramaGeometry(composition, 0)!;
				const right = computePanoramaGeometry(composition, 1)!;
				expect(left.phone).toEqual(right.phone);
				expect(left.worldWidth).toBe(left.panelWidth * 2);
				expect(right.viewportX).toBe(left.panelWidth);
			}
		});
	});
	describe('The Check', () => {
		const laterPair = () => {
			const demo = createDemo();
			demo.panorama = { ...demo.panorama!, leftId: demo.slides[3].id, rightId: demo.slides[4].id };
			return applyCheckStyle(demo);
		};
		it('centers one upright panel on the seam, the same for both frames', () => {
			const composition = laterPair();
			const left = computePanoramaGeometry(composition, 3)!;
			const right = computePanoramaGeometry(composition, 4)!;
			expect(left.phone).toEqual(right.phone);
			expect(left.phone.centerX).toBeCloseTo(left.panelWidth, 8);
			expect(left.phone.rotation).toBe(0);
			expect(left.phone.width / left.panelWidth).toBeCloseTo(0.84, 8);
			expect(left.phone.height / left.phone.width).toBeCloseTo(2868 / 1320, 8);
		});
		it('does not leave a pair inside the first three frames', () => {
			expect(computePanoramaGeometry(applyCheckStyle(createDemo()), 0)).toBeNull();
		});
	});
	describe('sample styles keep the phone clear of the copy', () => {
		const slide = () => createDemo().slides[0];
		it('leaves a phone that was already clear exactly where it was', () => {
			const phone = { centerX: 660, centerY: 2100, width: 1030, height: 2237, rotation: 0 };
			expect(clearClassicCopy(phone, [slide()], 1320, 2868)).toBe(phone);
		});
		it('moves an oversized phone below the copy band, rotated reach included', () => {
			const phone = { centerX: 660, centerY: 1400, width: 1400, height: 3040, rotation: 0.2 };
			const moved = clearClassicCopy(phone, [slide()], 1320, 2868);
			const reach =
				(Math.abs(Math.cos(phone.rotation)) * phone.height) / 2 +
				(Math.abs(Math.sin(phone.rotation)) * phone.width) / 2;
			const band = classicCopyBand(slide(), 1320, 2868);
			expect(moved.centerY - reach).toBeGreaterThanOrEqual(band.titleY + 2868 * 0.14);
		});
		it('moves a text-below phone up instead of over the copy', () => {
			const below = { ...slide(), layout: 'text-below' as const };
			const phone = { centerX: 660, centerY: 1200, width: 1000, height: 2172, rotation: 0 };
			const moved = clearClassicCopy(phone, [below], 1320, 2868);
			expect(moved.centerY + moved.height / 2).toBeLessThanOrEqual(
				classicCopyBand(below, 1320, 2868).top
			);
		});
		it('starts landscape copy below the wordmark', () => {
			const band = classicCopyBand(slide(), 2868, 1320);
			expect(band.badgeY).toBeGreaterThan(2868 * 0.13);
		});
		it('reserves room for the taller side of a pair', () => {
			const composition = createDemo();
			composition.slides[1].badge = 'Longer copy';
			composition.slides[0].badge = '';
			composition.panorama!.scale = 1.4;
			const { phone } = computePanoramaGeometry(composition, 0)!;
			const reach =
				(Math.abs(Math.cos(phone.rotation)) * phone.height) / 2 +
				(Math.abs(Math.sin(phone.rotation)) * phone.width) / 2;
			expect(phone.centerY - reach).toBeGreaterThanOrEqual(
				classicCopyBand(composition.slides[1], 1320, 2868).titleY + 2868 * 0.14
			);
		});
	});
});

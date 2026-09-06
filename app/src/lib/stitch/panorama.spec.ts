import { describe, expect, it } from 'vitest';
import { createDemo } from '../model/studio';
import { computePanoramaGeometry, panoramaPointToSlide } from './panorama';

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
});

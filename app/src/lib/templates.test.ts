import { describe, it, expect } from 'vitest';
import { DEVICE_SIZES } from './templates';

describe('DEVICE_SIZES', () => {
	it('all entries have positive width and height', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.width).toBeGreaterThan(0);
			expect(size.height).toBeGreaterThan(0);
		}
	});

	it('all entries have a valid device string', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.device).toBeTruthy();
			expect(typeof size.device).toBe('string');
		}
	});

	it('all entries have a label', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.label).toBeTruthy();
		}
	});

	it('includes iPhone and iPad sizes', () => {
		const devices = DEVICE_SIZES.map((s) => s.device);
		expect(devices).toContain('iphone');
		expect(devices).toContain('ipad');
	});
});

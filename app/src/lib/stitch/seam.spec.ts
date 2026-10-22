import { describe, it, expect } from 'vitest';
import { computeSeamGeometry, validateSeamIntegrity, collectSeams } from './seam';
import type { Slide, ImageRef } from '../model/types';
import { DEVICES } from '../model/devices';

function makeImage(id: string, w = 1320, h = 1600): ImageRef {
	return { id, blobUrl: `blob:${id}`, naturalWidth: w, naturalHeight: h };
}

function baseSlide(id: string): Slide {
	return {
		id,
		device: 'iphone-6.9',
		background: { kind: 'solid', colors: ['#000000'] },
		frame: 'bezel',
		layout: 'text-above',
		typography: { headline: '', fontColor: '#ffffff', fontWeight: 600 },
		effects: { shadow: 'soft', glow: 0 },
		continuity: { inset: 0 }
	};
}

function connectedSlides(): [Slide, Slide] {
	const left = baseSlide('left');
	const right = baseSlide('right');
	const image = makeImage('shared');
	left.continuity.outgoing = image;
	right.continuity.incoming = { ...image };
	return [left, right];
}

describe('computeSeamGeometry', () => {
	it('returns null when either side lacks a continuity image', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		expect(computeSeamGeometry(a, b, 0)).toBeNull();

		a.continuity.outgoing = makeImage('img-1');
		expect(computeSeamGeometry(a, b, 0)).toBeNull();
	});

	it('returns null when outgoing and incoming reference different images', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		a.continuity.outgoing = makeImage('img-1');
		b.continuity.incoming = makeImage('img-2');
		expect(computeSeamGeometry(a, b, 0)).toBeNull();
	});

	it('returns null when insets diverge across the seam', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1');
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		a.continuity.inset = 40;
		b.continuity.inset = 41;
		expect(computeSeamGeometry(a, b, 0)).toBeNull();
	});

	it('straddles the seam with half the image on each side when inset is zero', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1', 1320, 1600);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		const anchors = computeSeamGeometry(a, b, 0)!;
		const deviceWidth = DEVICES['iphone-6.9'].width;
		expect(anchors.leftX).toBe(deviceWidth - 660);
		expect(anchors.rightX).toBe(-660);
		expect(anchors.imageWidth).toBe(1320);
		expect(anchors.y).toBe(Math.round((2868 - 1600) / 2));
	});

	it('shifts both sides by the same inset, preserving the continuity invariant', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1', 900, 1200);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		a.continuity.inset = 120;
		b.continuity.inset = 120;
		const anchors = computeSeamGeometry(a, b, 0)!;
		const deviceWidth = DEVICES['iphone-6.9'].width;
		expect(anchors.leftX).toBe(deviceWidth - 450 + 120);
		expect(anchors.rightX).toBe(-450 + 120);
		expect(anchors.rightX).toBe(anchors.leftX - deviceWidth);
	});

	it('keeps the continuity invariant across a range of image widths and insets', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const deviceWidth = DEVICES['iphone-6.9'].width;
		for (const imageWidth of [200, 600, 900, 1320, 2000]) {
			for (const inset of [-200, -50, 0, 50, 200]) {
				const img = makeImage(`w${imageWidth}-i${inset}`, imageWidth, 1200);
				a.continuity.outgoing = img;
				b.continuity.incoming = img;
				a.continuity.inset = inset;
				b.continuity.inset = inset;
				const anchors = computeSeamGeometry(a, b, 0)!;
				expect(anchors.rightX, `w=${imageWidth} i=${inset}`).toBe(anchors.leftX - deviceWidth);
			}
		}
	});
});

describe('validateSeamIntegrity', () => {
	it('accepts a seam whose geometry satisfies the continuity invariant', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1', 1320, 1600);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		const anchors = computeSeamGeometry(a, b, 0)!;
		expect(validateSeamIntegrity(anchors, a, b).valid).toBe(true);
	});

	it('rejects slides with mismatched device heights across a seam', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1', 1320, 1600);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		const anchors = computeSeamGeometry(a, b, 0)!;
		b.device = 'ipad-13';
		expect(validateSeamIntegrity(anchors, a, b).valid).toBe(false);
	});

	it('rejects anchors that break the continuity invariant', () => {
		const a = baseSlide('a');
		const b = baseSlide('b');
		const img = makeImage('img-1', 1320, 1600);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		const anchors = computeSeamGeometry(a, b, 0)!;
		const tampered = { ...anchors, rightX: anchors.rightX + 1 };
		expect(validateSeamIntegrity(tampered, a, b).valid).toBe(false);
	});
});

describe('collectSeams', () => {
	it('produces one seam per adjacent pair that shares a continuity image', () => {
		const s1 = baseSlide('s1');
		const s2 = baseSlide('s2');
		const s3 = baseSlide('s3');
		const imgA = makeImage('a', 1320, 1600);
		const imgB = makeImage('b', 1320, 1600);
		s1.continuity.outgoing = imgA;
		s2.continuity.incoming = imgA;
		s2.continuity.outgoing = imgB;
		s3.continuity.incoming = imgB;
		const seams = collectSeams([s1, s2, s3]);
		expect(seams).toHaveLength(2);
		expect(seams[0].leftSlideId).toBe('s1');
		expect(seams[1].leftSlideId).toBe('s2');
	});

	it('skips boundaries where continuity is broken', () => {
		const s1 = baseSlide('s1');
		const s2 = baseSlide('s2');
		const s3 = baseSlide('s3');
		const imgB = makeImage('b', 1320, 1600);
		s2.continuity.outgoing = imgB;
		s3.continuity.incoming = imgB;
		const seams = collectSeams([s1, s2, s3]);
		expect(seams).toHaveLength(1);
		expect(seams[0].leftSlideId).toBe('s2');
	});
});

describe('seam input and state regressions', () => {
	it('keeps fractional placement valid across all output sizes', () => {
		for (const device of Object.values(DEVICES)) {
			for (const inset of [0.1, -0.1, 0.3, -0.3, 1 / 3]) {
				const [left, right] = connectedSlides();
				left.device = right.device = device.id;
				left.continuity.inset = right.continuity.inset = inset;
				const anchors = computeSeamGeometry(left, right, 0)!;
				expect(anchors.rightX, `${device.id}: ${inset}`).toBe(anchors.leftX - device.width);
				expect(validateSeamIntegrity(anchors, left, right).valid, `${device.id}: ${inset}`).toBe(
					true
				);
			}
		}
	});

	it.each([0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		'rejects invalid image pixel dimensions: %s',
		(value) => {
			for (const side of ['naturalWidth', 'naturalHeight'] as const) {
				const [left, right] = connectedSlides();
				left.continuity.outgoing![side] = right.continuity.incoming![side] = value;
				expect(computeSeamGeometry(left, right, 0), side).toBeNull();
				expect(collectSeams([left, right]), side).toEqual([]);
			}
		}
	);

	it.each([Infinity, -Infinity, NaN])('rejects a non-finite inset: %s', (inset) => {
		const [left, right] = connectedSlides();
		left.continuity.inset = right.continuity.inset = inset;
		expect(computeSeamGeometry(left, right, 0)).toBeNull();
	});

	it.each(['blobUrl', 'naturalWidth', 'naturalHeight'] as const)(
		'rejects images with the same ID but different %s',
		(field) => {
			const [left, right] = connectedSlides();
			if (field === 'blobUrl') right.continuity.incoming!.blobUrl = 'blob:another-image';
			else right.continuity.incoming![field] += 1;
			expect(computeSeamGeometry(left, right, 0)).toBeNull();
		}
	);

	it.each(['', '   ', null, 42])('rejects an invalid shared image ID or URL: %s', (value) => {
		for (const field of ['id', 'blobUrl'] as const) {
			const [left, right] = connectedSlides();
			left.continuity.outgoing![field] = right.continuity.incoming![field] = value as string;
			expect(computeSeamGeometry(left, right, 0), field).toBeNull();
		}
	});

	it('rejects a duplicated slide identity', () => {
		const [left, right] = connectedSlides();
		right.id = left.id;
		expect(computeSeamGeometry(left, right, 0)).toBeNull();
	});

	it('rejects a missing continuity record without throwing', () => {
		const [left, right] = connectedSlides();
		left.continuity = undefined as unknown as Slide['continuity'];
		expect(computeSeamGeometry(left, right, 0)).toBeNull();
	});

	it('does not collect a seam between incompatible output sizes', () => {
		const [left, right] = connectedSlides();
		right.device = 'ipad-13';
		expect(computeSeamGeometry(left, right, 0)).toBeNull();
		expect(collectSeams([left, right])).toEqual([]);
	});

	it.each(['unknown-device', '__proto__', 'constructor'])('rejects unknown device %s', (device) => {
		const [left, right] = connectedSlides();
		left.device = device as Slide['device'];
		expect(() => computeSeamGeometry(left, right, 0)).not.toThrow();
		expect(computeSeamGeometry(left, right, 0)).toBeNull();
	});

	it.each([-1, 0.5, NaN, Infinity])('rejects an invalid slide index: %s', (index) => {
		const [left, right] = connectedSlides();
		expect(computeSeamGeometry(left, right, index)).toBeNull();
	});

	it('rejects stale anchors after moving both halves of a shared image', () => {
		const [left, right] = connectedSlides();
		const anchors = computeSeamGeometry(left, right, 0)!;
		left.continuity.inset = right.continuity.inset = 100;
		expect(validateSeamIntegrity(anchors, left, right).valid).toBe(false);
	});

	it('rejects stale anchors after resizing the shared image', () => {
		const [left, right] = connectedSlides();
		const anchors = computeSeamGeometry(left, right, 0)!;
		left.continuity.outgoing!.naturalHeight = right.continuity.incoming!.naturalHeight = 1200;
		expect(validateSeamIntegrity(anchors, left, right).valid).toBe(false);
	});

	it('rejects anchors for a different ordered pair', () => {
		const [left, right] = connectedSlides();
		const anchors = computeSeamGeometry(left, right, 0)!;
		expect(
			validateSeamIntegrity({ ...anchors, leftSlideId: 'another-slide' }, left, right).valid
		).toBe(false);
	});

	it.each(['imageWidth', 'imageHeight', 'y', 'inset'] as const)(
		'rejects non-finite anchor %s even when the horizontal invariant holds',
		(field) => {
			const [left, right] = connectedSlides();
			const anchors = computeSeamGeometry(left, right, 0)!;
			expect(validateSeamIntegrity({ ...anchors, [field]: NaN }, left, right).valid).toBe(false);
		}
	);
});

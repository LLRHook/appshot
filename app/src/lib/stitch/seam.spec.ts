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
		b.device = 'ipad-13';
		const img = makeImage('img-1', 1320, 1600);
		a.continuity.outgoing = img;
		b.continuity.incoming = img;
		const anchors = computeSeamGeometry(a, b, 0)!;
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

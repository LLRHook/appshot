import { describe, expect, it } from 'vitest';
import type { ImageLayer } from '../model/contracts';
import { DEVICES } from '../model/devices';
import {
	frameProfileError,
	hexWithAlpha,
	imageLayerError,
	layerBounds,
	layerImages,
	layerRegionToOutput,
	MAX_LAYER_SCALE,
	paintImageLayer,
	rasterScale,
	setShadow,
	visibleCaptureHeight
} from './frames';

const FRAME = { width: 1320, height: 2868 };

describe('visible capture area', () => {
	const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
	it('measures top, bottom and horizontal clipping without counting rounded corners', () => {
		expect(visibleCaptureHeight({ x: 10, y: 10, width: 80, height: 80 }, viewport)).toBe(80);
		expect(visibleCaptureHeight({ x: 10, y: -20, width: 80, height: 80 }, viewport)).toBe(60);
		expect(visibleCaptureHeight({ x: 10, y: 60, width: 80, height: 80 }, viewport)).toBe(40);
		expect(visibleCaptureHeight({ x: 60, y: 10, width: 80, height: 80 }, viewport)).toBe(40);
		expect(visibleCaptureHeight({ x: 110, y: 10, width: 80, height: 80 }, viewport)).toBe(0);
	});
	it('uses the same rotation center when a torn cut removes the lower panel', () => {
		const box = { x: 10, y: 10, width: 80, height: 80, cut: 50 };
		expect(visibleCaptureHeight(box, viewport)).toBe(40);
		expect(visibleCaptureHeight({ ...box, rotation: Math.PI / 2 }, viewport)).toBeCloseTo(40);
		expect(visibleCaptureHeight({ ...box, cut: -10 }, viewport)).toBe(0);
	});
	it('splits a rotated shared world by the actual two viewports', () => {
		const box = { x: 50, y: 30, width: 100, height: 40, rotation: Math.PI / 6 };
		const left = visibleCaptureHeight(box, viewport);
		const right = visibleCaptureHeight(box, { ...viewport, left: 100, right: 200 });
		expect(left).toBeCloseTo(20);
		expect(right).toBeCloseTo(20);
		expect(left + right).toBeCloseTo(box.height);
	});
});

function layer(overrides: Partial<ImageLayer> = {}): ImageLayer {
	return {
		id: 'shares',
		kind: 'source-crop',
		image: { id: 'capture', blobUrl: '/capture.png', naturalWidth: 1320, naturalHeight: 2868 },
		crop: { x: 80, y: 1519, width: 1060, height: 1078 },
		x: 30,
		y: 1640,
		scale: 1.16,
		radius: 48,
		shadow: 'dramatic',
		...overrides
	};
}

/** Records what a painter asks of the canvas, with the real save/restore state stack. */
function fakeContext(scale = 1) {
	const calls: { name: string; args: unknown[]; smoothing?: boolean }[] = [];
	const stack: boolean[] = [];
	const ctx = {
		imageSmoothingEnabled: true as boolean,
		shadowColor: '',
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		fillStyle: '',
		getTransform: () => ({ a: scale, b: 0 }),
		save() {
			stack.push(this.imageSmoothingEnabled);
		},
		restore() {
			this.imageSmoothingEnabled = stack.pop() ?? true;
		},
		drawImage(...args: unknown[]) {
			calls.push({ name: 'drawImage', args, smoothing: this.imageSmoothingEnabled });
		}
	};
	for (const name of ['translate', 'rotate', 'beginPath', 'roundRect', 'fill', 'clip'])
		(ctx as unknown as Record<string, unknown>)[name] = (...args: unknown[]) =>
			void calls.push({ name, args });
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('image layer validation', () => {
	it('accepts a real crop placed with one scale', () => {
		expect(imageLayerError(layer(), FRAME)).toBeNull();
	});

	for (const [name, overrides, pattern] of [
		['a fractional crop', { crop: { x: 1.5, y: 0, width: 10, height: 10 } }, /whole source pixels/],
		['an empty crop', { crop: { x: 0, y: 0, width: 0, height: 10 } }, /empty/],
		['a crop past the right edge', { crop: { x: 1000, y: 0, width: 400, height: 10 } }, /outside/],
		['a crop past the bottom', { crop: { x: 0, y: 2800, width: 10, height: 100 } }, /outside/],
		['a negative crop', { crop: { x: -1, y: 0, width: 10, height: 10 } }, /outside/],
		['no scale', { scale: 0 }, /scale/],
		['an infinite scale', { scale: Infinity }, /scale/],
		['too much magnification', { scale: MAX_LAYER_SCALE + 1 }, /scale/],
		['a position that is not a number', { x: NaN }, /position/],
		['an invalid rotation', { rotation: Infinity }, /rotation/],
		['a negative radius', { radius: -2 }, /radius/],
		['an unknown kind', { kind: 'retyped' as ImageLayer['kind'] }, /kind/],
		['a layer entirely off the frame', { x: 4000 }, /outside the 1320/]
	] as const) {
		it(`names the problem with ${name}`, () => {
			const message = imageLayerError(layer(overrides as Partial<ImageLayer>), FRAME);
			expect(message).toMatch(pattern);
			expect(message).toContain('"shares"');
		});
	}

	it('rejects an image with no real size', () => {
		const image = { id: 'x', blobUrl: '/x.png', naturalWidth: 0, naturalHeight: 10 };
		expect(imageLayerError(layer({ image }), FRAME)).toMatch(/no valid image/);
	});

	it('calls art artwork, and a callout a callout', () => {
		expect(imageLayerError(layer({ kind: 'art', x: 4000 }), FRAME)).toMatch(/^Artwork/);
		expect(imageLayerError(layer({ x: 4000 }), FRAME)).toMatch(/^Callout/);
	});
});

describe('layer geometry', () => {
	it('covers crop × one scale, and grows when rotated', () => {
		const flat = layerBounds(layer());
		expect(flat.right - flat.left).toBeCloseTo(1060 * 1.16, 8);
		expect(flat.bottom - flat.top).toBeCloseTo(1078 * 1.16, 8);
		const turned = layerBounds(layer({ rotation: 10 }));
		expect(turned.right - turned.left).toBeGreaterThan(flat.right - flat.left);
		expect((turned.left + turned.right) / 2).toBeCloseTo((flat.left + flat.right) / 2, 8);
	});

	it('maps a source region through the crop to output pixels', () => {
		expect(layerRegionToOutput(layer(), { x: 896, y: 1606, width: 220, height: 96 })).toEqual({
			x: 30 + (896 - 80) * 1.16,
			y: 1640 + (1606 - 1519) * 1.16,
			width: 220 * 1.16,
			height: 96 * 1.16
		});
	});

	it('loads each distinct image once', () => {
		const same = layer().image;
		const other = { ...same, blobUrl: '/other.png' };
		expect(
			layerImages([layer({ image: same }), layer({ image: same }), layer({ image: other })])
		).toEqual([same, other]);
		expect(layerImages(undefined)).toEqual([]);
	});
});

describe('painting a layer', () => {
	it('draws the crop with one scale and restores the sampling it changed', () => {
		const { ctx, calls } = fakeContext();
		paintImageLayer(
			ctx,
			layer({ sampling: 'pixelated', shadow: 'none' }),
			{} as HTMLImageElement,
			1320
		);
		const draw = calls.find((call) => call.name === 'drawImage')!;
		expect(draw.smoothing).toBe(false);
		const [, sx, sy, sw, sh, , , dw, dh] = draw.args as number[];
		expect([sx, sy, sw, sh]).toEqual([80, 1519, 1060, 1078]);
		expect(dw / sw).toBeCloseTo(1.16, 8);
		expect(dh / sh).toBeCloseTo(1.16, 8);
		expect(ctx.imageSmoothingEnabled).toBe(true);
	});

	it('smooths by default', () => {
		const { ctx, calls } = fakeContext();
		paintImageLayer(ctx, layer(), {} as HTMLImageElement, 1320);
		expect(calls.find((call) => call.name === 'drawImage')!.smoothing).toBe(true);
	});

	it('puts a shadow plate behind a real crop but keeps art on its own alpha', () => {
		const crop = fakeContext();
		paintImageLayer(crop.ctx, layer(), {} as HTMLImageElement, 1320);
		expect(crop.calls.filter((call) => call.name === 'fill')).toHaveLength(1);
		const art = fakeContext();
		paintImageLayer(art.ctx, layer({ kind: 'art', radius: 0 }), {} as HTMLImageElement, 1320);
		expect(art.calls.filter((call) => call.name === 'fill')).toHaveLength(0);
	});
});

describe('shadows follow the raster', () => {
	it('multiplies output-pixel shadows by the preview scale', () => {
		const { ctx } = fakeContext(0.3);
		expect(rasterScale(ctx)).toBeCloseTo(0.3, 8);
		setShadow(ctx, { color: '#000', blur: 100, offsetY: 40 });
		expect(ctx.shadowBlur).toBeCloseTo(30, 8);
		expect(ctx.shadowOffsetY).toBeCloseTo(12, 8);
		expect(ctx.shadowOffsetX).toBe(0);
	});

	it('writes a hex color with opacity', () => {
		expect(hexWithAlpha('#1E5B57', 0.5)).toBe('rgba(30,91,87,0.5)');
	});
});

describe('measured hardware', () => {
	it('allows no hardware on any target', () => {
		for (const target of Object.values(DEVICES))
			expect(frameProfileError(undefined, target)).toBeNull();
	});

	it('only allows the iPhone 17 Pro Max frame on its measured size', () => {
		expect(frameProfileError('iphone-17-pro-max', DEVICES['iphone-6.9'])).toBeNull();
		for (const id of [
			'ipad-13',
			'iphone-duo-outer-1398x2034',
			'iphone-duo-inner-2007x2853',
			'iphone-di-medium-1206x2622'
		] as const) {
			const message = frameProfileError('iphone-17-pro-max', DEVICES[id]);
			expect(message, id).toMatch(/Simple frame/);
			expect(message, id).toContain(String(DEVICES[id].width));
		}
	});
});

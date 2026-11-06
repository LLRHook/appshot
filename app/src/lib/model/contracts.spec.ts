import { describe, expect, it } from 'vitest';
import type { ProjectAsset, ProjectForTarget, ProjectV2, StoredPanorama } from './contracts';
import { DEVICES, type DeviceId } from './devices';
import { parseProject } from './project';
import { projectForTarget } from './targets';

/** Proves the frozen types are implementable: the real projection satisfies the alias. */
const referenceProjection: ProjectForTarget = projectForTarget;

const png = (id: string, naturalWidth: number, naturalHeight: number): ProjectAsset => ({
	id,
	mime: 'image/png',
	byteLength: 1,
	url: '/sample/today.png',
	naturalWidth,
	naturalHeight
});

function fixture(): ProjectV2 {
	const shared = {
		background: { kind: 'solid' as const, colors: ['#123456'] },
		frame: 'none' as const,
		layout: 'text-above' as const,
		typography: { headline: 'Low tide.', fontColor: '#FFFFFF', fontWeight: 700 as const },
		effects: { shadow: 'none' as const, glow: 0 },
		scale: 1
	};
	return {
		version: 2,
		name: 'Working title',
		appName: 'Sample App',
		style: 'cobalt',
		accent: '#DAF975',
		targets: ['iphone-6.9', 'ipad-13'],
		assets: {
			phone: png('phone', 1320, 2868),
			tablet: png('tablet', 2064, 2752)
		},
		continuityMode: 'paired',
		slides: [
			{
				...shared,
				id: 'left',
				variants: {
					'iphone-6.9': {
						source: { asset: 'phone' },
						scale: 1.2,
						layers: [
							{
								id: 'callout',
								kind: 'source-crop',
								image: 'phone',
								crop: { x: 40, y: 900, width: 1240, height: 320 },
								x: 30,
								y: 1800,
								scale: 1.02,
								radius: 24
							}
						]
					},
					'ipad-13': { source: { asset: 'tablet' } }
				}
			},
			{ ...shared, id: 'right', variants: { 'iphone-6.9': { source: { asset: 'phone' } } } }
		],
		panorama: {
			leftId: 'left',
			rightId: 'right',
			offset: 0,
			scale: 1,
			tilt: 0,
			variants: { 'iphone-6.9': { source: { asset: 'phone' }, tilt: -5 } }
		} satisfies StoredPanorama
	};
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

describe('projection contract', () => {
	it('yields a legacy-shaped document for each target that the current parser accepts', () => {
		const project = deepFreeze(fixture());
		for (const target of project.targets) {
			const composition = referenceProjection(project, target);
			const reopened = parseProject(JSON.stringify(composition));
			expect(reopened.device).toBe(target);
			expect(reopened.version).toBe(1);
			expect(reopened.slides.every((slide) => slide.device === target)).toBe(true);
			expect(reopened.name).toBe('Sample App');
			expect(DEVICES[reopened.device]).toBeDefined();
		}
	});

	it('is deterministic and does not mutate the stored project', () => {
		const project = deepFreeze(fixture());
		expect(referenceProjection(project, 'ipad-13')).toEqual(
			referenceProjection(project, 'ipad-13')
		);
	});

	it('keeps variants on their own target', () => {
		const project = fixture();
		const phone = referenceProjection(project, 'iphone-6.9');
		const tablet = referenceProjection(project, 'ipad-13');
		expect(phone.slides[0].primaryImage?.id).toBe('phone');
		expect(phone.slides[0].scale).toBe(1.2);
		expect(tablet.slides[0].primaryImage?.id).toBe('tablet');
		expect(tablet.slides[0].scale).toBe(1);
		expect(tablet.slides[0].layers).toBeUndefined();
	});

	it('resolves stored layers to image references for the renderer', () => {
		const [layer] = referenceProjection(fixture(), 'iphone-6.9').slides[0].layers ?? [];
		expect(layer.image).toMatchObject({ id: 'phone', naturalWidth: 1320, naturalHeight: 2868 });
		expect(layer.crop.width * layer.scale).toBeCloseTo(1264.8);
	});

	it('leaves a missing source absent instead of substituting another target', () => {
		const tablet = referenceProjection(fixture(), 'ipad-13');
		expect(tablet.slides[1].primaryImage).toBeUndefined();
		expect(tablet.panorama).toBeUndefined();
		expect(tablet.continuityMode).toBe('none');
		expect(() => parseProject(JSON.stringify(tablet))).not.toThrow();
	});

	it('refuses a target the project did not declare', () => {
		const undeclared: DeviceId = 'iphone-6.7';
		expect(() => referenceProjection(fixture(), undeclared)).toThrow(/not one of/);
	});

	it('keeps projected layers through the parser, closing the hazard this spec used to pin', () => {
		// A field needs a parser change to survive persistence; `layers` now has one.
		const composition = referenceProjection(fixture(), 'iphone-6.9');
		expect(composition.slides[0].layers).toHaveLength(1);
		expect(parseProject(JSON.stringify(composition)).slides[0].layers).toEqual(
			composition.slides[0].layers
		);
	});
});

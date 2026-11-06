import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aspectFamilyOf } from './capture';
import { DEVICE_CLASS_IDS } from './contracts';
import {
	DEVICES,
	isDeviceId,
	OUTPUT_TARGETS,
	RECOMMENDED_TARGET_IDS,
	RECOMMENDED_TARGETS,
	SPEC_SOURCE,
	TARGET_CLASS_GROUPS,
	TARGET_CLASSES,
	targetPickerOptions,
	targetsForClass
} from './devices';

interface SpecSize {
	width: number;
	height: number;
	orientation: string;
	note?: string;
}
interface SpecClass {
	id: string;
	family: string;
	status: string;
	apple_label: string;
	devices: string[];
	requirement_verbatim: string | null;
	scaling_fallback_verbatim: string | null;
	accepted_sizes: SpecSize[];
}
// Imported by path so the type checker does not pull a plain Node script into the app's program.
const generatorPath = '../../../scripts/device-catalog/generate.mjs';
const { readSpecs, renderCatalog } = await import(/* @vite-ignore */ generatorPath);
const specs: { meta: { source: string; accessed: string }; classes: SpecClass[] } =
	await readSpecs();
const specRows = specs.classes.flatMap((specClass) =>
	specClass.accepted_sizes.map((size) => ({ specClass, size }))
);
const find = (classId: string, width: number, height: number) =>
	OUTPUT_TARGETS.find(
		(target) => target.classId === classId && target.width === width && target.height === height
	);

describe('device catalog generated from verified Apple data', () => {
	it('has all 62 accepted sizes across all 14 classes', () => {
		expect(specRows).toHaveLength(62);
		expect(OUTPUT_TARGETS).toHaveLength(62);
		expect(Object.keys(DEVICES)).toHaveLength(62);
		expect(new Set(OUTPUT_TARGETS.map((target) => target.classId)).size).toBe(14);
		expect(specs.classes.map((specClass) => specClass.id).sort()).toEqual(
			[...DEVICE_CLASS_IDS].sort()
		);
	});

	it.each(specRows.map(({ specClass, size }) => [specClass, size] as const))(
		'carries %o size %o exactly',
		(specClass, size) => {
			const target = find(specClass.id, size.width, size.height);
			expect(target).toBeDefined();
			expect(target!.orientation).toBe(size.orientation);
			expect(target!.platform).toBe(specClass.family);
			expect(target!.status).toBe(
				specClass.status === 'future-required' ? 'future' : specClass.status
			);
			expect(DEVICES[target!.id]).toBe(target);
		}
	);

	it('checked in exactly what the generator produces', async () => {
		const generated = await readFile(
			path.resolve(import.meta.dirname, 'device-catalog.generated.ts'),
			'utf8'
		);
		expect(generated).toBe(await renderCatalog(specs));
	});

	it('keeps the legacy project ids at their original sizes', () => {
		expect(DEVICES['iphone-6.9']).toMatchObject({
			width: 1320,
			height: 2868,
			label: 'iPhone 6.9"',
			classId: 'iphone-di-large'
		});
		expect(DEVICES['iphone-6.7']).toMatchObject({
			width: 1284,
			height: 2778,
			label: 'iPhone 6.5"',
			classId: 'iphone-faceid-large'
		});
		expect(DEVICES['ipad-13']).toMatchObject({
			width: 2064,
			height: 2752,
			label: 'iPad 13"',
			classId: 'ipad-13'
		});
	});

	it('includes the required medium Dynamic Island sizes in both orientations', () => {
		expect(
			targetsForClass('iphone-di-medium').map((target) => [
				target.width,
				target.height,
				target.status
			])
		).toEqual([
			[1179, 2556, 'required'],
			[2556, 1179, 'required'],
			[1206, 2622, 'required'],
			[2622, 1206, 'required']
		]);
	});

	it('has both iPhone Duo displays at their verified native sizes, by posture', () => {
		expect(
			targetsForClass('iphone-duo').map((target) => [
				target.id,
				target.width,
				target.height,
				target.posture,
				target.orientation,
				target.status
			])
		).toEqual([
			['iphone-duo-outer-1398x2034', 1398, 2034, 'outer', 'portrait', 'future'],
			['iphone-duo-outer-2034x1398', 2034, 1398, 'outer', 'landscape', 'future'],
			['iphone-duo-inner-2007x2853', 2007, 2853, 'inner', 'portrait', 'future'],
			['iphone-duo-inner-2853x2007', 2853, 2007, 'inner', 'landscape', 'future']
		]);
		expect(OUTPUT_TARGETS.filter((target) => target.posture)).toHaveLength(4);
	});

	it('does not accept the tech-spec Duo panel size as screenshot output', () => {
		const panel = (target: { width: number; height: number }) =>
			(target.width === 1878 && target.height === 2670) ||
			(target.width === 2670 && target.height === 1878);
		expect(OUTPUT_TARGETS.filter(panel)).toEqual([]);
	});

	it('lists a size under every class Apple gives it', () => {
		const rows = OUTPUT_TARGETS.filter((target) => target.width === 2048 && target.height === 2732);
		expect(rows.map((target) => target.classId).sort()).toEqual(['ipad-12.9', 'ipad-13']);
		expect(new Set(rows.map((target) => target.id)).size).toBe(2);
	});

	it('assigns a layout family from shape alone, the same way captures are classified', () => {
		for (const target of OUTPUT_TARGETS) {
			expect(aspectFamilyOf(target.width, target.height), target.id).toBe(target.layoutFamily);
		}
		expect(DEVICES['iphone-6.9'].layoutFamily).toBe('phone-tall');
		expect(DEVICES['iphone-duo-inner-2007x2853'].layoutFamily).toBe('duo-portrait');
		expect(DEVICES['iphone-duo-inner-2853x2007'].layoutFamily).toBe('wide-landscape');
		expect(DEVICES['ipad-13'].layoutFamily).toBe('tablet-portrait');
		expect(DEVICES['iphone-di-large-2868x1320'].layoutFamily).toBe('phone-landscape');
	});

	it('never borrows measured hardware for another device', () => {
		const framed = OUTPUT_TARGETS.filter((target) => target.frameProfile);
		expect(framed.map((target) => target.id)).toEqual(['iphone-6.9']);
	});

	it('exposes source, access date and Apple wording', () => {
		expect(SPEC_SOURCE.url).toBe(specs.meta.source);
		expect(SPEC_SOURCE.accessed).toBe('2026-11-05');
		for (const specClass of specs.classes) {
			const targetClass = TARGET_CLASSES[specClass.id as keyof typeof TARGET_CLASSES];
			expect(targetClass.appleLabel).toBe(specClass.apple_label);
			expect(targetClass.requirement).toBe(specClass.requirement_verbatim);
			expect(targetClass.scalingFallback).toBe(specClass.scaling_fallback_verbatim);
			expect(targetClass.devices).toEqual(specClass.devices);
		}
	});

	it('only recognizes real ids, including against inherited object keys', () => {
		expect(isDeviceId('iphone-6.9')).toBe(true);
		expect(isDeviceId('toString')).toBe(false);
		expect(isDeviceId(42)).toBe(false);
	});
});

describe('choosing among 62 sizes', () => {
	it('recommends the required, large, iPad and both Duo sizes', () => {
		expect(RECOMMENDED_TARGET_IDS).toEqual([
			'iphone-di-medium-1206x2622',
			'iphone-6.9',
			'ipad-13',
			'iphone-duo-outer-1398x2034',
			'iphone-duo-inner-2007x2853'
		]);
		expect(RECOMMENDED_TARGETS.map((target) => [target.width, target.height])).toEqual([
			[1206, 2622],
			[1320, 2868],
			[2064, 2752],
			[1398, 2034],
			[2007, 2853]
		]);
	});

	it('offers the recommended sizes plus whatever the campaign already uses, once', () => {
		expect(targetPickerOptions()).toEqual([...RECOMMENDED_TARGETS]);
		const options = targetPickerOptions(['iphone-6.7', 'ipad-13', 'iphone-6.7']);
		expect(options.map((target) => target.id)).toEqual([...RECOMMENDED_TARGET_IDS, 'iphone-6.7']);
	});

	it('groups every size under exactly one class, with one or two sizes to offer first', () => {
		expect(TARGET_CLASS_GROUPS).toHaveLength(14);
		const grouped = TARGET_CLASS_GROUPS.flatMap((group) => group.targets);
		expect(grouped).toHaveLength(62);
		expect(new Set(grouped).size).toBe(62);
		for (const group of TARGET_CLASS_GROUPS) {
			expect(group.preferred.length).toBeGreaterThanOrEqual(1);
			expect(group.preferred.every((target) => group.targets.includes(target))).toBe(true);
			expect(group.preferred.every((target) => target.orientation === 'portrait')).toBe(true);
		}
		const duo = TARGET_CLASS_GROUPS.find((group) => group.id === 'iphone-duo')!;
		expect(duo.preferred.map((target) => target.posture)).toEqual(['outer', 'inner']);
		const faceId = TARGET_CLASS_GROUPS.find((group) => group.id === 'iphone-faceid-medium')!;
		expect(faceId.preferred.map((target) => [target.width, target.height])).toEqual([[1170, 2532]]);
	});
});

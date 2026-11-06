import { describe, expect, it } from 'vitest';
import linenSample from './__fixtures__/linen-sample.appshot.json';
import { isBundledAsset } from './assets';
import type { CheckSettings } from './check';
import type { ProjectAsset, ProjectV2 } from './contracts';
import { DEVICES } from './devices';
import { isBundledSampleUrl, RETIRED_SAMPLE_IMAGE } from './image';
import { defaultLinenSettings, linenThemeOf, tableLinenFromManifest } from './linen';
import {
	createBlankProjectV2,
	createDemoProjectV2,
	migrateCompositionToV2,
	parseProjectV2,
	parseStoredProject,
	serializePortableProject,
	serializeStoredProject
} from './migrate';
import { parseProject } from './project';
import { createBlank, createDemo, STYLES } from './studio';
import { projectForTarget } from './targets';
import type { Composition, ImageRef } from './types';

const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const PNG_BYTES = 69;
const OTHER_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC';
const fixtureText = JSON.stringify(linenSample);

const portableAsset = (id: string, url = PNG): ProjectAsset => ({
	id,
	mime: 'image/png',
	byteLength: PNG_BYTES,
	url,
	naturalWidth: 1320,
	naturalHeight: 2868
});

/** A document using every optional field, so any field the parser drops fails the comparison. */
function fullProject(): ProjectV2 {
	const check: CheckSettings = {
		canvas: 'gold',
		preset: 'editorial',
		panel: false,
		wordmark: false,
		mark: { kind: 'ring', anchor: 'total', rect: { x: 1, y: 2, width: 3, height: 4 }, seed: 9 }
	};
	return {
		version: 2,
		name: 'Spring campaign',
		appName: 'Sample App',
		style: 'the-check',
		accent: '#CFA54B',
		targets: ['iphone-6.9', 'ipad-13'],
		assets: {
			a1: {
				...portableAsset('a1'),
				sha256: 'a'.repeat(64),
				name: 'today.png',
				provenance: {
					device: 'iPhone 17 Pro Max',
					os: 'iOS 27.1',
					appVersion: '1.0',
					build: '100',
					commit: 'abc123',
					appearance: 'dark',
					capturedAt: '2026-11-05T12:00:00Z',
					tool: 'simctl',
					synthetic: true,
					fictionalData: 'confirmed'
				}
			},
			a2: { ...portableAsset('a2', OTHER_PNG), naturalWidth: 2064, naturalHeight: 2752 }
		},
		continuityMode: 'paired',
		slides: [
			{
				id: 'left',
				label: 'Hook',
				badge: 'Cold',
				background: { kind: 'linear', colors: ['#112233', '#445566'], angle: 45, noise: 0.5 },
				frame: 'none',
				layout: 'text-above',
				typography: {
					headline: 'Low *tide*.',
					subtitle: 'Sub',
					fontColor: '#FFFFFF',
					fontWeight: 400
				},
				effects: { shadow: 'soft', glow: 0.25 },
				tilt: -3,
				scale: 1.1,
				fontScale: 0.9,
				linen: defaultLinenSettings('teal'),
				check,
				variants: {
					'iphone-6.9': {
						source: { asset: 'a1' },
						scale: 1.2,
						tilt: 4,
						fontScale: 1.05,
						layout: 'text-below',
						linen: { band: false, layout: defaultLinenSettings('cream').layout },
						check: { canvas: 'teal', mark: null },
						layers: [
							{
								id: 'total',
								kind: 'source-crop',
								image: 'a1',
								crop: { x: 40, y: 900, width: 1240, height: 320 },
								x: 30,
								y: 1800,
								scale: 1.02,
								rotation: -2,
								radius: 24,
								shadow: 'dramatic',
								sampling: 'pixelated'
							}
						]
					},
					'ipad-13': { source: { asset: 'a2', nonNative: { reason: 'Draft for review' } } }
				}
			},
			{
				id: 'right',
				background: { kind: 'solid', colors: ['#112233'] },
				frame: 'bezel',
				layout: 'centered',
				typography: { headline: 'Two', fontColor: '#000000', fontWeight: 800 },
				effects: { shadow: 'none', glow: 0 }
			}
		],
		panorama: {
			leftId: 'left',
			rightId: 'right',
			offset: 10,
			scale: 1.1,
			tilt: -5,
			linenPhone: defaultLinenSettings('teal').phone,
			variants: {
				'iphone-6.9': {
					source: { asset: 'a1' },
					offset: -20,
					scale: 0.9,
					tilt: 3,
					linenPhone: defaultLinenSettings('cream').phone
				}
			}
		}
	};
}

function corrupt(path: string, value: unknown): string {
	const input = JSON.parse(JSON.stringify(fullProject()));
	const parts = path.split('/');
	let target = input;
	for (const part of parts.slice(0, -1)) target = target[part];
	target[parts.at(-1)!] = value;
	return JSON.stringify(input);
}

describe('migrating v1 documents', () => {
	it('round-trips a Table Linen fixture with its content unchanged', () => {
		const v1 = parseProject(fixtureText);
		const v2 = parseProjectV2(fixtureText);
		expect(v2.version).toBe(2);
		expect(v2.targets).toEqual(['iphone-6.9']);
		expect(projectForTarget(v2, 'iphone-6.9')).toEqual(v1);
		expect(parseProject(JSON.stringify(projectForTarget(v2, 'iphone-6.9')))).toEqual(v1);
		const reopened = parseProjectV2(serializePortableProject(v2).join(''));
		expect(reopened).toEqual(v2);
		expect(projectForTarget(reopened, 'iphone-6.9')).toEqual(v1);
	});

	it('stores one asset per distinct image however many slots use it', () => {
		const v2 = parseProjectV2(fixtureText);
		expect(Object.keys(v2.assets)).toHaveLength(3);
		expect(v2.slides[0].variants?.['iphone-6.9']?.source?.asset).toBe(
			v2.panorama?.variants?.['iphone-6.9']?.source?.asset
		);
		expect(v2.slides[1].variants?.['iphone-6.9']?.source?.asset).toBe(
			v2.slides[0].variants?.['iphone-6.9']?.source?.asset
		);
	});

	it.each(STYLES.map((style) => style.id))(
		'migrates the demo campaign unchanged in the %s style',
		(style) => {
			const demo = { ...createDemo(), style };
			expect(projectForTarget(migrateCompositionToV2(demo), demo.device)).toEqual(
				parseProject(JSON.stringify(demo))
			);
		}
	);

	it.each(['iphone-6.9', 'iphone-6.7', 'ipad-13'] as const)(
		'keeps the old %s id and its exact size',
		(device) => {
			const project = createBlank();
			project.device = device;
			project.slides = project.slides.map((slide) => ({ ...slide, device }));
			const v2 = parseProjectV2(JSON.stringify(project));
			expect(v2.targets).toEqual([device]);
			expect(DEVICES[projectForTarget(v2, device).device].width).toBe(
				{ 'iphone-6.9': 1320, 'iphone-6.7': 1284, 'ipad-13': 2064 }[device]
			);
		}
	);

	it('migrates a native Table Linen manifest conversion with its pair', () => {
		const image: ImageRef = {
			id: 'authentic',
			blobUrl: '/sample/today.png',
			naturalWidth: 1320,
			naturalHeight: 2868
		};
		const project = tableLinenFromManifest(
			{
				version: 1,
				name: 'At the pier',
				style: 'table-linen',
				slides: ['first', 'second'].map((id) => ({
					id,
					image: 'capture.png',
					headline: ['Low tide.']
				})),
				panorama: { enabled: true, leftId: 'first', rightId: 'second', image: 'capture.png' }
			},
			{ 'capture.png': image }
		);
		const v2 = migrateCompositionToV2(project);
		expect(Object.keys(v2.assets)).toEqual(['authentic']);
		expect(projectForTarget(v2, 'iphone-6.9')).toEqual(project);
	});

	it('merges images with identical bytes even under different ids', () => {
		const composition = createBlank();
		composition.slides = [
			{ ...composition.slides[0], primaryImage: imageRef('first', PNG) },
			{ ...composition.slides[0], id: 'two', primaryImage: imageRef('second', PNG) }
		];
		const v2 = migrateCompositionToV2(composition);
		expect(Object.keys(v2.assets)).toEqual(['first']);
		expect(v2.slides[1].variants?.['iphone-6.9']?.source?.asset).toBe('first');
	});

	it('keeps different bytes separate even under one id', () => {
		const composition = createBlank();
		composition.slides = [
			{ ...composition.slides[0], primaryImage: imageRef('same', PNG) },
			{ ...composition.slides[0], id: 'two', primaryImage: imageRef('same', OTHER_PNG) }
		];
		const v2 = migrateCompositionToV2(composition);
		expect(Object.keys(v2.assets)).toEqual(['same', 'same~2']);
		expect(v2.assets['same~2'].url).toBe(OTHER_PNG);
		expect(v2.slides[1].variants?.['iphone-6.9']?.source?.asset).toBe('same~2');
	});

	it('records each embedded image with its real format and size', () => {
		const composition = createBlank();
		composition.slides[0].primaryImage = imageRef('one', PNG);
		const { one } = migrateCompositionToV2(composition).assets;
		expect(one).toEqual({
			id: 'one',
			mime: 'image/png',
			byteLength: PNG_BYTES,
			url: PNG,
			naturalWidth: 1320,
			naturalHeight: 2868
		});
	});

	it('marks bundled images as neither stored nor counted', () => {
		const { assets } = createDemoProjectV2();
		expect(Object.values(assets).every((asset) => asset.byteLength === 0)).toBe(true);
		expect(Object.values(assets).every((asset) => asset.url.startsWith('/sample/'))).toBe(true);
	});

	it('does not carry over continuity, which no renderer reads', () => {
		const composition = createBlank();
		composition.slides[0].continuity = { inset: -50, incoming: imageRef('old', PNG) };
		const v2 = migrateCompositionToV2(composition);
		expect(v2.slides[0]).not.toHaveProperty('continuity');
		expect(Object.keys(v2.assets)).toEqual([]);
		expect(projectForTarget(v2, 'iphone-6.9').slides[0].continuity).toEqual({ inset: 0 });
	});

	it('carries layers and The Check settings', () => {
		const composition = createBlank();
		const image = imageRef('one', PNG);
		composition.style = 'the-check';
		composition.slides[0].check = fullProject().slides[0].check;
		composition.slides[0].layers = [
			{
				id: 'callout',
				kind: 'source-crop',
				image,
				crop: { x: 0, y: 0, width: 10, height: 10 },
				x: 1,
				y: 2,
				scale: 1.5,
				rotation: 3,
				radius: 4,
				shadow: 'soft',
				sampling: 'smooth'
			}
		];
		const v2 = migrateCompositionToV2(composition);
		expect(v2.slides[0].variants?.['iphone-6.9']?.layers?.[0].image).toBe('one');
		expect(projectForTarget(v2, 'iphone-6.9').slides[0]).toEqual(
			parseProject(JSON.stringify(composition)).slides[0]
		);
	});

	it('pins the printed name, so retitling later cannot change the artwork', () => {
		const v2 = createDemoProjectV2();
		expect(v2.appName).toBe('Sample Garden');
		expect(projectForTarget({ ...v2, name: 'Spring test' }, 'iphone-6.9').name).toBe(
			'Sample Garden'
		);
	});

	it('gives a new blank campaign no brand yet, so its title prints', () => {
		const v2 = createBlankProjectV2();
		expect(v2).not.toHaveProperty('appName');
		expect(projectForTarget({ ...v2, name: 'Mine' }, 'iphone-6.9').name).toBe('Mine');
		expect(createBlankProjectV2(['iphone-di-medium-1206x2622', 'ipad-13']).targets).toEqual([
			'iphone-di-medium-1206x2622',
			'ipad-13'
		]);
	});

	it('leaves the legacy parser returning a single-target document', () => {
		const composition = parseProject(fixtureText);
		expect(composition.version).toBe(1);
		expect(composition.device).toBe('iphone-6.9');
	});
});

function imageRef(id: string, blobUrl: string): ImageRef {
	return { id, blobUrl, naturalWidth: 1320, naturalHeight: 2868 };
}

describe('parseProjectV2', () => {
	it('keeps every field of a complete document', () => {
		const project = fullProject();
		expect(parseProjectV2(JSON.stringify(project))).toEqual(project);
	});

	it('returns only known fields, at every level', () => {
		const input = JSON.parse(JSON.stringify(fullProject()));
		input.externalAsset = 'https://example.com/private';
		input.campaignId = 'chosen-by-a-file';
		input.assets.a1.externalUrl = 'https://example.com/image';
		input.assets.a1.provenance.note = 'extra';
		input.slides[0].html = '<script>x</script>';
		input.slides[0].device = 'ipad-13';
		input.slides[0].primaryImage = { id: 'x', blobUrl: PNG, naturalWidth: 1, naturalHeight: 1 };
		input.slides[0].continuity = { inset: 7 };
		input.slides[0].variants['iphone-6.9'].extra = true;
		input.slides[0].variants['iphone-6.9'].layers[0].extra = true;
		input.panorama.variants['iphone-6.9'].extra = true;
		const parsed = parseProjectV2(JSON.stringify(input));
		expect(parsed).toEqual(fullProject());
		expect(JSON.stringify(parsed)).not.toMatch(
			/externalAsset|externalUrl|example\.com|<script>|chosen-by-a-file/
		);
	});

	it('is safe against prototype keys in every map', () => {
		const text = JSON.stringify(fullProject()).replace(
			'"assets":{',
			'"assets":{"__proto__":{"id":"__proto__","mime":"image/png","byteLength":69,"url":"' +
				PNG +
				'","naturalWidth":1,"naturalHeight":1},'
		);
		const parsed = parseProjectV2(text);
		expect(Object.getPrototypeOf(parsed.assets)).toBe(Object.prototype);
		expect(Object.keys(parsed.assets)).toContain('__proto__');
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('refuses a newer project version clearly, whatever else it contains', () => {
		for (const version of [3, 99]) {
			expect(() => parseProjectV2(JSON.stringify({ version }))).toThrow(
				new RegExp(`newer version of Appshot \\(project version ${version}\\)`)
			);
		}
	});

	it.each(['', '{', 'null', '[]', '42', '{"version":"2"}', '{"version":0}', '{"version":2}'])(
		'refuses malformed input %s with a project error',
		(input) => {
			expect(() => parseProjectV2(input)).toThrow('Choose a valid Appshot project');
		}
	);

	it('applies the old file limit to old files and a larger one to multi-target files', () => {
		// Built by concatenation: serializing strings this large is what made this slow under load.
		const padded = (version: number, megabytes: number) =>
			`{"version":${version},"notes":"${'x'.repeat(megabytes * 1024 * 1024)}"}`;
		expect(() => parseProjectV2(padded(1, 61))).toThrow('60 MB');
		expect(() => parseProjectV2(padded(2, 257))).toThrow('256 MB');
	}, 30_000);

	it.each([
		['targets', []],
		['targets', 'iphone-6.9'],
		['targets', ['iphone-6.9', 'iphone-6.9']],
		['targets', ['toString']],
		['targets', ['android-phone']],
		['style', 'unknown'],
		['accent', 'red'],
		['name', 42],
		['name', 'x'.repeat(201)],
		['appName', 42],
		['continuityMode', 'anything'],
		['slides', []],
		['slides', Array(11).fill(fullProject().slides[1])],
		['slides/0/id', ''],
		['slides/0/background/kind', 'image'],
		['slides/0/typography/headline', 'x'.repeat(181)],
		['slides/0/tilt', 31],
		['slides/0/linen', { band: 'yes' }],
		['slides/0/check', { canvas: 'purple' }],
		['slides/0/variants', 'x'],
		['slides/0/variants/toString', {}],
		['slides/0/variants/iphone-6.7', { scale: 1 }],
		['slides/0/variants/iphone-6.9/scale', 2],
		['slides/0/variants/iphone-6.9/tilt', 31],
		['slides/0/variants/iphone-6.9/fontScale', 1.31],
		['slides/0/variants/iphone-6.9/layout', 'diagonal'],
		['slides/0/variants/iphone-6.9/linen', { colors: { canvas: 'red' } }],
		['slides/0/variants/iphone-6.9/check', { unknownKey: 1 }],
		['slides/0/variants/iphone-6.9/source', { asset: 'missing' }],
		['slides/0/variants/iphone-6.9/source', { asset: 'toString' }],
		['slides/0/variants/iphone-6.9/source', { asset: 'a1', nonNative: { reason: '   ' } }],
		['slides/0/variants/iphone-6.9/source', { asset: 'a1', nonNative: {} }],
		['panorama', null],
		['panorama/offset', 401],
		['panorama/leftId', 'right'],
		['panorama/variants/iphone-6.7', {}],
		['panorama/variants/iphone-6.9/source', { asset: 'missing' }],
		['panorama/variants/iphone-6.9/tilt', 31]
	])('rejects corrupt %s', (path, value) => {
		expect(() => parseProjectV2(corrupt(path as string, value))).toThrow(Error);
	});

	it.each([
		['id disagrees with its key', 'assets/a1/id', 'other'],
		['unknown format', 'assets/a1/mime', 'image/gif'],
		['size disagrees with the bytes', 'assets/a1/byteLength', 68],
		['non-integer size', 'assets/a1/byteLength', 68.5],
		['over the per-image limit', 'assets/a1/byteLength', 13 * 1024 * 1024],
		['bad hash', 'assets/a1/sha256', 'XYZ'],
		['uppercase hash', 'assets/a1/sha256', 'A'.repeat(64)],
		['zero width', 'assets/a1/naturalWidth', 0],
		['fractional height', 'assets/a1/naturalHeight', 1.5],
		['a side over the limit', 'assets/a1/naturalWidth', 8001],
		['bad appearance', 'assets/a1/provenance/appearance', 'sepia'],
		['non-boolean synthetic', 'assets/a1/provenance/synthetic', 'yes'],
		['bad fictional flag', 'assets/a1/provenance/fictionalData', 'maybe'],
		['non-string device', 'assets/a1/provenance/device', 42],
		['format disagrees with the data', 'assets/a1/mime', 'image/jpeg']
	])('rejects an asset with %s', (_label, path, value) => {
		expect(() => parseProjectV2(corrupt(path, value))).toThrow(Error);
	});

	it('rejects an asset with too many pixels in total', () => {
		const input = JSON.parse(JSON.stringify(fullProject()));
		Object.assign(input.assets.a1, { naturalWidth: 8000, naturalHeight: 8000 });
		expect(() => parseProjectV2(JSON.stringify(input))).toThrow(Error);
	});

	it.each([
		'blob:https://appshot.test/temporary',
		'https://example.com/image.png',
		'//example.com/image.png',
		'file:///tmp/image.png',
		'javascript:alert(1)',
		'/demo/old-sample.png',
		'/brand/old-mark.png',
		'/sample/unknown.png',
		'',
		'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
		PNG.replace('image/png', 'image/jpeg')
	])('refuses image URL %s in a file', (url) => {
		expect(() => parseProjectV2(corrupt('assets/a1/url', url))).toThrow(Error);
	});

	it('accepts bundled samples by their allowed path', () => {
		for (const url of ['/sample/mark.png', '/sample/today.png', '/sample/insights.png']) {
			const input = JSON.parse(JSON.stringify(fullProject()));
			input.assets.a1.url = url;
			expect(parseProjectV2(JSON.stringify(input)).assets.a1.url).toBe(url);
		}
	});

	it.each([
		['fractional crop', { x: 0.5, y: 0, width: 10, height: 10 }],
		['negative crop', { x: -1, y: 0, width: 10, height: 10 }],
		['empty crop', { x: 0, y: 0, width: 0, height: 10 }],
		['past the right edge', { x: 1000, y: 0, width: 321, height: 10 }],
		['past the bottom edge', { x: 0, y: 2800, width: 10, height: 69 }],
		['larger than the source', { x: 0, y: 0, width: 1321, height: 2869 }]
	])('rejects a layer crop %s', (_label, crop) => {
		expect(() =>
			parseProjectV2(corrupt('slides/0/variants/iphone-6.9/layers/0/crop', crop))
		).toThrow('whole pixels inside its image');
	});

	it('accepts a crop reaching exactly to the edge of the real source', () => {
		const crop = { x: 320, y: 868, width: 1000, height: 2000 };
		const parsed = parseProjectV2(corrupt('slides/0/variants/iphone-6.9/layers/0/crop', crop));
		expect(parsed.slides[0].variants?.['iphone-6.9']?.layers?.[0].crop).toEqual(crop);
	});

	it.each([
		['image', 'missing'],
		['kind', 'frame'],
		['x', 'left'],
		['scale', 0],
		['scale', 17],
		['scale', 0.009],
		['rotation', 361],
		['radius', -1],
		['shadow', 'giant'],
		['sampling', 'cubic']
	])('rejects layer field %s = %s', (key, value) => {
		expect(() =>
			parseProjectV2(corrupt(`slides/0/variants/iphone-6.9/layers/0/${key}`, value))
		).toThrow(Error);
	});

	it.each([
		['source-crop', 16],
		['art', 64]
	] as const)('reopens %s at the same scale the painter accepts', (kind, scale) => {
		const input = fullProject();
		const layer = input.slides[0].variants!['iphone-6.9']!.layers![0];
		layer.kind = kind;
		layer.scale = scale;
		const reopened = parseProjectV2(JSON.stringify(input));
		expect(reopened.slides[0].variants?.['iphone-6.9']?.layers?.[0]).toMatchObject({ kind, scale });
		layer.scale = scale + 1;
		expect(() => parseProjectV2(JSON.stringify(input))).toThrow('invalid layout value');
	});

	it('rejects duplicate layer ids and an unbounded layer list', () => {
		const layer = fullProject().slides[0].variants!['iphone-6.9']!.layers![0];
		expect(() =>
			parseProjectV2(corrupt('slides/0/variants/iphone-6.9/layers', [layer, layer]))
		).toThrow(Error);
		const many = Array.from({ length: 13 }, (_, index) => ({ ...layer, id: `layer-${index}` }));
		expect(() => parseProjectV2(corrupt('slides/0/variants/iphone-6.9/layers', many))).toThrow(
			Error
		);
	});

	it('rejects duplicate frames and more image bytes than a campaign may hold', () => {
		const project = fullProject();
		project.slides[1].id = 'left';
		delete project.panorama;
		expect(() => parseProjectV2(JSON.stringify(project))).toThrow(Error);
		const many = fullProject();
		for (let index = 0; index < 301; index++) {
			many.assets[`extra-${index}`] = {
				...portableAsset(`extra-${index}`),
				url: '/sample/today.png'
			};
		}
		expect(() => parseProjectV2(JSON.stringify(many))).toThrow(Error);
	});
});

describe('stored autosave form', () => {
	it('holds no bytes, no session URLs and no slot id, and keeps bundled paths', () => {
		const project: ProjectV2 = {
			...fullProject(),
			campaignId: 'slot-1',
			assets: {
				a1: { ...fullProject().assets.a1, url: 'blob:http://appshot.test/1' },
				a2: { ...fullProject().assets.a2, sha256: 'b'.repeat(64), url: PNG },
				bundled: { ...portableAsset('bundled'), url: '/sample/today.png', byteLength: 0 }
			}
		};
		const text = serializeStoredProject(project);
		expect(text).not.toContain('blob:');
		expect(text).not.toContain('base64');
		expect(text).not.toContain('slot-1');
		expect(text).toContain('/sample/today.png');
		expect(text.length).toBeLessThan(10_000);
	});

	it('keeps every field through a save and reload, ready for persistence to add URLs', () => {
		const project = fullProject();
		project.assets.a2.sha256 = 'b'.repeat(64);
		const restored = parseStoredProject(serializeStoredProject(project));
		const expected: ProjectV2 = {
			...project,
			assets: {
				a1: { ...project.assets.a1, url: '' },
				a2: { ...project.assets.a2, url: '' }
			}
		};
		expect(restored).toEqual(expected);
	});

	it.each([
		['blob URL', { url: 'blob:http://x/1', sha256: 'a'.repeat(64) }],
		['embedded bytes', { url: PNG, sha256: 'a'.repeat(64) }],
		['no way to find the bytes', { sha256: undefined }]
	])('rejects a record with %s', (_label, patch) => {
		const project = JSON.parse(serializeStoredProject(fullProject()));
		Object.assign(project.assets.a1, patch);
		expect(() => parseStoredProject(JSON.stringify(project))).toThrow(Error);
	});

	it('refuses newer and unknown records clearly', () => {
		expect(() => parseStoredProject('{"version":3}')).toThrow('newer version');
		expect(() => parseStoredProject('{"version":1}')).toThrow('Choose a valid Appshot project');
		expect(() => parseStoredProject('not json')).toThrow('Choose a valid Appshot project');
	});
});

describe('portable form', () => {
	it('reopens to the same document, in parts that never join the images into one string', () => {
		const project = { ...fullProject(), campaignId: 'slot-1' };
		const parts = serializePortableProject(project);
		expect(parts.some((part) => part.includes('"a1":') && part.includes(PNG))).toBe(false);
		const text = parts.join('');
		expect(text).not.toContain('slot-1');
		expect(parseProjectV2(text)).toEqual(fullProject());
	});

	it('refuses to write a document that could not be reopened', () => {
		const withSessionUrl = fullProject();
		withSessionUrl.assets.a1.url = 'blob:http://appshot.test/1';
		expect(() => serializePortableProject(withSessionUrl)).toThrow(Error);
		const broken = fullProject();
		broken.slides[0].variants!['iphone-6.9']!.source = { asset: 'gone' };
		expect(() => serializePortableProject(broken)).toThrow(Error);
	});
});

function asComposition(project: ProjectV2, target: 'iphone-6.9' | 'ipad-13'): Composition {
	return projectForTarget(project, target);
}

describe('every field reaches the renderer through a full save and reopen', () => {
	it('survives portable reopen and projection on each target', () => {
		const reopened = parseProjectV2(serializePortableProject(fullProject()).join(''));
		const phone = asComposition(reopened, 'iphone-6.9');
		expect(phone.name).toBe('Sample App');
		expect(phone.slides[0]).toMatchObject({
			scale: 1.2,
			tilt: 4,
			fontScale: 1.05,
			layout: 'text-below',
			check: { canvas: 'teal', preset: 'editorial', panel: false, wordmark: false }
		});
		expect(phone.slides[0].check).not.toHaveProperty('mark');
		expect(phone.slides[0].linen?.band).toBe(false);
		expect(phone.slides[0].layers?.[0]).toMatchObject({
			id: 'total',
			rotation: -2,
			radius: 24,
			shadow: 'dramatic',
			sampling: 'pixelated',
			image: { id: 'a1', blobUrl: PNG, naturalWidth: 1320, naturalHeight: 2868 }
		});
		expect(phone.panorama).toMatchObject({ offset: -20, scale: 0.9, tilt: 3 });
		const tablet = asComposition(reopened, 'ipad-13');
		expect(tablet.slides[0]).toMatchObject({
			scale: 1.1,
			tilt: -3,
			fontScale: 0.9,
			layout: 'text-above'
		});
		expect(tablet.slides[0].check?.mark).toBeDefined();
		expect(tablet.slides[0].layers).toBeUndefined();
		expect(tablet.panorama).toBeUndefined();
	});
});

describe('retired sample images', () => {
	const RETIRED = ['/demo/old-sample.png', '/brand/old-mark.png'];

	const v1With = (url: string, place: (composition: Composition, image: ImageRef) => void) => {
		const composition = createBlank();
		place(composition, imageRef('old', url));
		return JSON.stringify(composition);
	};

	const v2With = (url: string) => {
		const input = JSON.parse(JSON.stringify(fullProject()));
		input.assets.a1 = { ...input.assets.a1, url, byteLength: 0 };
		// A stored asset finds its bytes by hash, so a record can hold no other URL.
		input.assets.a2 = { ...input.assets.a2, sha256: 'b'.repeat(64) };
		return JSON.stringify(input);
	};

	it.each(RETIRED)('is refused by name in a v1 file: %s', (url) => {
		for (const text of [
			v1With(url, (composition, image) => {
				composition.slides[0].primaryImage = image;
			}),
			v1With(url, (composition, image) => {
				composition.slides[0].layers = [
					{
						id: 'art',
						kind: 'art',
						image,
						crop: { x: 0, y: 0, width: 10, height: 10 },
						x: 0,
						y: 0,
						scale: 1
					}
				];
			}),
			v1With(url, (composition, image) => {
				const second = { ...composition.slides[0], id: 'two' };
				composition.slides.push(second);
				composition.continuityMode = 'paired';
				composition.panorama = {
					leftId: composition.slides[0].id,
					rightId: 'two',
					image,
					offset: 0,
					scale: 1,
					tilt: 0
				};
			})
		]) {
			expect(() => parseProjectV2(text)).toThrow(RETIRED_SAMPLE_IMAGE);
			expect(() => parseProject(text)).toThrow(RETIRED_SAMPLE_IMAGE);
		}
	});

	it.each(RETIRED)('is refused by name in a v2 file: %s', (url) => {
		expect(() => parseProjectV2(v2With(url))).toThrow(RETIRED_SAMPLE_IMAGE);
	});

	it.each(RETIRED)('is refused by name in an autosave record: %s', (url) => {
		expect(() => parseStoredProject(v2With(url))).toThrow(RETIRED_SAMPLE_IMAGE);
	});

	it.each(RETIRED)('never counts as a bundled image: %s', (url) => {
		expect(isBundledSampleUrl(url)).toBe(false);
		expect(isBundledAsset({ url })).toBe(false);
	});

	it('leaves other unknown paths with the ordinary message', () => {
		for (const url of ['/sample/old.png', '/demo/old/sample.png', '/demo/old-sample.png?x=1']) {
			expect(() => parseProjectV2(v2With(url))).toThrow(Error);
			expect(() => parseProjectV2(v2With(url))).not.toThrow(RETIRED_SAMPLE_IMAGE);
		}
	});

	it.each(['the-check', 'table-linen'] as const)(
		'keeps opening an old %s project whose images are all embedded',
		(style) => {
			const composition = createDemo();
			const url = PNG;
			composition.style = style;
			composition.slides = composition.slides.map((slide) => ({
				...slide,
				primaryImage: imageRef('old', url),
				...(style === 'table-linen'
					? {
							linen: {
								...defaultLinenSettings('teal'),
								// Colors an older build saved. They stay as stored, now a custom theme.
								colors: {
									...defaultLinenSettings('teal').colors,
									canvas: '#2B6F64',
									dot: '#C99A3F'
								}
							}
						}
					: {})
			}));
			composition.panorama = { ...composition.panorama!, image: imageRef('old', url) };
			const text = JSON.stringify(composition);
			const opened = parseProjectV2(text);
			expect(opened.style).toBe(style);
			expect(projectForTarget(opened, 'iphone-6.9')).toEqual(parseProject(text));
			expect(Object.values(opened.assets).every((asset) => asset.url === url)).toBe(true);
			expect(Object.values(opened.assets).some((asset) => asset.provenance)).toBe(false);
			if (style === 'table-linen') {
				const { colors } = projectForTarget(opened, 'iphone-6.9').slides[0].linen!;
				expect(colors).toMatchObject({ canvas: '#2B6F64', dot: '#C99A3F' });
				expect(linenThemeOf(colors)).toBe('custom');
			}
		}
	);
});

describe('bundled samples', () => {
	it('allows the exact sample files and nothing else under that path', () => {
		for (const name of ['today', 'plant', 'schedule', 'journal', 'insights', 'mark'])
			expect(isBundledSampleUrl(`/sample/${name}.png`)).toBe(true);
		for (const url of [
			'/sample/',
			'/sample/README.md',
			'/sample/today.jpg',
			'/sample/Today.png',
			'/sample/extra/today.png',
			'/sample/today.png#x',
			'sample/today.png'
		])
			expect(isBundledSampleUrl(url)).toBe(false);
	});

	it('marks every sample as one, whatever a file claims', () => {
		const input = JSON.parse(JSON.stringify(fullProject()));
		input.assets.a1 = {
			...input.assets.a1,
			url: '/sample/mark.png',
			byteLength: 0,
			provenance: { tool: 'something else', device: 'iPhone' }
		};
		const { a1 } = parseProjectV2(JSON.stringify(input)).assets;
		expect(a1.provenance).toMatchObject({ tool: 'appshot-sample', device: 'iPhone' });
		delete input.assets.a1.provenance;
		delete input.assets.a2;
		delete input.slides[0].variants['ipad-13'];
		expect(parseStoredProject(JSON.stringify(input)).assets.a1.provenance).toEqual({
			tool: 'appshot-sample'
		});
	});

	it('marks the first-run campaign’s images as samples through every form', () => {
		const demo = createDemoProjectV2();
		const stored = parseStoredProject(serializeStoredProject(demo));
		const portable = parseProjectV2(serializePortableProject(demo).join(''));
		for (const document of [demo, stored, portable])
			for (const asset of Object.values(document.assets))
				expect(asset.provenance?.tool, asset.id).toBe('appshot-sample');
		expect(demo.name).toBe('Sample Garden');
		expect(demo.appName).toBe('Sample Garden');
		expect(demo.continuityMode).toBe('paired');
	});
});

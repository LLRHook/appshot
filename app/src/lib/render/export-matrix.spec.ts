import { describe, expect, it, vi } from 'vitest';
import type { ExportMatrix, Issue, ProjectAsset, ProjectV2 } from '../model/contracts';
import { DEVICES, type DeviceId } from '../model/devices';
import { disconnectPair } from '../model/edits';
import { parseProjectV2 } from '../model/migrate';
import { projectForTarget } from '../model/targets';
import type { Composition } from '../model/types';
import {
	assetOf,
	campaign,
	concat,
	FULL_RECORD,
	framePng,
	patternPixels,
	pngFile,
	RECOMMENDED
} from './__fixtures__/export';
import {
	createExportMatrix,
	DRAFT_FOLDER,
	framePath,
	MANIFEST_FILE,
	PARTIAL_MARKER_FILE,
	portableProjectBlob,
	PROJECT_FILE,
	README_FILE,
	safeFilename,
	targetFolder,
	type ExportRuntime,
	type MatrixManifest,
	type MatrixOptions
} from './export-matrix';
import { inspectPng } from './png';
import { createPreflight } from './preflight';
import { readZipDirectory, readZipEntry } from './zip';

const NOW = new Date('2026-11-06T12:00:00Z');
const DUO: DeviceId[] = ['iphone-duo-outer-1398x2034', 'iphone-duo-inner-2007x2853'];

/** Stands in for the canvas, so tests see the real pipeline around it. */
function runtimeWith(
	render: (composition: Composition, index: number) => Uint8Array | Promise<Uint8Array>,
	extra: Partial<ExportRuntime> = {}
) {
	const renderPng = vi.fn(async (composition: Composition, index: number) =>
		render(composition, index)
	);
	const runtime: ExportRuntime = {
		renderPng,
		preflight: (project, options) =>
			createPreflight({ now: () => NOW })(project, { ...options, layout: false }),
		now: () => NOW,
		...extra
	};
	return { runtime, renderPng };
}

/** A valid frame whose pixels differ by output and frame, so its hash identifies it. */
const validFrame = (composition: Composition, index: number) =>
	framePng(composition.device, 1 + RECOMMENDED.indexOf(composition.device) * 40 + index);

const run = (project: ProjectV2, options: MatrixOptions = {}, runtime = runtimeWith(validFrame)) =>
	createExportMatrix(runtime.runtime)(project, options);

async function done(
	project: ProjectV2,
	options: MatrixOptions = {},
	runtime = runtimeWith(validFrame)
) {
	const result = await run(project, options, runtime);
	if (result.status === 'blocked')
		throw new Error(`Blocked: ${result.issues.map((issue) => issue.message).join(' | ')}`);
	return result;
}

const blocking = (issues: readonly Issue[]) =>
	issues.filter((issue) => issue.severity === 'block').map((issue) => issue.code);

const names = async (zip: Blob) => (await readZipDirectory(zip)).map((entry) => entry.name);

const text = async (zip: Blob, path: string) => {
	const bytes = await readZipEntry(zip, path);
	return bytes && new TextDecoder().decode(bytes);
};

const sha = async (bytes: Uint8Array<ArrayBuffer>) =>
	Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

describe('it satisfies the frozen contract', () => {
	it('is assignable to ExportMatrix', () => {
		const contract: ExportMatrix = createExportMatrix(runtimeWith(validFrame).runtime);
		expect(contract).toBeTypeOf('function');
	});
});

describe('a complete store export', () => {
	it('writes class folders with deterministic names, whatever the listing order', async () => {
		const result = await done(campaign([...RECOMMENDED].reverse()));
		expect(result.status).toBe('complete');
		expect(await names(result.zip)).toEqual([
			PROJECT_FILE,
			'iphone-di-large/1320x2868-portrait/01-frame-s1-1320x2868.png',
			'iphone-di-large/1320x2868-portrait/02-frame-s2-1320x2868.png',
			'iphone-di-medium/1206x2622-portrait/01-frame-s1-1206x2622.png',
			'iphone-di-medium/1206x2622-portrait/02-frame-s2-1206x2622.png',
			'ipad-13/2064x2752-portrait/01-frame-s1-2064x2752.png',
			'ipad-13/2064x2752-portrait/02-frame-s2-2064x2752.png',
			MANIFEST_FILE,
			README_FILE
		]);
	});

	it('keeps the two Duo displays apart', () => {
		const slide = { label: 'Chart', typography: { headline: '' } };
		expect(framePath(DEVICES['iphone-duo-outer-1398x2034'], slide, 0, 'store')).toBe(
			'iphone-duo/outer-1398x2034-portrait/01-chart-1398x2034.png'
		);
		expect(framePath(DEVICES['iphone-duo-inner-2853x2007'], slide, 9, 'store')).toBe(
			'iphone-duo/inner-2853x2007-landscape/10-chart-2853x2007.png'
		);
		expect(targetFolder(DEVICES['iphone-6.7'])).toBe('iphone-faceid-large/1284x2778-portrait');
	});

	it('names frames with no usable label sensibly', () => {
		const target = DEVICES['iphone-6.9'];
		expect(
			framePath(target, { typography: { headline: '*Low* tide.\nTwo' } }, 0, 'store')
		).toContain('01-low-tide-1320x2868');
		expect(
			framePath(target, { label: '日本語', typography: { headline: '' } }, 0, 'store')
		).toContain('01-frame-1320x2868');
		expect(safeFilename('日本語')).toBe('campaign');
		expect(safeFilename('Sample App: V2!')).toBe('sample-app-v2');
	});

	it('records what each file really is, in the manifest', async () => {
		const project = campaign();
		const result = await done(project);
		const manifest: MatrixManifest = JSON.parse((await text(result.zip, MANIFEST_FILE))!);
		expect(manifest).toEqual(JSON.parse(JSON.stringify(result.manifest)));
		expect(manifest).toMatchObject({
			schema: 1,
			tool: 'appshot',
			createdAt: NOW.toISOString(),
			project: 'Working title',
			partial: false,
			scope: 'store',
			readiness: 'meets-file-spec-and-store-checklist',
			omitted: []
		});
		expect(manifest.appleSpec.accessed).toBe('2026-11-05');
		expect(manifest.files).toHaveLength(6);
		expect(manifest.targets.map((item) => [item.target, item.written, item.expected])).toEqual([
			['iphone-6.9', 2, 2],
			['iphone-di-medium-1206x2622', 2, 2],
			['ipad-13', 2, 2]
		]);
		for (const file of manifest.files) {
			const bytes = (await readZipEntry(result.zip, file.path))!;
			const target = DEVICES[file.target];
			expect(file.byteLength).toBe(bytes.length);
			expect(file.sha256).toBe(await sha(bytes));
			expect(inspectPng(bytes)).toEqual({
				width: target.width,
				height: target.height,
				bitDepth: 8,
				colorType: 2
			});
			expect(file).toMatchObject({
				width: target.width,
				height: target.height,
				bitDepth: 8,
				colorType: 2,
				classId: target.classId,
				sourceStatus: 'recorded'
			});
			const asset = project.assets[`${file.target}:s${file.slideIndex + 1}`];
			expect(file.source).toEqual({
				asset: asset.id,
				sha256: asset.sha256,
				compatibility: 'native',
				provenance: asset.provenance
			});
		}
		expect(manifest.projectFile).toMatchObject({ path: PROJECT_FILE });
		const projectBytes = (await readZipEntry(result.zip, PROJECT_FILE))!;
		expect(manifest.projectFile?.sha256).toBe(await sha(projectBytes));
		expect(manifest.projectFile?.byteLength).toBe(projectBytes.length);
	});

	it('reads "unverified source" for a capture nothing vouches for, and hashes it anyway', async () => {
		const project = campaign();
		const bare: ProjectAsset = { ...project.assets['ipad-13:s1'] };
		delete bare.sha256;
		delete bare.provenance;
		const result = await done({
			...project,
			assets: { ...project.assets, 'ipad-13:s1': bare }
		});
		const file = result.manifest.files.find(
			(item) => item.target === 'ipad-13' && item.slideIndex === 0
		)!;
		expect(file.sourceStatus).toBe('unverified source');
		expect(file.source?.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(result.issues.map((issue) => issue.code)).toContain('unverified-source');
		expect(result.manifest.issues).toEqual(result.issues);
	});

	it('words its summary as a checklist, never as approval', async () => {
		const result = await done(campaign());
		const readme = (await text(result.zip, README_FILE))!;
		expect(readme).toContain('meets the file spec');
		expect(readme).toContain('not native device UI');
		expect(readme).not.toMatch(/compliant|approved/i);
		expect(readme).toContain(PROJECT_FILE);
		expect(result.fileName).toBe('working-title-app-store-set.zip');
	});

	it('passes every frame through the renderer once, reporting progress', async () => {
		const onProgress = vi.fn();
		const runtime = runtimeWith(validFrame);
		await done(campaign(), { onProgress }, runtime);
		expect(runtime.renderPng).toHaveBeenCalledTimes(6);
		expect(onProgress).toHaveBeenCalledTimes(6);
		expect(onProgress).toHaveBeenNthCalledWith(1, {
			done: 1,
			total: 6,
			target: 'iphone-6.9',
			slideIndex: 0
		});
		expect(onProgress).toHaveBeenLastCalledWith({
			done: 6,
			total: 6,
			target: 'ipad-13',
			slideIndex: 1
		});
	});
});

describe('per-target content stays on its target', () => {
	it('gives each output only its own capture and overrides', async () => {
		const project = campaign(RECOMMENDED, 2, (target, slideIndex) => ({
			scale: target === 'ipad-13' ? 0.8 : 1.2,
			...(target === 'iphone-6.9' && slideIndex === 0 ? { fontScale: 1.1 } : {})
		}));
		const seen: Composition[] = [];
		const runtime = runtimeWith((composition, index) => {
			seen.push(composition);
			return validFrame(composition, index);
		});
		const result = await done(project, {}, runtime);
		for (const composition of seen) {
			composition.slides.forEach((slide, index) => {
				expect(slide.primaryImage?.id).toBe(`${composition.device}:s${index + 1}`);
				expect(slide.scale).toBe(composition.device === 'ipad-13' ? 0.8 : 1.2);
			});
		}
		// Each output's frames are different files, and each lists only its own source.
		const hashes = result.manifest.files.map((file) => file.sha256);
		expect(new Set(hashes).size).toBe(hashes.length);
		for (const file of result.manifest.files)
			expect(file.source?.asset.startsWith(`${file.target}:`)).toBe(true);
	});

	it('traces a callout from another capture to that capture, not its frame', async () => {
		const project = campaign(RECOMMENDED, 1, (target) => ({
			layers: [
				{
					id: 'rest',
					kind: 'source-crop',
					image: 'rest',
					crop: { x: 0, y: 0, width: 50, height: 50 },
					x: 10,
					y: 900,
					scale: 1
				},
				{
					id: 'own',
					kind: 'source-crop',
					image: `${target}:s1`,
					crop: { x: 0, y: 0, width: 50, height: 50 },
					x: 10,
					y: 1100,
					scale: 1
				}
			]
		}));
		const rest = assetOf('rest', 2064, 2752);
		const result = await done(
			{ ...project, assets: { ...project.assets, rest } },
			{ scope: 'draft', targets: ['ipad-13'] }
		);
		const [file] = result.manifest.files;
		expect(file.source?.asset).toBe('ipad-13:s1');
		expect(file.layers.map((layer) => [layer.id, layer.asset, layer.sourceStatus])).toEqual([
			['rest', 'rest', 'unverified source'],
			['own', 'ipad-13:s1', 'recorded']
		]);
		expect(file.layers[0].sha256).toBe(rest.sha256);
	});

	it('records every layer on a frame with its own hash', async () => {
		const project = campaign(RECOMMENDED, 1, (target) => ({
			layers: [
				{
					id: `crop-${target}`,
					kind: 'source-crop',
					image: `${target}:s1`,
					crop: { x: 0, y: 0, width: 50, height: 50 },
					x: 10,
					y: 900,
					scale: 1
				}
			]
		}));
		const result = await done(project);
		for (const file of result.manifest.files)
			expect(file.layers).toEqual([
				{
					id: `crop-${file.target}`,
					kind: 'source-crop',
					asset: `${file.target}:s1`,
					sha256: project.assets[`${file.target}:s1`].sha256,
					sourceStatus: 'recorded'
				}
			]);
	});
});

describe('a blocked store export', () => {
	it.each([
		[
			'no required medium iPhone',
			() => campaign(['iphone-6.9', 'ipad-13']),
			'required-class-missing'
		],
		[
			'a wrong-class source',
			() => {
				const project = campaign();
				const slides = project.slides.map((slide) => ({
					...slide,
					variants: {
						...slide.variants,
						'ipad-13': { source: { asset: 'iphone-6.9:s1' } }
					}
				}));
				return { ...project, slides };
			},
			'wrong-class'
		],
		[
			'a synthetic Duo source',
			() => {
				const project = campaign([...RECOMMENDED, ...DUO]);
				const fake = assetOf('fake', 1398, 2034, { provenance: { synthetic: true } });
				return {
					...project,
					assets: { ...project.assets, fake },
					slides: project.slides.map((slide) => ({
						...slide,
						variants: {
							...slide.variants,
							'iphone-duo-outer-1398x2034': { source: { asset: 'fake' } }
						}
					}))
				};
			},
			'synthetic-source'
		]
	])('produces nothing with %s, and renders nothing', async (_, build, code) => {
		const runtime = runtimeWith(validFrame);
		const result = await run(build(), {}, runtime);
		expect(result.status).toBe('blocked');
		expect('zip' in result).toBe(false);
		expect(blocking(result.issues)).toContain(code);
		expect(runtime.renderPng).not.toHaveBeenCalled();
	});

	it('reports every issue at once', async () => {
		const project = campaign(['iphone-6.9', 'ipad-13'], 11);
		const result = await run(project);
		expect(blocking(result.issues)).toEqual(
			expect.arrayContaining(['too-many-frames', 'required-class-missing'])
		);
	});
});

describe('a draft export is plainly a draft', () => {
	function syntheticDuo() {
		const project = campaign([...RECOMMENDED, ...DUO], 1);
		const outer = assetOf('fake-outer', 1398, 2034, {
			provenance: { synthetic: true, tool: 'layout probe' }
		});
		const inner = assetOf('fake-inner', 2007, 2853, {
			provenance: { synthetic: true, tool: 'layout probe' }
		});
		return {
			...project,
			assets: { ...project.assets, 'fake-outer': outer, 'fake-inner': inner },
			slides: project.slides.map((slide) => ({
				...slide,
				variants: {
					...slide.variants,
					'iphone-duo-outer-1398x2034': { source: { asset: 'fake-outer' } },
					'iphone-duo-inner-2007x2853': { source: { asset: 'fake-inner' } }
				}
			}))
		};
	}

	it('is refused for store and labelled everywhere for draft', async () => {
		const project = syntheticDuo();
		expect((await run(project)).status).toBe('blocked');
		const result = await done(project, { scope: 'draft' });
		expect(result.status).toBe('complete');
		expect(result.scope).toBe('draft');
		expect(result.fileName).toContain('DRAFT');
		expect(result.manifest.readiness).toBe('draft-not-store-ready');
		expect(result.manifest.summary).toContain('DRAFT, not for the App Store');
		const pngs = (await names(result.zip)).filter((name) => name.endsWith('.png'));
		expect(pngs).toHaveLength(5);
		for (const name of pngs) {
			expect(name.startsWith(`${DRAFT_FOLDER}/`)).toBe(true);
			expect(name.split('/').at(-1)).toMatch(/^DRAFT-/);
		}
		const readme = (await text(result.zip, README_FILE))!;
		expect(readme.split('\n')[2]).toContain('DRAFT, not for the App Store');
		const duo = result.manifest.files.find((file) => file.target === DUO[0])!;
		expect(duo.sourceStatus).toBe('synthetic');
		expect(duo.source?.provenance?.synthetic).toBe(true);
		expect(blocking(result.manifest.issues)).toContain('synthetic-source');
	});

	it('carries the reason a person accepted a non-native capture', async () => {
		const project = campaign(RECOMMENDED, 1);
		const reason = 'Layout review before the iPad build exists';
		const accepted = {
			...project,
			slides: project.slides.map((slide) => ({
				...slide,
				variants: {
					...slide.variants,
					'ipad-13': { source: { asset: 'iphone-6.9:s1', nonNative: { reason } } }
				}
			}))
		};
		expect((await run(accepted)).status).toBe('blocked');
		const result = await done(accepted, { scope: 'draft' });
		const file = result.manifest.files.find((item) => item.target === 'ipad-13')!;
		expect(file.source).toMatchObject({ compatibility: 'wrong-class', nonNative: { reason } });
	});

	it('records the accepted reason for both matching captures after a pair is disconnected', async () => {
		const project = campaign(RECOMMENDED, 2);
		const reason = 'Pair layout review before recapturing';
		const source = { asset: 'iphone-6.9:s1', nonNative: { reason } };
		const paired: ProjectV2 = {
			...project,
			continuityMode: 'paired',
			panorama: {
				leftId: project.slides[0].id,
				rightId: project.slides[1].id,
				offset: 0,
				scale: 1,
				tilt: 0,
				variants: { 'ipad-13': { source } }
			},
			slides: project.slides.map((slide) => ({
				...slide,
				variants: { ...slide.variants, 'ipad-13': { source: { asset: source.asset } } }
			}))
		};
		const disconnected = disconnectPair(paired);
		expect((await run(disconnected)).status).toBe('blocked');
		const result = await done(disconnected, { scope: 'draft' });
		const files = result.manifest.files.filter((file) => file.target === 'ipad-13');
		expect(files).toHaveLength(2);
		for (const file of files)
			expect(file.source).toMatchObject({ compatibility: 'wrong-class', nonNative: { reason } });
	});

	it('leaves a frame with no capture out, by name, instead of shipping a placeholder', async () => {
		const project = campaign(RECOMMENDED, 2, (target, slideIndex) =>
			target === 'ipad-13' && slideIndex === 1 ? null : {}
		);
		const runtime = runtimeWith(validFrame);
		const result = await done(project, { scope: 'draft' }, runtime);
		expect(result.status).toBe('partial');
		expect(result.manifest.partial).toBe(true);
		expect(result.manifest.summary).toContain('DRAFT and PARTIAL');
		expect(result.fileName).toContain('DRAFT-PARTIAL');
		expect(result.manifest.omitted).toEqual([
			{
				target: 'ipad-13',
				slideIndex: 1,
				reason: expect.stringContaining('Frame 2 has no capture')
			}
		]);
		expect(runtime.renderPng).toHaveBeenCalledTimes(5);
	});
});

describe('a file that fails is left out by name, and the set says so', () => {
	const failAt =
		(target: DeviceId, slideIndex: number, bad: () => Uint8Array) =>
		(composition: Composition, index: number) =>
			composition.device === target && index === slideIndex
				? bad()
				: validFrame(composition, index);

	const { width, height } = DEVICES['ipad-13'];
	it.each([
		['a truncated file', () => framePng('ipad-13', 2).slice(0, 5000), /cut off/],
		['bytes that are not a PNG', () => new TextEncoder().encode('not a png'), /not a PNG/],
		[
			'the wrong size',
			() => framePng('iphone-6.9'),
			/1320 × 2868 pixels, not the required 2064 × 2752/
		],
		[
			'transparent pixels',
			() => {
				const pixels = patternPixels(width, height, 2, 4);
				pixels[3] = 0;
				return pngFile(width, height, pixels, { channels: 4, level: 0 });
			},
			/transparent pixels/
		],
		[
			'a blank canvas',
			() => pngFile(width, height, new Uint8Array(width * height * 3), { level: 0 }),
			/same color/
		],
		[
			'trailing bytes',
			() => concat([framePng('ipad-13', 2), Uint8Array.from([1])]),
			/after the end/
		]
	])('with %s', async (_, bad, reason) => {
		const runtime = runtimeWith(failAt('ipad-13', 1, bad));
		const result = await done(campaign(), {}, runtime);
		expect(result.status).toBe('partial');
		expect(result.manifest).toMatchObject({
			partial: true,
			readiness: 'partial-not-store-ready'
		});
		expect(result.manifest.summary).toContain('PARTIAL, not a complete store set');
		expect(result.fileName).toContain('PARTIAL');
		const [omission] = result.manifest.omitted;
		expect(result.manifest.omitted).toHaveLength(1);
		expect(omission).toMatchObject({ target: 'ipad-13', slideIndex: 1 });
		expect(omission.reason).toContain('ipad-13/2064x2752-portrait/02-frame-s2-2064x2752.png');
		expect(omission.reason).toMatch(reason);

		const failure = result.issues.find((issue) => issue.code === 'frame-failed')!;
		expect(failure).toMatchObject({ severity: 'block', target: 'ipad-13', slideIndex: 1 });
		expect(failure.message).toContain('frame 2');
		expect(failure.message).toContain('iPad 13"');

		// The other five are there, the failed one is not, and the archive says so at its root.
		const listing = await names(result.zip);
		expect(listing.filter((name) => name.endsWith('.png'))).toHaveLength(5);
		expect(listing).not.toContain('ipad-13/2064x2752-portrait/02-frame-s2-2064x2752.png');
		expect(listing).toContain(PARTIAL_MARKER_FILE);
		expect(await text(result.zip, PARTIAL_MARKER_FILE)).toContain('iPad 13", frame 2');
		expect(await text(result.zip, README_FILE)).toContain('iPad 13", frame 2');
		expect(result.manifest.targets.find((item) => item.target === 'ipad-13')).toMatchObject({
			expected: 2,
			written: 1
		});
	});

	it('names a renderer that throws, and carries on', async () => {
		const runtime = runtimeWith((composition, index) => {
			if (composition.device === 'iphone-6.9' && index === 0)
				throw new Error('This headline does not fit.');
			return validFrame(composition, index);
		});
		const result = await done(campaign(), {}, runtime);
		expect(result.status).toBe('partial');
		expect(result.manifest.omitted[0].reason).toContain('This headline does not fit.');
		expect(result.manifest.files).toHaveLength(5);
	});

	it('rewrites opaque RGBA from the browser as real RGB and ships it', async () => {
		const runtime = runtimeWith((composition) => {
			const { width: w, height: h } = DEVICES[composition.device];
			if (composition.device !== 'iphone-6.9') return framePng(composition.device, 3);
			return pngFile(w, h, patternPixels(w, h, 2, 4), { channels: 4, level: 0 });
		});
		const result = await done(
			campaign(['iphone-6.9', 'iphone-di-medium-1206x2622'], 1),
			{},
			runtime
		);
		expect(result.status).toBe('complete');
		const file = result.manifest.files.find((item) => item.target === 'iphone-6.9')!;
		const bytes = (await readZipEntry(result.zip, file.path))!;
		expect(inspectPng(bytes)).toEqual({ width: 1320, height: 2868, bitDepth: 8, colorType: 2 });
		expect(file.colorType).toBe(2);
		expect(file.sha256).toBe(await sha(bytes));
	});

	it('takes the platform decoder as a second opinion', async () => {
		const runtime = runtimeWith(validFrame, {
			decodedSize: async () => ({ width: 1, height: 1 })
		});
		const result = await run(campaign(), {}, runtime);
		expect(result.status).toBe('blocked');
		expect(result.issues.find((issue) => issue.code === 'frame-failed')?.message).toContain(
			'browser decodes it as 1 × 1'
		);
	});

	it('returns blocked, with every name, when nothing could be written', async () => {
		const runtime = runtimeWith(() => {
			throw new Error('Out of memory.');
		});
		const result = await run(campaign(), {}, runtime);
		expect(result.status).toBe('blocked');
		expect(result.issues.filter((issue) => issue.code === 'frame-failed')).toHaveLength(6);
	});

	it('leaves out a file the archive cannot hold, without losing the rest', async () => {
		const result = await done(
			campaign(['iphone-di-medium-1206x2622', 'iphone-6.9'], 1),
			{},
			runtimeWith(validFrame, { maxZipBytes: 16 * 1024 * 1024 + 10 * 1024 * 1024 })
		);
		expect(result.status).toBe('partial');
		expect(result.manifest.files).toHaveLength(1);
		expect(result.manifest.omitted[0].reason).toContain('larger than it can be');
		expect(await names(result.zip)).toContain(MANIFEST_FILE);
	});

	it('marks a selection of outputs as partial, listing what it left out', async () => {
		const project = campaign();
		const runtime = runtimeWith(validFrame);
		const result = await done(project, { targets: ['ipad-13'] }, runtime);
		expect(result.status).toBe('partial');
		expect(result.manifest.readiness).toBe('partial-not-store-ready');
		expect(runtime.renderPng).toHaveBeenCalledTimes(2);
		expect(result.manifest.files.every((file) => file.target === 'ipad-13')).toBe(true);
		expect(result.manifest.omitted).toHaveLength(4);
		expect(result.manifest.omitted[0].reason).toContain('not selected for this export');
	});
});

describe('the editable project', () => {
	const crop = { x: 0, y: 0, width: 50, height: 50 };

	function withLayers() {
		const art = assetOf('art-1', 800, 1200, { name: 'leaf-mark.png' });
		// Embedded art of the app's own, which unlike a bundled sample can pass the store gate.
		const owned = assetOf('own-art', 640, 640, { name: 'own-mark.png' });
		const project = campaign(RECOMMENDED, 2, (target, slideIndex) => ({
			check: { preset: 'detail', panel: false },
			linen: undefined,
			layers: [
				{
					id: 'real-ui',
					kind: 'source-crop',
					image: `${target}:s${slideIndex + 1}`,
					crop,
					x: 30,
					y: 900,
					scale: 1.5,
					radius: 12,
					shadow: 'soft'
				},
				{
					id: 'leaf-mark',
					kind: 'art',
					image: 'art-1',
					crop,
					x: 40,
					y: 500,
					scale: 1,
					sampling: 'pixelated'
				},
				{ id: 'own-mark', kind: 'art', image: 'own-art', crop, x: 40, y: 300, scale: 1 }
			]
		}));
		return {
			...project,
			style: 'the-check' as const,
			assets: { ...project.assets, 'art-1': art, 'own-art': owned }
		};
	}

	it('reopens from the archive as the same campaign, layers and all', async () => {
		const project = withLayers();
		const result = await done(project);
		const reopened = parseProjectV2((await text(result.zip, PROJECT_FILE))!);
		expect(reopened.version).toBe(2);
		expect(reopened.targets).toEqual(RECOMMENDED);
		expect(reopened.slides).toEqual(JSON.parse(JSON.stringify(project.slides)));
		for (const target of RECOMMENDED) {
			const before = projectForTarget(project, target);
			const after = projectForTarget(reopened, target);
			expect(
				after.slides[1].layers?.map((layer) => [layer.id, layer.kind, layer.image.id])
			).toEqual([
				['real-ui', 'source-crop', `${target}:s2`],
				['leaf-mark', 'art', 'art-1'],
				['own-mark', 'art', 'own-art']
			]);
			expect(after).toEqual(JSON.parse(JSON.stringify(before)));
		}
	});

	it('refuses bundled sample art for the store and keeps it by path in a draft', async () => {
		const bundled: ProjectAsset = {
			id: 'sample-mark',
			mime: 'image/png',
			byteLength: 0,
			url: '/sample/mark.png',
			naturalWidth: 640,
			naturalHeight: 640,
			provenance: { tool: 'appshot-sample' }
		};
		const project = campaign(RECOMMENDED, 1, () => ({
			layers: [{ id: 'art', kind: 'art', image: 'sample-mark', crop, x: 40, y: 300, scale: 1 }]
		}));
		const sampled = { ...project, assets: { ...project.assets, 'sample-mark': bundled } };
		const store = await run(sampled);
		expect(store.status).toBe('blocked');
		expect(store.issues.filter((issue) => issue.code === 'sample-source')).toHaveLength(3);
		const draft = await done(sampled, { scope: 'draft' });
		expect(draft.manifest.readiness).toBe('draft-not-store-ready');
		const reopened = parseProjectV2((await text(draft.zip, PROJECT_FILE))!);
		expect(reopened.assets['sample-mark']).toEqual(bundled);
	});

	it('reopens from a partial archive too', async () => {
		const project = campaign();
		const runtime = runtimeWith((composition, index) => {
			if (index === 1) throw new Error('Out of memory.');
			return validFrame(composition, index);
		});
		const result = await done(project, {}, runtime);
		expect(result.status).toBe('partial');
		const reopened = parseProjectV2((await text(result.zip, PROJECT_FILE))!);
		expect(reopened.slides).toHaveLength(2);
		expect(Object.keys(reopened.assets)).toEqual(Object.keys(project.assets));
	});

	it('stores an image used many times once', async () => {
		const shared = assetOf('shared', 1320, 2868, { provenance: FULL_RECORD });
		const project = campaign(['iphone-6.9'], 3);
		const deduped: ProjectV2 = {
			...project,
			assets: { shared },
			slides: project.slides.map((slide) => ({
				...slide,
				variants: { 'iphone-6.9': { source: { asset: 'shared' } } }
			}))
		};
		const blob = await portableProjectBlob(deduped);
		const body = await blob.text();
		expect(body.split(shared.url)).toHaveLength(2);
	});

	it('fetches session URLs, fills in what is unrecorded, and keeps no session state', async () => {
		const bytes = pngFile(2, 2, patternPixels(2, 2));
		const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
		try {
			const rest = assetOf('live', 1320, 2868);
			delete rest.sha256;
			const project = campaign(['iphone-6.9'], 1);
			const reopened = parseProjectV2(
				await (
					await portableProjectBlob({
						...project,
						campaignId: 'slot-1',
						assets: { ...project.assets, live: { ...rest, url, byteLength: 1, mime: 'image/webp' } }
					})
				).text()
			);
			expect(reopened.campaignId).toBeUndefined();
			expect(reopened.assets.live).toMatchObject({
				mime: 'image/png',
				byteLength: bytes.length,
				sha256: await sha(bytes)
			});
			expect(reopened.assets.live.url).toMatch(/^data:image\/png;base64,/);
		} finally {
			URL.revokeObjectURL(url);
		}
	});

	it('refuses an image whose bytes do not match its record', async () => {
		const project = campaign(['iphone-6.9'], 1);
		const lying = { ...project.assets['iphone-6.9:s1'], sha256: 'f'.repeat(64), name: 'liar.png' };
		await expect(
			portableProjectBlob({ ...project, assets: { ...project.assets, 'iphone-6.9:s1': lying } })
		).rejects.toThrow('liar.png does not match');
	});

	it('still exports, labelled partial, when the project cannot be written', async () => {
		const result = await done(campaign(), {
			portableProject: () => Promise.reject(new Error('The image is missing.'))
		});
		expect(result.status).toBe('partial');
		expect(result.manifest).toMatchObject({ partial: true, projectFile: null });
		expect(result.manifest.files).toHaveLength(6);
		const [issue] = result.issues.filter((item) => item.code === 'project-file-omitted');
		expect(issue.message).toContain('The image is missing.');
		expect(await names(result.zip)).not.toContain(PROJECT_FILE);
		expect(await text(result.zip, README_FILE)).toContain('could not be written');
		expect(await text(result.zip, PARTIAL_MARKER_FILE)).toContain('could not be written');
	});

	it('uses the project writer it is given', async () => {
		const portableProject = vi.fn(async () => new Blob(['{"version":2}']));
		const result = await done(campaign(['iphone-6.9', 'iphone-di-medium-1206x2622'], 1), {
			portableProject
		});
		expect(portableProject).toHaveBeenCalledOnce();
		expect(await text(result.zip, PROJECT_FILE)).toBe('{"version":2}');
	});
});

describe('cancelling', () => {
	it('does nothing when already cancelled', async () => {
		const runtime = runtimeWith(validFrame);
		const controller = new AbortController();
		controller.abort();
		await expect(run(campaign(), { signal: controller.signal }, runtime)).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(runtime.renderPng).not.toHaveBeenCalled();
	});

	it('stops between frames with no result and no more progress', async () => {
		const controller = new AbortController();
		const onProgress = vi.fn(({ done: finished }: { done: number }) => {
			if (finished === 2) controller.abort();
		});
		const runtime = runtimeWith(validFrame);
		await expect(
			run(campaign(), { signal: controller.signal, onProgress }, runtime)
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(runtime.renderPng).toHaveBeenCalledTimes(2);
		expect(onProgress).toHaveBeenCalledTimes(2);
	});

	it('stops mid-frame without calling the failure a bad file', async () => {
		const controller = new AbortController();
		const runtime = runtimeWith(async (composition, index) => {
			controller.abort();
			return validFrame(composition, index);
		});
		await expect(run(campaign(), { signal: controller.signal }, runtime)).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(runtime.renderPng).toHaveBeenCalledOnce();
	});

	it('treats a cancellation raised inside the renderer as a cancellation', async () => {
		const controller = new AbortController();
		const runtime = runtimeWith(() => {
			controller.abort();
			throw new Error('The render was interrupted.');
		});
		await expect(run(campaign(), { signal: controller.signal }, runtime)).rejects.toMatchObject({
			name: 'AbortError'
		});
	});
});

// Bundled in memory by export-matrix.e2e.ts and scripts/verify-export.mjs; never shipped in the app.
import { CampaignPersistence } from '../src/lib/editor/campaign-persistence';
import { assetFromCapture, readCapture } from '../src/lib/model/capture';
import {
	BILLINGTON_SCENES,
	BRAND_ART,
	createCheckProject,
	type BillingtonAssets
} from '../src/lib/model/check-campaign';
import type {
	CaptureProvenance,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	StoredSlide
} from '../src/lib/model/contracts';
import { DEVICES, type DeviceId } from '../src/lib/model/devices';
import { defaultLinenSettings } from '../src/lib/model/linen';
import { parseProject } from '../src/lib/model/project';
import { createSlide, type StyleId } from '../src/lib/model/studio';
import { projectForTarget } from '../src/lib/model/targets';
import type { Composition } from '../src/lib/model/types';
import { renderSlide } from '../src/lib/render/canvas';
import {
	canvasToPng,
	exportCampaign,
	exportMatrix,
	exportSlide,
	portableComposition,
	projectTextFromFile
} from '../src/lib/render/export';
import { createExportMatrix, type MatrixResult } from '../src/lib/render/export-matrix';
import { decodePng, inspectPng } from '../src/lib/render/png';
import { preflight, type PreflightRunOptions } from '../src/lib/render/preflight';
import { readZipDirectory, readZipEntry } from '../src/lib/render/zip';

const projects = new Map<string, ProjectV2>();
const results = new Map<string, Extract<MatrixResult, { zip: Blob }>>();

/* ------------------------------------------------------------------------------- real captures */

async function captureAsset(file: File, provenance?: CaptureProvenance): Promise<ProjectAsset> {
	const capture = await readCapture(file);
	const url = URL.createObjectURL(capture.blob);
	return { ...assetFromCapture(capture, url), ...(provenance ? { provenance } : {}) };
}

/** Native captures from the capture tree, bound through the real campaign builder. */
export async function prepareNative(
	key: string,
	byTarget: Partial<Record<DeviceId, Record<string, string>>>,
	provenance?: CaptureProvenance
): Promise<{ targets: DeviceId[]; frames: number; assets: number }> {
	const assets: Partial<Record<DeviceId, BillingtonAssets>> = {};
	for (const [target, scenes] of Object.entries(byTarget) as [DeviceId, Record<string, string>][]) {
		const bound: BillingtonAssets = {};
		for (const scene of BILLINGTON_SCENES) {
			const url = scenes[scene];
			if (!url) continue;
			const response = await fetch(url);
			if (!response.ok) throw new Error(`${url} is missing.`);
			const file = new File([await response.blob()], `${target}-${scene}.png`);
			bound[scene] = await captureAsset(file, provenance);
		}
		assets[target] = bound;
	}
	const project = createCheckProject(assets);
	projects.set(key, project);
	return {
		targets: project.targets,
		frames: project.slides.length,
		assets: Object.keys(project.assets).length
	};
}

/** An editable project file, opened the way Open project does. */
export async function prepareProjectFile(key: string, url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} is missing.`);
	const text = await projectTextFromFile(await response.blob());
	const project = await new CampaignPersistence().importPortable(text);
	projects.set(key, project);
	return {
		name: project.name,
		style: project.style,
		targets: project.targets,
		frames: project.slides.length,
		assets: Object.keys(project.assets).length
	};
}

/* --------------------------------------------------------------------------- synthetic captures */

const rgbaFiles = new Map<string, File>();

/**
 * A capture with a real alpha channel: a fully transparent margin, a translucent band and opaque
 * rows of fake UI. The file's PNG is checked to really have alpha, or the test would prove nothing.
 */
async function rgbaCaptureFile(width: number, height: number, seed: number): Promise<File> {
	const key = `${width}x${height}:${seed}`;
	const known = rgbaFiles.get(key);
	if (known) return known;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = `hsl(${(seed * 47) % 360} 55% 94%)`;
	ctx.fillRect(width * 0.03, height * 0.02, width * 0.94, height * 0.96);
	const row = Math.max(20, Math.round(height / 28));
	for (let y = row * 2; y < height - row * 2; y += row * 2) {
		ctx.fillStyle = `hsl(${(seed * 47 + y) % 360} 40% 42%)`;
		ctx.fillRect(width * 0.08, y, width * (0.4 + ((y / row) % 5) * 0.1), row);
	}
	ctx.fillStyle = 'rgba(20, 90, 90, 0.5)';
	ctx.fillRect(0, height * 0.46, width, height * 0.08);
	const blob = await canvasToPng(canvas);
	canvas.width = canvas.height = 0;
	const inspection = inspectPng(new Uint8Array(await blob.arrayBuffer()));
	if (inspection.colorType !== 6) throw new Error('The fixture capture has no alpha channel.');
	const file = new File([blob], `rgba-${key}.png`, { type: 'image/png' });
	rgbaFiles.set(key, file);
	return file;
}

const HEADLINES = ['One bill.\n*Everyone’s* share.', 'Who had what.', 'Split it *your* way.'];

export interface SyntheticOptions {
	targets: DeviceId[];
	frames?: number;
	style?: StyleId;
	/** False stands in for a real capture, for a store-path test of RGBA input. */
	synthetic?: boolean;
	nonNative?: { reason: string };
	withLayers?: boolean;
	headline?: string;
}

/** Native-sized RGBA captures for each output, marked `synthetic` unless a test says otherwise. */
export async function prepareSynthetic(key: string, options: SyntheticOptions) {
	const { targets, frames = 1, style = 'the-check', synthetic = true } = options;
	const assets: Record<string, ProjectAsset> = {};
	const slides: StoredSlide[] = [];
	for (let index = 0; index < frames; index++) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- fields v2 does not store
		const { device, primaryImage, continuity, layers, ...shared } = createSlide(index);
		const variants: Partial<Record<DeviceId, SlideVariant>> = {};
		for (const target of targets) {
			const { width, height } = DEVICES[target];
			const file = await rgbaCaptureFile(width, height, index + 1);
			const asset = await captureAsset(
				file,
				synthetic
					? { synthetic: true, tool: 'export harness' }
					: { device: DEVICES[target].platform === 'ipad' ? 'iPad' : 'iPhone', os: 'iOS 27.2' }
			);
			assets[asset.id] = asset;
			variants[target] = {
				source: { asset: asset.id, ...(options.nonNative ? { nonNative: options.nonNative } : {}) },
				...(options.withLayers
					? {
							layers: [
								{
									id: 'callout',
									kind: 'source-crop' as const,
									image: asset.id,
									crop: {
										x: Math.round(width * 0.05),
										y: Math.round(height * 0.4),
										width: Math.round(width * 0.5),
										height: Math.round(height * 0.1)
									},
									x: Math.round(width * 0.25),
									y: Math.round(height * 0.72),
									scale: 1.2,
									radius: Math.round(width * 0.02),
									shadow: 'soft' as const
								}
							]
						}
					: {})
			};
		}
		slides.push({
			...shared,
			id: `frame-${index + 1}`,
			label: `Frame ${index + 1}`,
			frame: 'none',
			typography: {
				...shared.typography,
				headline: options.headline ?? HEADLINES[index % HEADLINES.length],
				subtitle: 'Real source pixels, nothing retyped.'
			},
			...(style === 'table-linen' ? { linen: defaultLinenSettings('teal') } : {}),
			variants
		});
	}
	projects.set(key, {
		version: 2,
		name: `Export probe ${key}`,
		appName: 'Billington',
		style,
		accent: '#F2CE6B',
		targets,
		assets,
		slides,
		continuityMode: 'none'
	});
}

/**
 * The same campaign without the pen marks the painter refused, so the file pipeline can still be
 * proven on real captures while campaign geometry is reported separately.
 */
export function withoutRefusedMarks(
	key: string,
	as: string,
	refused: readonly { target: DeviceId; slideIndex: number }[]
): void {
	const project = required(key);
	projects.set(as, {
		...project,
		slides: project.slides.map((slide, slideIndex) => ({
			...slide,
			variants: Object.fromEntries(
				Object.entries(slide.variants ?? {}).map(([target, variant]) => [
					target,
					refused.some((item) => item.target === target && item.slideIndex === slideIndex)
						? { ...variant, check: { ...variant?.check, mark: null } }
						: variant
				])
			)
		}))
	});
}

/* -------------------------------------------------------------------------------------- running */

function required(key: string): ProjectV2 {
	const project = projects.get(key);
	if (!project) throw new Error(`No project named ${key}.`);
	return project;
}

export async function runPreflight(key: string, options: PreflightRunOptions = {}) {
	const started = performance.now();
	const issues = await preflight(required(key), options);
	return { issues, ms: Math.round(performance.now() - started) };
}

function brief(key: string, result: MatrixResult) {
	if (result.status === 'blocked') return { status: result.status, issues: result.issues };
	results.set(key, result);
	return {
		status: result.status,
		scope: result.scope,
		fileName: result.fileName,
		bytes: result.zip.size,
		manifest: result.manifest,
		issues: result.issues
	};
}

export async function runExport(
	key: string,
	options: { targets?: DeviceId[]; scope?: 'store' | 'draft'; saveAs?: string } = {}
) {
	const started = performance.now();
	const heap = () =>
		(performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
	let peakHeap = heap();
	let progress = 0;
	const result = await exportMatrix(required(key), {
		...(options.targets ? { targets: options.targets } : {}),
		scope: options.scope ?? 'store',
		onProgress: ({ done }) => {
			progress = done;
			peakHeap = Math.max(peakHeap, heap());
		}
	});
	return {
		...brief(options.saveAs ?? key, result),
		progress,
		ms: Math.round(performance.now() - started),
		peakHeapMb: Math.round(peakHeap / 1048576)
	};
}

/** Hand a finished archive to the test runner as a real download. */
export function downloadResult(key: string): void {
	const result = results.get(key);
	if (!result) throw new Error(`No archive named ${key}.`);
	const anchor = document.createElement('a');
	anchor.href = URL.createObjectURL(result.zip);
	anchor.download = result.fileName;
	anchor.click();
}

async function renderNormally(composition: Composition, index: number) {
	return new Uint8Array(await (await exportSlide(composition, index)).arrayBuffer());
}

const baseRuntime = { preflight, now: () => new Date() };

const pixelHash = async (pixels: Uint8Array<ArrayBuffer>) =>
	Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');

/**
 * A real browser writing opaque RGBA must end as RGB with the very same pixels. One paint is encoded
 * both ways, because two paints of the same frame are not always byte-identical (see `comparePixels`).
 */
export async function rgbaEncoderRoundTrip(key: string) {
	const browserColorTypes: number[] = [];
	const expected = new Map<string, string>();
	const result = await createExportMatrix({
		...baseRuntime,
		renderPng: async (composition, index) => {
			const painted = document.createElement('canvas');
			const output = document.createElement('canvas');
			try {
				await renderSlide(painted, composition, index);
				output.width = painted.width;
				output.height = painted.height;
				output.getContext('2d')!.drawImage(painted, 0, 0);
				const direct = new Uint8Array(await (await canvasToPng(painted)).arrayBuffer());
				const bytes = new Uint8Array(await (await canvasToPng(output)).arrayBuffer());
				browserColorTypes.push(inspectPng(bytes).colorType);
				expected.set(
					`${composition.device}/${index}`,
					await pixelHash((await decodePng(direct)).pixels)
				);
				return bytes;
			} finally {
				painted.width = painted.height = output.width = output.height = 0;
			}
		}
	})(required(key), { scope: 'draft' });
	if (result.status === 'blocked') throw new Error(JSON.stringify(result.issues));
	results.set(`${key}-rgba`, result);
	const comparisons = [];
	for (const file of result.manifest.files) {
		const rewritten = await decodePng((await readZipEntry(result.zip, file.path))!);
		comparisons.push({
			path: file.path,
			colorType: rewritten.colorType,
			channels: rewritten.channels,
			samePixels:
				(await pixelHash(rewritten.pixels)) === expected.get(`${file.target}/${file.slideIndex}`)
		});
	}
	return { browserColorTypes, comparisons, status: result.status };
}

/** A real browser encoder, with chosen frames damaged on the way out. */
export async function damagedFrames(key: string, saveAs: string) {
	let frame = 0;
	const result = await createExportMatrix({
		...baseRuntime,
		renderPng: async (composition, index) => {
			const bytes = await renderNormally(composition, index);
			frame++;
			if (frame === 1) return bytes.slice(0, Math.floor(bytes.length / 2));
			if (frame === 2) return new TextEncoder().encode('<html>not a png</html>');
			if (frame === 3) {
				const flipped = bytes.slice();
				flipped[Math.floor(bytes.length / 2)] ^= 0xff;
				return flipped;
			}
			return bytes;
		}
	})(required(key), { scope: 'store' });
	return brief(saveAs, result);
}

export async function cancelledExport(key: string, afterFrames: number) {
	const controller = new AbortController();
	let rendered = 0;
	let progressCalls = 0;
	const run = createExportMatrix({
		...baseRuntime,
		renderPng: async (composition, index) => {
			rendered++;
			return renderNormally(composition, index);
		}
	});
	try {
		await run(required(key), {
			scope: 'draft',
			signal: controller.signal,
			onProgress: ({ done }) => {
				progressCalls++;
				if (done === afterFrames) controller.abort();
			}
		});
		return { outcome: 'finished', rendered, progressCalls };
	} catch (error) {
		return {
			outcome: (error as Error).name,
			rendered,
			progressCalls
		};
	}
}

/* ------------------------------------------------------------------------------------ reopening */

/** What Open project does with an exported ZIP: read it, then ingest through real persistence. */
export async function reopenArchive(key: string, as: string) {
	const result = results.get(key);
	if (!result) throw new Error(`No archive named ${key}.`);
	const persistence = new CampaignPersistence();
	const text = await projectTextFromFile(result.zip);
	const project = await persistence.importPortable(text);
	projects.set(as, project);
	return {
		version: project.version,
		targets: project.targets,
		frames: project.slides.length,
		assets: Object.keys(project.assets).length,
		layers: project.slides.flatMap((slide) =>
			Object.values(slide.variants ?? {}).flatMap((variant) =>
				(variant?.layers ?? []).map((layer) => ({ id: layer.id, kind: layer.kind }))
			)
		)
	};
}

/** Each frame's output hash, for comparing an export with the one made after reopening it. */
export function outputHashes(key: string): Record<string, string> {
	const result = results.get(key);
	if (!result) throw new Error(`No archive named ${key}.`);
	return Object.fromEntries(result.manifest.files.map((file) => [file.path, file.sha256]));
}

/** How far apart two renders of a frame are, by decoded pixels. `rows` says where. */
function pixelDifference(a: Uint8Array, b: Uint8Array, stride = 1) {
	if (a.length !== b.length) return { differing: Infinity, maxDelta: Infinity };
	let differing = 0;
	let maxDelta = 0;
	let top = -1;
	let bottom = -1;
	for (let at = 0; at < a.length; at++) {
		const delta = Math.abs(a[at] - b[at]);
		if (!delta) continue;
		differing++;
		if (delta > maxDelta) maxDelta = delta;
		const row = Math.floor(at / stride);
		if (top < 0) top = row;
		bottom = row;
	}
	return { differing, maxDelta, ...(differing ? { rows: [top, bottom] } : {}) };
}

/** One frame's two renders as a heat map, for looking at what a difference actually is. */
export async function differenceImage(firstKey: string, secondKey: string, path: string) {
	const first = results.get(firstKey);
	const second = results.get(secondKey);
	if (!first || !second) throw new Error('Both archives must exist.');
	const a = await decodePng((await readZipEntry(first.zip, path))!);
	const b = await decodePng((await readZipEntry(second.zip, path))!);
	const canvas = document.createElement('canvas');
	canvas.width = a.width;
	canvas.height = a.height;
	const ctx = canvas.getContext('2d')!;
	const image = ctx.createImageData(a.width, a.height);
	for (let at = 0, to = 0; at < a.pixels.length; at += 3, to += 4) {
		const delta =
			Math.abs(a.pixels[at] - b.pixels[at]) +
			Math.abs(a.pixels[at + 1] - b.pixels[at + 1]) +
			Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
		image.data[to] = Math.min(255, delta * 12);
		image.data[to + 1] = image.data[to + 2] = delta ? 0 : 40;
		image.data[to + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
	return canvas.toDataURL('image/png');
}

/**
 * How two archives' copies of each frame differ. Not file bytes: painting the same project twice in
 * one browser already moves text antialiasing by a level or so on a few hundred channels.
 */
export async function comparePixels(firstKey: string, secondKey: string) {
	const first = results.get(firstKey);
	const second = results.get(secondKey);
	if (!first || !second) throw new Error('Both archives must exist.');
	const comparisons = [];
	for (const file of first.manifest.files) {
		const other = await readZipEntry(second.zip, file.path);
		if (!other) {
			comparisons.push({ path: file.path, differing: Infinity, maxDelta: Infinity });
			continue;
		}
		const a = await decodePng((await readZipEntry(first.zip, file.path))!);
		const b = await decodePng(other);
		comparisons.push({ path: file.path, ...pixelDifference(a.pixels, b.pixels, a.width * 3) });
	}
	return {
		worst: comparisons.toSorted((x, y) => y.differing - x.differing).slice(0, 6),
		frames: comparisons.length,
		differingFrames: comparisons.filter((item) => item.differing > 0).length,
		maxDelta: Math.max(0, ...comparisons.map((item) => item.maxDelta)),
		maxChannels: Math.max(0, ...comparisons.map((item) => item.differing))
	};
}

/** The archive's listing, for labelling checks without leaving the page. */
export async function listing(key: string): Promise<string[]> {
	const result = results.get(key);
	if (!result) throw new Error(`No archive named ${key}.`);
	return (await readZipDirectory(result.zip)).map((entry) => entry.name);
}

/* ------------------------------------------------------------------------------------- legacy v1 */

/** The single-target path: real layers and bundled brand art, saved, reopened and repainted. */
export async function legacyRoundTrip(key: string, target: DeviceId) {
	const projected = projectForTarget(required(key), target);
	const composition: Composition = {
		...projected,
		slides: projected.slides.map((slide) => ({
			...slide,
			layers: [
				...(slide.layers ?? []),
				{
					id: 'mascot',
					kind: 'art' as const,
					image: BRAND_ART.billy,
					crop: { x: 100, y: 100, width: 400, height: 400 },
					x: 40,
					y: DEVICES[target].height - 460,
					scale: 1,
					sampling: 'pixelated' as const
				}
			]
		}))
	};
	const zip = await exportCampaign(composition);
	const portable = await portableComposition(composition);
	const reopened = parseProject(
		new TextDecoder().decode((await readZipEntry(zip, 'project.json'))!)
	);
	const countLayers = (document: Composition) =>
		document.slides.reduce((sum, slide) => sum + (slide.layers?.length ?? 0), 0);
	const before = await decodePng(await renderNormally(composition, 0));
	const after = await decodePng(await renderNormally(reopened, 0));
	const entries = (await readZipDirectory(zip)).map((entry) => entry.name);
	return {
		entries,
		colorTypes: await Promise.all(
			entries
				.filter((name) => name.endsWith('.png'))
				.map(async (name) => inspectPng((await readZipEntry(zip, name))!).colorType)
		),
		layersBefore: countLayers(composition),
		layersPortable: countLayers(portable),
		layersReopened: countLayers(reopened),
		allEmbedded: reopened.slides.every((slide) =>
			(slide.layers ?? []).every((layer) => layer.image.blobUrl.startsWith('data:'))
		),
		reopenedDifference: pixelDifference(before.pixels, after.pixels)
	};
}

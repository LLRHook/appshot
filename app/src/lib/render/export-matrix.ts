import { bytesFromDataUrl, dataUrlFromBytes, isBundledAsset, sha256Hex } from '../model/assets';
import { sniffImage, sourceCompatibility } from '../model/capture';
import type {
	AssetId,
	DeviceClassId,
	ExportManifest,
	ExportManifestFile,
	ExportMatrix,
	ExportMatrixOptions,
	Issue,
	Orientation,
	OutputTarget,
	PreflightOptions,
	ProjectAsset,
	ProjectV2,
	SourceBinding,
	TargetStatus
} from '../model/contracts';
import { DEVICES, isDeviceId, OUTPUT_TARGETS, SPEC_SOURCE, type DeviceId } from '../model/devices';
import { MAX_PORTABLE_PROJECT_BYTES } from '../model/limits';
import { linenPlainText } from '../model/linen';
import { serializePortableProject } from '../model/migrate';
import { projectForTarget } from '../model/targets';
import type { Composition } from '../model/types';
import { verifyOpaquePng } from './png';
import { ZipWriter } from './zip';

/**
 * The whole-campaign export: every frame of every selected output, through `projectForTarget` and
 * the one renderer, one at a time. Nothing in the archive is taken on trust. Each PNG is decoded
 * after encoding, and anything that fails is left out by name, with the set labelled partial.
 *
 * This module has no DOM in it. The browser's renderer, decoder and preflight arrive as an
 * `ExportRuntime`, so every failure path here can be tested with bytes rather than hoped about.
 */

/* ------------------------------------------------------------------------------- names and paths */

/** One portable path segment: ASCII, lowercase, and never empty. */
function slug(name: string, fallback: string): string {
	return (
		name
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-zA-Z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 70)
			.replace(/-+$/, '')
			.toLowerCase() || fallback
	);
}

export function safeFilename(name: string): string {
	return slug(name, 'campaign');
}

export const PROJECT_FILE = 'project.json';
export const MANIFEST_FILE = 'manifest.json';
export const README_FILE = 'README.txt';
export const PARTIAL_MARKER_FILE = 'PARTIAL-NOT-A-COMPLETE-SET.txt';
export const DRAFT_FOLDER = 'DRAFT-NOT-FOR-APP-STORE';
const DRAFT_PREFIX = 'DRAFT-';

/** `<class>/[<posture>-]<width>x<height>-<orientation>`, so the same size in two classes stays apart. */
export function targetFolder(target: OutputTarget): string {
	const posture = target.posture ? `${target.posture}-` : '';
	return `${target.classId}/${posture}${target.width}x${target.height}-${target.orientation}`;
}

export function framePath(
	target: OutputTarget,
	slide: { label?: string; typography: { headline: string } },
	slideIndex: number,
	scope: 'store' | 'draft'
): string {
	const firstLine = linenPlainText(slide.typography.headline).split('\n')[0];
	const name = slug(slide.label?.trim() || firstLine, 'frame');
	const stem = `${String(slideIndex + 1).padStart(2, '0')}-${name}-${target.width}x${target.height}.png`;
	return scope === 'draft'
		? `${DRAFT_FOLDER}/${targetFolder(target)}/${DRAFT_PREFIX}${stem}`
		: `${targetFolder(target)}/${stem}`;
}

/* -------------------------------------------------------------------------------------- manifest */

/**
 * - `meets-file-spec-and-store-checklist`: every declared frame, verified, with no blocking finding.
 *   It proves files and sizes. It does not prove native device UI, truthful claims or App Review.
 * - `draft-not-store-ready` and `partial-not-store-ready` say what they are.
 */
export type ExportReadiness =
	| 'meets-file-spec-and-store-checklist'
	| 'draft-not-store-ready'
	| 'partial-not-store-ready';

/** `unverified source` is what a report says when nothing records where a capture came from. */
export type SourceRecordStatus = 'recorded' | 'unverified source' | 'synthetic';

export interface ExportFileRecord extends ExportManifestFile {
	byteLength: number;
	/** Read back from the encoded file. */
	bitDepth: number;
	colorType: number;
	/** `null` when the frame has no capture. */
	sourceStatus: SourceRecordStatus | null;
	/** Every image layer drawn on this frame, so a callout's capture is traceable too. */
	layers: {
		id: string;
		kind: 'source-crop' | 'art';
		asset: AssetId;
		sha256?: string;
		sourceStatus: SourceRecordStatus;
	}[];
}

export interface ExportTargetSummary {
	target: DeviceId;
	label: string;
	classId: DeviceClassId;
	status: TargetStatus;
	width: number;
	height: number;
	orientation: Orientation;
	posture?: 'outer' | 'inner';
	folder: string;
	expected: number;
	written: number;
}

export interface MatrixManifest extends ExportManifest {
	files: ExportFileRecord[];
	scope: 'store' | 'draft';
	readiness: ExportReadiness;
	/** The same sentence the README opens with. */
	summary: string;
	/** Apple's page these sizes come from, and when it was read. */
	appleSpec: { url: string; accessed: string };
	targets: ExportTargetSummary[];
	/** Null when the editable project could not be written; an issue says why. */
	projectFile: { path: string; byteLength: number; sha256: string } | null;
	issues: Issue[];
}

export interface MatrixOptions extends ExportMatrixOptions {
	/**
	 * Supplies the editable project file. Pass `persistence.exportPortable` from the editor, which
	 * holds session bytes even after a URL has gone. Defaults to `portableProjectBlob`.
	 */
	portableProject?: (project: ProjectV2) => Promise<Blob>;
}

export type MatrixResult =
	| { status: 'blocked'; scope: 'store' | 'draft'; issues: Issue[] }
	| {
			status: 'complete' | 'partial';
			scope: 'store' | 'draft';
			zip: Blob;
			/** A download name that says what the archive is. */
			fileName: string;
			manifest: MatrixManifest;
			issues: Issue[];
	  };

export interface ExportRuntime {
	/** Paint one frame at its exact size through the one renderer and return the encoded bytes. */
	renderPng(composition: Composition, slideIndex: number): Promise<Uint8Array>;
	/** The platform's own decoder, as a second opinion on the size. */
	decodedSize?(bytes: Uint8Array<ArrayBuffer>): Promise<{ width: number; height: number }>;
	preflight(project: ProjectV2, options: PreflightOptions): Promise<Issue[]>;
	now(): Date;
	/** For tests of the archive limit. */
	maxZipBytes?: number;
}

/* --------------------------------------------------------------------------- the portable project */

async function assetBytes(asset: ProjectAsset): Promise<Uint8Array<ArrayBuffer>> {
	const label = asset.name ?? 'An image';
	if (asset.url.startsWith('data:')) return bytesFromDataUrl(asset.url).bytes;
	const response = await fetch(asset.url).catch(() => null);
	if (!response?.ok) throw new Error(`${label} is missing. Add it again to save the project.`);
	return new Uint8Array(await response.arrayBuffer());
}

/** Editable `project.json`: schema 2, every unique image embedded once, reopenable anywhere. */
export async function portableProjectBlob(project: ProjectV2): Promise<Blob> {
	const assets: Record<AssetId, ProjectAsset> = {};
	for (const asset of Object.values(project.assets)) {
		if (isBundledAsset(asset)) {
			assets[asset.id] = asset;
			continue;
		}
		const label = asset.name ?? 'An image';
		const bytes = await assetBytes(asset);
		const sniffed = sniffImage(bytes);
		if (!sniffed) throw new Error(`${label} is damaged. Add it again to save the project.`);
		const sha256 = await sha256Hex(bytes);
		if (asset.sha256 && asset.sha256 !== sha256)
			throw new Error(`${label} does not match its record. Add it again to save the project.`);
		assets[asset.id] = {
			...asset,
			mime: sniffed.mime,
			sha256,
			byteLength: bytes.byteLength,
			url: dataUrlFromBytes(bytes, sniffed.mime)
		};
	}
	const parts = serializePortableProject({ ...project, assets });
	if (parts.reduce((sum, part) => sum + part.length, 0) > MAX_PORTABLE_PROJECT_BYTES)
		throw new Error('The project file would be over 256 MB, so Appshot could not reopen it.');
	return new Blob(parts, { type: 'application/json' });
}

/* -------------------------------------------------------------------------------------- the frame */

const message = (error: unknown) =>
	error instanceof Error && error.message ? error.message : 'An unknown error occurred.';

function sourceStatusOf(asset: ProjectAsset): SourceRecordStatus {
	if (asset.provenance?.synthetic) return 'synthetic';
	return asset.provenance?.device && asset.provenance.os ? 'recorded' : 'unverified source';
}

/** The asset and binding this frame actually shows on this output, as `projectForTarget` chose. */
function frameBinding(
	project: ProjectV2,
	composition: Composition,
	slideIndex: number,
	targetId: DeviceId
): { assetId?: AssetId; binding?: SourceBinding } {
	const slide = composition.slides[slideIndex];
	const { panorama } = composition;
	if (
		composition.continuityMode === 'paired' &&
		panorama &&
		(panorama.leftId === slide.id || panorama.rightId === slide.id)
	)
		return {
			assetId: panorama.image.id,
			binding: project.panorama?.variants?.[targetId]?.source
		};
	return {
		assetId: slide.primaryImage?.id,
		binding: project.slides[slideIndex].variants?.[targetId]?.source
	};
}

type AssetHashes = ReadonlyMap<AssetId, string>;

/** Hash whatever a migrated project never did. An image that cannot be read just reports none. */
async function assetHashes(project: ProjectV2): Promise<AssetHashes> {
	const hashes = new Map<AssetId, string>();
	for (const asset of Object.values(project.assets)) {
		if (asset.sha256) {
			hashes.set(asset.id, asset.sha256);
			continue;
		}
		try {
			hashes.set(asset.id, await sha256Hex(await assetBytes(asset)));
		} catch {
			// The frame that needs this image will report it.
		}
	}
	return hashes;
}

function sourceRecord(
	project: ProjectV2,
	composition: Composition,
	slideIndex: number,
	target: OutputTarget,
	hashes: AssetHashes
): Pick<ExportFileRecord, 'source' | 'sourceStatus'> {
	const { assetId, binding } = frameBinding(project, composition, slideIndex, target.id);
	if (assetId === undefined || !Object.hasOwn(project.assets, assetId))
		return { source: null, sourceStatus: null };
	const asset = project.assets[assetId];
	const sha256 = hashes.get(assetId);
	return {
		source: {
			asset: assetId,
			...(sha256 ? { sha256 } : {}),
			compatibility: sourceCompatibility(asset, target).level,
			...(binding?.nonNative ? { nonNative: binding.nonNative } : {}),
			...(asset.provenance ? { provenance: asset.provenance } : {})
		},
		sourceStatus: sourceStatusOf(asset)
	};
}

function layerRecords(
	project: ProjectV2,
	composition: Composition,
	slideIndex: number,
	hashes: AssetHashes
): ExportFileRecord['layers'] {
	return (composition.slides[slideIndex].layers ?? []).flatMap((layer) => {
		const asset = project.assets[layer.image.id];
		if (!asset) return [];
		const sha256 = hashes.get(asset.id);
		return [
			{
				id: layer.id,
				kind: layer.kind,
				asset: asset.id,
				...(sha256 ? { sha256 } : {}),
				sourceStatus: sourceStatusOf(asset)
			}
		];
	});
}

/** Every step a frame must pass to reach the archive. Any failure throws a reason. */
async function encodeFrame(
	runtime: ExportRuntime,
	composition: Composition,
	slideIndex: number,
	target: OutputTarget,
	signal?: AbortSignal
) {
	const encoded = await runtime.renderPng(composition, slideIndex);
	signal?.throwIfAborted();
	const verified = await verifyOpaquePng(encoded, target);
	signal?.throwIfAborted();
	const decoded = await runtime.decodedSize?.(verified.bytes);
	if (decoded && (decoded.width !== target.width || decoded.height !== target.height))
		throw new Error(
			`The browser decodes it as ${decoded.width} × ${decoded.height} pixels, not ${target.width} × ${target.height}.`
		);
	return { verified, sha256: await sha256Hex(verified.bytes) };
}

/* --------------------------------------------------------------------------------------- reports */

function summaryLine(readiness: ExportReadiness, omitted: number): string {
	switch (readiness) {
		case 'meets-file-spec-and-store-checklist':
			return 'Complete: every frame meets the file spec and Appshot store checklist. This proves files and sizes, not native device UI, truthful claims or App Review.';
		case 'draft-not-store-ready':
			return omitted
				? `DRAFT and PARTIAL, not for the App Store: ${omitted} frame${omitted === 1 ? ' is' : 's are'} left out, and blocking findings may remain.`
				: 'DRAFT, not for the App Store: blocking findings may remain. Use it to review layout only.';
		case 'partial-not-store-ready':
			return `PARTIAL, not a complete store set: ${omitted} frame${omitted === 1 ? ' is' : 's are'} left out.`;
	}
}

function omissionLines(manifest: MatrixManifest): string[] {
	return manifest.omitted.map(
		(item) => `- ${DEVICES[item.target].label}, frame ${item.slideIndex + 1}: ${item.reason}`
	);
}

function readmeText(manifest: MatrixManifest): string {
	const lines = [
		`Appshot export: ${manifest.project}`,
		'',
		manifest.summary,
		'',
		`Created: ${manifest.createdAt}`,
		`Apple's screenshot specification, read ${manifest.appleSpec.accessed}: ${manifest.appleSpec.url}`,
		'',
		'Outputs',
		...manifest.targets.map(
			(item) =>
				`- ${item.label}, ${item.width} x ${item.height} (${item.status}): ${item.written} of ${item.expected} frames in ${manifest.scope === 'draft' ? `${DRAFT_FOLDER}/` : ''}${item.folder}/`
		),
		'',
		'What was checked',
		'Each PNG was decoded after it was encoded: exact pixel size, 8-bit RGB, no alpha channel.',
		'Sizes prove size only. Appshot cannot prove a capture shows native device UI, or that App Review will accept it.',
		`${MANIFEST_FILE} lists each file's hash, source, source hash, provenance and every finding.`,
		'A source with no recorded device reads "unverified source" there.'
	];
	if (manifest.omitted.length) lines.push('', 'Left out', ...omissionLines(manifest));
	lines.push(
		'',
		'To keep editing',
		manifest.projectFile
			? `Unzip this archive and choose ${PROJECT_FILE} with Open project in Appshot. It holds every source image.`
			: `${PROJECT_FILE} could not be written; see ${MANIFEST_FILE}. Keep your project file from Appshot.`,
		''
	);
	return lines.join('\n');
}

function downloadName(manifest: MatrixManifest): string {
	const labels = [
		manifest.scope === 'draft' ? 'DRAFT' : '',
		manifest.partial ? 'PARTIAL' : ''
	].filter(Boolean);
	return `${safeFilename(manifest.project)}-${[...labels, 'app-store-set'].join('-')}.zip`;
}

/* ----------------------------------------------------------------------------------------- export */

/** The catalog's order, whatever order a campaign or a selection lists its outputs in. */
function orderedTargets(ids: readonly DeviceId[]): OutputTarget[] {
	const wanted = new Set(ids);
	return OUTPUT_TARGETS.filter((target) => wanted.has(target.id));
}

/** Room kept in the archive for the manifest and README, which are written last. */
const REPORT_RESERVE_BYTES = 16 * 1024 * 1024;

const encoder = new TextEncoder();

export function createExportMatrix(runtime: ExportRuntime) {
	/** See `ExportMatrix` in `contracts.ts`. Rejects with the signal's reason when cancelled. */
	return async function exportMatrix(
		project: ProjectV2,
		options: MatrixOptions = {}
	): Promise<MatrixResult> {
		const { signal, onProgress } = options;
		const scope = options.scope ?? 'store';
		signal?.throwIfAborted();

		const selectedIds = [...(options.targets ?? project.targets)];
		const issues = [...(await runtime.preflight(project, { targets: selectedIds, signal }))];
		signal?.throwIfAborted();
		if (scope === 'store' && issues.some((issue) => issue.severity === 'block'))
			return { status: 'blocked', scope, issues };

		const targets = orderedTargets(
			selectedIds.filter((id) => isDeviceId(id) && project.targets.includes(id))
		);
		if (!targets.length || !project.slides.length) {
			return { status: 'blocked', scope, issues };
		}

		const zip = new ZipWriter(
			runtime.maxZipBytes !== undefined ? { maxBytes: runtime.maxZipBytes } : {}
		);

		let projectFile: MatrixManifest['projectFile'] = null;
		try {
			const blob = await (options.portableProject ?? portableProjectBlob)(project);
			signal?.throwIfAborted();
			await zip.addBlob(PROJECT_FILE, blob, REPORT_RESERVE_BYTES);
			projectFile = {
				path: PROJECT_FILE,
				byteLength: blob.size,
				sha256: await sha256Hex(await blob.arrayBuffer())
			};
		} catch (error) {
			signal?.throwIfAborted();
			issues.push({
				severity: 'block',
				code: 'project-file-omitted',
				message: `The editable ${PROJECT_FILE} is not in this export: ${message(error)}`
			});
		}

		const hashes = await assetHashes(project);
		signal?.throwIfAborted();
		const files: ExportFileRecord[] = [];
		const omitted: ExportManifest['omitted'] = [];
		const summaries: ExportTargetSummary[] = [];
		const total = targets.length * project.slides.length;
		let done = 0;

		// A draft may paint what a store export refuses, but a frame with no capture would only
		// show the editor's placeholder, so it is reported as left out rather than shipped.
		const unpaintable = (target: DeviceId, slideIndex: number) =>
			issues.find(
				(issue) =>
					(issue.code === 'missing-source' || issue.code === 'missing-asset') &&
					issue.target === target &&
					issue.slideIndex === slideIndex
			);

		for (const target of targets) {
			let composition: Composition | undefined;
			let projectionError: unknown;
			try {
				composition = projectForTarget(project, target.id);
			} catch (error) {
				projectionError = error;
			}
			let written = 0;
			for (let slideIndex = 0; slideIndex < project.slides.length; slideIndex++) {
				signal?.throwIfAborted();
				const slide = project.slides[slideIndex];
				const path = framePath(target, slide, slideIndex, scope);
				const where = `${target.label} ${target.width} × ${target.height}, frame ${slideIndex + 1} (${path})`;
				try {
					const skipped = unpaintable(target.id, slideIndex);
					if (skipped) throw new Error(skipped.message);
					if (!composition) throw projectionError;
					const { verified, sha256 } = await encodeFrame(
						runtime,
						composition,
						slideIndex,
						target,
						signal
					);
					signal?.throwIfAborted();
					zip.add(path, verified.bytes, REPORT_RESERVE_BYTES);
					files.push({
						path,
						target: target.id,
						classId: target.classId,
						width: verified.width,
						height: verified.height,
						bitDepth: verified.bitDepth,
						colorType: verified.colorType,
						byteLength: verified.bytes.length,
						slideId: slide.id,
						slideIndex,
						sha256,
						...sourceRecord(project, composition, slideIndex, target, hashes),
						layers: layerRecords(project, composition, slideIndex, hashes)
					});
					written++;
				} catch (error) {
					signal?.throwIfAborted();
					const reason = message(error);
					omitted.push({ target: target.id, slideIndex, reason: `${path}: ${reason}` });
					if (!unpaintable(target.id, slideIndex))
						issues.push({
							severity: 'block',
							code: 'frame-failed',
							message: `${where} could not be exported: ${reason}`,
							target: target.id,
							slideIndex
						});
				}
				done++;
				onProgress?.({ done, total, target: target.id, slideIndex });
			}
			summaries.push({
				target: target.id,
				label: target.label,
				classId: target.classId,
				status: target.status,
				width: target.width,
				height: target.height,
				orientation: target.orientation,
				...(target.posture ? { posture: target.posture } : {}),
				folder: targetFolder(target),
				expected: project.slides.length,
				written
			});
		}

		signal?.throwIfAborted();
		if (!files.length) return { status: 'blocked', scope, issues };

		// Declared outputs the selection left out make this a part of the set, never the whole.
		for (const target of orderedTargets(project.targets)) {
			if (targets.includes(target)) continue;
			project.slides.forEach((slide, slideIndex) =>
				omitted.push({
					target: target.id,
					slideIndex,
					reason: `${framePath(target, slide, slideIndex, scope)}: not selected for this export.`
				})
			);
		}

		const partial = omitted.length > 0 || !projectFile;
		const readiness: ExportReadiness =
			scope === 'draft'
				? 'draft-not-store-ready'
				: partial
					? 'partial-not-store-ready'
					: 'meets-file-spec-and-store-checklist';
		const manifest: MatrixManifest = {
			schema: 1,
			tool: 'appshot',
			createdAt: runtime.now().toISOString(),
			project: project.name,
			partial,
			scope,
			readiness,
			summary: summaryLine(readiness, omitted.length),
			appleSpec: { url: SPEC_SOURCE.url, accessed: SPEC_SOURCE.accessed },
			targets: summaries,
			projectFile,
			files,
			omitted,
			issues
		};
		zip.add(MANIFEST_FILE, encoder.encode(JSON.stringify(manifest, null, '\t')));
		zip.add(README_FILE, encoder.encode(readmeText(manifest)));
		if (partial)
			zip.add(
				PARTIAL_MARKER_FILE,
				encoder.encode(
					[manifest.summary, '', ...omissionLines(manifest), ''].join('\n') +
						(projectFile ? '' : `\n${PROJECT_FILE} could not be written.\n`)
				)
			);

		signal?.throwIfAborted();
		return {
			status: partial ? 'partial' : 'complete',
			scope,
			zip: zip.finish(),
			fileName: downloadName(manifest),
			manifest,
			issues
		};
	} satisfies ExportMatrix;
}

import { dataUrlFromBytes } from '../model/assets';
import { sniffImage } from '../model/capture';
import { DEVICES } from '../model/devices';
import { parseProject } from '../model/project';
import type { Composition, ImageRef } from '../model/types';
import { renderSlide } from './canvas';
import {
	createExportMatrix,
	PROJECT_FILE,
	safeFilename,
	type ExportRuntime
} from './export-matrix';
import { verifyOpaquePng } from './png';
import { preflight } from './preflight';
import { isZipFile, readZipEntry, ZipWriter } from './zip';

export { safeFilename };

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		try {
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(
								new Error(
									'The browser could not encode this PNG. Try exporting one screenshot at a time.'
								)
							),
				'image/png'
			);
		} catch {
			reject(
				new Error(
					'A screenshot cannot be exported. Re-upload images from your computer to allow local export.'
				)
			);
		}
	});
}

/** Paint one frame at its exact size through the one renderer, and encode it. */
async function renderPng(composition: Composition, index: number): Promise<Uint8Array> {
	const canvas = document.createElement('canvas');
	try {
		await renderSlide(canvas, composition, index);
		return new Uint8Array(await (await canvasToPng(canvas)).arrayBuffer());
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

/** One frame's final file, decoded to prove it is what it should be. Failures name the frame. */
async function verifiedFrame(composition: Composition, index: number) {
	const encoded = await renderPng(composition, index);
	try {
		return await verifyOpaquePng(encoded, DEVICES[composition.device]);
	} catch (error) {
		throw new Error(
			`Frame ${index + 1} could not be exported. ${error instanceof Error ? error.message : ''}`.trim(),
			{ cause: error }
		);
	}
}

export async function exportSlide(composition: Composition, index: number): Promise<Blob> {
	const { bytes } = await verifiedFrame(composition, index);
	return new Blob([bytes], { type: 'image/png' });
}

const MISSING_ORIGINAL =
	'An original screenshot is missing. Add it again to save the complete project.';

/** Fetch an image once, however many frames and layers use it, as a data URL of its real format. */
async function embeddedImage(url: string): Promise<string> {
	const response = await fetch(url).catch(() => null);
	if (!response?.ok) throw new Error(MISSING_ORIGINAL);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const sniffed = sniffImage(bytes);
	if (!sniffed) throw new Error('A screenshot could not be saved into the project.');
	return dataUrlFromBytes(bytes, sniffed.mime);
}

/** Resolve local blob/static URLs so the project can reopen on another computer. */
export async function portableComposition(composition: Composition): Promise<Composition> {
	const copy = structuredClone(composition);
	const converted = new Map<string, Promise<string>>();
	async function embed(image?: ImageRef) {
		if (!image || image.blobUrl.startsWith('data:')) return;
		let pending = converted.get(image.blobUrl);
		if (!pending) {
			pending = embeddedImage(image.blobUrl);
			converted.set(image.blobUrl, pending);
		}
		image.blobUrl = await pending;
	}
	await Promise.all(
		copy.slides
			.flatMap((slide) => [
				embed(slide.primaryImage),
				embed(slide.continuity.incoming),
				embed(slide.continuity.outgoing),
				...(slide.layers ?? []).map((layer) => embed(layer.image))
			])
			.concat(embed(copy.panorama?.image))
	);
	return parseProject(JSON.stringify(copy));
}

/** Actual PNG files at device resolution, plus a self-contained editable project. */
export async function exportCampaign(
	composition: Composition,
	onProgress?: (done: number, total: number) => void
): Promise<Blob> {
	if (!composition.slides.length) throw new Error('Add a screenshot before exporting.');
	const zip = new ZipWriter();
	const { width, height } = DEVICES[composition.device];
	onProgress?.(0, composition.slides.length);
	for (let index = 0; index < composition.slides.length; index++) {
		const { bytes } = await verifiedFrame(composition, index);
		zip.add(
			`${String(index + 1).padStart(2, '0')}-${safeFilename(composition.slides[index].label || composition.name)}-${width}x${height}.png`,
			bytes
		);
		onProgress?.(index + 1, composition.slides.length);
	}
	zip.add(
		PROJECT_FILE,
		new TextEncoder().encode(JSON.stringify(await portableComposition(composition)))
	);
	return zip.finish();
}

/** Presentation contact sheet; individual App Store PNGs remain available in the ZIP. */
export async function exportContactSheet(composition: Composition): Promise<Blob> {
	if (!composition.slides.length)
		throw new Error('Add a screenshot before making a contact sheet.');
	const previewWidth = 440;
	const { width, height } = DEVICES[composition.device];
	const previewHeight = Math.round((previewWidth * height) / width);
	const padding = 72;
	const gap = 24;
	const maxColumns = 5;
	const columns = Math.min(maxColumns, composition.slides.length);
	const rows = Math.ceil(composition.slides.length / columns);
	const canvas = document.createElement('canvas');
	canvas.width = padding * 2 + columns * previewWidth + (columns - 1) * gap;
	canvas.height = 160 + rows * (previewHeight + 60) + padding;
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) throw new Error('Your browser could not create a drawing canvas.');
	ctx.fillStyle = '#f2f1ed';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	await document.fonts.load('600 38px "DM Sans"');
	ctx.fillStyle = '#252622';
	ctx.font = '600 38px "DM Sans", Arial, sans-serif';
	ctx.fillText(composition.name || 'Campaign', padding, 83);
	ctx.fillStyle = '#777973';
	ctx.font = '400 19px "DM Sans", Arial, sans-serif';
	ctx.textAlign = 'right';
	ctx.fillText(
		`${composition.slides.length} screenshots  ·  ${width} × ${height} px`,
		canvas.width - padding,
		81
	);
	ctx.textAlign = 'left';
	const preview = document.createElement('canvas');
	try {
		for (let index = 0; index < composition.slides.length; index++) {
			await renderSlide(preview, composition, index, { width: previewWidth });
			const column = index % columns;
			const row = Math.floor(index / columns);
			const x = padding + column * (previewWidth + gap);
			const y = 140 + row * (previewHeight + 60);
			ctx.drawImage(preview, x, y);
			ctx.fillStyle = '#777973';
			ctx.font = '400 16px "DM Sans", Arial, sans-serif';
			ctx.fillText(
				`${String(index + 1).padStart(2, '0')}  ${composition.slides[index].label || 'Screenshot'}`,
				x,
				y + previewHeight + 28,
				previewWidth
			);
		}
		return await canvasToPng(canvas);
	} finally {
		preview.width = 0;
		preview.height = 0;
		canvas.width = 0;
		canvas.height = 0;
	}
}

/** What the browser's own decoder makes of a finished file. */
async function decodedSize(bytes: Uint8Array<ArrayBuffer>) {
	const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
	try {
		return { width: bitmap.width, height: bitmap.height };
	} finally {
		bitmap.close();
	}
}

const browserRuntime: ExportRuntime = {
	renderPng,
	decodedSize,
	preflight,
	now: () => new Date()
};

/**
 * Every frame of every output: class folders, a manifest and an editable project in one ZIP. A
 * `store` export of a campaign with blocking findings returns `blocked` before anything is painted.
 * See `createExportMatrix`.
 */
export const exportMatrix = createExportMatrix(browserRuntime);

/**
 * The text of a project file from whatever Open project was given: `.appshot.json`, a `project.json`
 * or a whole exported ZIP. Feed the result to `CampaignPersistence.importPortable`.
 */
export async function projectTextFromFile(file: Blob): Promise<string> {
	if (!(await isZipFile(file))) return file.text();
	const bytes = await readZipEntry(file, PROJECT_FILE);
	if (!bytes)
		throw new Error(
			`This ZIP has no ${PROJECT_FILE}, so it cannot be opened. Export again, or open the project file itself.`
		);
	return new TextDecoder().decode(bytes);
}

import type { Composition, ImageRef } from '../model/types';
import { parseProject } from '../model/project';
import { DEVICES } from '../model/devices';
import { renderSlide } from './canvas';
import { createZip, type ZipEntry } from './zip';

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

export async function exportSlide(composition: Composition, index: number): Promise<Blob> {
	const canvas = document.createElement('canvas');
	try {
		await renderSlide(canvas, composition, index);
		return await canvasToPng(canvas);
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('A screenshot could not be saved into the project.'));
		reader.readAsDataURL(blob);
	});
}

/** Resolve local blob/static URLs so the project can reopen on another computer. */
export async function portableComposition(composition: Composition): Promise<Composition> {
	const copy = structuredClone(composition);
	const converted = new Map<string, Promise<string>>();
	async function embed(image?: ImageRef) {
		if (!image || image.blobUrl.startsWith('data:')) return;
		let pending = converted.get(image.blobUrl);
		if (!pending) {
			pending = fetch(image.blobUrl).then(async (response) => {
				if (!response.ok)
					throw new Error(
						'An original screenshot is missing. Add it again to save the complete project.'
					);
				return blobToDataUrl(await response.blob());
			});
			converted.set(image.blobUrl, pending);
		}
		image.blobUrl = await pending;
	}
	await Promise.all(
		copy.slides
			.flatMap((slide) => [
				embed(slide.primaryImage),
				embed(slide.continuity.incoming),
				embed(slide.continuity.outgoing)
			])
			.concat(embed(copy.panorama?.image))
	);
	return parseProject(JSON.stringify(copy));
}

export function safeFilename(name: string): string {
	return (
		name
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 70)
			.toLowerCase() || 'campaign'
	);
}

/** Actual PNG files at device resolution, plus a self-contained editable project. */
export async function exportCampaign(
	composition: Composition,
	onProgress?: (done: number, total: number) => void
): Promise<Blob> {
	if (!composition.slides.length) throw new Error('Add a screenshot before exporting.');
	const entries: ZipEntry[] = [];
	const { width, height } = DEVICES[composition.device];
	onProgress?.(0, composition.slides.length);
	for (let index = 0; index < composition.slides.length; index++) {
		const blob = await exportSlide(composition, index);
		entries.push({
			name: `${String(index + 1).padStart(2, '0')}-${safeFilename(composition.slides[index].label || composition.name)}-${width}x${height}.png`,
			data: new Uint8Array(await blob.arrayBuffer())
		});
		onProgress?.(index + 1, composition.slides.length);
	}
	entries.push({
		name: 'project.json',
		data: new TextEncoder().encode(JSON.stringify(await portableComposition(composition)))
	});
	const zip = createZip(entries);
	return new Blob([zip.buffer], { type: 'application/zip' });
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

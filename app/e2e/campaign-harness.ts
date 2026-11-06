// Bundled in memory by campaign-persistence.e2e.ts; never shipped in the app.
import { readCaptures, sourceCompatibility } from '../src/lib/model/capture';
import { DEVICES } from '../src/lib/model/devices';
import type { ProjectV2 } from '../src/lib/model/contracts';
import { createDemoProjectV2 } from '../src/lib/model/migrate';
import { normalizeProjectV2 } from '../src/lib/model/targets';
import {
	CAMPAIGN_HISTORY_LIMIT,
	CampaignPersistence
} from '../src/lib/editor/campaign-persistence';
import { EditorStore } from '../src/lib/editor/store.svelte';

export * from '../src/lib/model/edits';
export * from '../src/lib/model/migrate';
export * from '../src/lib/editor/campaign-persistence';
export { projectForTarget } from '../src/lib/model/targets';
export { loadProject, parseProject, saveProject } from '../src/lib/model/project';
export { createDemo, createBlank } from '../src/lib/model/studio';
export { renderSlide } from '../src/lib/render/canvas';
export { createPreflight } from '../src/lib/render/preflight';
export { readCaptures, sourceCompatibility, DEVICES, EditorStore };

/** The real wiring a studio uses: one store, one adapter, real IndexedDB and timers. */
export function startStudio(initial: ProjectV2 = createDemoProjectV2()) {
	const persistence = new CampaignPersistence();
	const failures: unknown[] = [];
	const store = new EditorStore<ProjectV2>({
		initial,
		persistence,
		normalize: normalizeProjectV2,
		historyLimit: CAMPAIGN_HISTORY_LIMIT,
		onSaveFailed: (error) => failures.push(error)
	});
	return { persistence, store, failures };
}

export const editFirstHeadline = (project: ProjectV2, headline: string): ProjectV2 => ({
	...project,
	slides: project.slides.map((slide, index) =>
		index === 0 ? { ...slide, typography: { ...slide.typography, headline } } : slide
	)
});

/** A real encoded image from a real canvas, unique per seed. */
export function canvasFile(
	name: string,
	width: number,
	height: number,
	seed: number,
	mime: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.fillStyle = `rgb(${(seed * 40) % 255}, ${(seed * 90) % 255}, ${(seed * 160) % 255})`;
	context.fillRect(0, 0, width, height);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error()),
			mime
		)
	);
}

/** Incompressible pixels, so a PNG reaches a realistic worst-case file size. */
export function noiseFile(name: string, side: number, seed: number): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = side;
	const context = canvas.getContext('2d', { alpha: false })!;
	const pixels = context.createImageData(side, side);
	let state = seed * 2654435761 + 1;
	for (let index = 0; index < pixels.data.length; index += 4) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		pixels.data[index] = state & 255;
		pixels.data[index + 1] = (state >> 8) & 255;
		pixels.data[index + 2] = (state >> 16) & 255;
		pixels.data[index + 3] = 255;
	}
	context.putImageData(pixels, 0, 0);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error()),
			'image/png'
		)
	);
}

/** Read storage directly, as a test's independent view of what is really there. */
export async function readStored() {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open('appshot-campaigns', 1);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	const all = (name: string) =>
		new Promise<unknown[]>((resolve, reject) => {
			const request = db.transaction(name).objectStore(name).getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	const [campaigns, assets, quarantine] = await Promise.all([
		all('campaigns'),
		all('assets'),
		all('quarantine')
	]);
	db.close();
	return {
		campaigns: campaigns as { id: string; revision: number; title: string; document: string }[],
		assets: assets as { sha256: string; byteLength: number; mime: string }[],
		quarantine: quarantine as { id: string; raw: unknown; reason: string }[]
	};
}

/** Write a raw record, standing in for damage or a newer build. */
export async function seedCampaign(id: string, document: string, title = 'Seeded') {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open('appshot-campaigns', 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore('campaigns', { keyPath: 'id' });
			request.result.createObjectStore('assets', { keyPath: 'sha256' });
			request.result.createObjectStore('quarantine', { keyPath: 'id' });
			request.result.createObjectStore('meta');
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(['campaigns', 'meta'], 'readwrite');
		transaction.objectStore('campaigns').put({
			id,
			schema: 2,
			revision: 7,
			updatedAt: Date.now(),
			lastWriter: { instance: 'seed', seq: 1 },
			title,
			frames: 1,
			targets: 1,
			document
		});
		transaction.objectStore('meta').put(id, 'active');
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
	db.close();
}

/** Write the old single-slot autosave exactly as an older build would have, damaged or not. */
export async function seedLegacyAutosave(raw: unknown) {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open('appshot-studio', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('projects');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction('projects', 'readwrite');
		transaction.objectStore('projects').put(raw, 'appshot-studio-project-v1');
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
	db.close();
}

export async function readLegacyRaw(): Promise<unknown> {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open('appshot-studio', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('projects');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	const value = await new Promise((resolve, reject) => {
		const request = db
			.transaction('projects')
			.objectStore('projects')
			.get('appshot-studio-project-v1');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	db.close();
	return value;
}

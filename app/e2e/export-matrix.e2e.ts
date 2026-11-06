import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { verifyArchive } from '../scripts/verify-export.mjs';
import type * as Harness from './export-harness';

/**
 * Export through the real renderer, encoder and persistence in a real browser. Each archive is
 * then checked by `verifyArchive`, which shares no code with what it checks. Captures are synthetic
 * but have a real alpha channel. `scripts/verify-export.mjs run` repeats this outside the test runner
 * and can add a real project file.
 */

declare global {
	interface Window {
		ExportHarness: typeof Harness;
	}
}

const REQUIRED = ['iphone-di-medium-1206x2622', 'iphone-6.9', 'ipad-13'] as const;
const DUO = ['iphone-duo-outer-1398x2034', 'iphone-duo-inner-2007x2853'] as const;

let harness: string;
let folder: string;

test.beforeAll(async () => {
	const bundle = await build({
		configFile: false,
		logLevel: 'silent',
		resolve: { alias: { $lib: path.resolve('src/lib') } },
		build: {
			write: false,
			lib: {
				entry: path.resolve('e2e/export-harness.ts'),
				name: 'ExportHarness',
				formats: ['iife']
			}
		}
	});
	const result = Array.isArray(bundle) ? bundle[0] : bundle;
	if (!('output' in result)) throw new Error('Could not build the export harness.');
	const chunk = result.output.find((entry) => entry.type === 'chunk');
	if (!chunk) throw new Error('The export harness produced no JavaScript.');
	harness = chunk.code;
	folder = await mkdtemp(path.join(tmpdir(), 'appshot-export-'));
});

test.afterAll(async () => {
	await rm(folder, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
	// A bare page on the app's origin: its fonts and art are reachable, and a dev server's reload is not.
	await page.route('**/export-check', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Export check</title>' })
	);
	await page.goto('/export-check');
	await page.addScriptTag({ content: harness });
});

async function archive(page: Page, key: string, expected: 'complete' | 'partial' | 'draft') {
	const pending = page.waitForEvent('download');
	await page.evaluate((name) => window.ExportHarness.downloadResult(name), key);
	const download = await pending;
	const file = path.join(folder, `${key}-${download.suggestedFilename()}`);
	await download.saveAs(file);
	const report = await verifyArchive(file, expected);
	expect(report.problems).toEqual([]);
	return { ...report, fileName: download.suggestedFilename() };
}

test('a store export turns RGBA captures into verified RGB files of the exact sizes', async ({
	page
}) => {
	const result = await page.evaluate(async (targets) => {
		const { prepareSynthetic, runExport } = window.ExportHarness;
		await prepareSynthetic('store', {
			targets: [...targets],
			frames: 2,
			synthetic: false,
			withLayers: true
		});
		return runExport('store');
	}, REQUIRED);
	expect(result.status).toBe('complete');
	const report = await archive(page, 'store', 'complete');
	expect(report).toMatchObject({
		pngs: 6,
		colorTypes: [2],
		bitDepths: [8],
		partial: false,
		readiness: 'meets-file-spec-and-store-checklist',
		projectVersion: 2
	});
	expect(report.sizes.sort()).toEqual(['1206x2622', '1320x2868', '2064x2752']);
});

test('a synthetic Duo is refused for the store and plainly a draft otherwise', async ({ page }) => {
	const result = await page.evaluate(
		async (targets) => {
			const { prepareSynthetic, runExport } = window.ExportHarness;
			await prepareSynthetic('duo', { targets: [...targets], frames: 1 });
			return { store: await runExport('duo'), draft: await runExport('duo', { scope: 'draft' }) };
		},
		[...REQUIRED, ...DUO]
	);
	expect(result.store.status).toBe('blocked');
	const refused = result.store.issues.filter((issue) => issue.code === 'synthetic-source');
	expect(refused.map((issue) => issue.target).sort()).toEqual([...REQUIRED, ...DUO].sort());
	expect(result.draft.status).toBe('complete');
	const report = await archive(page, 'duo', 'draft');
	expect(report.readiness).toBe('draft-not-store-ready');
	expect(report.fileName).toContain('DRAFT');
	expect(report.sizes).toContain('1398x2034');
	expect(report.sizes).toContain('2007x2853');
});

test('a failed frame leaves a labelled partial archive that still reopens, layers and all', async ({
	page
}) => {
	const result = await page.evaluate(async (targets) => {
		const { prepareSynthetic, damagedFrames, reopenArchive } = window.ExportHarness;
		await prepareSynthetic('partial', {
			targets: [...targets],
			frames: 2,
			synthetic: false,
			withLayers: true
		});
		const damaged = await damagedFrames('partial', 'partial');
		return { damaged, reopened: await reopenArchive('partial', 'partial-reopened') };
	}, REQUIRED);
	expect(result.damaged.status).toBe('partial');
	const omitted = 'manifest' in result.damaged ? result.damaged.manifest.omitted : [];
	expect(omitted.map((item) => item.reason)).toEqual([
		expect.stringMatching(/iphone-di-large\/.*01-frame-1-1320x2868\.png: The file is cut off/),
		expect.stringMatching(/iphone-di-large\/.*02-frame-2-1320x2868\.png: It is not a PNG/),
		expect.stringMatching(
			/iphone-di-medium\/.*01-frame-1-1206x2622\.png: Its IDAT chunk is damaged/
		)
	]);
	const report = await archive(page, 'partial', 'partial');
	expect(report.fileName).toContain('PARTIAL');
	expect(report.pngs).toBe(3);
	expect(result.reopened).toMatchObject({ version: 2, frames: 2 });
	expect(result.reopened.layers).toHaveLength(6);
});

test('a project reopened from its ZIP paints the same frames', async ({ page }) => {
	const difference = await page.evaluate(async (targets) => {
		const { prepareSynthetic, runExport, reopenArchive, comparePixels } = window.ExportHarness;
		await prepareSynthetic('first', {
			targets: [...targets],
			frames: 1,
			synthetic: false,
			withLayers: true
		});
		await runExport('first');
		await reopenArchive('first', 'second');
		await runExport('second');
		return comparePixels('first', 'second');
	}, REQUIRED);
	expect(difference.frames).toBe(3);
	// Painting twice in one browser can move text antialiasing by a level; a lost layer cannot hide.
	expect(difference.maxDelta).toBeLessThanOrEqual(3);
	expect(difference.maxChannels).toBeLessThanOrEqual(2000);
});

test('opaque RGBA from a real encoder becomes real RGB with the same pixels', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { prepareSynthetic, rgbaEncoderRoundTrip } = window.ExportHarness;
		await prepareSynthetic('rgba', { targets: ['iphone-6.9'], frames: 1, withLayers: true });
		return rgbaEncoderRoundTrip('rgba');
	});
	expect(result.browserColorTypes).toEqual([6]);
	expect(result.comparisons).toEqual([expect.objectContaining({ colorType: 2, samePixels: true })]);
	await archive(page, 'rgba-rgba', 'draft');
});

test('cancelling stops the render, and the next export is unaffected', async ({ page }) => {
	const result = await page.evaluate(async (targets) => {
		const { prepareSynthetic, cancelledExport, runExport } = window.ExportHarness;
		await prepareSynthetic('cancel', { targets: [...targets], frames: 2, synthetic: false });
		const cancelled = await cancelledExport('cancel', 2);
		const next = await runExport('cancel');
		return { cancelled, next: next.status };
	}, REQUIRED);
	expect(result.cancelled).toEqual({ outcome: 'AbortError', rendered: 2, progressCalls: 2 });
	expect(result.next).toBe('complete');
});

test('preflight reports a real painter refusal before any full-size render', async ({ page }) => {
	const result = await page.evaluate(async (targets) => {
		const { prepareSynthetic, runPreflight, runExport } = window.ExportHarness;
		await prepareSynthetic('long', {
			targets: [...targets],
			frames: 1,
			synthetic: false,
			headline: 'Words '.repeat(28).trim()
		});
		const { issues } = await runPreflight('long');
		return { issues, exported: await runExport('long') };
	}, REQUIRED);
	const refused = result.issues.filter((issue) => issue.code === 'layout-error');
	expect(refused.map((issue) => issue.target)).toContain('ipad-13');
	expect(refused[0]).toMatchObject({ severity: 'block', control: 'headline', slideIndex: 0 });
	expect(refused[0].message).toContain('Shorten it');
	expect(result.exported.status).toBe('blocked');
});

test('a multi-target campaign exports every display and reopens as the same frames', async ({
	page
}) => {
	const result = await page.evaluate(
		async (targets) => {
			const { prepareCampaign, runPreflight, runExport, reopenArchive, comparePixels } =
				window.ExportHarness;
			const prepared = await prepareCampaign('campaign', {
				targets: [...targets],
				synthetic: false
			});
			const { issues } = await runPreflight('campaign');
			const blocks = issues.filter((issue) => issue.severity === 'block');
			if (blocks.length) return { prepared, blocks };
			const first = await runExport('campaign');
			const warm = await runExport('campaign', { saveAs: 'warm' });
			const reopened = await reopenArchive('campaign', 'campaign-reopened');
			await runExport('campaign-reopened', { saveAs: 'again' });
			return {
				prepared,
				blocks,
				first: first.status,
				warm: warm.status,
				reopened,
				difference: await comparePixels('warm', 'again')
			};
		},
		[...REQUIRED, ...DUO]
	);
	expect(result.prepared).toEqual({ targets: [...REQUIRED, ...DUO], frames: 5, assets: 30 });
	expect(result.blocks).toEqual([]);
	if (!('reopened' in result)) throw new Error('The campaign did not reach export.');
	expect(result.first).toBe('complete');
	const report = await archive(page, 'campaign', 'complete');
	expect(report).toMatchObject({
		pngs: 25,
		colorTypes: [2],
		partial: false,
		readiness: 'meets-file-spec-and-store-checklist'
	});
	expect(report.sizes.sort()).toEqual([
		'1206x2622',
		'1320x2868',
		'1398x2034',
		'2007x2853',
		'2064x2752'
	]);
	// Each display keeps its own layers: five frames' worth, the same ids on each of the five.
	expect(result.reopened).toMatchObject({ version: 2, frames: 5, assets: 30 });
	const ids = result.reopened.layers.map((layer) => layer.id);
	expect(ids.filter((id) => id === 'callout')).toHaveLength(15);
	expect(ids.filter((id) => id === 'strip')).toHaveLength(5);
	expect(result.difference.frames).toBe(25);
	expect(result.difference.maxDelta).toBeLessThanOrEqual(3);
	expect(result.difference.maxChannels).toBeLessThanOrEqual(2000);
});

test('a v1 project keeps its layers and sample art through save and reopen', async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { prepareSynthetic, legacyRoundTrip } = window.ExportHarness;
		await prepareSynthetic('legacy', {
			targets: ['iphone-6.9'],
			frames: 2,
			withLayers: true
		});
		return legacyRoundTrip('legacy', 'iphone-6.9');
	});
	expect(result).toMatchObject({
		colorTypes: [2, 2],
		layersBefore: 4,
		layersPortable: 4,
		layersReopened: 4,
		allEmbedded: true
	});
	expect(result.reopenedDifference.maxDelta).toBeLessThanOrEqual(3);
	expect(result.reopenedDifference.differing).toBeLessThanOrEqual(2000);
	expect(result.entries).toEqual([
		'DRAFT-01-frame-1-1320x2868.png',
		'DRAFT-02-frame-2-1320x2868.png',
		'project.json',
		'README.txt'
	]);
});

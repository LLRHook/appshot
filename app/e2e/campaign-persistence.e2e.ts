import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import type * as Harness from './campaign-harness';

/**
 * The persistence adapter in a real browser with real IndexedDB, localStorage, timers and reloads.
 * Runs against the harness, not the page UI, and installs no pagehide or visibility handler, so a
 * surviving edit proves the journal rather than a lucky unload-time write.
 */

type Studio = ReturnType<typeof Harness.startStudio>;

declare global {
	interface Window {
		AppshotCampaignTests: typeof Harness;
		studio: Studio;
	}
}

let bundle: string;
test.beforeAll(async () => {
	const built = await build({
		configFile: false,
		logLevel: 'silent',
		plugins: [svelte({ configFile: false, compilerOptions: { runes: true } })],
		resolve: { alias: { $lib: path.resolve('src/lib') } },
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write: false,
			lib: {
				entry: path.resolve('e2e/campaign-harness.ts'),
				name: 'AppshotCampaignTests',
				formats: ['iife']
			}
		}
	});
	const result = Array.isArray(built) ? built[0] : built;
	if (!('output' in result)) throw new Error('Could not build the campaign harness.');
	const chunk = result.output.find((entry) => entry.type === 'chunk');
	if (!chunk) throw new Error('The campaign harness produced no JavaScript.');
	bundle = `${chunk.code}\nwindow.AppshotCampaignTests = AppshotCampaignTests;`;
});

/** Same origin as the app, with nothing else on the page touching storage. */
const BLANK = '/robots.txt';

async function openPage(context: BrowserContext): Promise<Page> {
	const page = await context.newPage();
	await page.addInitScript({ content: bundle });
	await page.goto(BLANK);
	return page;
}

/** Start a studio on the page and read what was saved. */
async function start(page: Page) {
	return page.evaluate(async () => {
		window.studio = window.AppshotCampaignTests.startStudio();
		const result = await window.studio.store.restore();
		return {
			status: result.status,
			error: result.status === 'failed' ? String(result.error) : undefined,
			errorName: result.status === 'failed' ? (result.error as Error | undefined)?.name : undefined,
			store: window.studio.store.status,
			headline: window.studio.store.project.slides[0].typography.headline,
			name: window.studio.store.project.name,
			campaignId: window.studio.store.project.campaignId,
			notes: window.studio.persistence.takeRestoreNotes()
		};
	});
}

async function edit(page: Page, headline: string) {
	return page.evaluate((text) => {
		const { store } = window.studio;
		store.apply(window.AppshotCampaignTests.editFirstHeadline(store.project, text));
		return store.status;
	}, headline);
}

const flush = (page: Page) =>
	page.evaluate(async () => {
		await window.studio.store.flush();
		return window.studio.store.status;
	});

async function record(name: string, data: unknown) {
	const directory = process.env.PLAYWRIGHT_ARTIFACT_DIR
		? path.join(process.env.PLAYWRIGHT_ARTIFACT_DIR, 'campaign-persistence')
		: test.info().outputDir;
	await mkdir(directory, { recursive: true });
	await writeFile(path.join(directory, `${name}.json`), JSON.stringify(data, null, 2));
}

test.describe('a real reload inside the autosave delay', () => {
	test('keeps the edit, 10 times out of 10', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		const rounds = [];
		for (let round = 1; round <= 10; round++) {
			// The reload starts in the same turn as the edit, so the 350 ms timer cannot have fired.
			const before = await page.evaluate((text) => {
				const { store } = window.studio;
				store.apply(window.AppshotCampaignTests.editFirstHeadline(store.project, text));
				const status = store.status;
				const journal = Object.keys(localStorage).filter((key) =>
					key.startsWith('appshot.journal.v1.')
				).length;
				setTimeout(() => location.reload(), 0);
				return { status, journal };
			}, `Round ${round}`);
			expect(before.status).toBe('saving');
			expect(before.journal).toBe(1);
			await page.waitForURL(`**${BLANK}`);
			await page.waitForFunction(() => document.readyState === 'complete');
			await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
			const after = await start(page);
			rounds.push({ round, statusAtReload: before.status, restored: after.headline });
			expect(after).toMatchObject({
				status: 'restored',
				store: 'saved',
				headline: `Round ${round}`
			});
		}
		await record('real-reload', {
			survived: rounds.filter((item) => item.restored === `Round ${item.round}`).length,
			of: 10,
			rounds
		});
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(1);
		expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
	});

	test('control: with the journal blocked, the same reload loses the edit', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		await page.evaluate(() => {
			Storage.prototype.setItem = () => {
				throw new DOMException('blocked', 'SecurityError');
			};
			const { store } = window.studio;
			store.apply(window.AppshotCampaignTests.editFirstHeadline(store.project, 'Lost'));
			setTimeout(() => location.reload(), 0);
		});
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const after = await start(page);
		expect(after.status).toBe('empty');
		expect(after.headline).not.toBe('Lost');
	});

	test('keeps it when the tab closes outright, and in a tab opened later', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Before closing');
		await page.close();
		const later = await openPage(context);
		const restored = await start(later);
		expect(restored).toMatchObject({ status: 'restored', headline: 'Before closing' });
		const stored = await later.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(1);
		expect(JSON.parse(stored.campaigns[0].document).slides[0].typography.headline).toBe(
			'Before closing'
		);
	});

	test('survives a renderer crash after the edit', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		const client = await context.newCDPSession(page);
		await edit(page, 'Before the crash');
		const crashed = page.waitForEvent('crash', { timeout: 10_000 });
		// Internal crash-URL navigation can abort without crashing in CI. The protocol command
		// targets the renderer directly; its request may reject when that renderer crashes.
		void client.send('Page.crash').catch(() => {});
		await crashed;
		await page.close().catch(() => {});
		const later = await openPage(context);
		expect(await start(later)).toMatchObject({ status: 'restored', headline: 'Before the crash' });
	});

	test('keeps later edits made while an earlier write was finishing', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		await page.evaluate(async () => {
			const { store } = window.studio;
			const { editFirstHeadline } = window.AppshotCampaignTests;
			store.apply(editFirstHeadline(store.project, 'First'));
			const writing = store.flush();
			store.apply(editFirstHeadline(store.project, 'Second'));
			await writing;
			setTimeout(() => location.reload(), 0);
		});
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(page)).toMatchObject({ headline: 'Second' });
	});

	test('only reports saved after the write commits, then leaves no journal behind', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		const result = await page.evaluate(async () => {
			const { store } = window.studio;
			const { editFirstHeadline, readStored } = window.AppshotCampaignTests;
			store.apply(editFirstHeadline(store.project, 'Durable'));
			const during = {
				status: store.status,
				journal: Object.keys(localStorage).length,
				stored: (await readStored()).campaigns.length
			};
			await store.flush();
			return {
				during,
				after: {
					status: store.status,
					journal: Object.keys(localStorage).length,
					stored: (await readStored()).campaigns.length
				}
			};
		});
		expect(result.during).toEqual({ status: 'saving', journal: 1, stored: 0 });
		expect(result.after).toEqual({ status: 'saved', journal: 0, stored: 1 });
	});
});

test.describe('replacing a campaign keeps the old one', () => {
	test('New campaign, then reload: the earlier campaign is listed, opens and continues', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Campaign A');
		expect(await flush(page)).toBe('saved');
		const replaced = await page.evaluate(() => {
			const { store } = window.studio;
			const previous = store.project.campaignId;
			store.replaceProject(window.AppshotCampaignTests.createBlankProjectV2());
			setTimeout(() => location.reload(), 0);
			return { previous, next: store.project.campaignId, name: store.project.name };
		});
		expect(replaced.next).toBeTruthy();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const restored = await start(page);
		expect(restored.name).toBe('Untitled campaign');
		expect(restored.campaignId).toBe(replaced.next);

		const items = await page.evaluate(() => window.studio.persistence.listRecoverable());
		expect(items).toHaveLength(2);
		expect(items.filter((item) => item.kind === 'campaign')).toHaveLength(2);
		expect(items.filter((item) => item.latest).map((item) => item.title)).toEqual([
			'Untitled campaign'
		]);

		const opened = await page.evaluate(async () => {
			const { persistence, store } = window.studio;
			const earlier = (await persistence.listRecoverable()).find((item) => !item.latest)!;
			store.replaceProject(await persistence.openRecoverable(earlier.id));
			return store.project.slides[0].typography.headline;
		});
		expect(opened).toBe('Campaign A');
		await edit(page, 'Campaign A, continued');
		expect(await flush(page)).toBe('saved');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(2);
		const headlines = stored.campaigns.map(
			(campaign) => JSON.parse(campaign.document).slides[0].typography.headline
		);
		expect(headlines).toContain('Campaign A, continued');
		expect(headlines).not.toContain('Campaign A');
	});

	test('Open project keeps the earlier campaign too, and a pending edit of it', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Saved earlier');
		await flush(page);
		await edit(page, 'Pending when the file opened');
		const replaced = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const { createDemo } = window.AppshotCampaignTests;
			const file = JSON.stringify({ ...createDemo(), name: 'Opened file' });
			store.replaceProject(await persistence.importPortable(file));
			return store.project.name;
		});
		expect(replaced).toBe('Opened file');
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const restored = await start(page);
		expect(restored.name).toBe('Opened file');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns.map((campaign) => campaign.title).sort()).toEqual([
			'Billington',
			'Opened file'
		]);
		const earlier = stored.campaigns.find((campaign) => campaign.title === 'Billington')!;
		expect(JSON.parse(earlier.document).slides[0].typography.headline).toBe(
			'Pending when the file opened'
		);
	});

	test('undoing across New resumes the old campaign’s slot and leaves the new one', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Before New');
		await flush(page);
		const ids = await page.evaluate(async () => {
			const { store } = window.studio;
			const { createBlankProjectV2 } = window.AppshotCampaignTests;
			const old = store.project.campaignId;
			store.replaceProject(createBlankProjectV2());
			await store.flush();
			const fresh = store.project.campaignId;
			store.undo();
			await store.flush();
			return { old, fresh, afterUndo: store.project.campaignId, status: store.status };
		});
		expect(ids.afterUndo).toBe(ids.old);
		expect(ids.fresh).not.toBe(ids.old);
		expect(ids.status).toBe('saved');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns.map((campaign) => campaign.title).sort()).toEqual([
			'Billington',
			'Untitled campaign'
		]);
	});

	test('deleting a kept campaign only happens on request, and frees only its own images', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		const counts = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const { addAssets, canvasFile, createBlankProjectV2, readStored } =
				window.AppshotCampaignTests;
			const shared = await canvasFile('shared.png', 40, 80, 1);
			const onlyA = await canvasFile('only-a.png', 40, 80, 2);
			const a = await persistence.ingestFiles([shared, onlyA]);
			store.apply(
				addAssets(
					store.project,
					a.accepted.map((item) => item.asset)
				).project
			);
			await store.flush();
			const idA = persistence.campaignIdOf(store.project);
			store.replaceProject(createBlankProjectV2());
			const b = await persistence.ingestFiles([shared]);
			store.apply(
				addAssets(
					store.project,
					b.accepted.map((item) => item.asset)
				).project
			);
			await store.flush();
			const before = (await readStored()).assets.length;
			await persistence.discardRecoverable(idA);
			const afterSession = (await readStored()).assets.length;
			return { before, afterSession, campaigns: (await readStored()).campaigns.length };
		});
		// This page may still undo back to images it used, so its session keeps them for now.
		expect(counts).toEqual({ before: 2, afterSession: 2, campaigns: 1 });
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		await start(page);
		const swept = await page.evaluate(async () => {
			const { persistence } = window.studio;
			const { readStored } = window.AppshotCampaignTests;
			const items = await persistence.listRecoverable();
			const keep = items[0].id;
			await persistence.discardRecoverable('not-a-real-id');
			return { keep, assets: (await readStored()).assets.length };
		});
		expect(swept.assets).toBe(1);
	});
});

test.describe('saved data that cannot be read', () => {
	const DAMAGED = '{"version":2,"name":"Broken","slides":[{"id":';

	test('stays byte-identical through later edits and can be downloaded', async ({ context }) => {
		const page = await openPage(context);
		await page.evaluate((raw) => window.AppshotCampaignTests.seedCampaign('old', raw), DAMAGED);
		const restored = await start(page);
		expect(restored).toMatchObject({
			status: 'failed',
			errorName: 'UnreadableCampaignError',
			store: 'unavailable'
		});
		await edit(page, 'New work');
		expect(await flush(page)).toBe('saved');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(2);
		const old = stored.campaigns.find((campaign) => campaign.id === 'old')!;
		expect(old.document).toBe(DAMAGED);
		expect(old.revision).toBe(7);

		const items = await page.evaluate(() => window.studio.persistence.listRecoverable());
		const unreadable = items.find((item) => item.id === 'old')!;
		expect(unreadable.kind).toBe('unreadable');
		expect(unreadable.reason).toBeTruthy();
		const download = await page.evaluate(async () =>
			(await window.studio.persistence.exportRecoverable('old')).text()
		);
		expect(download).toBe(DAMAGED);

		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(page)).toMatchObject({ status: 'restored', headline: 'New work' });
		await expect
			.poll(async () =>
				page.evaluate(
					async () =>
						(await window.AppshotCampaignTests.readStored()).campaigns.find(
							(campaign) => campaign.id === 'old'
						)?.document
				)
			)
			.toBe(DAMAGED);
	});

	test('is not written over by a journal entry for the same campaign', async ({ context }) => {
		const page = await openPage(context);
		const good = await page.evaluate(() => {
			const T = window.AppshotCampaignTests;
			return T.serializeStoredProject(T.createBlankProjectV2());
		});
		const raw = await page.evaluate(
			async ({ damaged, document }) => {
				await window.AppshotCampaignTests.seedCampaign('old', damaged);
				const value = `${JSON.stringify({ v: 1, instance: 'gone', campaign: 'old', base: 7, seq: 1, at: 1 })}\n${document}`;
				localStorage.setItem('appshot.journal.v1.gone.old', value);
				return value;
			},
			{ damaged: DAMAGED, document: good }
		);
		expect(raw).toContain('Untitled campaign');
		const restored = await start(page);
		expect(restored.status).toBe('failed');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns.find((campaign) => campaign.id === 'old')?.document).toBe(DAMAGED);
		const copy = stored.campaigns.find((campaign) => campaign.id !== 'old')!;
		expect(JSON.parse(copy.document).name).toBe('Untitled campaign');
	});

	test('refuses to store a document that could not be reopened, keeping the last good one', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Last good');
		expect(await flush(page)).toBe('saved');
		const result = await page.evaluate(async () => {
			const { store } = window.studio;
			store.apply({ ...store.project, accent: 'not a color' });
			await store.flush();
			return { status: store.status, failure: String(window.studio.failures[0]) };
		});
		expect(result.status).toBe('failed');
		expect(result.failure).toContain('invalid color');
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(JSON.parse(stored.campaigns[0].document).slides[0].typography.headline).toBe(
			'Last good'
		);
		expect(JSON.parse(stored.campaigns[0].document).accent).not.toBe('not a color');
	});

	test('from a newer build fails clearly and is never written over', async ({ context }) => {
		const page = await openPage(context);
		const newer = JSON.stringify({ version: 3, name: 'Future', slides: [] });
		await page.evaluate((raw) => window.AppshotCampaignTests.seedCampaign('future', raw), newer);
		const restored = await start(page);
		expect(restored.status).toBe('failed');
		expect(restored.error).toContain('newer version');
		await edit(page, 'This build’s work');
		await flush(page);
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns.find((campaign) => campaign.id === 'future')?.document).toBe(newer);
	});

	test('in a journal entry is quarantined, downloadable, and does not block loading', async ({
		context
	}) => {
		const page = await openPage(context);
		await page.evaluate(() =>
			localStorage.setItem('appshot.journal.v1.deadbeef.campaign', 'not a journal entry')
		);
		const restored = await start(page);
		expect(restored.status).toBe('empty');
		expect(restored.notes[0]).toMatch(/kept for you to download/);
		const state = await page.evaluate(async () => ({
			keys: Object.keys(localStorage),
			items: await window.studio.persistence.listRecoverable(),
			raw: await (
				await window.studio.persistence.exportRecoverable('appshot.journal.v1.deadbeef.campaign')
			).text()
		}));
		expect(state.keys).toEqual([]);
		expect(state.raw).toBe('not a journal entry');
		expect(state.items).toMatchObject([{ kind: 'unreadable', title: 'Unsaved edit' }]);
	});

	test('with a valid header but a damaged document is quarantined, not applied', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await edit(page, 'Good saved work');
		await flush(page);
		const raw = await page.evaluate(() => {
			const id = window.studio.store.project.campaignId;
			const value = `${JSON.stringify({ v: 1, instance: 'gone', campaign: id, base: 1, seq: 9, at: 1 })}\n{"version":2,"broken`;
			localStorage.setItem(`appshot.journal.v1.gone.${id}`, value);
			return value;
		});
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const restored = await start(page);
		expect(restored).toMatchObject({ status: 'restored', headline: 'Good saved work' });
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.quarantine[0].raw).toBe(raw);
	});

	test('with an image missing from storage keeps the rest of the campaign and says so', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const { addAssets, bindSource, canvasFile } = window.AppshotCampaignTests;
			const { accepted } = await persistence.ingestFiles([
				await canvasFile('gone.png', 1320, 2868, 3)
			]);
			const added = addAssets(store.project, [accepted[0].asset]);
			store.apply(
				bindSource(added.project, added.project.slides[0].id, 'iphone-6.9', added.ids[0])
			);
			store.apply(window.AppshotCampaignTests.editFirstHeadline(store.project, 'Still here'));
			await store.flush();
			await new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('appshot-campaigns', 1);
				open.onsuccess = () => {
					const transaction = open.result.transaction('assets', 'readwrite');
					transaction.objectStore('assets').clear();
					transaction.oncomplete = () => {
						open.result.close();
						resolve();
					};
					transaction.onerror = () => reject(transaction.error);
				};
			});
		});
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const restored = await start(page);
		expect(restored).toMatchObject({ status: 'restored', headline: 'Still here' });
		expect(restored.notes[0]).toContain('gone.png');
		const image = await page.evaluate(
			() => window.studio.store.project.slides[0].variants?.['iphone-6.9']?.source
		);
		expect(image).toBeUndefined();
	});
});

test.describe('the old single-slot autosave', () => {
	test('moves across once, unchanged in content, leaving the original intact', async ({
		context
	}) => {
		const page = await openPage(context);
		const fixture = JSON.parse(
			await readFile(path.resolve('src/lib/model/__fixtures__/table-linen-v2.appshot.json'), 'utf8')
		);
		const raw = JSON.stringify(fixture);
		await page.evaluate((text) => window.AppshotCampaignTests.seedLegacyAutosave(text), raw);
		const restored = await start(page);
		expect(restored).toMatchObject({ status: 'restored', store: 'saved', name: 'Billington' });

		const projected = await page.evaluate(() => {
			const { projectForTarget } = window.AppshotCampaignTests;
			return projectForTarget(window.studio.store.project, 'iphone-6.9');
		});
		expect(projected.slides.map((slide) => slide.typography.headline)).toEqual(
			fixture.slides.map((slide: { typography: { headline: string } }) => slide.typography.headline)
		);
		expect(projected.slides[0].linen).toEqual(fixture.slides[0].linen);
		expect(projected.panorama?.linenPhone).toEqual(fixture.panorama.linenPhone);
		expect(projected.slides.every((slide) => slide.primaryImage?.blobUrl.startsWith('blob:'))).toBe(
			true
		);
		const stored = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.assets).toHaveLength(4);
		expect(stored.campaigns).toHaveLength(1);
		expect(await page.evaluate(() => window.AppshotCampaignTests.readLegacyRaw())).toBe(raw);

		await edit(page, 'Edited after moving');
		await flush(page);
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(page)).toMatchObject({ headline: 'Edited after moving' });
		const afterReload = await page.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(afterReload.campaigns).toHaveLength(1);
		expect(await page.evaluate(() => window.AppshotCampaignTests.readLegacyRaw())).toBe(raw);
	});

	test('that cannot be read keeps its bytes, reports once, and does not block new work', async ({
		context
	}) => {
		const page = await openPage(context);
		await page.evaluate(() => window.AppshotCampaignTests.seedLegacyAutosave('{"version":1,'));
		const first = await start(page);
		expect(first).toMatchObject({ status: 'failed', errorName: 'UnreadableCampaignError' });
		const kept = await page.evaluate(async () => ({
			stored: (await window.AppshotCampaignTests.readStored()).quarantine,
			legacy: await window.AppshotCampaignTests.readLegacyRaw(),
			download: await (await window.studio.persistence.exportRecoverable('legacy-autosave')).text()
		}));
		expect(kept.stored[0].raw).toBe('{"version":1,');
		expect(kept.legacy).toBe('{"version":1,');
		expect(kept.download).toBe('{"version":1,');
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(page)).toMatchObject({ status: 'empty', store: 'example' });
	});
});

test.describe('two tabs on one campaign', () => {
	async function twoTabs(context: BrowserContext) {
		const first = await openPage(context);
		await start(first);
		await edit(first, 'Shared start');
		await flush(first);
		const second = await openPage(context);
		const opened = await start(second);
		expect(opened).toMatchObject({ status: 'restored', headline: 'Shared start' });
		return { first, second };
	}

	test('does not write over the other tab, and reports a conflict', async ({ context }) => {
		const { first, second } = await twoTabs(context);
		await second.evaluate(() => {
			(window as unknown as { heard: unknown[] }).heard = [];
			window.studio.persistence.onExternalChange((change) =>
				(window as unknown as { heard: unknown[] }).heard.push(change)
			);
		});
		await edit(first, 'First tab wins the race');
		expect(await flush(first)).toBe('saved');
		await expect
			.poll(() => second.evaluate(() => (window as unknown as { heard: unknown[] }).heard.length))
			.toBe(1);

		await edit(second, 'Second tab edit');
		expect(await flush(second)).toBe('failed');
		const conflict = await second.evaluate(() => {
			const error = window.studio.failures[0] as Error & { campaignId: string };
			return { name: error.name, message: error.message, campaignId: error.campaignId };
		});
		expect(conflict.name).toBe('CampaignConflictError');
		expect(conflict.message).toContain('another tab');

		const stored = await first.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(1);
		expect(JSON.parse(stored.campaigns[0].document).slides[0].typography.headline).toBe(
			'First tab wins the race'
		);
		await record('two-tab-conflict', { conflict, keptHeadline: 'First tab wins the race' });
	});

	test('can keep the losing tab’s edits as a copy, then both continue', async ({ context }) => {
		const { first, second } = await twoTabs(context);
		await edit(first, 'First tab');
		await flush(first);
		await edit(second, 'Second tab');
		expect(await flush(second)).toBe('failed');
		const status = await second.evaluate(async () => {
			const { store, persistence } = window.studio;
			persistence.keepAsCopy(store.project);
			await store.saveNow();
			return store.status;
		});
		expect(status).toBe('saved');
		await edit(second, 'Second tab, continued');
		expect(await flush(second)).toBe('saved');
		await edit(first, 'First tab, continued');
		expect(await flush(first)).toBe('saved');

		const items = await first.evaluate(() => window.studio.persistence.listRecoverable());
		expect(items).toHaveLength(2);
		expect(items.map((item) => item.origin).filter(Boolean)).toEqual(['conflict-copy']);
		const stored = await first.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(
			stored.campaigns
				.map((campaign) => JSON.parse(campaign.document).slides[0].typography.headline)
				.sort()
		).toEqual(['First tab, continued', 'Second tab, continued']);

		await second.reload();
		await second.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(second)).toMatchObject({ headline: 'Second tab, continued' });
		await first.reload();
		await first.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(first)).toMatchObject({ headline: 'First tab, continued' });
	});

	test('can drop the losing tab’s edits and show the other tab’s work', async ({ context }) => {
		const { first, second } = await twoTabs(context);
		await edit(first, 'First tab');
		await flush(first);
		await edit(second, 'Second tab');
		expect(await flush(second)).toBe('failed');
		await second.evaluate(() => {
			const { store, persistence } = window.studio;
			persistence.discardLocalEdits(store.project);
		});
		await second.reload();
		await second.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(second)).toMatchObject({ status: 'restored', headline: 'First tab' });
		const stored = await second.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(1);
	});

	test('keeps a closed tab’s unsaved edit that diverged, as a separate copy', async ({
		context
	}) => {
		const { first, second } = await twoTabs(context);
		await edit(first, 'First tab saved');
		await flush(first);
		await edit(second, 'Second tab, unsaved when it reloaded');
		await second.evaluate(() => setTimeout(() => location.reload(), 0));
		await second.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		const restored = await start(second);
		expect(restored.headline).toBe('Second tab, unsaved when it reloaded');
		expect(restored.notes[0]).toMatch(/kept as a separate copy/);
		const items = await second.evaluate(() => window.studio.persistence.listRecoverable());
		expect(items.map((item) => item.origin).filter(Boolean)).toEqual(['recovered-edit']);
		const stored = await second.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(
			stored.campaigns
				.map((campaign) => JSON.parse(campaign.document).slides[0].typography.headline)
				.sort()
		).toEqual(['First tab saved', 'Second tab, unsaved when it reloaded']);
		expect(await flush(first)).toBe('saved');
	});

	test('a new tab applies a live tab’s pending edit without causing it a conflict', async ({
		context
	}) => {
		const first = await openPage(context);
		await start(first);
		await edit(first, 'Saved');
		await flush(first);
		await edit(first, 'Pending in the first tab');
		const second = await openPage(context);
		expect(await start(second)).toMatchObject({ headline: 'Pending in the first tab' });
		await edit(first, 'Still typing');
		expect(await flush(first)).toBe('saved');
		const stored = await first.evaluate(() => window.AppshotCampaignTests.readStored());
		expect(stored.campaigns).toHaveLength(1);
		expect(JSON.parse(stored.campaigns[0].document).slides[0].typography.headline).toBe(
			'Still typing'
		);
	});
});

test.describe('images', () => {
	test('identical bytes are stored once, across frames, targets, files and campaigns', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		const counts = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const {
				addAssets,
				addTarget,
				bindPanoramaSource,
				bindSource,
				canvasFile,
				connectPair,
				createBlankProjectV2,
				readStored
			} = window.AppshotCampaignTests;
			const file = await canvasFile('capture.png', 1320, 2868, 7);
			const renamed = new File([file], 'capture copy.png', { type: 'image/png' });
			const { accepted } = await persistence.ingestFiles([file, file, renamed]);
			const added = addAssets(
				store.project,
				accepted.map((item) => item.asset)
			);
			const uniqueIds = new Set(added.ids).size;
			let project = addTarget(added.project, 'ipad-13');
			const before = Object.keys(project.assets).length;
			for (const slide of project.slides)
				project = bindSource(project, slide.id, 'iphone-6.9', added.ids[0]);
			project = bindPanoramaSource(
				connectPair(project, project.slides[0].id, { offset: 0, scale: 1, tilt: 0 }),
				'iphone-6.9',
				added.ids[0]
			);
			store.apply(project);
			await store.flush();
			const first = await readStored();
			const after = Object.keys(project.assets).length;
			store.replaceProject(createBlankProjectV2());
			const again = await persistence.ingestFiles([file]);
			store.apply(addAssets(store.project, [again.accepted[0].asset]).project);
			await store.flush();
			return {
				uniqueIds,
				before,
				after,
				storedAfterFirst: first.assets.length,
				storedAfterSecond: (await readStored()).assets.length,
				sameUrl: accepted[0].asset.url === accepted[2].asset.url
			};
		});
		expect(counts.uniqueIds).toBe(1);
		expect(counts.after).toBe(counts.before);
		expect(counts.storedAfterFirst).toBe(1);
		expect(counts.storedAfterSecond).toBe(1);
		expect(counts.sameUrl).toBe(true);
	});

	test('reads real files: real format, real size, naming each failure, keeping the rest', async ({
		context
	}) => {
		const page = await openPage(context);
		const result = await page.evaluate(async () => {
			const { canvasFile, readCaptures, DEVICES } = window.AppshotCampaignTests;
			const png = await canvasFile('home.png', 1320, 2868, 1);
			// A real JPEG, carrying the name and claimed type the real Billington file has.
			const jpegBlob = await canvasFile('x.jpg', 368, 800, 2, 'image/jpeg');
			const mislabeled = new File([jpegBlob], '05_bill_entry_filled.png', { type: 'image/png' });
			const corrupt = new File(
				[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
				'broken.png',
				{ type: 'image/png' }
			);
			const text = new File(['hello'], 'notes.png', { type: 'image/png' });
			const batch = await readCaptures([png, mislabeled, corrupt, text], {
				target: DEVICES['iphone-6.9']
			});
			return {
				accepted: batch.accepted.map((capture) => ({
					name: capture.name,
					mime: capture.mime,
					blobType: capture.blob.type,
					size: [capture.naturalWidth, capture.naturalHeight],
					classes: capture.classification.classIds,
					mislabeled: capture.mislabeled,
					notes: capture.notes,
					level: capture.compatibility?.level,
					severity: capture.compatibility?.severity
				})),
				rejected: batch.rejected
			};
		});
		expect(result.accepted).toEqual([
			{
				name: 'home.png',
				mime: 'image/png',
				blobType: 'image/png',
				size: [1320, 2868],
				classes: ['iphone-di-large'],
				mislabeled: false,
				notes: [],
				level: 'native',
				severity: 'ok'
			},
			{
				name: '05_bill_entry_filled.png',
				mime: 'image/jpeg',
				blobType: 'image/jpeg',
				size: [368, 800],
				classes: [],
				mislabeled: true,
				notes: [expect.stringContaining('really a JPEG'), expect.stringContaining('368 × 800')],
				level: 'upscaled',
				severity: 'block'
			}
		]);
		expect(result.rejected.map((rejection) => [rejection.name, rejection.code])).toEqual([
			['broken.png', 'undecodable'],
			['notes.png', 'unsupported-format']
		]);
		expect(result.rejected[0].message).toContain('broken.png');
		await record('source-batch', result);
	});

	test('editing stays cheap with four 11 MB captures: no image bytes per keystroke', async ({
		context
	}) => {
		test.setTimeout(180_000);
		const page = await openPage(context);
		await start(page);
		const result = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const { addAssets, addTarget, bindSource, editFirstHeadline, noiseFile } =
				window.AppshotCampaignTests;
			const files = await Promise.all(
				[1, 2, 3, 4].map((seed) => noiseFile(`n${seed}.png`, 1950, seed))
			);
			const { accepted, rejected } = await persistence.ingestFiles(files);
			const added = addAssets(
				store.project,
				accepted.map((item) => item.asset)
			);
			let project = addTarget(added.project, 'ipad-13');
			project.slides.slice(0, 4).forEach((slide, index) => {
				project = bindSource(project, slide.id, 'iphone-6.9', added.ids[index]);
			});
			store.apply(project);
			await store.flush();

			const times: number[] = [];
			let journalBytes = 0;
			let storedText = '';
			for (let key = 0; key < 300; key++) {
				const started = performance.now();
				store.apply(editFirstHeadline(store.project, `Typing ${key}`), { coalesce: 'headline' });
				times.push(performance.now() - started);
				const entry = Object.keys(localStorage)[0];
				storedText = localStorage.getItem(entry) ?? '';
				journalBytes = Math.max(journalBytes, storedText.length);
			}
			await store.flush();
			times.sort((a, b) => a - b);
			return {
				rejected: rejected.length,
				bytes: files.map((file) => file.size),
				median: times[150],
				p95: times[285],
				max: times[299],
				journalBytes,
				journalHasImageBytes: storedText.includes('base64') || storedText.includes('blob:'),
				undoSteps: 300,
				status: store.status
			};
		});
		await record('keystroke-cost', result);
		expect(result.rejected).toBe(0);
		expect(Math.min(...result.bytes)).toBeGreaterThan(10 * 1024 * 1024);
		expect(result.journalHasImageBytes).toBe(false);
		expect(result.journalBytes).toBeLessThan(64 * 1024);
		expect(result.median).toBeLessThan(16);
		expect(result.status).toBe('saved');
	});
});

test.describe('project files', () => {
	test('carry every field and image byte to a browser that has never seen them', async ({
		context,
		browser
	}, testInfo) => {
		const page = await openPage(context);
		await start(page);
		const saved = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const T = window.AppshotCampaignTests;
			const { accepted } = await persistence.ingestFiles([
				await T.canvasFile('phone.png', 1320, 2868, 1),
				await T.canvasFile('tablet.jpg', 2064, 2752, 2, 'image/jpeg')
			]);
			const blank = T.createBlankProjectV2();
			const extraFrame = { ...blank.slides[0], id: 'second-frame', label: 'Second' };
			const added = T.addAssets(T.addSlide(blank, extraFrame), [
				{
					...accepted[0].asset,
					provenance: { device: 'iPhone 17 Pro Max', build: '36', synthetic: true }
				},
				accepted[1].asset
			]);
			let project = T.setAppName(T.setWorkingTitle(added.project, 'Spring test'), 'Billington');
			project = T.addTarget(project, 'ipad-13');
			project = { ...project, style: 'the-check' };
			const [first, second] = project.slides;
			project = T.patchSlide(project, first.id, {
				check: { canvas: 'gold', preset: 'editorial', panel: true, wordmark: false }
			});
			project = T.bindSource(project, first.id, 'iphone-6.9', added.ids[0]);
			project = T.bindSource(project, first.id, 'ipad-13', added.ids[1]);
			project = T.bindSource(project, second.id, 'ipad-13', added.ids[0]);
			project = T.setSourceOverride(project, second.id, 'ipad-13', 'Review only');
			project = T.patchSlideVariant(project, first.id, 'iphone-6.9', {
				scale: 1.2,
				check: {
					mark: {
						kind: 'ring',
						anchor: 'callout',
						rect: { x: 1, y: 2, width: 3, height: 4 },
						seed: 11
					}
				}
			});
			project = T.setSlideLayers(project, first.id, 'iphone-6.9', [
				{
					id: 'callout',
					kind: 'source-crop',
					image: added.ids[0],
					crop: { x: 40, y: 900, width: 1240, height: 320 },
					x: 30,
					y: 1800,
					scale: 1.02,
					rotation: -2,
					radius: 24,
					shadow: 'soft',
					sampling: 'smooth'
				}
			]);
			store.replaceProject(project);
			await store.flush();
			const file = await persistence.exportPortable(store.project);
			return {
				text: await file.text(),
				type: file.type,
				project: T.serializeStoredProject(store.project)
			};
		});
		expect(saved.type).toBe('application/json');
		expect(saved.text).not.toContain('blob:');
		expect(saved.text).not.toContain('campaignId');
		const destination = path.join(testInfo.outputDir, 'portable.appshot.json');
		await mkdir(testInfo.outputDir, { recursive: true });
		await writeFile(destination, saved.text);

		const fresh = await browser.newContext();
		try {
			const other = await openPage(fresh);
			await start(other);
			const reopened = await other.evaluate(async (text) => {
				const { store, persistence } = window.studio;
				const T = window.AppshotCampaignTests;
				const before = store.project.campaignId;
				store.replaceProject(await persistence.importPortable(new Blob([text])));
				await store.flush();
				const project = store.project;
				const pixels = await Promise.all(
					Object.values(project.assets).map(async (asset) => {
						const bytes = new Uint8Array(await (await fetch(asset.url)).arrayBuffer());
						return { name: asset.name, length: bytes.length, url: asset.url.slice(0, 5) };
					})
				);
				return {
					before,
					id: project.campaignId,
					stored: T.serializeStoredProject(project),
					pixels,
					savedAgain: await (await persistence.exportPortable(project)).text()
				};
			}, saved.text);
			expect(JSON.parse(reopened.stored)).toEqual(JSON.parse(saved.project));
			expect(reopened.id).toBeTruthy();
			expect(JSON.parse(reopened.savedAgain)).toEqual(JSON.parse(saved.text));
			expect(reopened.pixels.every((item) => item.url === 'blob:')).toBe(true);
			expect(reopened.pixels.length).toBe(2);

			await other.reload();
			await other.waitForFunction(() => Boolean(window.AppshotCampaignTests));
			const restored = await start(other);
			expect(restored).toMatchObject({ status: 'restored', name: 'Spring test' });
			const afterReload = await other.evaluate(() => {
				const T = window.AppshotCampaignTests;
				const { project } = window.studio.store;
				const phone = T.projectForTarget(project, 'iphone-6.9');
				return {
					stored: T.serializeStoredProject(project),
					printed: phone.name,
					layer: phone.slides[0].layers?.[0],
					check: phone.slides[0].check,
					scale: phone.slides[0].scale,
					style: phone.style
				};
			});
			expect(JSON.parse(afterReload.stored)).toEqual(JSON.parse(saved.project));
			expect(afterReload.printed).toBe('Billington');
			expect(afterReload.style).toBe('the-check');
			expect(afterReload.scale).toBe(1.2);
			expect(afterReload.check).toEqual({
				canvas: 'gold',
				preset: 'editorial',
				panel: true,
				wordmark: false,
				mark: {
					kind: 'ring',
					anchor: 'callout',
					rect: { x: 1, y: 2, width: 3, height: 4 },
					seed: 11
				}
			});
			expect(afterReload.layer).toMatchObject({
				rotation: -2,
				radius: 24,
				shadow: 'soft',
				sampling: 'smooth',
				crop: { x: 40, y: 900, width: 1240, height: 320 }
			});
			expect(afterReload.layer?.image.blobUrl).toMatch(/^blob:/);
		} finally {
			await fresh.close();
		}
	});

	test('open old v1 files, and refuse session, external and newer-version content', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		const fixture = await readFile(
			path.resolve('src/lib/model/__fixtures__/table-linen-v2.appshot.json'),
			'utf8'
		);
		const results = await page.evaluate(async (v1) => {
			const { persistence } = window.studio;
			const T = window.AppshotCampaignTests;
			const attempt = async (text: string) => {
				try {
					await persistence.importPortable(text);
					return 'opened';
				} catch (error) {
					return (error as Error).message;
				}
			};
			const opened = await persistence.importPortable(v1);
			const file = await (await persistence.exportPortable(opened)).text();
			const valid = JSON.parse(file);
			const assetId = Object.keys(valid.assets)[0];
			const withUrl = (url: string) => {
				const copy = JSON.parse(file);
				copy.assets[assetId].url = url;
				return JSON.stringify(copy);
			};
			return {
				v1Assets: Object.keys(opened.assets).length,
				v1Slides: opened.slides.length,
				hashed: Object.values(opened.assets).every((asset) =>
					/^[0-9a-f]{64}$/.test(asset.sha256 ?? '')
				),
				v2Reopens: await attempt(file),
				blobUrl: await attempt(withUrl('blob:http://127.0.0.1/x')),
				external: await attempt(withUrl('https://example.com/image.png')),
				future: await attempt(JSON.stringify({ ...valid, version: 3 })),
				garbage: await attempt('{"version":2'),
				wrongHash: await attempt(
					JSON.stringify({
						...valid,
						assets: {
							...valid.assets,
							[assetId]: { ...valid.assets[assetId], sha256: 'f'.repeat(64) }
						}
					})
				),
				legacyRefusesV2: (() => {
					try {
						T.parseProject(file);
						return 'accepted';
					} catch (error) {
						return (error as Error).message;
					}
				})()
			};
		}, fixture);
		expect(results.v1Assets).toBe(4);
		expect(results.v1Slides).toBe(5);
		expect(results.hashed).toBe(true);
		expect(results.v2Reopens).toBe('opened');
		expect(results.blobUrl).toMatch(/invalid image/);
		expect(results.external).toMatch(/invalid image/);
		expect(results.future).toMatch(/newer version/);
		expect(results.garbage).toMatch(/Choose a valid Appshot project/);
		expect(results.wrongHash).toMatch(/do not match/);
		expect(results.legacyRefusesV2).toMatch(/Choose a valid Appshot project/);
	});
});

test.describe('when the browser refuses to store things', () => {
	test('a full journal does not stop editing or the real save', async ({ context }) => {
		const page = await openPage(context);
		await start(page);
		const result = await page.evaluate(async () => {
			const { store } = window.studio;
			Storage.prototype.setItem = () => {
				throw new DOMException('full', 'QuotaExceededError');
			};
			store.apply(window.AppshotCampaignTests.editFirstHeadline(store.project, 'No journal'));
			const during = store.status;
			await store.flush();
			return { during, after: store.status };
		});
		expect(result).toEqual({ during: 'saving', after: 'saved' });
		await page.reload();
		await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
		expect(await start(page)).toMatchObject({ headline: 'No journal' });
	});

	test('image bytes that cannot be stored keep working this session and never read as saved', async ({
		context
	}) => {
		const page = await openPage(context);
		await start(page);
		const result = await page.evaluate(async () => {
			const { store, persistence } = window.studio;
			const T = window.AppshotCampaignTests;
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (
				this: IDBObjectStore,
				...args: Parameters<typeof put>
			) {
				if (this.name === 'assets') throw new DOMException('full', 'QuotaExceededError');
				return put.apply(this, args);
			};
			const { accepted } = await persistence.ingestFiles([
				await T.canvasFile('unstored.png', 1320, 2868, 5)
			]);
			const added = T.addAssets(store.project, [accepted[0].asset]);
			const applied = store.apply(
				T.bindSource(added.project, added.project.slides[0].id, 'iphone-6.9', added.ids[0])
			);
			const journal = Object.keys(localStorage).length;
			await store.flush();
			const failed = { applied: applied.status, journal, status: store.status };
			const exported = (await persistence.exportPortable(store.project)).size;
			IDBObjectStore.prototype.put = put;
			store.apply(T.editFirstHeadline(store.project, 'Storage came back'));
			await store.flush();
			return {
				failed,
				exported,
				recovered: store.status,
				stored: (await T.readStored()).assets.length
			};
		});
		expect(result.failed).toEqual({ applied: 'applied', journal: 0, status: 'failed' });
		expect(result.exported).toBeGreaterThan(0);
		expect(result.recovered).toBe('saved');
		expect(result.stored).toBe(1);
	});
});

test('a campaign restored from storage renders its stored images', async ({ context }) => {
	const page = await openPage(context);
	await start(page);
	await page.evaluate(async () => {
		const { store, persistence } = window.studio;
		const T = window.AppshotCampaignTests;
		const { accepted } = await persistence.ingestFiles([
			await T.canvasFile('p.png', 1320, 2868, 4)
		]);
		const added = T.addAssets(store.project, [accepted[0].asset]);
		const single = T.removeSlide(
			T.removeSlide(
				T.removeSlide(
					T.removeSlide(T.disconnectPair(added.project), added.project.slides[4].id),
					added.project.slides[3].id
				),
				added.project.slides[2].id
			),
			added.project.slides[1].id
		);
		store.apply(T.bindSource(single, single.slides[0].id, 'iphone-6.9', added.ids[0]));
		await store.flush();
	});
	await page.reload();
	await page.waitForFunction(() => Boolean(window.AppshotCampaignTests));
	await start(page);
	const painted = await page.evaluate(async () => {
		const T = window.AppshotCampaignTests;
		const composition = T.projectForTarget(window.studio.store.project, 'iphone-6.9');
		const canvas = document.createElement('canvas');
		await T.renderSlide(canvas, composition, 0);
		const context2d = canvas.getContext('2d')!;
		return {
			size: [canvas.width, canvas.height],
			url: composition.slides[0].primaryImage?.blobUrl.slice(0, 5),
			center: Array.from(context2d.getImageData(660, 2000, 1, 1).data)
		};
	});
	expect(painted.size).toEqual([1320, 2868]);
	expect(painted.url).toBe('blob:');
	expect(painted.center[3]).toBe(255);
});

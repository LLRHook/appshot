import { describe, expect, it } from 'vitest';
import type { ProjectV2 } from '$lib/model/contracts';
import { createDemoProjectV2 } from '$lib/model/migrate';
import {
	CAMPAIGN_HISTORY_LIMIT,
	CampaignConflictError,
	CampaignPersistence,
	journalDisposition,
	UnreadableCampaignError,
	writeAllowed
} from './campaign-persistence';

/** Real IndexedDB behavior is covered by e2e/campaign-persistence.e2e.ts in a real browser. */

const record = (revision: number, instance: string, seq: number) => ({
	revision,
	lastWriter: { instance, seq }
});

describe('what happens to a journal entry found at load', () => {
	const entry = { instance: 'closed-tab', seq: 5, base: 3 };

	it.each([
		['no record yet: the entry is the first save', undefined, 'promote'],
		[
			'the record is still at its base: the edit simply never landed',
			record(3, 'any', 1),
			'promote'
		],
		[
			'same page load, older write: a later edit on the same stream',
			record(4, 'closed-tab', 4),
			'promote'
		],
		[
			'same page load, this write: it landed before the entry was removed',
			record(4, 'closed-tab', 5),
			'discard'
		],
		['same page load, newer write: nothing to add', record(5, 'closed-tab', 9), 'discard'],
		['another page wrote since: it diverged, so keep both', record(4, 'other-tab', 1), 'fork']
	] as const)('%s', (_label, stored, expected) => {
		expect(journalDisposition(entry, stored)).toBe(expected);
	});

	it('keeps a separate copy if another writer’s revision fell behind the entry', () => {
		expect(journalDisposition(entry, record(1, 'other-tab', 1))).toBe('fork');
	});
});

describe('whether a page may write a record', () => {
	it.each([
		['no record yet', undefined, 0, true],
		['nobody wrote since this page read it', record(3, 'other', 1), 3, true],
		['this page wrote it last, including a promotion on its behalf', record(9, 'me', 4), 3, true],
		['another page wrote since', record(4, 'other', 1), 3, false],
		['another page wrote it and this page never read it', record(1, 'other', 1), 0, false]
	] as const)('%s', (_label, stored, base, allowed) => {
		expect(writeAllowed(stored, base, 'me')).toBe(allowed);
	});
});

describe('CampaignPersistence, the parts with no storage', () => {
	const withAsset = (patch: Partial<ProjectV2['assets'][string]>): ProjectV2 => ({
		...createDemoProjectV2(),
		assets: {
			extra: {
				id: 'extra',
				mime: 'image/png',
				byteLength: 1,
				url: 'data:image/png;base64,AAAA',
				naturalWidth: 1,
				naturalHeight: 1,
				...patch
			}
		}
	});

	it('constructs without touching browser APIs, for server rendering', () => {
		expect(() => new CampaignPersistence()).not.toThrow();
	});

	it('accepts bundled images, which need no storage', () => {
		expect(new CampaignPersistence().rejectReason(createDemoProjectV2())).toBeNull();
	});

	it('rejects image count overflow before committing an edit the parser cannot save', () => {
		const demo = createDemoProjectV2();
		const sample = Object.values(demo.assets)[0];
		const assets = Object.fromEntries(
			Array.from({ length: 301 }, (_, index) => [
				`sample-${index}`,
				{ ...sample, id: `sample-${index}` }
			])
		);
		expect(new CampaignPersistence().rejectReason({ ...demo, assets })).toContain('300 images');
	});

	it('refuses an image that did not go through ingestion, so a save can never lose its bytes', () => {
		const persistence = new CampaignPersistence();
		expect(persistence.rejectReason(withAsset({}))).toMatch(/not been stored/);
		expect(persistence.rejectReason(withAsset({ sha256: 'a'.repeat(64) }))).toMatch(
			/not been stored/
		);
	});

	it('gives a replacing document its own slot, unless it already has one', () => {
		const persistence = new CampaignPersistence();
		const demo = createDemoProjectV2();
		const first = persistence.forReplacement(demo);
		const second = persistence.forReplacement(demo);
		expect(first.campaignId).toBeTruthy();
		expect(first.campaignId).not.toBe(second.campaignId);
		expect(persistence.forReplacement(first)).toBe(first);
	});

	it('keeps a useful undo depth', () => {
		expect(CAMPAIGN_HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
	});

	it('explains conflicts and unreadable records in words a person can act on', () => {
		const conflict = new CampaignConflictError('c1', 4, 123);
		expect(conflict.message).toMatch(/another tab/);
		expect(conflict).toMatchObject({ campaignId: 'c1', storedRevision: 4, storedAt: 123 });
		const unreadable = new UnreadableCampaignError('c1', 'bad data.');
		expect(unreadable.recoverableId).toBe('c1');
		expect(unreadable.message).toMatch(/kept/);
	});
});

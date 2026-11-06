import { bytesFromDataUrl, dataUrlFromBytes, isBundledAsset, sha256Hex } from '$lib/model/assets';
import {
	assetFromCapture,
	readCaptures,
	sniffImage,
	type CaptureFile,
	type ReadCaptureOptions,
	type RejectedCapture
} from '$lib/model/capture';
import type { ProjectAsset, ProjectV2 } from '$lib/model/contracts';
import { removeAsset, rewriteAssetIds } from '$lib/model/edits';
import { MAX_CAMPAIGN_IMAGE_BYTES, MAX_PORTABLE_PROJECT_BYTES } from '$lib/model/limits';
import {
	migrateCompositionToV2,
	parseProjectV2,
	parseStoredProject,
	serializePortableProject,
	serializeStoredProject
} from '$lib/model/migrate';
import { parseProject, readLegacyAutosave } from '$lib/model/project';
import type { ProjectPersistence } from './persistence';

/**
 * Where a campaign lives between sessions, and how no edit gets lost.
 *
 * - Image bytes are stored once by SHA-256 in `assets`, before any document refers to them. An edit
 *   only ever serializes metadata, so typing cost does not grow with image size.
 * - A campaign is one record in `campaigns`, written with a revision check. New and Open get their
 *   own record, so replacing a campaign leaves the old one recoverable, and a record that cannot be
 *   read is never written over.
 * - Each edit also writes its metadata to a small synchronous localStorage journal, because a
 *   transaction started while a page unloads does not reliably finish. The next load promotes it.
 *   A journal entry only refers to bytes already in `assets`.
 *
 * Status stays honest: `save` resolves only when its transaction has committed, and the journal
 * alone never counts as saved.
 */

const DB_NAME = 'appshot-campaigns';
const DB_VERSION = 1;
const JOURNAL_PREFIX = 'appshot.journal.v1.';
const TAB_CAMPAIGN_KEY = 'appshot.tab-campaign';
const CHANNEL_NAME = 'appshot-campaigns';
/** Enough for a long session with coalesced edits. Steps share every unchanged part of a document. */
export const CAMPAIGN_HISTORY_LIMIT = 100;

export type CampaignOriginKind = 'legacy-autosave' | 'conflict-copy' | 'recovered-edit';

interface CampaignOrigin {
	kind: CampaignOriginKind;
	/** The campaign this one was split from. */
	of?: string;
}

/** Whose edit a record holds, so a journal entry already written is not applied twice. */
interface WriterMark {
	/** One page load. A reload is a new instance. */
	instance: string;
	seq: number;
}

interface CampaignRecord {
	id: string;
	schema: 2;
	revision: number;
	updatedAt: number;
	lastWriter: WriterMark;
	title: string;
	frames: number;
	targets: number;
	origin?: CampaignOrigin;
	/** `serializeStoredProject` text, kept as text so a record that cannot be parsed stays intact. */
	document: string;
}

interface AssetRecord {
	sha256: string;
	blob: Blob;
	mime: ProjectAsset['mime'];
	byteLength: number;
	storedAt: number;
}

interface QuarantineRecord {
	id: string;
	at: number;
	source: 'legacy-autosave' | 'journal';
	reason: string;
	raw: unknown;
}

interface JournalHeader extends WriterMark {
	v: 1;
	campaign: string;
	/** The revision this edit was made on top of. 0 when the campaign has no record yet. */
	base: number;
	at: number;
}

/* -------------------------------------------------------------------------------------- policy */

export type JournalDisposition = 'promote' | 'discard' | 'fork';

/**
 * What to do with a journal entry found at load, given the record it belongs to. A record whose
 * last write came from the same page load is either already past this entry or an earlier state of
 * the same edit stream. A record another page wrote since the entry's base means the entry diverged:
 * it is kept as a separate campaign rather than written over that work.
 */
export function journalDisposition(
	entry: Pick<JournalHeader, 'instance' | 'seq' | 'base'>,
	record: Pick<CampaignRecord, 'revision' | 'lastWriter'> | undefined
): JournalDisposition {
	if (!record) return 'promote';
	if (record.lastWriter.instance === entry.instance)
		return record.lastWriter.seq >= entry.seq ? 'discard' : 'promote';
	return record.revision <= entry.base ? 'promote' : 'fork';
}

/** Whether a page that last knew `base` may write this record without losing another page's work. */
export function writeAllowed(
	record: Pick<CampaignRecord, 'revision' | 'lastWriter'> | undefined,
	base: number,
	instance: string
): boolean {
	return !record || record.revision === base || record.lastWriter.instance === instance;
}

/* -------------------------------------------------------------------------------------- errors */

/**
 * Another tab saved this campaign after this tab last read it, so this edit was not written. It is
 * still in this tab and in its journal. Resolve with `keepAsCopy` or `discardLocalEdits`; until
 * then every save fails the same way rather than writing over the other tab.
 */
export class CampaignConflictError extends Error {
	readonly campaignId: string;
	readonly storedRevision: number;
	readonly storedAt: number;
	constructor(campaignId: string, storedRevision: number, storedAt: number) {
		super('This campaign was changed in another tab, so this tab did not save over it.');
		this.name = 'CampaignConflictError';
		this.campaignId = campaignId;
		this.storedRevision = storedRevision;
		this.storedAt = storedAt;
	}
}

/** A saved campaign could not be read. It has been left exactly as it was. */
export class UnreadableCampaignError extends Error {
	readonly recoverableId: string;
	constructor(recoverableId: string, reason: string) {
		super(
			`Your saved campaign could not be opened (${reason}) It has been kept, and you can download a copy of it.`
		);
		this.name = 'UnreadableCampaignError';
		this.recoverableId = recoverableId;
	}
}

/* ------------------------------------------------------------------------------------ IndexedDB */

function requested<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Browser storage failed.'));
	});
}

function committed(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = transaction.onerror = () =>
			reject(transaction.error ?? new Error('Browser storage failed.'));
	});
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('Browser storage is unavailable. Save a project file to keep your work.'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			db.createObjectStore('campaigns', { keyPath: 'id' });
			db.createObjectStore('assets', { keyPath: 'sha256' });
			db.createObjectStore('quarantine', { keyPath: 'id' });
			db.createObjectStore('meta');
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('Browser storage could not be opened.'));
		request.onblocked = () =>
			reject(new Error('Browser storage is busy. Close other Appshot tabs and try again.'));
	});
}

/* ------------------------------------------------------------------------------- public shapes */

export interface RecoverableItem {
	id: string;
	kind: 'campaign' | 'unreadable';
	title: string;
	savedAt: number;
	frames?: number;
	targets?: number;
	origin?: CampaignOriginKind;
	/** Why it cannot be opened, for `unreadable` items. */
	reason?: string;
	/** Autosaved here most recently; it opens at the next load of a new tab. */
	latest: boolean;
}

export interface IngestedCapture {
	asset: ProjectAsset;
	capture: CaptureFile;
}

export interface IngestResult {
	accepted: IngestedCapture[];
	/** Each names its file. Valid files in the same batch are still accepted. */
	rejected: RejectedCapture[];
}

export interface ExternalChange {
	campaignId: string;
	revision: number;
	title: string;
}

interface SessionAsset {
	blob: Blob;
	url: string;
	/** The bytes are committed to `assets`, so a journal entry may refer to them. */
	durable: boolean;
}

function storageGet(storage: () => Storage, key: string): string | null {
	try {
		return storage().getItem(key);
	} catch {
		return null;
	}
}

function storageSet(storage: () => Storage, key: string, value: string): void {
	try {
		storage().setItem(key, value);
	} catch {
		// Full or blocked. Only the protection this write adds is lost; autosave still runs.
	}
}

function storageRemove(storage: () => Storage, key: string): void {
	try {
		storage().removeItem(key);
	} catch {
		// Blocked storage has nothing to remove.
	}
}

const local = () => localStorage;
const session = () => sessionStorage;

function journalKey(instance: string, campaign: string): string {
	return `${JOURNAL_PREFIX}${instance}.${campaign}`;
}

function parseJournal(raw: string): { header: JournalHeader; document: string } {
	const split = raw.indexOf('\n');
	if (split < 0) throw new Error('the entry is incomplete');
	const header: JournalHeader = JSON.parse(raw.slice(0, split));
	if (
		header?.v !== 1 ||
		typeof header.campaign !== 'string' ||
		typeof header.instance !== 'string' ||
		!Number.isInteger(header.seq) ||
		!Number.isInteger(header.base)
	)
		throw new Error('the entry has an unknown format');
	const document = raw.slice(split + 1);
	parseStoredProject(document);
	return { header, document };
}

function summarize(document: string): Pick<CampaignRecord, 'title' | 'frames' | 'targets'> {
	const project = parseStoredProject(document);
	return { title: project.name, frames: project.slides.length, targets: project.targets.length };
}

function isReadable(document: string): boolean {
	try {
		parseStoredProject(document);
		return true;
	} catch {
		return false;
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : 'unknown error';
}

/** The persistence adapter for `EditorStore<ProjectV2>`, plus the recovery and file operations. */
export class CampaignPersistence implements ProjectPersistence<ProjectV2> {
	readonly #instance = crypto.randomUUID();
	#database: Promise<IDBDatabase> | undefined;
	readonly #assets = new Map<string, SessionAsset>();
	/** The revision this page last read or wrote, per campaign. */
	readonly #bases = new Map<string, number>();
	readonly #seqs = new Map<string, number>();
	readonly #journaled = new WeakMap<ProjectV2, number>();
	/** Slot for a document with no campaign id, such as the example before its first edit. */
	#implicitSlot: string | undefined;
	/** Campaigns this page keeps writing elsewhere after a conflict. */
	readonly #redirects = new Map<string, string>();
	readonly #origins = new Map<string, CampaignOrigin>();
	#notes: string[] = [];
	#tabPointer: string | undefined;
	#channel: BroadcastChannel | undefined;
	readonly #listeners = new Set<(change: ExternalChange) => void>();

	/** Opens on first use, so constructing this during server rendering touches nothing. */
	#db(): Promise<IDBDatabase> {
		if (this.#database) return this.#database;
		this.#connectChannel();
		const opening = openDatabase().then((db) => {
			db.onversionchange = () => {
				db.close();
				this.#database = undefined;
			};
			db.onclose = () => {
				this.#database = undefined;
			};
			return db;
		});
		opening.catch(() => {
			this.#database = undefined;
		});
		this.#database = opening;
		return opening;
	}

	#connectChannel(): void {
		if (this.#channel || typeof BroadcastChannel === 'undefined') return;
		this.#channel = new BroadcastChannel(CHANNEL_NAME);
		this.#channel.onmessage = (event: MessageEvent) => {
			const { instance, campaignId, revision, title } = event.data ?? {};
			if (instance === this.#instance || !this.#bases.has(campaignId)) return;
			for (const listener of this.#listeners) listener({ campaignId, revision, title });
		};
	}

	#slotOf(document: ProjectV2): string {
		const declared = document.campaignId ?? (this.#implicitSlot ??= crypto.randomUUID());
		return this.#redirects.get(declared) ?? declared;
	}

	/** The saved campaign a document writes to, to mark it in `listRecoverable` results. */
	campaignIdOf(document: ProjectV2): string {
		return this.#slotOf(document);
	}

	/* ---------------------------------------------------------------- ProjectPersistence<ProjectV2> */

	rejectReason(document: ProjectV2): string | null {
		let total = 0;
		for (const asset of Object.values(document.assets)) {
			if (isBundledAsset(asset)) continue;
			if (!asset.sha256 || !this.#assets.has(asset.sha256))
				return 'This image has not been stored yet. Add it to the campaign again.';
			total += asset.byteLength;
		}
		return total > MAX_CAMPAIGN_IMAGE_BYTES
			? 'This campaign is too large to save. Remove images you no longer need (180 MB limit).'
			: null;
	}

	forReplacement(next: ProjectV2): ProjectV2 {
		return next.campaignId ? next : { ...next, campaignId: crypto.randomUUID() };
	}

	journal(document: ProjectV2): void {
		const slot = this.#slotOf(document);
		this.#pointTabAt(slot);
		// Bytes the browser refused to store cannot be promised across a reload. The last entry that
		// only refers to durable bytes stays, and status reports the failed save.
		for (const asset of Object.values(document.assets))
			if (!isBundledAsset(asset) && !this.#assets.get(asset.sha256 ?? '')?.durable) return;
		const seq = (this.#seqs.get(slot) ?? 0) + 1;
		this.#seqs.set(slot, seq);
		this.#journaled.set(document, seq);
		const header: JournalHeader = {
			v: 1,
			instance: this.#instance,
			campaign: slot,
			base: this.#bases.get(slot) ?? 0,
			seq,
			at: Date.now()
		};
		storageSet(
			local,
			journalKey(this.#instance, slot),
			`${JSON.stringify(header)}\n${serializeStoredProject(document)}`
		);
	}

	/** Which campaign a reload of this tab should show. Unchanged while typing, so not rewritten. */
	#pointTabAt(slot: string): void {
		if (slot === this.#tabPointer) return;
		this.#tabPointer = slot;
		storageSet(session, TAB_CAMPAIGN_KEY, slot);
	}

	async save(document: ProjectV2): Promise<void> {
		const slot = this.#slotOf(document);
		const text = serializeStoredProject(document);
		// Rejects here, keeping the last good record, rather than storing what could not be reopened.
		parseStoredProject(text);
		const seq = this.#journaled.get(document) ?? this.#seqs.get(slot) ?? 0;
		const db = await this.#db();
		const transaction = db.transaction(['campaigns', 'assets', 'meta'], 'readwrite');
		const finished = committed(transaction);
		let revision: number;
		try {
			const campaigns = transaction.objectStore('campaigns');
			const existing: CampaignRecord | undefined = await requested(campaigns.get(slot));
			if (!writeAllowed(existing, this.#bases.get(slot) ?? 0, this.#instance))
				throw new CampaignConflictError(slot, existing!.revision, existing!.updatedAt);
			await this.#ensureBytes(transaction, document);
			revision = (existing?.revision ?? 0) + 1;
			const record: CampaignRecord = {
				id: slot,
				schema: 2,
				revision,
				updatedAt: Date.now(),
				lastWriter: { instance: this.#instance, seq },
				title: document.name,
				frames: document.slides.length,
				targets: document.targets.length,
				...this.#originField(slot, existing),
				document: text
			};
			campaigns.put(record);
			transaction.objectStore('meta').put(slot, 'active');
		} catch (error) {
			try {
				transaction.abort();
			} catch {
				// A failed request already ended the transaction.
			}
			await finished.catch(() => {});
			throw error;
		}
		await finished;

		for (const asset of Object.values(document.assets)) {
			const held = asset.sha256 ? this.#assets.get(asset.sha256) : undefined;
			if (held) held.durable = true;
		}
		this.#bases.set(slot, revision);
		if ((this.#seqs.get(slot) ?? 0) <= seq) storageRemove(local, journalKey(this.#instance, slot));
		this.#channel?.postMessage({
			instance: this.#instance,
			campaignId: slot,
			revision,
			title: document.name
		});
	}

	#originField(slot: string, existing: CampaignRecord | undefined) {
		const origin = existing?.origin ?? this.#origins.get(slot);
		return origin ? { origin } : {};
	}

	/** Every referenced image must have its bytes in this transaction before a record refers to it. */
	async #ensureBytes(transaction: IDBTransaction, document: ProjectV2): Promise<void> {
		const assets = transaction.objectStore('assets');
		for (const asset of Object.values(document.assets)) {
			if (isBundledAsset(asset)) continue;
			const sha256 = asset.sha256 ?? '';
			const key = await requested(assets.getKey(sha256));
			if (key !== undefined) continue;
			const held = this.#assets.get(sha256);
			if (!held)
				throw new Error(`${asset.name ?? 'An image'} is missing. Add it again to keep your work.`);
			assets.put({
				sha256,
				blob: held.blob,
				mime: asset.mime,
				byteLength: asset.byteLength,
				storedAt: Date.now()
			} satisfies AssetRecord);
		}
	}

	async load(): Promise<ProjectV2 | null> {
		const db = await this.#db();
		this.#notes = [];
		const legacyFailure = await this.#importLegacyOnce(db);
		const tabCampaign = await this.#promoteJournals(db);
		const active: string | undefined = await requested(
			db.transaction('meta').objectStore('meta').get('active')
		);
		const candidates = [tabCampaign, active].filter((id): id is string => Boolean(id));
		for (const id of candidates) {
			const record = await this.#readRecord(db, id);
			if (!record) continue;
			const project = await this.#hydrate(db, record);
			this.#markOpen(record);
			this.#pointTabAt(record.id);
			if (legacyFailure) this.#notes.push(legacyFailure.message);
			return project;
		}
		if (legacyFailure) throw legacyFailure;
		return null;
	}

	/** Findings from the latest `load` worth telling the user. Empties the list. */
	takeRestoreNotes(): string[] {
		const notes = this.#notes;
		this.#notes = [];
		return notes;
	}

	#readRecord(db: IDBDatabase, id: string): Promise<CampaignRecord | undefined> {
		return requested(db.transaction('campaigns').objectStore('campaigns').get(id));
	}

	async #hydrate(db: IDBDatabase, record: CampaignRecord): Promise<ProjectV2> {
		let project: ProjectV2;
		try {
			project = parseStoredProject(record.document);
		} catch (error) {
			throw new UnreadableCampaignError(record.id, errorText(error));
		}
		const missing: ProjectAsset[] = [];
		const store = db.transaction('assets').objectStore('assets');
		const stored = await Promise.all(
			Object.values(project.assets).map(async (asset) => {
				if (isBundledAsset(asset)) return asset;
				const url = await this.#sessionUrl(store, asset.sha256!);
				if (!url) missing.push(asset);
				return { ...asset, url: url ?? '' };
			})
		);
		project = { ...project, assets: Object.fromEntries(stored.map((asset) => [asset.id, asset])) };
		for (const asset of missing) {
			project = removeAsset(project, asset.id);
			this.#notes.push(
				`${asset.name ?? 'An image'} was no longer in browser storage, so it was removed from this campaign. Add it again.`
			);
		}
		return { ...project, campaignId: record.id };
	}

	/** This page now holds `record`, so a later write by another page is a conflict. */
	#markOpen(record: CampaignRecord): void {
		this.#bases.set(record.id, record.revision);
	}

	async #sessionUrl(store: IDBObjectStore, sha256: string): Promise<string | null> {
		const held = this.#assets.get(sha256);
		if (held) return held.url;
		const record: AssetRecord | undefined = await requested(store.get(sha256));
		if (!record) return null;
		const url = URL.createObjectURL(record.blob);
		this.#assets.set(sha256, { blob: record.blob, url, durable: true });
		return url;
	}

	/**
	 * Move the single-slot v1 autosave across, once. The old record is only ever read, so it stays
	 * intact either way; unreadable bytes also get a quarantine copy the user can download.
	 */
	async #importLegacyOnce(db: IDBDatabase): Promise<Error | null> {
		const done = await requested(db.transaction('meta').objectStore('meta').get('legacy-import'));
		if (done) return null;
		let raw: unknown;
		try {
			raw = await readLegacyAutosave();
		} catch {
			return null; // Not readable right now, such as an old tab upgrading it. Try at the next load.
		}
		if (raw === undefined) {
			await this.#writeMeta(db, 'legacy-import', { at: Date.now(), outcome: 'none' });
			return null;
		}
		try {
			if (typeof raw !== 'string') throw new Error('The saved data is not a project.');
			const project = await this.#ingestDocument(migrateCompositionToV2(parseProject(raw)));
			for (const asset of Object.values(project.assets))
				if (!isBundledAsset(asset) && !this.#assets.get(asset.sha256 ?? '')?.durable)
					throw new Error('browser storage is full.');
			const id = crypto.randomUUID();
			const document = serializeStoredProject(project);
			const transaction = db.transaction(['campaigns', 'meta'], 'readwrite');
			const finished = committed(transaction);
			transaction.objectStore('campaigns').put({
				id,
				schema: 2,
				revision: 1,
				updatedAt: Date.now(),
				lastWriter: { instance: this.#instance, seq: 0 },
				...summarize(document),
				origin: { kind: 'legacy-autosave' },
				document
			} satisfies CampaignRecord);
			const meta = transaction.objectStore('meta');
			meta.put({ at: Date.now(), outcome: 'imported', id }, 'legacy-import');
			const active = await requested(meta.get('active'));
			if (!active) meta.put(id, 'active');
			await finished;
			return null;
		} catch (error) {
			const id = 'legacy-autosave';
			const transaction = db.transaction(['quarantine', 'meta'], 'readwrite');
			const finished = committed(transaction);
			transaction.objectStore('quarantine').put({
				id,
				at: Date.now(),
				source: 'legacy-autosave',
				reason: errorText(error),
				raw
			} satisfies QuarantineRecord);
			transaction
				.objectStore('meta')
				.put({ at: Date.now(), outcome: 'unreadable' }, 'legacy-import');
			await finished;
			return new UnreadableCampaignError(id, errorText(error));
		}
	}

	async #writeMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
		const transaction = db.transaction('meta', 'readwrite');
		const finished = committed(transaction);
		transaction.objectStore('meta').put(value, key);
		await finished;
	}

	/**
	 * Apply journal entries left by earlier page loads, oldest first. Each is removed only after its
	 * outcome has committed, so a crash here repeats safely. Returns the campaign this tab should
	 * show: normally the one it was editing, or its split-off copy if its edit diverged.
	 */
	async #promoteJournals(db: IDBDatabase): Promise<string | null> {
		let tabCampaign = storageGet(session, TAB_CAMPAIGN_KEY);
		const entries: { key: string; raw: string; header: JournalHeader; document: string }[] = [];
		for (const key of this.#journalKeys()) {
			const raw = storageGet(local, key);
			if (raw === null) continue;
			try {
				entries.push({ key, raw, ...parseJournal(raw) });
			} catch (error) {
				await this.#quarantineJournal(db, key, raw, errorText(error));
			}
		}
		entries.sort((a, b) => a.header.at - b.header.at);
		for (const { key, raw, header, document } of entries) {
			const transaction = db.transaction(['campaigns', 'meta'], 'readwrite');
			const finished = committed(transaction);
			const campaigns = transaction.objectStore('campaigns');
			const record: CampaignRecord | undefined = await requested(campaigns.get(header.campaign));
			const disposition =
				record && !isReadable(record.document) ? 'fork' : journalDisposition(header, record);
			const mark = { instance: header.instance, seq: header.seq };
			if (disposition === 'promote') {
				campaigns.put({
					id: header.campaign,
					schema: 2,
					revision: (record?.revision ?? 0) + 1,
					updatedAt: header.at,
					lastWriter: mark,
					...summarize(document),
					...(record?.origin ? { origin: record.origin } : {}),
					document
				} satisfies CampaignRecord);
				transaction.objectStore('meta').put(header.campaign, 'active');
			} else if (disposition === 'fork') {
				const id = `recovered-${header.instance}-${header.seq}`;
				campaigns.put({
					id,
					schema: 2,
					revision: 1,
					updatedAt: header.at,
					lastWriter: mark,
					...summarize(document),
					origin: { kind: 'recovered-edit', of: header.campaign },
					document
				} satisfies CampaignRecord);
				if (tabCampaign === header.campaign) tabCampaign = id;
				this.#notes.push(
					'Another tab changed this campaign before your last edit was saved, so that edit was kept as a separate copy.'
				);
			}
			await finished;
			// A live tab may have written a newer entry here meanwhile, and that one is still needed.
			if (storageGet(local, key) === raw) storageRemove(local, key);
		}
		return tabCampaign;
	}

	#journalKeys(): string[] {
		try {
			return Object.keys(localStorage).filter(
				(key) =>
					key.startsWith(JOURNAL_PREFIX) && !key.startsWith(`${JOURNAL_PREFIX}${this.#instance}.`)
			);
		} catch {
			return [];
		}
	}

	async #quarantineJournal(
		db: IDBDatabase,
		key: string,
		raw: string,
		reason: string
	): Promise<void> {
		const transaction = db.transaction('quarantine', 'readwrite');
		const finished = committed(transaction);
		transaction.objectStore('quarantine').put({
			id: key,
			at: Date.now(),
			source: 'journal',
			reason,
			raw
		} satisfies QuarantineRecord);
		await finished;
		storageRemove(local, key);
		this.#notes.push('An unsaved edit could not be read. It has been kept for you to download.');
	}

	/* ---------------------------------------------------------------------------- adding images */

	/**
	 * Read screenshot files and store their bytes, so they are safe before any document refers to
	 * them. A bad file is reported by name and the rest still load. If the browser refuses to store
	 * an image it is kept for this session; saves then report failure until a save can store it.
	 */
	async ingestFiles(files: Iterable<File>, options?: ReadCaptureOptions): Promise<IngestResult> {
		const { accepted, rejected } = await readCaptures(files, options);
		const ingested: IngestedCapture[] = [];
		for (const capture of accepted) {
			const url = await this.#storeBytes(capture.sha256, capture.blob, capture.mime);
			ingested.push({ capture, asset: assetFromCapture(capture, url) });
		}
		return { accepted: ingested, rejected };
	}

	async #storeBytes(sha256: string, blob: Blob, mime: ProjectAsset['mime']): Promise<string> {
		let held = this.#assets.get(sha256);
		if (!held) {
			held = { blob, url: URL.createObjectURL(blob), durable: false };
			this.#assets.set(sha256, held);
		}
		if (!held.durable) {
			try {
				const db = await this.#db();
				const transaction = db.transaction('assets', 'readwrite');
				const finished = committed(transaction);
				const assets = transaction.objectStore('assets');
				const key = await requested(assets.getKey(sha256));
				if (key === undefined)
					assets.put({
						sha256,
						blob,
						mime,
						byteLength: blob.size,
						storedAt: Date.now()
					} satisfies AssetRecord);
				await finished;
				held.durable = true;
			} catch {
				// Stays usable this session. `journal` skips it and `save` retries, reporting any failure.
			}
		}
		return held.url;
	}

	/* ------------------------------------------------------------------------------- project files */

	/**
	 * Open a project file of any supported version: validate it, store its images by hash, and return
	 * a document ready for `store.replaceProject`. Identical images merge into one asset.
	 */
	async importPortable(source: Blob | string): Promise<ProjectV2> {
		if (typeof source !== 'string' && source.size > MAX_PORTABLE_PROJECT_BYTES)
			throw new Error('Choose a project file under 256 MB.');
		return this.#ingestDocument(
			parseProjectV2(typeof source === 'string' ? source : await source.text())
		);
	}

	async #ingestDocument(project: ProjectV2): Promise<ProjectV2> {
		const hashes = new Map<string, string>();
		const renames = new Map<string, string>();
		const assets: Record<string, ProjectAsset> = {};
		for (const asset of Object.values(project.assets)) {
			if (isBundledAsset(asset)) {
				assets[asset.id] = asset;
				continue;
			}
			const { mime, bytes } = bytesFromDataUrl(asset.url);
			if (sniffImage(bytes)?.mime !== mime)
				throw new Error('The project contains an image that is not what it claims to be.');
			const sha256 = await sha256Hex(bytes);
			if (asset.sha256 && asset.sha256 !== sha256)
				throw new Error('The project contains an image whose bytes do not match its record.');
			const known = hashes.get(sha256);
			if (known) {
				renames.set(asset.id, known);
				continue;
			}
			hashes.set(sha256, asset.id);
			const url = await this.#storeBytes(sha256, new Blob([bytes], { type: mime }), mime);
			assets[asset.id] = { ...asset, sha256, byteLength: bytes.byteLength, url };
		}
		return rewriteAssetIds({ ...project, assets }, renames);
	}

	/** A self-contained project file: every image embedded, ready to reopen on another computer. */
	async exportPortable(document: ProjectV2): Promise<Blob> {
		const assets: Record<string, ProjectAsset> = {};
		for (const asset of Object.values(document.assets)) {
			const blob = await this.#assetBlob(asset);
			const bytes = new Uint8Array(await blob.arrayBuffer());
			const sniffed = sniffImage(bytes);
			if (!sniffed)
				throw new Error(
					`${asset.name ?? 'An image'} is damaged. Add it again to save the project.`
				);
			assets[asset.id] = {
				...asset,
				mime: sniffed.mime,
				sha256: await sha256Hex(bytes),
				byteLength: bytes.byteLength,
				url: dataUrlFromBytes(bytes, sniffed.mime)
			};
		}
		return new Blob(serializePortableProject({ ...document, assets }), {
			type: 'application/json'
		});
	}

	async #assetBlob(asset: ProjectAsset): Promise<Blob> {
		const held = asset.sha256 ? this.#assets.get(asset.sha256) : undefined;
		if (held) return held.blob;
		const response = await fetch(asset.url).catch(() => null);
		if (!response?.ok)
			throw new Error(
				'An original screenshot is missing. Add it again to save the complete project.'
			);
		return response.blob();
	}

	/* -------------------------------------------------------------------------------- other tabs */

	/** Hear when another tab saves a campaign this page has open. Returns the unsubscribe. */
	onExternalChange(listener: (change: ExternalChange) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Resolve a conflict by keeping this tab's document as a separate campaign, leaving the other
	 * tab's work untouched. Follow with `store.saveNow()`. Undo in this tab keeps working in the copy.
	 */
	keepAsCopy(document: ProjectV2): void {
		const copy = crypto.randomUUID();
		const previous = this.#slotOf(document);
		const declared = document.campaignId ?? (this.#implicitSlot ??= crypto.randomUUID());
		this.#redirects.set(declared, copy);
		this.#origins.set(copy, { kind: 'conflict-copy', of: previous });
		// Journal the copy before dropping the old entry, so no moment leaves these edits unprotected.
		this.journal(document);
		storageRemove(local, journalKey(this.#instance, previous));
	}

	/**
	 * Resolve a conflict by dropping this tab's unsaved edits. Reload the page afterward to show the
	 * other tab's version.
	 */
	discardLocalEdits(document: ProjectV2): void {
		const slot = this.#slotOf(document);
		storageRemove(local, journalKey(this.#instance, slot));
		this.#bases.delete(slot);
	}

	/* ---------------------------------------------------------------------------------- recovery */

	/** Every campaign kept in this browser, newest first, and anything that could not be read. */
	async listRecoverable(): Promise<RecoverableItem[]> {
		const db = await this.#db();
		const transaction = db.transaction(['campaigns', 'quarantine', 'meta']);
		const [records, quarantined, active] = await Promise.all([
			requested<CampaignRecord[]>(transaction.objectStore('campaigns').getAll()),
			requested<QuarantineRecord[]>(transaction.objectStore('quarantine').getAll()),
			requested<string | undefined>(transaction.objectStore('meta').get('active'))
		]);
		const campaigns = records.map((record): RecoverableItem => {
			let reason: string | undefined;
			try {
				parseStoredProject(record.document);
			} catch (error) {
				reason = errorText(error);
			}
			return {
				id: record.id,
				kind: reason ? 'unreadable' : 'campaign',
				title: record.title,
				savedAt: record.updatedAt,
				frames: record.frames,
				targets: record.targets,
				...(record.origin ? { origin: record.origin.kind } : {}),
				...(reason ? { reason } : {}),
				latest: record.id === active
			};
		});
		const unreadable = quarantined.map(
			(item): RecoverableItem => ({
				id: item.id,
				kind: 'unreadable',
				title: item.source === 'journal' ? 'Unsaved edit' : 'Earlier autosave',
				savedAt: item.at,
				reason: item.reason,
				latest: false
			})
		);
		return [...campaigns, ...unreadable].sort((a, b) => b.savedAt - a.savedAt);
	}

	/** Open a kept campaign for `store.replaceProject`. Further edits continue that campaign. */
	async openRecoverable(id: string): Promise<ProjectV2> {
		const db = await this.#db();
		const record = await this.#readRecord(db, id);
		if (!record) throw new Error('That campaign is no longer in this browser.');
		const project = await this.#hydrate(db, record);
		this.#markOpen(record);
		return project;
	}

	/**
	 * Download a kept item as it is: a project file for a readable campaign, the unchanged bytes for
	 * anything that could not be read.
	 */
	async exportRecoverable(id: string): Promise<Blob> {
		const db = await this.#db();
		const record = await this.#readRecord(db, id);
		if (record) {
			try {
				return await this.exportPortable(await this.#hydrate(db, record));
			} catch {
				return new Blob([record.document], { type: 'application/json' });
			}
		}
		const item: QuarantineRecord | undefined = await requested(
			db.transaction('quarantine').objectStore('quarantine').get(id)
		);
		if (!item) throw new Error('That item is no longer in this browser.');
		return new Blob([typeof item.raw === 'string' ? item.raw : JSON.stringify(item.raw)], {
			type: 'application/json'
		});
	}

	/**
	 * Permanently delete a kept item, after the user has asked to, and any image bytes nothing else
	 * uses. A live tab that still needs an image restores it from its own session on its next save.
	 */
	async discardRecoverable(id: string): Promise<void> {
		const db = await this.#db();
		const transaction = db.transaction(['campaigns', 'quarantine', 'assets'], 'readwrite');
		const finished = committed(transaction);
		const campaigns = transaction.objectStore('campaigns');
		campaigns.delete(id);
		transaction.objectStore('quarantine').delete(id);
		const records = await requested<CampaignRecord[]>(campaigns.getAll());
		const used = new Set(this.#assets.keys());
		const collect = (document: string) => {
			try {
				for (const asset of Object.values(parseStoredProject(document).assets))
					if (asset.sha256) used.add(asset.sha256);
			} catch {
				// An unreadable record's references cannot be known, and its bytes may matter. Keep all.
				used.add('*');
			}
		};
		for (const record of records) collect(record.document);
		for (const key of this.#allJournalKeys()) {
			const raw = storageGet(local, key);
			if (raw) collect(raw.slice(raw.indexOf('\n') + 1));
		}
		if (!used.has('*')) {
			const assets = transaction.objectStore('assets');
			const keys = await requested(assets.getAllKeys());
			for (const key of keys) if (!used.has(String(key))) assets.delete(key);
		}
		await finished;
	}

	#allJournalKeys(): string[] {
		try {
			return Object.keys(localStorage).filter((key) => key.startsWith(JOURNAL_PREFIX));
		} catch {
			return [];
		}
	}

	/** Release this page's connections. Stored data and session image URLs stay valid. */
	close(): void {
		this.#channel?.close();
		this.#channel = undefined;
		void this.#database?.then((db) => db.close()).catch(() => {});
		this.#database = undefined;
	}
}

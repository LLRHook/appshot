import { documentsEqual } from './equal';
import type { ProjectPersistence } from './persistence';

/** What the store needs from a document: its frames, to keep the selection valid. */
export interface EditorDocument {
	readonly slides: readonly unknown[];
}

/**
 * `opening` until `restore` settles; `example` when nothing was saved; `unavailable` when the
 * saved document could not be read; `failed` when the latest write did not land.
 */
export type SaveStatus = 'opening' | 'example' | 'saved' | 'saving' | 'unavailable' | 'failed';

export interface ApplyOptions {
	/**
	 * Applies sharing a key form one undo step until a boundary: another key, a command without
	 * a key, `checkpoint`, `select`, `undo`, `redo` or `replaceProject`.
	 */
	coalesce?: string;
	/** Frame to select with this change; clamped to the new document. */
	select?: number;
}

export type ApplyResult =
	| { status: 'applied' | 'unchanged' }
	| { status: 'rejected'; reason: string };

export type RestoreResult =
	| { status: 'restored' | 'empty' }
	/** The store was edited or disposed during the read, so the result was discarded. */
	| { status: 'superseded' }
	| { status: 'failed'; error: unknown };

export interface EditorStoreOptions<D extends EditorDocument> {
	initial: D;
	persistence: ProjectPersistence<D>;
	/** Repairs invariants on every incoming change, e.g. clearing a broken connected pair. */
	normalize?: (next: D) => D;
	/** Undo steps kept. Older steps fall off. */
	historyLimit?: number;
	autosaveDelayMs?: number;
	/** The latest write failed. Fires once per failed revision, never for a superseded one. */
	onSaveFailed?: (error: unknown) => void;
}

interface HistoryEntry<D> {
	readonly project: D;
	readonly selectedIndex: number;
}

/**
 * The editor's one writer of campaign state: immutable commits, undo history, frame selection
 * and autosave timing. Documents are plain immutable values held in `$state.raw`; rendering and
 * export stay with the callers. Reads are reactive, and all writes go through the commands.
 */
export class EditorStore<D extends EditorDocument> {
	#project = $state.raw() as D;
	#selectedIndex = $state(0);
	#past = $state.raw<readonly HistoryEntry<D>[]>([]);
	#future = $state.raw<readonly HistoryEntry<D>[]>([]);
	#status = $state<SaveStatus>('opening');

	readonly #persistence: ProjectPersistence<D>;
	readonly #normalize: (next: D) => D;
	readonly #historyLimit: number;
	readonly #autosaveDelayMs: number;
	readonly #onSaveFailed: ((error: unknown) => void) | undefined;
	/** Key of the undo step that later applies may still join. */
	#openGroup: string | null = null;
	#revision = 0;
	#saveTimer: ReturnType<typeof setTimeout> | undefined;
	/** Writes run one at a time, in order. Never rejects; failures land in `status`. */
	#saves: Promise<void> = Promise.resolve();
	#disposed = false;

	constructor(options: EditorStoreOptions<D>) {
		this.#project = options.initial;
		this.#persistence = options.persistence;
		this.#normalize = options.normalize ?? ((next) => next);
		this.#historyLimit = options.historyLimit ?? 25;
		this.#autosaveDelayMs = options.autosaveDelayMs ?? 350;
		this.#onSaveFailed = options.onSaveFailed;
	}

	get project(): D {
		return this.#project;
	}
	get selectedIndex(): number {
		return this.#selectedIndex;
	}
	get status(): SaveStatus {
		return this.#status;
	}
	/** False until the saved document has been read, so edits cannot race the restore. */
	get ready(): boolean {
		return this.#status !== 'opening';
	}
	get canUndo(): boolean {
		return this.#past.length > 0;
	}
	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	/** Commit a new document. A structurally identical one changes nothing, not even redo. */
	apply(next: D, options: ApplyOptions = {}): ApplyResult {
		const normalized = this.#normalize(next);
		const selectedIndex = this.#clamp(options.select ?? this.#selectedIndex, normalized);
		if (documentsEqual(this.#project, normalized)) {
			this.#selectedIndex = selectedIndex;
			return { status: 'unchanged' };
		}
		const reason = this.#persistence.rejectReason?.(normalized);
		if (reason) return { status: 'rejected', reason };
		if (!options.coalesce || options.coalesce !== this.#openGroup) {
			this.checkpoint();
			this.#past = [...this.#past, this.#entry()].slice(-this.#historyLimit);
			this.#openGroup = options.coalesce ?? null;
		}
		this.#future = [];
		this.#project = normalized;
		this.#selectedIndex = selectedIndex;
		this.#scheduleSave();
		return { status: 'applied' };
	}

	/**
	 * Swap in a whole different campaign as one undoable step, selecting its first frame. Any pending
	 * write of the outgoing campaign goes first, so replacing it cannot drop its last edits.
	 */
	replaceProject(next: D): ApplyResult {
		const incoming = this.#persistence.forReplacement?.(next) ?? next;
		if (this.#saveTimer !== undefined) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = undefined;
			this.#write();
		}
		return this.apply(incoming, { select: 0 });
	}

	/**
	 * Change save identities without adding an undo step or losing redo. Used when a conflicting
	 * campaign becomes a copy: its past and future edits must follow that copy, while entries for
	 * other campaigns keep their own identities. The mapper changes identity metadata only; flush
	 * earlier writes before calling this so they cannot race the new identity.
	 */
	remapDocuments(remap: (document: D) => D): void {
		this.checkpoint();
		this.#project = remap(this.#project);
		this.#past = this.#past.map((entry) => ({ ...entry, project: remap(entry.project) }));
		this.#future = this.#future.map((entry) => ({ ...entry, project: remap(entry.project) }));
		this.#scheduleSave();
	}

	/** The current or nearest undo/redo document matching a save identity, without changing history. */
	findDocument(matches: (document: D) => boolean): D | undefined {
		if (matches(this.#project)) return this.#project;
		for (const history of [this.#past, this.#future]) {
			for (let index = history.length - 1; index >= 0; index--)
				if (matches(history[index].project)) return history[index].project;
		}
		return undefined;
	}

	/** Change the edited frame. Selection alone is not an undo step, but it ends the open one. */
	select(index: number): void {
		this.checkpoint();
		this.#selectedIndex = this.#clamp(index, this.#project);
	}

	/** End the open undo step. One that netted out to no change is dropped. */
	checkpoint(): void {
		if (this.#openGroup === null) return;
		this.#openGroup = null;
		const base = this.#past.at(-1);
		if (base && documentsEqual(base.project, this.#project)) this.#past = this.#past.slice(0, -1);
	}

	undo(): boolean {
		this.checkpoint();
		const entry = this.#past.at(-1);
		if (!entry) return false;
		this.#past = this.#past.slice(0, -1);
		this.#future = [...this.#future, this.#entry()];
		this.#restoreEntry(entry);
		return true;
	}

	redo(): boolean {
		this.checkpoint();
		const entry = this.#future.at(-1);
		if (!entry) return false;
		this.#future = this.#future.slice(0, -1);
		this.#past = [...this.#past, this.#entry()];
		this.#restoreEntry(entry);
		return true;
	}

	/** Read the saved document once at startup. It enters without an undo step or a write. */
	async restore(): Promise<RestoreResult> {
		const revision = this.#revision;
		const superseded = () => this.#disposed || revision !== this.#revision;
		try {
			const saved = await this.#persistence.load();
			if (superseded()) return { status: 'superseded' };
			if (saved) {
				this.#project = this.#normalize(saved);
				this.#selectedIndex = 0;
			}
			this.#status = saved ? 'saved' : 'example';
			return { status: saved ? 'restored' : 'empty' };
		} catch (error) {
			if (superseded()) return { status: 'superseded' };
			this.#status = 'unavailable';
			return { status: 'failed', error };
		}
	}

	/** Write a pending change now. Resolves when every write has settled; read `status` after. */
	flush(): Promise<void> {
		if (this.#saveTimer !== undefined) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = undefined;
			this.#write();
		}
		return this.#saves;
	}

	/**
	 * Write the current document now, even with nothing pending. For retrying after a failure the
	 * user resolved, such as keeping a conflicting edit as a copy. Resolves like `flush`.
	 */
	saveNow(): Promise<void> {
		clearTimeout(this.#saveTimer);
		this.#saveTimer = undefined;
		this.#revision++;
		this.#status = 'saving';
		this.#write();
		return this.#saves;
	}

	/** Teardown: a pending change is written, not dropped, and an unfinished restore is ignored. */
	dispose(): Promise<void> {
		this.#disposed = true;
		return this.flush();
	}

	#entry(): HistoryEntry<D> {
		return { project: this.#project, selectedIndex: this.#selectedIndex };
	}

	#restoreEntry(entry: HistoryEntry<D>): void {
		this.#project = entry.project;
		this.#selectedIndex = this.#clamp(entry.selectedIndex, entry.project);
		this.#scheduleSave();
	}

	#clamp(index: number, document: D): number {
		return Math.max(0, Math.min(index, document.slides.length - 1));
	}

	#scheduleSave(): void {
		this.#revision++;
		this.#status = 'saving';
		try {
			this.#persistence.journal?.(this.#project);
		} catch {
			// Best effort by contract: the edit still reaches the autosave write below.
		}
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => {
			this.#saveTimer = undefined;
			this.#write();
		}, this.#autosaveDelayMs);
	}

	#write(): void {
		const revision = this.#revision;
		const document = this.#project;
		this.#saves = this.#saves
			.then(() => this.#persistence.save(document))
			.then(
				() => {
					if (revision === this.#revision) this.#status = 'saved';
				},
				(error: unknown) => {
					if (revision !== this.#revision) return;
					this.#status = 'failed';
					this.#onSaveFailed?.(error);
				}
			);
	}
}

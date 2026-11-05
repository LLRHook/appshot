import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectV2 } from '$lib/model/contracts';
import { documentsEqual } from './equal';
import type { ProjectPersistence } from './persistence';
import { EditorStore, type EditorDocument, type EditorStoreOptions } from './store.svelte';

interface Doc extends EditorDocument {
	title: string;
	slides: string[];
	note?: string;
}

const AUTOSAVE_MS = 350;
const doc = (title: string, slides = ['a', 'b', 'c']): Doc => ({ title, slides });

function memoryPersistence(saved: Doc | null = null) {
	const writes: Doc[] = [];
	const persistence: ProjectPersistence<Doc> = {
		load: async () => saved,
		save: async (document) => {
			writes.push(document);
		}
	};
	return { persistence, writes };
}

function makeStore(options: Partial<EditorStoreOptions<Doc>> = {}) {
	const { persistence, writes } = memoryPersistence();
	const store = new EditorStore<Doc>({
		initial: doc('start'),
		persistence,
		autosaveDelayMs: AUTOSAVE_MS,
		...options
	});
	return { store, writes };
}

/** A save the test finishes by hand, to observe the store while a write is in flight. */
function manualSave() {
	const calls: { document: Doc; resolve: () => void; reject: (error: unknown) => void }[] = [];
	const persistence: ProjectPersistence<Doc> = {
		load: async () => null,
		save: (document) =>
			new Promise<void>((resolve, reject) => {
				calls.push({ document, resolve, reject });
			})
	};
	return { persistence, calls };
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('undo history', () => {
	it('undoes and redoes commits, returning the exact earlier documents', () => {
		const { store } = makeStore();
		const first = store.project;
		const second = doc('second');
		expect(store.apply(second)).toEqual({ status: 'applied' });
		expect(store.project).toBe(second);
		expect(store.canUndo).toBe(true);
		expect(store.canRedo).toBe(false);

		expect(store.undo()).toBe(true);
		expect(store.project).toBe(first);
		expect(store.canUndo).toBe(false);
		expect(store.canRedo).toBe(true);

		expect(store.redo()).toBe(true);
		expect(store.project).toBe(second);
	});

	it('reports when there is nothing to undo or redo', () => {
		const { store } = makeStore();
		expect(store.undo()).toBe(false);
		expect(store.redo()).toBe(false);
	});

	it('discards redo when a new edit branches off', () => {
		const { store } = makeStore();
		store.apply(doc('second'));
		store.undo();
		store.apply(doc('branch'));
		expect(store.canRedo).toBe(false);
		expect(store.redo()).toBe(false);
		expect(store.project.title).toBe('branch');
	});

	it('keeps only the newest steps up to the limit', () => {
		const { store } = makeStore({ historyLimit: 3 });
		for (const title of ['1', '2', '3', '4', '5']) store.apply(doc(title));
		expect(store.undo() && store.undo() && store.undo()).toBe(true);
		expect(store.project.title).toBe('2');
		expect(store.undo()).toBe(false);
	});

	it('never mutates a committed document', () => {
		const { store } = makeStore({ initial: Object.freeze(doc('start')) });
		const next = Object.freeze(doc('next'));
		store.apply(next);
		store.undo();
		store.redo();
		expect(store.project).toBe(next);
	});
});

describe('no-op guard', () => {
	it('adds no step and schedules no write for a structurally identical document', () => {
		const { store, writes } = makeStore();
		expect(store.apply({ ...doc('start') })).toEqual({ status: 'unchanged' });
		expect(store.canUndo).toBe(false);
		expect(store.status).toBe('opening');
		vi.advanceTimersByTime(AUTOSAVE_MS * 2);
		expect(writes).toEqual([]);
	});

	it('keeps redo available after a no-op', () => {
		const { store } = makeStore();
		store.apply(doc('second'));
		store.undo();
		store.apply({ ...store.project });
		expect(store.canRedo).toBe(true);
	});

	it('compares after normalizing, so a repaired document can equal the current one', () => {
		const { store } = makeStore({
			normalize: (next) =>
				next.note === 'broken' ? { title: next.title, slides: next.slides } : next
		});
		expect(store.apply({ ...doc('start'), note: 'broken' }).status).toBe('unchanged');
		expect(store.canUndo).toBe(false);
	});

	it('still moves a selection passed with an unchanged document', () => {
		const { store } = makeStore();
		store.apply({ ...doc('start') }, { select: 2 });
		expect(store.selectedIndex).toBe(2);
	});
});

describe('coalescing', () => {
	const type = (store: EditorStore<Doc>, text: string, key = 'headline') => {
		for (let end = 1; end <= text.length; end++) {
			store.apply({ ...store.project, title: text.slice(0, end) }, { coalesce: key });
		}
	};

	it('turns a typed word into one undo step', () => {
		const { store } = makeStore();
		type(store, 'hello');
		expect(store.project.title).toBe('hello');
		store.undo();
		expect(store.project.title).toBe('start');
		expect(store.canUndo).toBe(false);
		store.redo();
		expect(store.project.title).toBe('hello');
	});

	it('starts a new step when the key changes', () => {
		const { store } = makeStore();
		type(store, 'ab', 'headline');
		type(store, 'cd', 'subtitle');
		store.undo();
		expect(store.project.title).toBe('ab');
		store.undo();
		expect(store.project.title).toBe('start');
	});

	it('does not coalesce commands without a key', () => {
		const { store } = makeStore();
		store.apply(doc('one'));
		store.apply(doc('two'));
		store.undo();
		expect(store.project.title).toBe('one');
	});

	it('ends the step at a checkpoint, such as a released slider', () => {
		const { store } = makeStore();
		type(store, 'ab');
		store.checkpoint();
		type(store, 'abcd');
		store.undo();
		expect(store.project.title).toBe('ab');
		store.undo();
		expect(store.project.title).toBe('start');
	});

	it('ends the step when the selection changes', () => {
		const { store } = makeStore();
		type(store, 'ab');
		store.select(1);
		type(store, 'abcd');
		store.undo();
		expect(store.project.title).toBe('ab');
	});

	it('ends the step at undo, so later typing cannot rejoin it', () => {
		const { store } = makeStore();
		type(store, 'ab');
		store.undo();
		type(store, 'x');
		store.undo();
		expect(store.project.title).toBe('start');
		expect(store.canUndo).toBe(false);
	});

	it('ends the step when an edit without a key arrives', () => {
		const { store } = makeStore();
		type(store, 'ab');
		store.apply(doc('button'));
		type(store, 'abc');
		store.undo();
		expect(store.project.title).toBe('button');
		store.undo();
		expect(store.project.title).toBe('ab');
	});

	it('keeps an earlier delete recoverable after 100 keystrokes', () => {
		const { store } = makeStore({ historyLimit: 25 });
		store.apply(doc('start', ['a', 'b']));
		const typed = 'x'.repeat(100);
		type(store, typed);
		store.undo();
		expect(store.project.slides).toEqual(['a', 'b']);
		store.undo();
		expect(store.project.slides).toEqual(['a', 'b', 'c']);
	});

	it('drops a step whose edits net out to no change', () => {
		const { store } = makeStore();
		store.apply({ ...store.project, title: 'dragged' }, { coalesce: 'slider' });
		store.apply({ ...store.project, title: 'start' }, { coalesce: 'slider' });
		store.checkpoint();
		expect(store.canUndo).toBe(false);
	});

	it('undoes the previous real step when the open step netted out', () => {
		const { store } = makeStore();
		store.apply(doc('real'));
		store.apply({ ...store.project, title: 'dragged' }, { coalesce: 'slider' });
		store.apply({ ...store.project, title: 'real' }, { coalesce: 'slider' });
		store.undo();
		expect(store.project.title).toBe('start');
	});
});

describe('selection', () => {
	it('restores the frame that was selected when the undone edit was made', () => {
		const { store } = makeStore();
		store.select(2);
		store.apply({ ...store.project, title: 'edited frame 3' });
		store.select(0);
		store.undo();
		expect(store.selectedIndex).toBe(2);
		store.redo();
		expect(store.selectedIndex).toBe(0);
	});

	it('moves with an edit and comes back on undo', () => {
		const { store } = makeStore();
		store.apply({ ...store.project, slides: ['b', 'a', 'c'] }, { select: 1 });
		expect(store.selectedIndex).toBe(1);
		store.undo();
		expect(store.selectedIndex).toBe(0);
	});

	it('clamps to the frames that exist after a delete', () => {
		const { store } = makeStore();
		store.select(2);
		store.apply({ ...store.project, slides: ['a'] });
		expect(store.selectedIndex).toBe(0);
		store.undo();
		expect(store.selectedIndex).toBe(2);
	});

	it('clamps out-of-range requests', () => {
		const { store } = makeStore();
		store.select(99);
		expect(store.selectedIndex).toBe(2);
		store.select(-1);
		expect(store.selectedIndex).toBe(0);
	});
});

describe('normalize and rejection', () => {
	it('stores the repaired document', () => {
		const { store } = makeStore({
			normalize: (next) => ({ ...next, slides: next.slides.filter(Boolean) })
		});
		store.apply(doc('next', ['a', '']));
		expect(store.project.slides).toEqual(['a']);
	});

	it('leaves state, history and autosave alone when persistence rejects a document', async () => {
		const { persistence, writes } = memoryPersistence();
		const { store } = makeStore({
			persistence: {
				...persistence,
				rejectReason: (document) => (document.title === 'huge' ? 'Too large.' : null)
			}
		});
		store.apply(doc('kept'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		expect(store.status).toBe('saved');

		expect(store.apply(doc('huge'), { select: 2 })).toEqual({
			status: 'rejected',
			reason: 'Too large.'
		});
		expect(store.project.title).toBe('kept');
		expect(store.selectedIndex).toBe(0);
		expect(store.status).toBe('saved');
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		expect(writes.map((d) => d.title)).toEqual(['kept']);
		store.undo();
		expect(store.project.title).toBe('start');
		expect(store.canUndo).toBe(false);
	});
});

describe('replaceProject', () => {
	it('swaps the campaign as one undoable step and selects its first frame', () => {
		const { store } = makeStore();
		store.select(2);
		const opened = doc('opened', ['x', 'y', 'z', 'w']);
		expect(store.replaceProject(opened).status).toBe('applied');
		expect(store.project).toBe(opened);
		expect(store.selectedIndex).toBe(0);
		store.undo();
		expect(store.project.title).toBe('start');
		expect(store.selectedIndex).toBe(2);
	});

	it('ends an open typing step', () => {
		const { store } = makeStore();
		store.apply({ ...store.project, title: 'typed' }, { coalesce: 'headline' });
		store.replaceProject(doc('opened'));
		store.apply({ ...store.project, title: 'more' }, { coalesce: 'headline' });
		store.undo();
		expect(store.project.title).toBe('opened');
		store.undo();
		expect(store.project.title).toBe('typed');
	});

	it('returns the rejection without replacing', () => {
		const { persistence } = memoryPersistence();
		const { store } = makeStore({
			persistence: { ...persistence, rejectReason: () => 'No.' }
		});
		expect(store.replaceProject(doc('opened'))).toEqual({ status: 'rejected', reason: 'No.' });
		expect(store.project.title).toBe('start');
	});
});

describe('autosave', () => {
	it('debounces rapid edits into one write of the latest document', async () => {
		const { store, writes } = makeStore();
		store.apply(doc('one'));
		vi.advanceTimersByTime(AUTOSAVE_MS - 1);
		store.apply(doc('two'));
		expect(store.status).toBe('saving');
		vi.advanceTimersByTime(AUTOSAVE_MS - 1);
		expect(writes).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(writes.map((d) => d.title)).toEqual(['two']);
		expect(store.status).toBe('saved');
	});

	it('autosaves after undo and redo', async () => {
		const { store, writes } = makeStore();
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		store.undo();
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		store.redo();
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		expect(writes.map((d) => d.title)).toEqual(['one', 'start', 'one']);
	});

	it('runs writes in order, and only the newest write settles the status', async () => {
		const { persistence, calls } = manualSave();
		const { store } = makeStore({ persistence });
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		store.apply(doc('two'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		expect(calls.map((call) => call.document.title)).toEqual(['one']);

		calls[0].resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('saving');
		expect(calls.map((call) => call.document.title)).toEqual(['one', 'two']);

		calls[1].resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('saved');
	});

	it('reports a failure of the newest write, then recovers on the next success', async () => {
		const onSaveFailed = vi.fn();
		const { persistence, calls } = manualSave();
		const { store } = makeStore({ persistence, onSaveFailed });
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		const failure = new Error('quota');
		calls[0].reject(failure);
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('failed');
		expect(onSaveFailed).toHaveBeenCalledExactlyOnceWith(failure);

		store.apply(doc('two'));
		expect(store.status).toBe('saving');
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		calls[1].resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('saved');
		expect(onSaveFailed).toHaveBeenCalledOnce();
	});

	it('ignores the failure of a write a newer edit already replaced', async () => {
		const onSaveFailed = vi.fn();
		const { persistence, calls } = manualSave();
		const { store } = makeStore({ persistence, onSaveFailed });
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		store.apply(doc('two'));
		calls[0].reject(new Error('quota'));
		await vi.advanceTimersByTimeAsync(0);
		expect(store.status).toBe('saving');
		expect(onSaveFailed).not.toHaveBeenCalled();
	});

	it('treats a save that throws synchronously as a failed write', async () => {
		const onSaveFailed = vi.fn();
		const { store } = makeStore({
			onSaveFailed,
			persistence: {
				load: async () => null,
				save: () => {
					throw new Error('unserializable');
				}
			}
		});
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		expect(store.status).toBe('failed');
		expect(onSaveFailed).toHaveBeenCalledOnce();
	});
});

describe('flush', () => {
	it('writes a pending change immediately and does not write it twice', async () => {
		const { store, writes } = makeStore();
		store.apply(doc('one'));
		await store.flush();
		expect(writes.map((d) => d.title)).toEqual(['one']);
		expect(store.status).toBe('saved');
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
		expect(writes).toHaveLength(1);
	});

	it('writes nothing when no change is pending', async () => {
		const { store, writes } = makeStore();
		await store.flush();
		expect(writes).toEqual([]);
	});

	it('resolves only after a write already in flight has settled', async () => {
		const { persistence, calls } = manualSave();
		const { store } = makeStore({ persistence });
		store.apply(doc('one'));
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
		let flushed = false;
		void store.flush().then(() => (flushed = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(flushed).toBe(false);
		calls[0].resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(flushed).toBe(true);
	});

	it('resolves after a failed write and leaves the failure in status', async () => {
		const { store } = makeStore({
			persistence: { load: async () => null, save: () => Promise.reject(new Error('quota')) }
		});
		store.apply(doc('one'));
		await expect(store.flush()).resolves.toBeUndefined();
		expect(store.status).toBe('failed');
	});
});

describe('restore', () => {
	it('loads the saved document with no undo step and no write', async () => {
		const saved = doc('saved', ['s']);
		const { persistence, writes } = memoryPersistence(saved);
		const { store } = makeStore({ persistence });
		expect(store.ready).toBe(false);
		expect(store.status).toBe('opening');

		expect(await store.restore()).toEqual({ status: 'restored' });
		expect(store.project).toBe(saved);
		expect(store.status).toBe('saved');
		expect(store.ready).toBe(true);
		expect(store.canUndo).toBe(false);
		await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
		expect(writes).toEqual([]);
	});

	it('normalizes what it loads', async () => {
		const { persistence } = memoryPersistence(doc('saved', ['a', '']));
		const { store } = makeStore({
			persistence,
			normalize: (next) => ({ ...next, slides: next.slides.filter(Boolean) })
		});
		await store.restore();
		expect(store.project.slides).toEqual(['a']);
	});

	it('keeps the initial campaign when nothing was saved', async () => {
		const { store } = makeStore();
		expect(await store.restore()).toEqual({ status: 'empty' });
		expect(store.project.title).toBe('start');
		expect(store.status).toBe('example');
		expect(store.ready).toBe(true);
	});

	it('stays usable when the saved document cannot be read', async () => {
		const failure = new Error('unreadable');
		const { store } = makeStore({
			persistence: { load: () => Promise.reject(failure), save: async () => {} }
		});
		expect(await store.restore()).toEqual({ status: 'failed', error: failure });
		expect(store.status).toBe('unavailable');
		expect(store.ready).toBe(true);
		expect(store.apply(doc('still works')).status).toBe('applied');
	});

	it('does not overwrite an edit made during the read', async () => {
		let finish: (value: Doc) => void = () => {};
		const { store } = makeStore({
			persistence: {
				load: () => new Promise<Doc>((resolve) => (finish = resolve)),
				save: async () => {}
			}
		});
		const pending = store.restore();
		store.apply(doc('newer'));
		finish(doc('older'));
		expect(await pending).toEqual({ status: 'superseded' });
		expect(store.project.title).toBe('newer');
	});

	it('does nothing when the read finishes after dispose', async () => {
		let fail: (error: unknown) => void = () => {};
		const { store } = makeStore({
			persistence: {
				load: () => new Promise<Doc>((_, reject) => (fail = reject)),
				save: async () => {}
			}
		});
		const pending = store.restore();
		await store.dispose();
		fail(new Error('late'));
		expect(await pending).toEqual({ status: 'superseded' });
		expect(store.status).toBe('opening');
	});
});

describe('dispose', () => {
	it('writes a pending change instead of dropping it', async () => {
		const { store, writes } = makeStore();
		store.apply(doc('last edit'));
		await store.dispose();
		expect(writes.map((d) => d.title)).toEqual(['last edit']);
	});
});

describe('document boundary', () => {
	it('holds a stored Project v2 through the same commands and persistence seam', async () => {
		const project: ProjectV2 = {
			version: 2,
			name: 'Campaign',
			style: 'cobalt',
			accent: '#DAF975',
			targets: ['iphone-6.9'],
			assets: {},
			slides: [],
			continuityMode: 'none'
		};
		const writes: ProjectV2[] = [];
		const store = new EditorStore<ProjectV2>({
			initial: project,
			persistence: {
				load: async () => null,
				save: async (document) => {
					writes.push(document);
				}
			}
		});
		store.apply({ ...project, targets: ['iphone-6.9', 'ipad-13'] });
		await store.flush();
		expect(writes.map((document) => document.targets)).toEqual([['iphone-6.9', 'ipad-13']]);
		store.undo();
		expect(store.project).toBe(project);
		expect(store.selectedIndex).toBe(0);
	});
});

describe('documentsEqual', () => {
	it.each([
		[
			{ a: 1, b: { c: [1, 2] } },
			{ b: { c: [1, 2] }, a: 1 }
		],
		[{ a: 1, b: undefined }, { a: 1 }],
		[{ a: 1 }, { a: 1, b: undefined }],
		[Number.NaN, Number.NaN],
		[[], []]
	])('treats %j and %j as equal', (a, b) => {
		expect(documentsEqual(a, b)).toBe(true);
	});

	it.each([
		[{ a: 1 }, { a: 2 }],
		[{ a: 1 }, { a: 1, b: 2 }],
		[{ a: 1, b: 2 }, { a: 1 }],
		[{ a: null }, {}],
		[[1, 2], [1]],
		[
			[1, 2],
			[2, 1]
		],
		[[], {}],
		[null, {}],
		[0, ''],
		[{ toString: 1 }, {}],
		[{}, { toString: 1 }]
	])('treats %j and %j as different', (a, b) => {
		expect(documentsEqual(a, b)).toBe(false);
	});

	it('does not walk a shared subtree', () => {
		const shared = {
			get expensive(): number {
				throw new Error('should not read');
			}
		};
		expect(documentsEqual({ a: shared }, { a: shared })).toBe(true);
	});
});

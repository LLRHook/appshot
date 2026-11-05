import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJECT_BYTES } from '$lib/model/limits';
import { createDemo } from '$lib/model/studio';
import type { Composition } from '$lib/model/types';
import { legacyPersistence, type ProjectPersistence } from './persistence';
import { StudioController, isTextEntry } from './studio.svelte';

function studioWith(options: Partial<ProjectPersistence<Composition>> = {}) {
	return new StudioController({ load: async () => null, save: async () => {}, ...options });
}

/** How many steps it takes to undo back to the opening document. */
function undoDepth(studio: StudioController) {
	let depth = 0;
	while (studio.store.undo()) depth++;
	return depth;
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('StudioController undo grouping', () => {
	it('makes typing in one field a single step', () => {
		const studio = studioWith();
		for (const text of ['D', 'Di', 'Din', 'Dinner']) studio.typography('headline', text);
		expect(studio.slide.typography.headline).toBe('Dinner');
		expect(undoDepth(studio)).toBe(1);
		expect(studio.slide.typography.headline).toBe(createDemo().slides[0].typography.headline);
	});

	it('separates fields, frames and commands', () => {
		const studio = studioWith();
		studio.typography('headline', 'A');
		studio.typography('subtitle', 'B');
		studio.store.select(1);
		studio.typography('headline', 'C');
		studio.chooseStyle('paper');
		expect(undoDepth(studio)).toBe(4);
	});

	it('makes a slider drag a single step, until its change event ends it', () => {
		const studio = studioWith();
		for (const fontScale of [1.05, 1.1, 1.15]) studio.patchSlide({ fontScale }, 'fontScale');
		studio.store.checkpoint();
		studio.patchSlide({ fontScale: 0.9 }, 'fontScale');
		expect(undoDepth(studio)).toBe(2);
	});

	it('makes a color drag a single step for a frame and for the shared hardware palette', () => {
		const studio = studioWith();
		studio.chooseStyle('table-linen');
		for (const color of ['#111111', '#222222']) studio.linenColor('canvas', color);
		for (const color of ['#333333', '#444444']) studio.linenColor('shadow', color);
		for (const value of [0.1, 0.2]) studio.linenShadowOpacity(value);
		expect(undoDepth(studio)).toBe(4);
	});

	it('makes shared phone and panorama drags one step each', () => {
		const studio = studioWith();
		expect(studio.isLinked).toBe(true);
		for (const offset of [10, 20, 30]) studio.setPanorama('offset', offset);
		studio.chooseStyle('table-linen');
		for (const rotation of [-1, -2, -3]) studio.linenPhoneNumber('rotation', rotation);
		expect(studio.composition.panorama?.linenPhone?.rotation).toBe(-3);
		expect(undoDepth(studio)).toBe(3);
	});

	it('adds no step when re-applying a style changes nothing', () => {
		const studio = studioWith();
		studio.chooseStyle('cobalt');
		expect(studio.store.canUndo).toBe(false);
		expect(studio.store.status).toBe('opening');
	});
});

describe('StudioController commands through the store', () => {
	it('selects the moved, duplicated and added frames, and undo returns to the origin', () => {
		const studio = studioWith();
		studio.store.select(1);
		studio.moveSlide(1);
		expect(studio.selected).toBe(2);
		studio.duplicate();
		expect(studio.selected).toBe(3);
		expect(studio.composition.slides).toHaveLength(6);
		studio.addSlide();
		expect(studio.selected).toBe(6);
		expect(studio.activeTab).toBe('assets');
		expect(undoDepth(studio)).toBe(3);
		expect(studio.selected).toBe(1);
	});

	it('clears a pair broken by a move, and undo restores it', () => {
		const studio = studioWith();
		expect(studio.composition.panorama).toBeDefined();
		studio.moveSlide(1);
		expect(studio.composition.panorama).toBeUndefined();
		expect(studio.composition.continuityMode).toBe('none');
		studio.store.undo();
		expect(studio.composition.panorama).toBeDefined();
		expect(studio.composition.continuityMode).toBe('paired');
	});

	it('starts a blank campaign as one undoable step', () => {
		const studio = studioWith();
		const before = studio.composition;
		studio.store.select(2);
		studio.newCampaign();
		expect(studio.composition.slides).toHaveLength(1);
		expect(studio.selected).toBe(0);
		expect(studio.activeTab).toBe('assets');
		studio.store.undo();
		expect(studio.composition).toBe(before);
		expect(studio.selected).toBe(2);
	});

	it('surfaces a rejected edit as the error and keeps the document', () => {
		const studio = studioWith({ rejectReason: () => 'Too large.' });
		const before = studio.composition;
		studio.setName('Renamed');
		expect(studio.error).toBe('Too large.');
		expect(studio.composition).toBe(before);
		expect(studio.store.canUndo).toBe(false);
	});

	it('toasts when the newest autosave fails', async () => {
		const studio = studioWith({ save: () => Promise.reject(new Error('quota')) });
		studio.setName('Renamed');
		await studio.store.flush();
		expect(studio.store.status).toBe('failed');
		expect(studio.toast).toContain('Save your project');
	});

	it('toasts when the saved project cannot be restored, and stays usable', async () => {
		const studio = studioWith({ load: () => Promise.reject(new Error('corrupt')) });
		const stop = studio.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(studio.store.status).toBe('unavailable');
		expect(studio.store.ready).toBe(true);
		expect(studio.toast).toContain('could not restore');
		stop();
	});

	it('writes a pending edit on teardown', async () => {
		const save = vi.fn(async () => {});
		const studio = studioWith({ save });
		const stop = studio.start();
		await vi.advanceTimersByTimeAsync(0);
		studio.setName('Last edit');
		stop();
		await studio.store.flush();
		expect(save).toHaveBeenCalledOnce();
	});
});

describe('keyboard undo', () => {
	const key = (target: unknown, init: Partial<KeyboardEvent> = {}) =>
		({
			key: 'z',
			metaKey: true,
			ctrlKey: false,
			shiftKey: false,
			target,
			preventDefault: vi.fn(),
			...init
		}) as unknown as KeyboardEvent;

	async function readyStudio() {
		const studio = studioWith();
		studio.start();
		await vi.advanceTimersByTimeAsync(0);
		studio.setName('Edited');
		return studio;
	}

	it.each([
		['range', { tagName: 'INPUT', type: 'range' }],
		['color', { tagName: 'INPUT', type: 'color' }],
		['select', { tagName: 'SELECT' }],
		['button', { tagName: 'BUTTON' }],
		['body', { tagName: 'BODY' }]
	])('undoes from a %s control', async (_name, target) => {
		const studio = await readyStudio();
		const event = key(target);
		studio.handleKeydown(event);
		expect(studio.composition.name).toBe('Billington');
		expect(event.preventDefault).toHaveBeenCalled();
		studio.handleKeydown(key(target, { shiftKey: true }));
		expect(studio.composition.name).toBe('Edited');
	});

	it.each([
		['textarea', { tagName: 'TEXTAREA' }],
		['text input', { tagName: 'INPUT', type: 'text' }],
		['number input', { tagName: 'INPUT', type: 'number' }],
		['editable region', { tagName: 'DIV', isContentEditable: true }]
	])('leaves %s to the browser', async (_name, target) => {
		const studio = await readyStudio();
		const event = key(target);
		studio.handleKeydown(event);
		expect(studio.composition.name).toBe('Edited');
		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	it('ignores other keys, and shortcuts while an export dialog is open', async () => {
		const studio = await readyStudio();
		studio.handleKeydown(key({ tagName: 'BODY' }, { key: 'y' }));
		studio.handleKeydown(key({ tagName: 'BODY' }, { metaKey: false }));
		expect(studio.composition.name).toBe('Edited');
		studio.exportDialog = { open: true } as HTMLDialogElement;
		studio.handleKeydown(key({ tagName: 'BODY' }));
		expect(studio.composition.name).toBe('Edited');
	});

	it('ignores shortcuts before the workspace is ready', async () => {
		const studio = await readyStudio();
		const opening = studioWith();
		opening.store.apply({ ...opening.composition, name: 'Edited' });
		await opening.store.flush();
		studio.processing = true;
		studio.handleKeydown(key({ tagName: 'BODY' }));
		expect(studio.composition.name).toBe('Edited');
	});

	it('classifies a missing target as not text entry', () => {
		expect(isTextEntry(null)).toBe(false);
	});
});

describe('legacyPersistence', () => {
	it('accepts a normal campaign and rejects one over the project limit', () => {
		const demo = createDemo();
		expect(legacyPersistence.rejectReason?.(demo)).toBeNull();
		expect(
			legacyPersistence.rejectReason?.({ ...demo, name: 'x'.repeat(MAX_PROJECT_BYTES + 1) })
		).toContain('60 MB project limit');
	});
});

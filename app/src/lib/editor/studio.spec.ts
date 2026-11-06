import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJECT_BYTES } from '$lib/model/limits';
import { createDemo } from '$lib/model/studio';
import { STYLES } from '$lib/model/studio';
import { projectForTarget, sourceIssues } from '$lib/model/targets';
import { unbindSource } from '$lib/model/edits';
import type { ProjectV2 } from '$lib/model/contracts';
import { legacyPersistence, type ProjectPersistence } from './persistence';
import { StudioController, isTextEntry } from './studio.svelte';

function studioWith(options: Partial<ProjectPersistence<ProjectV2>> = {}) {
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

describe('the screenshot library', () => {
	it('lists the sample screens but leaves out sample art', () => {
		const studio = studioWith();
		expect(studio.assets.map((asset) => asset.blobUrl).sort()).toEqual(
			['insights', 'journal', 'plant', 'schedule', 'today'].map((name) => `/sample/${name}.png`)
		);
		const { project } = studio.store;
		studio.store.apply({
			...project,
			assets: {
				...project.assets,
				'sample-mark': {
					id: 'sample-mark',
					mime: 'image/png',
					byteLength: 0,
					url: '/sample/mark.png',
					naturalWidth: 640,
					naturalHeight: 640
				}
			}
		});
		expect(studio.store.project.assets).toHaveProperty('sample-mark');
		expect(studio.assets.map((asset) => asset.id)).not.toContain('sample-mark');
		expect(studio.assets).toHaveLength(5);
	});
});

describe('StudioController undo grouping', () => {
	it('makes typing in one field a single step', () => {
		const studio = studioWith();
		for (const text of ['G', 'Gu', 'Gul', 'Gull']) studio.typography('headline', text);
		expect(studio.slide.typography.headline).toBe('Gull');
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
	it.each(STYLES.filter((style) => style.id !== 'table-linen' && style.id !== 'the-check'))(
		'a new $name frame keeps the selected background',
		(style) => {
			const studio = studioWith();
			studio.chooseStyle(style.id);
			studio.addSlide();
			expect(studio.slide.background.colors).toEqual([style.background]);
		}
	);

	it('a new The Check frame is frameless and has its own settings', () => {
		const studio = studioWith();
		studio.chooseStyle('the-check');
		studio.addSlide();
		expect(studio.slide).toMatchObject({
			frame: 'none',
			effects: { shadow: 'soft' },
			tilt: 0,
			scale: 1
		});
		expect(studio.slide.check).toBeDefined();
	});

	it('The Check straightens panels on current outputs and outputs added later', () => {
		const studio = studioWith();
		studio.chooseDevice('ipad-13');
		studio.chooseDevice('iphone-6.9');
		studio.chooseStyle('the-check');
		studio.chooseDevice('iphone-duo-inner-2007x2853');
		for (const target of studio.store.project.targets)
			for (const slide of projectForTarget(studio.store.project, target).slides)
				expect(slide).toMatchObject({ tilt: 0, scale: 1 });
	});

	it('The Check also straightens the stored pair before an empty output gets its first capture', () => {
		const studio = studioWith();
		studio.toggleLink();
		studio.store.select(2);
		studio.toggleLink();
		expect(studio.store.project.panorama?.tilt).not.toBe(0);
		studio.chooseStyle('the-check');
		studio.chooseDevice('ipad-13');
		studio.useAsset(studio.assets[0], 'Internal geometry test');
		expect(studio.store.project.panorama).toMatchObject({ tilt: 0, scale: 1, offset: 0 });
		expect(studio.composition.panorama).toMatchObject({ tilt: 0, scale: 1, offset: 0 });
	});

	it('The Check resets retained per-output pair placement before a removed capture is rebound', () => {
		const studio = studioWith();
		studio.toggleLink();
		studio.store.select(2);
		studio.toggleLink();
		studio.setPanorama('tilt', -5);
		studio.setPanorama('scale', 1.2);
		studio.setPanorama('offset', 50);
		studio.removeAsset(studio.displayedImage!.id);
		expect(studio.composition.panorama).toBeUndefined();
		studio.chooseStyle('the-check');
		studio.useAsset(studio.assets[0]);
		expect(studio.composition.panorama).toMatchObject({ tilt: 0, scale: 1, offset: 0 });
		expect(studio.composition.slides[3].check?.canvas).toBe(
			studio.composition.slides[2].check?.canvas
		);
		expect(studio.composition.slides[3].background).toEqual(
			studio.composition.slides[2].background
		);
	});

	it('The Check disconnects a first-three pair even when all of its captures were removed', () => {
		const studio = studioWith();
		studio.removeAsset(studio.displayedImage!.id);
		expect(studio.composition.panorama).toBeUndefined();
		studio.chooseStyle('the-check');
		studio.useAsset(studio.assets[0]);
		expect(studio.store.project.panorama).toBeUndefined();
		expect(studio.store.project.continuityMode).toBe('none');
		expect(studio.composition.panorama).toBeUndefined();
	});

	it.each(['style', 'toggle'])(
		'disconnecting via %s keeps captures supplied only by the pair',
		(command) => {
			const studio = studioWith();
			const pair = studio.store.project.panorama!;
			const asset = pair.variants![studio.targetId]!.source!.asset;
			let next = studio.store.project;
			for (const id of [pair.leftId, pair.rightId]) next = unbindSource(next, id, studio.targetId);
			studio.store.apply(next);
			expect(studio.composition.slides[0].primaryImage).toBeUndefined();
			if (command === 'style') studio.chooseStyle('the-check');
			else studio.toggleLink();
			expect(studio.composition.panorama).toBeUndefined();
			for (const slide of studio.composition.slides.slice(0, 2))
				expect(slide.primaryImage?.id).toBe(asset);
			studio.store.undo();
			expect(studio.composition.panorama?.image.id).toBe(asset);
			expect(studio.composition.slides[0].primaryImage).toBeUndefined();
		}
	);

	it('records a first pair binding’s draft reason on the pair instead of the hidden slide source', () => {
		const studio = studioWith();
		studio.chooseDevice('ipad-13');
		expect(studio.isLinked).toBe(false);
		studio.useAsset(studio.assets[0], 'Internal draft only');
		expect(studio.store.project.panorama?.variants?.['ipad-13']?.source?.nonNative).toEqual({
			reason: 'Internal draft only'
		});
		expect(studio.store.project.slides[0].variants?.['ipad-13']?.source?.nonNative).toBeUndefined();
	});

	it.each(['style', 'toggle'])(
		'disconnecting via %s keeps the accepted draft reason on both matching captures',
		(command) => {
			const studio = studioWith();
			studio.chooseDevice('ipad-13');
			studio.useAsset(studio.assets[0], 'Internal draft only');
			const before = studio.store.project;
			if (command === 'style') studio.chooseStyle('the-check');
			else studio.toggleLink();
			expect(studio.composition.panorama).toBeUndefined();
			for (const slide of studio.store.project.slides.slice(0, 2))
				expect(slide.variants?.['ipad-13']?.source?.nonNative).toEqual({
					reason: 'Internal draft only'
				});
			const issues = sourceIssues(studio.store.project, ['ipad-13']).filter(
				(issue) => issue.slideIndex! < 2
			);
			expect(issues).toHaveLength(2);
			expect(issues.every((issue) => issue.code === 'non-native-source')).toBe(true);
			studio.store.undo();
			expect(studio.store.project).toEqual(before);
		}
	);

	it('connecting The Check frames uses a straight panel and one canvas at the seam', () => {
		const studio = studioWith();
		studio.chooseStyle('the-check');
		studio.toggleLink();
		expect(studio.composition.panorama?.tilt).toBe(0);
		expect(studio.composition.slides[1].check?.canvas).toBe(
			studio.composition.slides[0].check?.canvas
		);
	});

	it('duplicating the left frame keeps its pair and selects the new frame after it', () => {
		const studio = studioWith();
		const pair = studio.composition.panorama;
		studio.duplicate();
		expect(studio.composition.panorama).toEqual(pair);
		expect(studio.selected).toBe(2);
		expect(studio.slide.id).not.toBe(pair?.leftId);
	});

	it('removing a library image unbinds every output and undo restores it', () => {
		const studio = studioWith();
		studio.toggleLink();
		const before = studio.store.project;
		const id = studio.displayedImage!.id;
		studio.removeAsset(id);
		expect(studio.store.project.assets).not.toHaveProperty(id);
		const removed = projectForTarget(studio.store.project, studio.targetId);
		expect(removed.panorama).toBeUndefined();
		expect(removed.slides[0].primaryImage).toBeUndefined();
		studio.store.undo();
		expect(studio.store.project).toBe(before);
	});

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

describe('multi-target editor commands', () => {
	it('reports missing required display coverage and the future Duo requirement', async () => {
		const studio = studioWith();
		await studio.updateReadiness(studio.store.project);
		expect(
			studio.issues.some(
				(issue) => issue.code === 'required-class-missing' && issue.severity === 'block'
			)
		).toBe(true);
		expect(
			studio.issues.some((issue) => issue.code === 'future-class' && issue.severity === 'info')
		).toBe(true);
	});

	it('drops a stale coverage check as soon as the campaign changes', async () => {
		const studio = studioWith();
		await studio.updateReadiness(studio.store.project);
		studio.chooseDevice('iphone-di-medium-1206x2622');
		expect(studio.issues.some((issue) => issue.code === 'required-class-missing')).toBe(false);
		await studio.updateReadiness(studio.store.project);
		expect(studio.issues.some((issue) => issue.code === 'required-class-missing')).toBe(false);
		expect(studio.issues.some((issue) => issue.code === 'missing-source')).toBe(true);
	});

	it('starts a new output without borrowing another display’s captures', () => {
		const studio = studioWith();
		const original = studio.slide.primaryImage;
		studio.chooseDevice('iphone-di-medium-1206x2622');
		expect(studio.store.project.targets).toEqual(['iphone-6.9', 'iphone-di-medium-1206x2622']);
		expect(studio.slide.primaryImage).toBeUndefined();
		expect(studio.composition.panorama).toBeUndefined();
		expect(
			studio.issues.some(
				(issue) => issue.code === 'missing-source' && issue.target === studio.targetId
			)
		).toBe(true);
		studio.chooseDevice('iphone-6.9');
		expect(studio.slide.primaryImage).toEqual(original);
		expect(studio.isLinked).toBe(true);
	});

	it('shares copy while preserving a separate placement for each output', () => {
		const studio = studioWith();
		const originalScale = studio.slide.scale;
		studio.chooseDevice('iphone-di-medium-1206x2622');
		studio.typography('headline', 'Tide charts');
		studio.patchSlide({ scale: 1.25 });
		studio.chooseDevice('iphone-6.9');
		expect(studio.slide.typography.headline).toBe('Tide charts');
		expect(studio.slide.scale).toBe(originalScale);
		studio.chooseDevice('iphone-di-medium-1206x2622');
		expect(studio.slide.scale).toBe(1.25);
	});

	it('explains and refuses a phone capture chosen for iPad', () => {
		const studio = studioWith();
		const phone = studio.assets[0];
		studio.chooseDevice('ipad-13');
		studio.useAsset(phone);
		expect(studio.error).toContain('capture');
		expect(studio.error).toContain('iPad');
		expect(studio.slide.primaryImage).toBeUndefined();
		expect(studio.assets.some((asset) => asset.id === phone.id)).toBe(true);
	});

	it('duplicates every output’s bindings and keeps the assets shared', () => {
		const studio = studioWith();
		studio.chooseDevice('iphone-di-medium-1206x2622');
		const project = studio.store.project;
		const original = project.slides[0];
		studio.store.apply({
			...project,
			slides: [
				{
					...original,
					variants: { ...original.variants, 'iphone-di-medium-1206x2622': { scale: 0.9 } }
				},
				...project.slides.slice(1)
			]
		});
		const assets = studio.store.project.assets;
		studio.duplicate();
		expect(studio.store.project.slides[studio.selected].variants).toEqual(
			studio.store.project.slides[0].variants
		);
		expect(studio.store.project.slides[studio.selected].id).not.toBe(
			studio.store.project.slides[0].id
		);
		expect(studio.store.project.assets).toBe(assets);
	});

	it('keeps the working title separate from the brand printed on screenshots', () => {
		const studio = studioWith();
		studio.setName('Summer campaign');
		expect(studio.store.project.name).toBe('Summer campaign');
		expect(studio.composition.name).toBe('Sample Garden');
		studio.setAppName('Sample Garden Plus');
		expect(studio.composition.name).toBe('Sample Garden Plus');
		expect(studio.store.project.name).toBe('Summer campaign');
	});

	it('keeps a valid output selected after removal and restores the target on undo', () => {
		const studio = studioWith();
		studio.chooseDevice('ipad-13');
		studio.removeOutput('ipad-13');
		expect(studio.targetId).toBe('iphone-6.9');
		studio.store.undo();
		expect(studio.targetId).toBe('ipad-13');
		studio.removeOutput('ipad-13');
		studio.removeOutput('iphone-6.9');
		expect(studio.store.project.targets).toEqual(['iphone-6.9']);
		expect(studio.error).toContain('at least one output');
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
		expect(studio.store.project.name).toBe('Sample Garden');
		expect(event.preventDefault).toHaveBeenCalled();
		studio.handleKeydown(key(target, { shiftKey: true }));
		expect(studio.store.project.name).toBe('Edited');
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
		expect(studio.store.project.name).toBe('Edited');
		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	it('ignores other keys, and shortcuts while an export dialog is open', async () => {
		const studio = await readyStudio();
		studio.handleKeydown(key({ tagName: 'BODY' }, { key: 'y' }));
		studio.handleKeydown(key({ tagName: 'BODY' }, { metaKey: false }));
		expect(studio.store.project.name).toBe('Edited');
		studio.exportDialog = { open: true } as HTMLDialogElement;
		studio.handleKeydown(key({ tagName: 'BODY' }));
		expect(studio.store.project.name).toBe('Edited');
	});

	it('ignores shortcuts before the workspace is ready', async () => {
		const studio = await readyStudio();
		const opening = studioWith();
		opening.store.apply({ ...opening.store.project, name: 'Edited' });
		await opening.store.flush();
		studio.processing = true;
		studio.handleKeydown(key({ tagName: 'BODY' }));
		expect(studio.store.project.name).toBe('Edited');
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

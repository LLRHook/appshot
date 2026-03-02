import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_CONFIG } from './layers';
import { saveEditorState, loadEditorState, clearSavedState, type SavedState } from './persistence';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
	getItem: vi.fn((key: string) => store[key] ?? null),
	setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
	removeItem: vi.fn((key: string) => { delete store[key]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

const KEY = 'appshot:editor-state';

function makeState(overrides: Partial<Omit<SavedState, 'version' | 'savedAt'>> = {}) {
	return {
		config: structuredClone(DEFAULT_CONFIG),
		screenshots: [],
		selectedDeviceLabel: 'iPhone 6.9"',
		currentSlide: 0,
		...overrides,
	};
}

beforeEach(() => {
	for (const key of Object.keys(store)) delete store[key];
	vi.clearAllMocks();
	// Restore default implementations (clearAllMocks only clears call history)
	localStorageMock.getItem.mockImplementation((key: string) => store[key] ?? null);
	localStorageMock.setItem.mockImplementation((key: string, value: string) => { store[key] = value; });
	localStorageMock.removeItem.mockImplementation((key: string) => { delete store[key]; });
});

describe('saveEditorState', () => {
	it('saves state to localStorage under the correct key', () => {
		const result = saveEditorState(makeState());

		expect(result).toBe('saved');
		expect(localStorageMock.setItem).toHaveBeenCalledOnce();
		expect(localStorageMock.setItem.mock.calls[0][0]).toBe(KEY);
	});

	it('saved JSON includes version, savedAt, and all fields', () => {
		saveEditorState(makeState({ currentSlide: 3 }));

		const saved = JSON.parse(store[KEY]) as SavedState;
		expect(saved.version).toBe(1);
		expect(saved.savedAt).toBeTypeOf('number');
		expect(saved.currentSlide).toBe(3);
		expect(saved.config.background.type).toBe('linear-gradient');
		expect(saved.selectedDeviceLabel).toBe('iPhone 6.9"');
	});

	it('saves screenshots array', () => {
		saveEditorState(makeState({ screenshots: ['data:image/png;base64,abc'] }));

		const saved = JSON.parse(store[KEY]) as SavedState;
		expect(saved.screenshots).toEqual(['data:image/png;base64,abc']);
	});

	it('retries without screenshots on quota error and returns quota-warning', () => {
		let callCount = 0;
		localStorageMock.setItem.mockImplementation((key: string, value: string) => {
			callCount++;
			if (callCount === 1) throw new DOMException('quota exceeded', 'QuotaExceededError');
			store[key] = value;
		});

		const result = saveEditorState(makeState({ screenshots: ['big-data-url'] }));

		expect(result).toBe('quota-warning');
		expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
		const saved = JSON.parse(store[KEY]) as SavedState;
		expect(saved.screenshots).toEqual([]);
	});

	it('returns quota-warning when both attempts fail', () => {
		localStorageMock.setItem.mockImplementation(() => {
			throw new DOMException('quota exceeded', 'QuotaExceededError');
		});

		const result = saveEditorState(makeState());
		expect(result).toBe('quota-warning');
	});
});

describe('loadEditorState', () => {
	it('returns null when nothing is stored', () => {
		expect(loadEditorState()).toBeNull();
	});

	it('returns parsed state from localStorage', () => {
		const state: SavedState = {
			version: 1,
			config: structuredClone(DEFAULT_CONFIG),
			screenshots: ['data:image/png;base64,test'],
			selectedDeviceLabel: 'iPad 13"',
			currentSlide: 2,
			savedAt: Date.now(),
		};
		store[KEY] = JSON.stringify(state);

		const loaded = loadEditorState();
		expect(loaded).not.toBeNull();
		expect(loaded!.selectedDeviceLabel).toBe('iPad 13"');
		expect(loaded!.currentSlide).toBe(2);
		expect(loaded!.screenshots).toEqual(['data:image/png;base64,test']);
		expect(loaded!.config.background.type).toBe('linear-gradient');
	});

	it('returns null for invalid JSON', () => {
		store[KEY] = 'not valid json!!!';
		expect(loadEditorState()).toBeNull();
	});

	it('returns null for wrong version', () => {
		store[KEY] = JSON.stringify({ version: 99, config: DEFAULT_CONFIG });
		expect(loadEditorState()).toBeNull();
	});

	it('returns null when config is missing', () => {
		store[KEY] = JSON.stringify({ version: 1 });
		expect(loadEditorState()).toBeNull();
	});

	it('returns null for empty object', () => {
		store[KEY] = JSON.stringify({});
		expect(loadEditorState()).toBeNull();
	});
});

describe('clearSavedState', () => {
	it('removes the key from localStorage', () => {
		store[KEY] = 'something';
		clearSavedState();

		expect(localStorageMock.removeItem).toHaveBeenCalledWith(KEY);
		expect(store[KEY]).toBeUndefined();
	});
});

describe('save → load roundtrip', () => {
	it('roundtrips config accurately', () => {
		const input = makeState({
			currentSlide: 5,
			selectedDeviceLabel: 'iPhone 6.7"',
		});
		input.config.background.type = 'mesh';
		input.config.background.color1 = '#FF0000';
		input.config.typography.headline = 'My Cool App';
		input.config.effects.noise = true;
		input.config.perspective.preset = 'hero-shot';

		saveEditorState(input);
		const loaded = loadEditorState();

		expect(loaded).not.toBeNull();
		expect(loaded!.config.background.type).toBe('mesh');
		expect(loaded!.config.background.color1).toBe('#FF0000');
		expect(loaded!.config.typography.headline).toBe('My Cool App');
		expect(loaded!.config.effects.noise).toBe(true);
		expect(loaded!.config.perspective.preset).toBe('hero-shot');
		expect(loaded!.currentSlide).toBe(5);
		expect(loaded!.selectedDeviceLabel).toBe('iPhone 6.7"');
	});

	it('roundtrips with screenshots', () => {
		const screenshots = ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'];
		saveEditorState(makeState({ screenshots }));
		const loaded = loadEditorState();

		expect(loaded!.screenshots).toEqual(screenshots);
	});

	it('roundtrips with empty screenshots', () => {
		saveEditorState(makeState({ screenshots: [] }));
		const loaded = loadEditorState();

		expect(loaded!.screenshots).toEqual([]);
	});

	it('overwrites previous state on subsequent saves', () => {
		saveEditorState(makeState({ currentSlide: 1 }));
		saveEditorState(makeState({ currentSlide: 7 }));

		const loaded = loadEditorState();
		expect(loaded!.currentSlide).toBe(7);
	});

	it('returns null after clear', () => {
		saveEditorState(makeState());
		clearSavedState();

		expect(loadEditorState()).toBeNull();
	});
});

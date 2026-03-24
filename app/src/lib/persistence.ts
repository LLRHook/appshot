import { DEFAULT_CONFIG, type ComposableConfig, type BackgroundConfig, type DeviceFrameConfig, type TypographyConfig, type EffectsConfig, type PerspectiveConfig, type LayoutConfig } from './layers';

const STORAGE_KEY = 'appshot:editor-state';

export interface SavedState {
	version: 1;
	config: ComposableConfig;
	screenshots: string[];
	selectedDeviceLabel: string;
	currentSlide: number;
	savedAt: number;
}

export function saveEditorState(state: Omit<SavedState, 'version' | 'savedAt'>): 'saved' | 'quota-warning' {
	const payload: SavedState = {
		version: 1,
		...state,
		savedAt: Date.now(),
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		return 'saved';
	} catch {
		// Quota exceeded — retry without screenshots
		try {
			payload.screenshots = [];
			localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
			return 'quota-warning';
		} catch {
			return 'quota-warning';
		}
	}
}

export function loadEditorState(): SavedState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const parsed = JSON.parse(raw);
		if (!parsed || parsed.version !== 1 || !parsed.config) return null;

		// Deep merge with defaults to handle new fields added after save
		const config: ComposableConfig = {
			background: { ...DEFAULT_CONFIG.background, ...parsed.config.background } as BackgroundConfig,
			device: { ...DEFAULT_CONFIG.device, ...parsed.config.device } as DeviceFrameConfig,
			layout: { ...DEFAULT_CONFIG.layout, ...parsed.config.layout } as LayoutConfig,
			typography: { ...DEFAULT_CONFIG.typography, ...parsed.config.typography } as TypographyConfig,
			effects: { ...DEFAULT_CONFIG.effects, ...parsed.config.effects } as EffectsConfig,
			perspective: { ...DEFAULT_CONFIG.perspective, ...parsed.config.perspective } as PerspectiveConfig,
		};

		return { ...parsed, config } as SavedState;
	} catch {
		return null;
	}
}

export function clearSavedState(): void {
	localStorage.removeItem(STORAGE_KEY);
}

export async function compressScreenshots(dataUrls: string[]): Promise<string[]> {
	if (typeof document === 'undefined') return dataUrls;

	const results: string[] = [];

	for (const url of dataUrls) {
		if (!url) {
			results.push(url);
			continue;
		}

		try {
			const compressed = await compressImage(url, 1200, 0.7);
			results.push(compressed);
		} catch {
			results.push(url);
		}
	}

	return results;
}

function compressImage(dataUrl: string, maxDim: number, quality: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			let { width, height } = img;

			if (width > maxDim || height > maxDim) {
				const scale = maxDim / Math.max(width, height);
				width = Math.round(width * scale);
				height = Math.round(height * scale);
			}

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) { reject(new Error('No canvas context')); return; }

			ctx.drawImage(img, 0, 0, width, height);
			resolve(canvas.toDataURL('image/jpeg', quality));
		};
		img.onerror = reject;
		img.src = dataUrl;
	});
}

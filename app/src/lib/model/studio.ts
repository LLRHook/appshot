import type { Composition, ImageRef, Slide } from './types';

export type StyleId = 'cobalt' | 'paper' | 'midnight' | 'sorbet' | 'terminal' | 'table-linen';
export interface StyleDirection {
	id: StyleId;
	name: string;
	description: string;
	background: string;
	foreground: string;
	accent: string;
	swatches: string[];
}
export const STYLES: StyleDirection[] = [
	{
		id: 'cobalt',
		name: 'Cobalt studio',
		description: 'Bold type. Electric blue. Built to stand out.',
		background: '#164AF5',
		foreground: '#FFFFFF',
		accent: '#DAF975',
		swatches: ['#164AF5', '#DAF975', '#FFFFFF']
	},
	{
		id: 'paper',
		name: 'Sunday paper',
		description: 'Warm paper and expressive editorial type.',
		background: '#F1EBDD',
		foreground: '#29251F',
		accent: '#C65F3B',
		swatches: ['#F1EBDD', '#C65F3B', '#29251F']
	},
	{
		id: 'midnight',
		name: 'After hours',
		description: 'Deep charcoal. Luminous, quiet luxury.',
		background: '#14151B',
		foreground: '#F4F0E9',
		accent: '#B5A5F7',
		swatches: ['#14151B', '#B5A5F7', '#F4F0E9']
	},
	{
		id: 'sorbet',
		name: 'Soft serve',
		description: 'Playful pastel color and sculptural shapes.',
		background: '#F9D6CD',
		foreground: '#512C45',
		accent: '#EAF59B',
		swatches: ['#F9D6CD', '#BFAFF4', '#EAF59B']
	},
	{
		id: 'terminal',
		name: 'Field notes',
		description: 'Precision grid. Sharp green. Technical charm.',
		background: '#DFE9DD',
		foreground: '#193E2B',
		accent: '#EAFE73',
		swatches: ['#DFE9DD', '#193E2B', '#EAFE73']
	},
	{
		id: 'table-linen',
		name: 'Table Linen',
		description: 'Deep teal, warm cream, serif italics. One quiet phone.',
		background: '#2A736E',
		foreground: '#FBF6EF',
		accent: '#D4A843',
		swatches: ['#2A736E', '#FBF6EF', '#D4A843']
	}
];
export function getStyle(id: StyleId): StyleDirection {
	return STYLES.find((s) => s.id === id) ?? STYLES[0];
}
export function imageRef(id: string, url: string, width = 1320, height = 2868): ImageRef {
	return { id, blobUrl: url, naturalWidth: width, naturalHeight: height };
}
export function createSlide(index: number, image?: ImageRef): Slide {
	return {
		id: crypto.randomUUID(),
		device: 'iphone-6.9',
		label: `Screenshot ${index + 1}`,
		background: { kind: 'solid', colors: ['#164AF5'] },
		frame: 'bezel',
		layout: 'text-above',
		typography: {
			headline: 'Your next\ngreat story.',
			subtitle: 'Make a little room for something wonderful.',
			fontColor: '#FFFFFF',
			fontWeight: 800
		},
		effects: { shadow: 'dramatic', glow: 0 },
		primaryImage: image,
		continuity: { inset: 0 },
		tilt: 0,
		scale: 1,
		badge: '',
		fontScale: 1
	};
}
export function createDemo(): Composition {
	const items = [
		[
			'The good times.\nMinus the math.',
			'The simple way to split a bill with friends.',
			'Made for the table',
			'home'
		],
		[
			'One bill.\nEveryone’s share.',
			'Add the people. Let Billington do the splitting.',
			'Better together',
			'split'
		],
		[
			'From receipt\nto ready.',
			'Scan a receipt and bring every item into the bill.',
			'Less typing, more living',
			'receipt'
		],
		[
			'Your people.\nYour portion.',
			'Split evenly or choose a percentage for each person.',
			'Fair feels good',
			'items'
		],
		[
			'Split it.\nShare it.\nSorted.',
			'Share the breakdown. Everyone can see their share.',
			'No account needed',
			'share'
		]
	];
	const slides = items.map(([headline, subtitle, badge, asset], i) => ({
		...createSlide(i, imageRef(`demo-${asset}`, `/demo/${asset}.png`)),
		label: ['The hook', 'Better together', 'Scan the receipt', 'Make it fair', 'Share the bill'][i],
		typography: { headline, subtitle, fontColor: '#FFFFFF', fontWeight: 800 as const },
		badge,
		tilt: i === 2 ? 7 : i === 3 ? -6 : 0
	}));
	return {
		version: 1,
		name: 'Billington',
		device: 'iphone-6.9',
		slides,
		continuityMode: 'paired',
		style: 'cobalt',
		accent: '#DAF975',
		panorama: {
			leftId: slides[0].id,
			rightId: slides[1].id,
			image: slides[1].primaryImage!,
			offset: 0,
			scale: 1,
			tilt: -14
		}
	};
}
export function createBlank(): Composition {
	return {
		version: 1,
		name: 'Untitled campaign',
		device: 'iphone-6.9',
		slides: [createSlide(0)],
		continuityMode: 'none',
		style: 'cobalt',
		accent: '#DAF975'
	};
}

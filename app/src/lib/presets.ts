import type { ComposableConfig } from './layers';

export interface Preset {
	id: string;
	name: string;
	description: string;
	config: ComposableConfig;
}

const FLAT_PERSPECTIVE = { preset: 'flat' as const, rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 1000 };

export const PRESETS: Preset[] = [
	{
		id: 'gradient-bezel',
		name: 'Gradient + Device Bezel',
		description: 'Warm-to-cool gradient background with minimal dark device bezel and Dynamic Island',
		config: {
			background: { type: 'linear-gradient', color1: '#D4A574', color2: '#328983', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#D9B38C', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'clean-flat',
		name: 'Clean Flat',
		description: 'Solid color background, no device frame, rounded screenshot with subtle shadow',
		config: {
			background: { type: 'solid', color1: '#F5F5F5', color2: '#F5F5F5', color3: '#F5F5F5', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#328983', fontWeight: 700 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'dark-minimal',
		name: 'Dark Minimal',
		description: 'Near-black background with white text and thin device outline',
		config: {
			background: { type: 'solid', color1: '#111111', color2: '#111111', color3: '#111111', angle: 0 },
			device: { style: 'wireframe', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'none', glow: 'none', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'bold-type',
		name: 'Bold Type',
		description: 'Giant headline dominates the frame with a vibrant background. Marketing-first impact.',
		config: {
			background: { type: 'solid', color1: '#6C5CE7', color2: '#6C5CE7', color3: '#6C5CE7', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'DO MORE', subtitle: 'The smarter way to get things done', fontColor: '#FFFFFF', fontWeight: 800 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'glass-card',
		name: 'Glass Card',
		description: 'Frosted glass surface on a mesh gradient background. Modern iOS aesthetic with depth and blur.',
		config: {
			background: { type: 'mesh', color1: '#6C5CE7', color2: '#00B894', color3: '#FD79A8', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 600 },
			effects: { shadow: 'medium', glow: 'subtle', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'panoramic',
		name: 'Panoramic Flow',
		description: 'One wide screenshot flows across multiple slides. Each slide auto-shows a different portion.',
		config: {
			background: { type: 'linear-gradient', color1: '#667EEA', color2: '#F093FB', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: true, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'none', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'duo-side-by-side',
		name: 'Duo Side-by-Side',
		description: 'Two devices side-by-side with a shared gradient background.',
		config: {
			background: { type: 'linear-gradient', color1: '#D4A574', color2: '#328983', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'duo-side-by-side', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'duo-overlap',
		name: 'Duo Overlap',
		description: 'Two devices with depth — front phone overlaps the back for a layered, 3D-like effect.',
		config: {
			background: { type: 'linear-gradient', color1: '#667EEA', color2: '#F093FB', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'duo-overlap', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'feature-callout',
		name: 'Feature Callout',
		description: 'Clean background with centered screenshot and a floating badge highlighting a key feature.',
		config: {
			background: { type: 'solid', color1: '#FFFFFF', color2: '#FFFFFF', color3: '#FFFFFF', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'centered', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#1A1A1A', fontWeight: 700 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
			perspective: FLAT_PERSPECTIVE,
		},
	},
	{
		id: 'hero-3d',
		name: 'Hero 3D',
		description: 'Dark gradient with a dramatic 3D hero-shot angle. Premium bezel frame with visible phone edges.',
		config: {
			background: { type: 'linear-gradient', color1: '#0F0C29', color2: '#302B63', color3: '#24243E', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
			perspective: { preset: 'hero-shot', rotateX: 12, rotateY: -20, rotateZ: 5, perspective: 800 },
		},
	},
	{
		id: 'clay-tilt',
		name: 'Clay Tilt',
		description: 'Warm gradient with a tilted clay frame. Soft, tactile 3D mockup feel.',
		config: {
			background: { type: 'linear-gradient', color1: '#FFECD2', color2: '#FCB69F', color3: '#FD79A8', angle: 135 },
			device: { style: 'clay', device: 'iphone', clayColor: '#F5E6D3' },
			layout: { type: 'text-above', panoramic: false, totalSlides: 3 },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#5D4037', fontWeight: 700 },
			effects: { shadow: 'medium', glow: 'none', noise: false },
			perspective: { preset: 'tilt-right', rotateX: 5, rotateY: -25, rotateZ: 2, perspective: 1000 },
		},
	},
];

export function getPreset(id: string): Preset | undefined {
	return PRESETS.find((p) => p.id === id);
}

export function getPresetConfig(id: string): ComposableConfig | undefined {
	return PRESETS.find((p) => p.id === id)?.config;
}

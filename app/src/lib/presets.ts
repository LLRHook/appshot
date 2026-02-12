import type { ComposableConfig } from './layers';

export interface Preset {
	id: string;
	name: string;
	description: string;
	config: ComposableConfig;
}

export const PRESETS: Preset[] = [
	{
		id: 'gradient-bezel',
		name: 'Gradient + Device Bezel',
		description: 'Warm-to-cool gradient background with minimal dark device bezel and Dynamic Island',
		config: {
			background: { type: 'linear-gradient', color1: '#D4A574', color2: '#328983', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#D9B38C', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
		},
	},
	{
		id: 'clean-flat',
		name: 'Clean Flat',
		description: 'Solid color background, no device frame, rounded screenshot with subtle shadow',
		config: {
			background: { type: 'solid', color1: '#F5F5F5', color2: '#F5F5F5', color3: '#F5F5F5', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#328983', fontWeight: 700 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
		},
	},
	{
		id: 'dark-minimal',
		name: 'Dark Minimal',
		description: 'Near-black background with white text and thin device outline',
		config: {
			background: { type: 'solid', color1: '#111111', color2: '#111111', color3: '#111111', angle: 0 },
			device: { style: 'wireframe', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'none', glow: 'none', noise: false },
		},
	},
	{
		id: 'bold-type',
		name: 'Bold Type',
		description: 'Giant headline dominates the frame with a vibrant background. Marketing-first impact.',
		config: {
			background: { type: 'solid', color1: '#6C5CE7', color2: '#6C5CE7', color3: '#6C5CE7', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'DO MORE', subtitle: 'The smarter way to get things done', fontColor: '#FFFFFF', fontWeight: 800 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
		},
	},
	{
		id: 'glass-card',
		name: 'Glass Card',
		description: 'Frosted glass surface on a mesh gradient background. Modern iOS aesthetic with depth and blur.',
		config: {
			background: { type: 'mesh', color1: '#6C5CE7', color2: '#00B894', color3: '#FD79A8', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 600 },
			effects: { shadow: 'medium', glow: 'subtle', noise: false },
		},
	},
	{
		id: 'panoramic',
		name: 'Panoramic Flow',
		description: 'Continuous gradient that flows across multiple screenshots. Great for a series.',
		config: {
			background: { type: 'linear-gradient', color1: '#667EEA', color2: '#F093FB', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'text-above' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'none', noise: false },
		},
	},
	{
		id: 'duo-side-by-side',
		name: 'Duo Side-by-Side',
		description: 'Two devices side-by-side with a shared gradient background.',
		config: {
			background: { type: 'linear-gradient', color1: '#D4A574', color2: '#328983', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'duo-side-by-side' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
		},
	},
	{
		id: 'duo-overlap',
		name: 'Duo Overlap',
		description: 'Two devices with depth — front phone overlaps the back for a layered, 3D-like effect.',
		config: {
			background: { type: 'linear-gradient', color1: '#667EEA', color2: '#F093FB', color3: '#FD79A8', angle: 135 },
			device: { style: 'bezel', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'duo-overlap' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#FFFFFF', fontWeight: 700 },
			effects: { shadow: 'dramatic', glow: 'subtle', noise: false },
		},
	},
	{
		id: 'feature-callout',
		name: 'Feature Callout',
		description: 'Clean background with centered screenshot and a floating badge highlighting a key feature.',
		config: {
			background: { type: 'solid', color1: '#FFFFFF', color2: '#FFFFFF', color3: '#FFFFFF', angle: 0 },
			device: { style: 'none', device: 'iphone', clayColor: '#E8DED5' },
			layout: { type: 'centered' },
			typography: { headline: 'Your App Name', subtitle: '', fontColor: '#1A1A1A', fontWeight: 700 },
			effects: { shadow: 'subtle', glow: 'none', noise: false },
		},
	},
];

export function getPreset(id: string): Preset | undefined {
	return PRESETS.find((p) => p.id === id);
}

export function getPresetConfig(id: string): ComposableConfig | undefined {
	return PRESETS.find((p) => p.id === id)?.config;
}

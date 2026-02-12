export interface ParamDef {
	type: 'text' | 'enum' | 'color' | 'number' | 'image';
	label: string;
	default?: string | number;
	options?: string[];
	maxLength?: number;
	min?: number;
	max?: number;
}

export interface TemplateSchema {
	id: string;
	name: string;
	description: string;
	params: Record<string, ParamDef>;
}

export interface DeviceSize {
	label: string;
	width: number;
	height: number;
	device: string;
}

export const DEVICE_SIZES: DeviceSize[] = [
	{ label: 'iPhone 6.9"', width: 1320, height: 2868, device: 'iphone' },
	{ label: 'iPhone 6.7"', width: 1284, height: 2778, device: 'iphone' },
	{ label: 'iPhone 6.5"', width: 1242, height: 2688, device: 'iphone' },
	{ label: 'iPad 13"', width: 2064, height: 2752, device: 'ipad' },
];

export const TEMPLATES: TemplateSchema[] = [
	{
		id: 'gradient-bezel',
		name: 'Gradient + Device Bezel',
		description: 'Warm-to-cool gradient background with minimal dark device bezel and Dynamic Island',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			layout: { type: 'enum', label: 'Layout', options: ['text-above', 'text-left', 'text-right', 'split'], default: 'text-above' },
			device: { type: 'enum', label: 'Device Frame', options: ['iphone', 'ipad'], default: 'iphone' },
			gradient_from: { type: 'color', label: 'Gradient Start', default: '#D4A574' },
			gradient_to: { type: 'color', label: 'Gradient End', default: '#328983' },
			gradient_angle: { type: 'number', label: 'Gradient Angle', min: 0, max: 360, default: 135 },
			src: { type: 'image', label: 'Screenshot' },
			crop_x: { type: 'number', label: 'Crop X %', min: 0, max: 100, default: 50 },
			crop_y: { type: 'number', label: 'Crop Y %', min: 0, max: 100, default: 35 },
		},
	},
	{
		id: 'clean-flat',
		name: 'Clean Flat',
		description: 'Solid color background, no device frame, rounded screenshot with subtle shadow',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			bg_color: { type: 'color', label: 'Background', default: '#F5F5F5' },
			text_color: { type: 'color', label: 'Text Color', default: '#328983' },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
	{
		id: 'dark-minimal',
		name: 'Dark Minimal',
		description: 'Near-black background with white text and thin device outline',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			layout: { type: 'enum', label: 'Layout', options: ['text-above', 'text-left', 'text-right'], default: 'text-above' },
			accent_color: { type: 'color', label: 'Accent Color', default: '#328983' },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
	{
		id: 'bold-type',
		name: 'Bold Type',
		description: 'Giant headline dominates the frame with a vibrant background. Marketing-first, Apple-style impact.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 20, default: 'DO MORE' },
			subtitle: { type: 'text', label: 'Subtitle', maxLength: 60, default: 'The smarter way to get things done' },
			bg_color: { type: 'color', label: 'Background', default: '#6C5CE7' },
			text_color: { type: 'color', label: 'Text Color', default: '#FFFFFF' },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
	{
		id: 'glass-card',
		name: 'Glass Card',
		description: 'Frosted glass surface on a mesh gradient background. Modern iOS aesthetic with depth and blur.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			color_1: { type: 'color', label: 'Orb 1', default: '#6C5CE7' },
			color_2: { type: 'color', label: 'Orb 2', default: '#00B894' },
			color_3: { type: 'color', label: 'Orb 3', default: '#FD79A8' },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
	{
		id: 'panoramic',
		name: 'Panoramic Flow',
		description: 'Continuous gradient that flows across multiple screenshots. Set the slide number to create a seamless series.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			gradient_from: { type: 'color', label: 'Gradient Start', default: '#667EEA' },
			gradient_to: { type: 'color', label: 'Gradient End', default: '#F093FB' },
			gradient_angle: { type: 'number', label: 'Gradient Angle', min: 0, max: 360, default: 135 },
			slide: { type: 'number', label: 'Slide Number', min: 1, max: 10, default: 1 },
			total_slides: { type: 'number', label: 'Total Slides', min: 2, max: 10, default: 5 },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
	{
		id: 'duo-side-by-side',
		name: 'Duo Side-by-Side',
		description: 'Two devices side-by-side with a shared gradient background. Upload two screenshots to showcase different screens.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			subtitle: { type: 'text', label: 'Subtitle', maxLength: 60 },
			device: { type: 'enum', label: 'Device Frame', options: ['iphone', 'ipad'], default: 'iphone' },
			gradient_from: { type: 'color', label: 'Gradient Start', default: '#D4A574' },
			gradient_to: { type: 'color', label: 'Gradient End', default: '#328983' },
			gradient_angle: { type: 'number', label: 'Gradient Angle', min: 0, max: 360, default: 135 },
			src_1: { type: 'image', label: 'Screenshot 1 (Left)' },
			src_2: { type: 'image', label: 'Screenshot 2 (Right)' },
		},
	},
	{
		id: 'duo-overlap',
		name: 'Duo Overlap',
		description: 'Two devices with depth — front phone overlaps the back for a layered, 3D-like effect.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			subtitle: { type: 'text', label: 'Subtitle', maxLength: 60 },
			device: { type: 'enum', label: 'Device Frame', options: ['iphone', 'ipad'], default: 'iphone' },
			gradient_from: { type: 'color', label: 'Gradient Start', default: '#667EEA' },
			gradient_to: { type: 'color', label: 'Gradient End', default: '#F093FB' },
			gradient_angle: { type: 'number', label: 'Gradient Angle', min: 0, max: 360, default: 135 },
			src_1: { type: 'image', label: 'Screenshot 1 (Back)' },
			src_2: { type: 'image', label: 'Screenshot 2 (Front)' },
		},
	},
	{
		id: 'feature-callout',
		name: 'Feature Callout',
		description: 'Clean background with centered screenshot and a floating badge highlighting a key feature.',
		params: {
			headline: { type: 'text', label: 'Headline', maxLength: 40, default: 'Your App Name' },
			badge_text: { type: 'text', label: 'Badge Text', maxLength: 24, default: 'New Feature' },
			badge_position: { type: 'enum', label: 'Badge Position', options: ['top', 'middle', 'bottom'], default: 'middle' },
			bg_color: { type: 'color', label: 'Background', default: '#FFFFFF' },
			text_color: { type: 'color', label: 'Text Color', default: '#1A1A1A' },
			accent_color: { type: 'color', label: 'Accent Color', default: '#328983' },
			src: { type: 'image', label: 'Screenshot' },
		},
	},
];

export function getTemplate(id: string): TemplateSchema | undefined {
	return TEMPLATES.find((t) => t.id === id);
}

export function getTemplateDefaults(schema: TemplateSchema): Record<string, string | number> {
	const defaults: Record<string, string | number> = {};
	for (const [key, param] of Object.entries(schema.params)) {
		if (param.default !== undefined) {
			defaults[key] = param.default;
		}
	}
	return defaults;
}

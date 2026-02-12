// ── Background ──

export type BackgroundType = 'linear-gradient' | 'radial-gradient' | 'mesh' | 'solid';

export interface BackgroundConfig {
	type: BackgroundType;
	color1: string; // primary color (hex with #)
	color2: string; // secondary color
	color3: string; // third color (mesh only)
	angle: number; // gradient angle (linear only)
}

// ── Device Frame ──

export type DeviceFrameStyle = 'bezel' | 'clay' | 'wireframe' | 'none';
export type DeviceType = 'iphone' | 'ipad';

export interface DeviceFrameConfig {
	style: DeviceFrameStyle;
	device: DeviceType;
	clayColor: string; // frame color for clay style
}

// ── Layout ──

export type LayoutType =
	| 'text-above'
	| 'text-left'
	| 'text-right'
	| 'split'
	| 'centered'
	| 'duo-side-by-side'
	| 'duo-overlap';

export interface LayoutConfig {
	type: LayoutType;
}

// ── Typography ──

export interface TypographyConfig {
	headline: string;
	subtitle: string;
	fontColor: string;
	fontWeight: number; // 400, 500, 600, 700, 800
}

// ── Effects ──

export type ShadowDepth = 'none' | 'subtle' | 'medium' | 'dramatic';
export type GlowIntensity = 'none' | 'subtle' | 'bright';

export interface EffectsConfig {
	shadow: ShadowDepth;
	glow: GlowIntensity;
	noise: boolean;
}

// ── Composable Config (full layer stack) ──

export interface ComposableConfig {
	background: BackgroundConfig;
	device: DeviceFrameConfig;
	layout: LayoutConfig;
	typography: TypographyConfig;
	effects: EffectsConfig;
}

// ── Defaults ──

export const DEFAULT_CONFIG: ComposableConfig = {
	background: {
		type: 'linear-gradient',
		color1: '#D4A574',
		color2: '#328983',
		color3: '#FD79A8',
		angle: 135,
	},
	device: {
		style: 'bezel',
		device: 'iphone',
		clayColor: '#E8DED5',
	},
	layout: {
		type: 'text-above',
	},
	typography: {
		headline: 'Your App Name',
		subtitle: '',
		fontColor: '#FFFFFF',
		fontWeight: 700,
	},
	effects: {
		shadow: 'medium',
		glow: 'subtle',
		noise: false,
	},
};

// ── Flatten config → URL params ──

export function configToParams(config: ComposableConfig): Record<string, string | number> {
	return {
		bg_type: config.background.type,
		bg_color1: config.background.color1,
		bg_color2: config.background.color2,
		bg_color3: config.background.color3,
		bg_angle: config.background.angle,
		frame_style: config.device.style,
		device: config.device.device,
		clay_color: config.device.clayColor,
		layout: config.layout.type,
		headline: config.typography.headline,
		subtitle: config.typography.subtitle,
		font_color: config.typography.fontColor,
		font_weight: config.typography.fontWeight,
		shadow: config.effects.shadow,
		glow: config.effects.glow,
		noise: config.effects.noise ? '1' : '0',
	};
}

// ── Parse URL params → config ──

export function paramsToConfig(params: Record<string, string | number>): ComposableConfig {
	return {
		background: {
			type: (String(params.bg_type) as BackgroundType) || DEFAULT_CONFIG.background.type,
			color1: String(params.bg_color1 || DEFAULT_CONFIG.background.color1),
			color2: String(params.bg_color2 || DEFAULT_CONFIG.background.color2),
			color3: String(params.bg_color3 || DEFAULT_CONFIG.background.color3),
			angle: Number(params.bg_angle) || DEFAULT_CONFIG.background.angle,
		},
		device: {
			style: (String(params.frame_style) as DeviceFrameStyle) || DEFAULT_CONFIG.device.style,
			device: (String(params.device) as DeviceType) || DEFAULT_CONFIG.device.device,
			clayColor: String(params.clay_color || DEFAULT_CONFIG.device.clayColor),
		},
		layout: {
			type: (String(params.layout) as LayoutType) || DEFAULT_CONFIG.layout.type,
		},
		typography: {
			headline: String(params.headline ?? DEFAULT_CONFIG.typography.headline),
			subtitle: String(params.subtitle ?? DEFAULT_CONFIG.typography.subtitle),
			fontColor: String(params.font_color || DEFAULT_CONFIG.typography.fontColor),
			fontWeight: Number(params.font_weight) || DEFAULT_CONFIG.typography.fontWeight,
		},
		effects: {
			shadow: (String(params.shadow) as ShadowDepth) || DEFAULT_CONFIG.effects.shadow,
			glow: (String(params.glow) as GlowIntensity) || DEFAULT_CONFIG.effects.glow,
			noise: params.noise === '1' || params.noise === 1,
		},
	};
}

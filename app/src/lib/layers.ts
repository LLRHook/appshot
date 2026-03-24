// ── Background ──

export type BackgroundType = 'linear-gradient' | 'radial-gradient' | 'mesh' | 'solid' | 'image';

export interface GradientStop {
	color: string; // hex with #
	position: number; // 0-100
}

export interface BackgroundConfig {
	type: BackgroundType;
	color1: string; // primary color (hex with #)
	color2: string; // secondary color
	color3: string; // third color (mesh only)
	angle: number; // gradient angle (linear only)
	gradientStops: GradientStop[]; // arbitrary stops (overrides color1/color2 when non-empty)
	imageUrl: string; // background image data URL
	imageFit: 'cover' | 'contain' | 'fill'; // image fit mode
	imageBlur: number; // blur applied to bg image (px, 0 = none)
	imageOverlayColor: string; // semi-transparent overlay on bg image
	imageOverlayOpacity: number; // 0-100
	radialCenterX: number; // 0-100 (percentage)
	radialCenterY: number; // 0-100 (percentage)
}

// ── Device Frame ──

export type DeviceFrameStyle = 'bezel' | 'clay' | 'wireframe' | 'none';
export type DeviceType = 'iphone' | 'ipad';

export interface DeviceFrameConfig {
	style: DeviceFrameStyle;
	device: DeviceType;
	clayColor: string; // frame color for clay style (kept for backward compat)
	frameColor: string; // universal frame color (all styles)
	frameThickness: number; // 0-100 (percentage, maps to padding)
	frameBorderRadius: number; // 0-100 (percentage, maps to border-radius)
	screenBorderRadius: number; // 0-100 (percentage)
	deviceScale: number; // 50-150 (percentage, 100 = default)
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
	panoramic: boolean;
	totalSlides: number;
}

// ── Typography ──

export interface TypographyConfig {
	headline: string;
	subtitle: string;
	fontColor: string;
	fontWeight: number; // 400, 500, 600, 700, 800
	fontFamily: string; // font family name (e.g., 'Inter', 'SF Pro Display')
	fontSize: number; // 50-200 (percentage of default, 100 = auto)
	textAlign: 'left' | 'center' | 'right';
	textShadow: boolean;
	textShadowColor: string;
	textShadowBlur: number; // 0-20 (px)
	subtitleColor: string; // independent subtitle color (empty = inherit fontColor)
	subtitleWeight: number; // independent subtitle weight (0 = inherit fontWeight)
	subtitleSize: number; // 50-200 (percentage of default, 100 = auto)
}

// ── Perspective (3D) ──

export type PerspectivePreset = 'flat' | 'tilt-left' | 'tilt-right' | 'isometric' | 'hero-shot';

export interface PerspectiveConfig {
	preset: PerspectivePreset;
	rotateX: number;
	rotateY: number;
	rotateZ: number;
	perspective: number; // depth in px
}

export const PERSPECTIVE_PRESETS: Record<PerspectivePreset, Omit<PerspectiveConfig, 'preset'>> = {
	'flat': { rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 1000 },
	'tilt-left': { rotateX: 5, rotateY: 25, rotateZ: -2, perspective: 1000 },
	'tilt-right': { rotateX: 5, rotateY: -25, rotateZ: 2, perspective: 1000 },
	'isometric': { rotateX: 35, rotateY: -30, rotateZ: 0, perspective: 1200 },
	'hero-shot': { rotateX: 12, rotateY: -20, rotateZ: 5, perspective: 800 },
};

// ── Effects ──

export type ShadowDepth = 'none' | 'subtle' | 'medium' | 'dramatic' | 'custom';
export type GlowIntensity = 'none' | 'subtle' | 'bright' | 'custom';

export interface EffectsConfig {
	shadow: ShadowDepth;
	glow: GlowIntensity;
	noise: boolean;
	// Custom shadow controls (used when shadow === 'custom')
	shadowColor: string;
	shadowBlur: number; // 0-100 px
	shadowSpread: number; // 0-50 px
	shadowOffsetX: number; // -50 to 50 px
	shadowOffsetY: number; // -50 to 50 px
	// Custom glow controls (used when glow === 'custom')
	glowColor: string;
	glowIntensity: number; // 0-100
	glowRadius: number; // 0-200 px
	// Noise intensity (replaces boolean)
	noiseIntensity: number; // 0-100 (0 = off)
	// Background blur / frosted glass
	backgroundBlur: number; // 0-50 px (0 = off)
}

// ── Composable Config (full layer stack) ──

export interface ComposableConfig {
	background: BackgroundConfig;
	device: DeviceFrameConfig;
	layout: LayoutConfig;
	typography: TypographyConfig;
	effects: EffectsConfig;
	perspective: PerspectiveConfig;
}

// ── Defaults ──

export const DEFAULT_CONFIG: ComposableConfig = {
	background: {
		type: 'linear-gradient',
		color1: '#D4A574',
		color2: '#328983',
		color3: '#FD79A8',
		angle: 135,
		gradientStops: [],
		imageUrl: '',
		imageFit: 'cover',
		imageBlur: 0,
		imageOverlayColor: '#000000',
		imageOverlayOpacity: 0,
		radialCenterX: 50,
		radialCenterY: 50,
	},
	device: {
		style: 'bezel',
		device: 'iphone',
		clayColor: '#E8DED5',
		frameColor: '#1a1a1a',
		frameThickness: 50,
		frameBorderRadius: 50,
		screenBorderRadius: 50,
		deviceScale: 100,
	},
	layout: {
		type: 'text-above',
		panoramic: false,
		totalSlides: 3,
	},
	typography: {
		headline: 'Your App Name',
		subtitle: '',
		fontColor: '#FFFFFF',
		fontWeight: 700,
		fontFamily: '',
		fontSize: 100,
		textAlign: 'center',
		textShadow: false,
		textShadowColor: '#000000',
		textShadowBlur: 4,
		subtitleColor: '',
		subtitleWeight: 0,
		subtitleSize: 100,
	},
	effects: {
		shadow: 'medium',
		glow: 'subtle',
		noise: false,
		shadowColor: '#000000',
		shadowBlur: 36,
		shadowSpread: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 12,
		glowColor: '#FFFFFF',
		glowIntensity: 30,
		glowRadius: 100,
		noiseIntensity: 35,
		backgroundBlur: 0,
	},
	perspective: {
		preset: 'flat',
		rotateX: 0,
		rotateY: 0,
		rotateZ: 0,
		perspective: 1000,
	},
};

// ── Flatten config → URL params ──

export function configToParams(config: ComposableConfig): Record<string, string | number> {
	const params: Record<string, string | number> = {
		bg_type: config.background.type,
		bg_color1: config.background.color1,
		bg_color2: config.background.color2,
		bg_color3: config.background.color3,
		bg_angle: config.background.angle,
		bg_radial_cx: config.background.radialCenterX,
		bg_radial_cy: config.background.radialCenterY,
		bg_image_fit: config.background.imageFit,
		bg_image_blur: config.background.imageBlur,
		bg_image_overlay_color: config.background.imageOverlayColor,
		bg_image_overlay_opacity: config.background.imageOverlayOpacity,
		frame_style: config.device.style,
		device: config.device.device,
		clay_color: config.device.clayColor,
		frame_color: config.device.frameColor,
		frame_thickness: config.device.frameThickness,
		frame_border_radius: config.device.frameBorderRadius,
		screen_border_radius: config.device.screenBorderRadius,
		device_scale: config.device.deviceScale,
		layout: config.layout.type,
		panoramic: config.layout.panoramic ? '1' : '0',
		total_slides: config.layout.totalSlides,
		headline: config.typography.headline,
		subtitle: config.typography.subtitle,
		font_color: config.typography.fontColor,
		font_weight: config.typography.fontWeight,
		font_family: config.typography.fontFamily,
		font_size: config.typography.fontSize,
		text_align: config.typography.textAlign,
		text_shadow: config.typography.textShadow ? '1' : '0',
		text_shadow_color: config.typography.textShadowColor,
		text_shadow_blur: config.typography.textShadowBlur,
		subtitle_color: config.typography.subtitleColor,
		subtitle_weight: config.typography.subtitleWeight,
		subtitle_size: config.typography.subtitleSize,
		shadow: config.effects.shadow,
		glow: config.effects.glow,
		noise: config.effects.noise ? '1' : '0',
		shadow_color: config.effects.shadowColor,
		shadow_blur: config.effects.shadowBlur,
		shadow_spread: config.effects.shadowSpread,
		shadow_offset_x: config.effects.shadowOffsetX,
		shadow_offset_y: config.effects.shadowOffsetY,
		glow_color: config.effects.glowColor,
		glow_intensity: config.effects.glowIntensity,
		glow_radius: config.effects.glowRadius,
		noise_intensity: config.effects.noiseIntensity,
		bg_blur: config.effects.backgroundBlur,
		persp_preset: config.perspective.preset,
		persp_rx: config.perspective.rotateX,
		persp_ry: config.perspective.rotateY,
		persp_rz: config.perspective.rotateZ,
		persp_depth: config.perspective.perspective,
	};

	// Serialize gradient stops as JSON
	if (config.background.gradientStops.length > 0) {
		params.bg_stops = JSON.stringify(config.background.gradientStops);
	}

	// Image URL is sent via postMessage, not URL params (too large)
	// but we still include a flag so the template knows to expect it
	if (config.background.imageUrl) {
		params.bg_has_image = '1';
	}

	return params;
}

// ── Parse URL params → config ──

export function paramsToConfig(params: Record<string, string | number>): ComposableConfig {
	let gradientStops: GradientStop[] = [];
	if (params.bg_stops) {
		try {
			gradientStops = JSON.parse(String(params.bg_stops));
		} catch { /* ignore */ }
	}

	return {
		background: {
			type: (String(params.bg_type) as BackgroundType) || DEFAULT_CONFIG.background.type,
			color1: String(params.bg_color1 || DEFAULT_CONFIG.background.color1),
			color2: String(params.bg_color2 || DEFAULT_CONFIG.background.color2),
			color3: String(params.bg_color3 || DEFAULT_CONFIG.background.color3),
			angle: Number(params.bg_angle) || DEFAULT_CONFIG.background.angle,
			gradientStops,
			imageUrl: '', // sent via postMessage, not URL params
			imageFit: (String(params.bg_image_fit || DEFAULT_CONFIG.background.imageFit)) as BackgroundConfig['imageFit'],
			imageBlur: Number(params.bg_image_blur ?? DEFAULT_CONFIG.background.imageBlur),
			imageOverlayColor: String(params.bg_image_overlay_color || DEFAULT_CONFIG.background.imageOverlayColor),
			imageOverlayOpacity: Number(params.bg_image_overlay_opacity ?? DEFAULT_CONFIG.background.imageOverlayOpacity),
			radialCenterX: Number(params.bg_radial_cx ?? DEFAULT_CONFIG.background.radialCenterX),
			radialCenterY: Number(params.bg_radial_cy ?? DEFAULT_CONFIG.background.radialCenterY),
		},
		device: {
			style: (String(params.frame_style) as DeviceFrameStyle) || DEFAULT_CONFIG.device.style,
			device: (String(params.device) as DeviceType) || DEFAULT_CONFIG.device.device,
			clayColor: String(params.clay_color || DEFAULT_CONFIG.device.clayColor),
			frameColor: String(params.frame_color || DEFAULT_CONFIG.device.frameColor),
			frameThickness: Number(params.frame_thickness ?? DEFAULT_CONFIG.device.frameThickness),
			frameBorderRadius: Number(params.frame_border_radius ?? DEFAULT_CONFIG.device.frameBorderRadius),
			screenBorderRadius: Number(params.screen_border_radius ?? DEFAULT_CONFIG.device.screenBorderRadius),
			deviceScale: Number(params.device_scale ?? DEFAULT_CONFIG.device.deviceScale),
		},
		layout: {
			type: (String(params.layout) as LayoutType) || DEFAULT_CONFIG.layout.type,
			panoramic: params.panoramic === '1' || params.panoramic === 1,
			totalSlides: Number(params.total_slides) || DEFAULT_CONFIG.layout.totalSlides,
		},
		typography: {
			headline: String(params.headline ?? DEFAULT_CONFIG.typography.headline),
			subtitle: String(params.subtitle ?? DEFAULT_CONFIG.typography.subtitle),
			fontColor: String(params.font_color || DEFAULT_CONFIG.typography.fontColor),
			fontWeight: Number(params.font_weight) || DEFAULT_CONFIG.typography.fontWeight,
			fontFamily: String(params.font_family ?? DEFAULT_CONFIG.typography.fontFamily),
			fontSize: Number(params.font_size ?? DEFAULT_CONFIG.typography.fontSize),
			textAlign: (String(params.text_align || DEFAULT_CONFIG.typography.textAlign)) as TypographyConfig['textAlign'],
			textShadow: params.text_shadow === '1' || params.text_shadow === 1,
			textShadowColor: String(params.text_shadow_color || DEFAULT_CONFIG.typography.textShadowColor),
			textShadowBlur: Number(params.text_shadow_blur ?? DEFAULT_CONFIG.typography.textShadowBlur),
			subtitleColor: String(params.subtitle_color ?? DEFAULT_CONFIG.typography.subtitleColor),
			subtitleWeight: Number(params.subtitle_weight ?? DEFAULT_CONFIG.typography.subtitleWeight),
			subtitleSize: Number(params.subtitle_size ?? DEFAULT_CONFIG.typography.subtitleSize),
		},
		effects: {
			shadow: (String(params.shadow) as ShadowDepth) || DEFAULT_CONFIG.effects.shadow,
			glow: (String(params.glow) as GlowIntensity) || DEFAULT_CONFIG.effects.glow,
			noise: params.noise === '1' || params.noise === 1,
			shadowColor: String(params.shadow_color || DEFAULT_CONFIG.effects.shadowColor),
			shadowBlur: Number(params.shadow_blur ?? DEFAULT_CONFIG.effects.shadowBlur),
			shadowSpread: Number(params.shadow_spread ?? DEFAULT_CONFIG.effects.shadowSpread),
			shadowOffsetX: Number(params.shadow_offset_x ?? DEFAULT_CONFIG.effects.shadowOffsetX),
			shadowOffsetY: Number(params.shadow_offset_y ?? DEFAULT_CONFIG.effects.shadowOffsetY),
			glowColor: String(params.glow_color || DEFAULT_CONFIG.effects.glowColor),
			glowIntensity: Number(params.glow_intensity ?? DEFAULT_CONFIG.effects.glowIntensity),
			glowRadius: Number(params.glow_radius ?? DEFAULT_CONFIG.effects.glowRadius),
			noiseIntensity: Number(params.noise_intensity ?? DEFAULT_CONFIG.effects.noiseIntensity),
			backgroundBlur: Number(params.bg_blur ?? DEFAULT_CONFIG.effects.backgroundBlur),
		},
		perspective: {
			preset: (String(params.persp_preset || 'flat') as PerspectivePreset),
			rotateX: Number(params.persp_rx) || 0,
			rotateY: Number(params.persp_ry) || 0,
			rotateZ: Number(params.persp_rz) || 0,
			perspective: Number(params.persp_depth) || DEFAULT_CONFIG.perspective.perspective,
		},
	};
}

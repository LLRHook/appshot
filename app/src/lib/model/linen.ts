import { parseImageRef } from './image';
import { validateProjectSize } from './limits';
import type { Composition, ImageRef, Slide } from './types';

/**
 * Table Linen: the editorial Billington direction. Every number in this module is
 * expressed in 1320×2868 reference pixels (one iPhone 6.9" panel). A connected pair
 * shares one 2640×2868 world, so a shared phone's centerX is a world coordinate.
 * Horizontal positions and all type/shell sizes scale by outputWidth / 1320; vertical
 * anchors (tops, bottoms, band) scale by outputHeight / 2868. At the reference size the
 * native renderer reproduces the external `render-table-linen.mjs` artifact exactly.
 *
 * This module must not import `./project` (project.ts imports the validators below);
 * image validation lives in the acyclic `./image` module shared with project.ts.
 */

export const LINEN_REFERENCE = { width: 1320, height: 2868 } as const;
export const LINEN_WORLD_WIDTH = LINEN_REFERENCE.width * 2;
export const LINEN_STYLE_ID = 'table-linen' as const;

export type LinenTheme = 'teal' | 'cream';
export type LinenPhoneMode = 'full' | 'bottom-crop';
/** Code-native device illustration calibrated to the iOS 26.3 simulator compositor. */
export type LinenHardwareModel = 'iphone-17-pro-max';
/** `source`: the capture already carries its island (never drawn). `draw`: add the cutout. */
export type LinenIslandMode = 'draw' | 'source';

export interface LinenColors {
	canvas: string;
	band: string;
	headline: string;
	accent: string;
	subtitle: string;
	wordmark: string;
	dot: string;
	shell: string;
	shellEdge: string;
	/** Strict #RRGGBB; the renderer's `rgba(r,g,b,a)` shadow becomes shadow + shadowOpacity. */
	shadow: string;
	shadowOpacity: number;
}

export interface LinenLayout {
	margin: number;
	wordmarkTop: number;
	headlineTop: number;
	headlineWidth: number;
	headlineSize: number;
	headlineLeading: number;
	headlineTracking: number;
	subtitleTop: number;
	subtitleWidth: number;
	subtitleSize: number;
	subtitleLeading: number;
	bandTop: number;
}

export interface LinenPhone {
	mode: LinenPhoneMode;
	top: number;
	bottom: number;
	maxWidth: number;
	centerX: number;
	shell: number;
	radius: number;
	frameless: boolean;
	shadow: boolean;
	/** Degrees, rotated about the screen centre together with the shell. */
	rotation: number;
	cropReason?: string;
	/**
	 * Hardware API shared with `render-table-linen.mjs` (V2). Omitted keeps the V1 flat
	 * shell byte-for-byte. With `iphone-17-pro-max` the shell band becomes a silver rim
	 * plus black glass bezel and the display corners use the calibrated radius.
	 */
	hardware?: LinenHardwareModel;
	/** Default `source`. Only `draw` ever paints an island, and only over a light centre. */
	dynamicIsland?: LinenIslandMode;
	/** Side buttons (action, volume, power, camera control) projecting 2.5 native px. */
	hardwareButtons?: boolean;
}

export interface LinenSettings {
	colors: LinenColors;
	layout: LinenLayout;
	phone: LinenPhone;
	band: boolean;
}

export const LINEN_PALETTES: Record<LinenTheme, LinenColors> = {
	teal: {
		canvas: '#2A736E',
		band: '#24645F',
		headline: '#FBF6EF',
		accent: '#D4A843',
		subtitle: '#CFE3E0',
		wordmark: '#FBF6EF',
		dot: '#D4A843',
		shell: '#292C2C',
		shellEdge: '#515A59',
		shadow: '#000000',
		shadowOpacity: 0.3
	},
	cream: {
		canvas: '#FBF6EF',
		band: '#F1E2D2',
		headline: '#2C2C2C',
		accent: '#2A736E',
		subtitle: '#4C5B6B',
		wordmark: '#2C2C2C',
		dot: '#D4A843',
		shell: '#292C2C',
		shellEdge: '#515A59',
		shadow: '#2A736E',
		shadowOpacity: 0.18
	}
};

export const LINEN_LAYOUT: LinenLayout = {
	margin: 96,
	wordmarkTop: 128,
	headlineTop: 248,
	headlineWidth: 1128,
	headlineSize: 118,
	headlineLeading: 120,
	headlineTracking: -1.77,
	subtitleTop: 528,
	subtitleWidth: 1000,
	subtitleSize: 44,
	subtitleLeading: 57,
	bandTop: 2040
};

/** Single-panel phone; the renderer's `centerX` default is half of one panel. */
export const LINEN_PHONE: LinenPhone = {
	mode: 'full',
	top: 760,
	bottom: 2740,
	maxWidth: 1038,
	centerX: 660,
	shell: 24,
	radius: 60,
	frameless: false,
	shadow: true,
	rotation: 0
};

/** Shared phone for a connected pair, centred on the seam of the 2640-wide world. */
export const LINEN_SHARED_PHONE: LinenPhone = { ...LINEN_PHONE, centerX: LINEN_REFERENCE.width };

/** Vertical clearance the renderer requires between copy and the phone shell (reference px). */
export const LINEN_COPY_CLEARANCE = 36;

export const LINEN_COLOR_KEYS = [
	'canvas',
	'band',
	'headline',
	'accent',
	'subtitle',
	'wordmark',
	'dot',
	'shell',
	'shellEdge',
	'shadow'
] as const;
export type LinenColorKey = (typeof LINEN_COLOR_KEYS)[number];

export const LINEN_LAYOUT_BOUNDS: Record<keyof LinenLayout, readonly [number, number]> = {
	margin: [0, 1320],
	wordmarkTop: [0, 2868],
	headlineTop: [0, 2868],
	headlineWidth: [1, 1320],
	headlineSize: [8, 400],
	headlineLeading: [1, 600],
	headlineTracking: [-40, 40],
	subtitleTop: [0, 2868],
	subtitleWidth: [1, 1320],
	subtitleSize: [8, 200],
	subtitleLeading: [1, 400],
	bandTop: [0, 2868]
};

export const LINEN_PHONE_BOUNDS = {
	top: [0, 2868],
	bottom: [1, 6000],
	maxWidth: [1, LINEN_WORLD_WIDTH],
	centerX: [0, LINEN_WORLD_WIDTH],
	shell: [0, 200],
	radius: [0, 400],
	rotation: [-8, 8]
} as const satisfies Partial<Record<keyof LinenPhone, readonly [number, number]>>;

const LINEN_LAYOUT_KEYS = Object.keys(LINEN_LAYOUT) as (keyof LinenLayout)[];
const LINEN_PHONE_KEYS: (keyof LinenPhone)[] = [
	'mode',
	'top',
	'bottom',
	'maxWidth',
	'centerX',
	'shell',
	'radius',
	'frameless',
	'shadow',
	'rotation',
	'cropReason',
	'hardware',
	'dynamicIsland',
	'hardwareButtons'
];
const HEX = /^#[0-9a-f]{6}$/i;
const RGBA =
	/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)$/i;

function fail(message: string): never {
	throw new Error(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		fail(`${what} must be an object.`);
	return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, [min, max]: readonly [number, number], what: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		fail(`${what} must be a finite number between ${min} and ${max}.`);
	return value;
}

function hexColor(value: unknown, what: string): string {
	if (typeof value !== 'string' || !HEX.test(value)) fail(`${what} must be a #RRGGBB color.`);
	return value;
}

function rejectUnknownKeys(value: Record<string, unknown>, known: readonly string[], what: string) {
	for (const key of Object.keys(value))
		if (!known.includes(key)) fail(`${what} has an unsupported key "${key}".`);
}

/**
 * Convert the renderer's shadow color (`rgba(0,0,0,0.30)` or `#RRGGBB`) into the strict
 * hex + bounded opacity pair stored natively. Arbitrary CSS is rejected.
 */
export function parseShadowColor(value: unknown): { shadow: string; shadowOpacity: number } {
	if (typeof value !== 'string') fail('Shadow color must be a string.');
	if (HEX.test(value)) return { shadow: value, shadowOpacity: 1 };
	const match = RGBA.exec(value.trim());
	if (!match) fail('Shadow color must be #RRGGBB or rgba(r, g, b, a).');
	const channels = match.slice(1, 4).map(Number);
	if (channels.some((channel) => channel > 255)) fail('Shadow color channels must be 0–255.');
	const alpha = match[4] === undefined ? 1 : Number(match[4]);
	const hex = channels.map((channel) => channel.toString(16).padStart(2, '0').toUpperCase());
	return {
		shadow: `#${hex.join('')}`,
		shadowOpacity: finiteNumber(alpha, [0, 1], 'Shadow opacity')
	};
}

/** CSS color the canvas receives for the phone shadow: exact renderer alpha preserved. */
export function linenShadowCss(colors: LinenColors): string {
	const channel = (offset: number) => parseInt(colors.shadow.slice(offset, offset + 2), 16);
	return `rgba(${channel(1)},${channel(3)},${channel(5)},${colors.shadowOpacity})`;
}

export function parseLinenColors(value: unknown): LinenColors {
	const colors = record(value, 'Table Linen colors');
	return {
		canvas: hexColor(colors.canvas, 'Canvas color'),
		band: hexColor(colors.band, 'Band color'),
		headline: hexColor(colors.headline, 'Headline color'),
		accent: hexColor(colors.accent, 'Accent color'),
		subtitle: hexColor(colors.subtitle, 'Subtitle color'),
		wordmark: hexColor(colors.wordmark, 'Wordmark color'),
		dot: hexColor(colors.dot, 'Dot color'),
		shell: hexColor(colors.shell, 'Shell color'),
		shellEdge: hexColor(colors.shellEdge, 'Shell edge color'),
		shadow: hexColor(colors.shadow, 'Shadow color'),
		shadowOpacity: finiteNumber(colors.shadowOpacity, [0, 1], 'Shadow opacity')
	};
}

export function parseLinenLayout(value: unknown): LinenLayout {
	const layout = record(value, 'Table Linen layout');
	const result = {} as LinenLayout;
	for (const key of LINEN_LAYOUT_KEYS)
		result[key] = finiteNumber(layout[key], LINEN_LAYOUT_BOUNDS[key], `Layout ${key}`);
	return result;
}

export function parseLinenPhone(value: unknown): LinenPhone {
	const phone = record(value, 'Table Linen phone');
	if (phone.mode !== 'full' && phone.mode !== 'bottom-crop')
		fail('Phone mode must be "full" or "bottom-crop".');
	if (typeof phone.frameless !== 'boolean') fail('Phone frameless must be true or false.');
	if (typeof phone.shadow !== 'boolean') fail('Phone shadow must be true or false.');
	const result: LinenPhone = {
		mode: phone.mode,
		top: finiteNumber(phone.top, LINEN_PHONE_BOUNDS.top, 'Phone top'),
		bottom: finiteNumber(phone.bottom, LINEN_PHONE_BOUNDS.bottom, 'Phone bottom'),
		maxWidth: finiteNumber(phone.maxWidth, LINEN_PHONE_BOUNDS.maxWidth, 'Phone maxWidth'),
		centerX: finiteNumber(phone.centerX, LINEN_PHONE_BOUNDS.centerX, 'Phone centerX'),
		shell: finiteNumber(phone.shell, LINEN_PHONE_BOUNDS.shell, 'Phone shell'),
		radius: finiteNumber(phone.radius, LINEN_PHONE_BOUNDS.radius, 'Phone radius'),
		frameless: phone.frameless,
		shadow: phone.shadow,
		rotation: finiteNumber(phone.rotation, LINEN_PHONE_BOUNDS.rotation, 'Phone rotation')
	};
	if (result.top >= result.bottom) fail('Phone top must be above phone bottom.');
	if (phone.cropReason !== undefined) {
		if (typeof phone.cropReason !== 'string' || phone.cropReason.length > 200)
			fail('Phone cropReason must be a short string.');
		result.cropReason = phone.cropReason;
	}
	if (result.mode === 'bottom-crop' && !result.cropReason?.trim())
		fail('An intentional bottom crop requires a phone cropReason.');
	// Optional hardware keys are stored only when present so V1 projects round-trip unchanged.
	if (phone.hardware !== undefined) {
		if (phone.hardware !== 'iphone-17-pro-max')
			fail('Phone hardware must be omitted or "iphone-17-pro-max".');
		result.hardware = phone.hardware;
	}
	if (phone.dynamicIsland !== undefined) {
		if (phone.dynamicIsland !== 'draw' && phone.dynamicIsland !== 'source')
			fail('Phone dynamicIsland must be "draw" or "source".');
		result.dynamicIsland = phone.dynamicIsland;
	}
	if (phone.hardwareButtons !== undefined) {
		if (typeof phone.hardwareButtons !== 'boolean')
			fail('Phone hardwareButtons must be true or false.');
		result.hardwareButtons = phone.hardwareButtons;
	}
	return result;
}

export function parseLinenSettings(value: unknown): LinenSettings {
	const settings = record(value, 'Table Linen settings');
	if (typeof settings.band !== 'boolean') fail('Table Linen band must be true or false.');
	return {
		colors: parseLinenColors(settings.colors),
		layout: parseLinenLayout(settings.layout),
		phone: parseLinenPhone(settings.phone),
		band: settings.band
	};
}

/* ------------------------------------------------------------------ defaults */

/** Renderer default: first and last panels are teal; a connected pair shares its theme. */
export function defaultLinenTheme(
	index: number,
	count: number,
	pair?: readonly number[]
): LinenTheme {
	if (pair?.includes(index)) return 'teal';
	return index === 0 || index === count - 1 ? 'teal' : 'cream';
}

export function defaultLinenSettings(
	theme: LinenTheme,
	options: { band?: boolean; phone?: LinenPhone; quiet?: boolean } = {}
): LinenSettings {
	const quiet = options.quiet ?? false;
	return {
		colors: { ...LINEN_PALETTES[quiet ? 'cream' : theme] },
		layout: { ...LINEN_LAYOUT },
		phone: { ...(options.phone ?? LINEN_PHONE) },
		band: quiet ? false : (options.band ?? true)
	};
}

/** Which theme preset a palette currently matches, for editor toggles. */
export function linenThemeOf(colors: LinenColors): LinenTheme | 'custom' {
	for (const theme of ['teal', 'cream'] as const) {
		const preset = LINEN_PALETTES[theme];
		if (
			preset.canvas.toUpperCase() === colors.canvas.toUpperCase() &&
			preset.headline.toUpperCase() === colors.headline.toUpperCase()
		)
			return theme;
	}
	return 'custom';
}

function pairIndices(composition: Composition): number[] {
	const panorama = composition.panorama;
	if (composition.continuityMode !== 'paired' || !panorama) return [];
	const left = composition.slides.findIndex((slide) => slide.id === panorama.leftId);
	const adjacent = left >= 0 && composition.slides[left + 1]?.id === panorama.rightId;
	return adjacent ? [left, left + 1] : [];
}

/** Complete settings for a slide, falling back to renderer defaults when none were saved. */
export function resolveLinenSettings(composition: Composition, index: number): LinenSettings {
	const slide = composition.slides[index];
	if (slide?.linen) return slide.linen;
	return defaultLinenSettings(
		defaultLinenTheme(index, composition.slides.length, pairIndices(composition))
	);
}

/** The shared phone for a connected Table Linen pair. */
export function resolveSharedLinenPhone(composition: Composition): LinenPhone {
	return composition.panorama?.linenPhone ?? LINEN_SHARED_PHONE;
}

/**
 * Useful first-time defaults for an existing slide: keep its text, but move the
 * subtitle and phone down when the headline already has more than two lines so the
 * renderer's collision checks pass instead of erroring.
 */
export function linenDefaultsForSlide(slide: Slide, theme: LinenTheme): LinenSettings {
	const settings = defaultLinenSettings(theme);
	const { layout } = settings;
	const headlineLines = linenLines(slide.typography.headline).length;
	// Rough soft-wrap estimate (no canvas here): DM Sans averages about 0.52 em per glyph.
	const perLine = Math.max(1, Math.floor(layout.subtitleWidth / (layout.subtitleSize * 0.52)));
	const subtitleLines = linenLines(slide.typography.subtitle).reduce(
		(count, line) => count + Math.max(1, Math.ceil(line.trim().length / perLine)),
		0
	);
	if (headlineLines > 2) {
		layout.subtitleTop = Math.min(
			LINEN_LAYOUT_BOUNDS.subtitleTop[1],
			layout.headlineTop + headlineLines * layout.headlineLeading + 40
		);
	}
	const copyBottom = layout.subtitleTop + subtitleLines * layout.subtitleLeading;
	const requiredTop = copyBottom + LINEN_COPY_CLEARANCE + settings.phone.shell;
	if (requiredTop > settings.phone.top) {
		settings.phone.top = Math.min(requiredTop, settings.phone.bottom - 1);
	}
	return settings;
}

/* ------------------------------------------------------------------ text markup */

export interface LinenSpan {
	text: string;
	italic: boolean;
}

/** Split copy into explicit lines; a trailing newline while typing is not a line. */
export function linenLines(text: string | undefined): string[] {
	if (!text) return [];
	const lines = text.split('\n');
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	return lines;
}

/**
 * Paired `*` markers delimit italic accent spans (Instrument Serif Italic in the accent
 * color). Unbalanced markers are an error rather than being drawn or dropped silently.
 */
export function linenHeadlineSpans(line: string, where = 'The headline'): LinenSpan[] {
	const parts = line.split('*');
	if (parts.length % 2 === 0)
		fail(`${where} has an unbalanced * italic marker. Wrap accent words as *like this*.`);
	return parts.map((text, index) => ({ text, italic: index % 2 === 1 }));
}

/* ------------------------------------------------------------------ geometry */

export interface LinenScale {
	/** Horizontal positions and every size: outputWidth / 1320. */
	sx: number;
	/** Vertical anchors: outputHeight / 2868. */
	sy: number;
}

export function linenScale(width: number, height: number): LinenScale {
	return { sx: width / LINEN_REFERENCE.width, sy: height / LINEN_REFERENCE.height };
}

export interface LinenBounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * iPhone 17 Pro Max illustration constants in NATIVE 1320×2868 capture pixels, measured
 * from the iOS 26.3 simulator compositor (see HARDWARE-REFERENCE.md in the campaign
 * artifacts). They scale with the capture, never with the panel. Identical to the V2
 * `render-table-linen.mjs` constants.
 */
export const LINEN_HARDWARE = {
	displayRadiusNative: 150,
	rimNative: 8,
	buttonProjectionNative: 2.5,
	island: { x: 472, y: 42, width: 376, height: 110, radius: 55 },
	/** Sampled to decide whether a `draw` island would double an existing dark one. */
	islandCenter: { x: 660, y: 97 },
	referenceSize: { width: 1320, height: 2868 },
	buttons: [
		{ label: 'action', side: 'left', rows: [300, 400] },
		{ label: 'volume-up', side: 'left', rows: [505, 700] },
		{ label: 'volume-down', side: 'left', rows: [745, 940] },
		{ label: 'power', side: 'right', rows: [585, 865] },
		{ label: 'camera-control', side: 'right', rows: [1540, 1720] }
	]
} as const;

export interface LinenLocalRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface LinenHardwareButton {
	label: string;
	side: 'left' | 'right';
	/** Phone-local (screen centre origin, pre-rotation) output pixels. */
	local: LinenLocalRect;
	/** World-space axis-aligned bounds after rotation. */
	bounds: LinenBounds;
}

export interface LinenHardwareBox {
	model: LinenHardwareModel;
	/** Reference-native → output for the capture: screenWidth/1320, screenHeight/2868. */
	kx: number;
	ky: number;
	displayRadius: number;
	bodyRadius: number;
	rim: number;
	glassBezel: number;
	projection: number;
	/** Body top-left in phone-local coordinates. */
	bx: number;
	by: number;
	buttons: LinenHardwareButton[];
	islandMode: LinenIslandMode;
	islandLocal: LinenLocalRect & { radius: number };
	/** Shell bounds widened by the button projection when buttons are drawn. */
	outerBounds: LinenBounds;
}

export interface LinenPhoneBox {
	screenWidth: number;
	screenHeight: number;
	shellWidth: number;
	shellHeight: number;
	border: number;
	radius: number;
	centerX: number;
	centerY: number;
	/** Radians. */
	rotation: number;
	/** Source pixels → output pixels. */
	scale: number;
	bounds: LinenBounds;
	screenBounds: LinenBounds;
	/** Present only when `phone.hardware` is set. */
	hardware?: LinenHardwareBox;
	/** What must stay inside the canvas: outer hardware bounds, else the shell bounds. */
	fitBounds: LinenBounds;
}

const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/** Same matrix the canvas applies: translate(centre) · rotate(θ). */
function toWorld(
	centerX: number,
	centerY: number,
	rotation: number,
	lx: number,
	ly: number
): { x: number; y: number } {
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	return { x: centerX + lx * cos - ly * sin, y: centerY + lx * sin + ly * cos };
}

function worldBox(
	centerX: number,
	centerY: number,
	rotation: number,
	rect: LinenLocalRect
): LinenBounds {
	const corners = [
		[rect.x, rect.y],
		[rect.x + rect.width, rect.y],
		[rect.x + rect.width, rect.y + rect.height],
		[rect.x, rect.y + rect.height]
	].map(([x, y]) => toWorld(centerX, centerY, rotation, x, y));
	return {
		left: Math.min(...corners.map((corner) => corner.x)),
		right: Math.max(...corners.map((corner) => corner.x)),
		top: Math.min(...corners.map((corner) => corner.y)),
		bottom: Math.max(...corners.map((corner) => corner.y))
	};
}

function rotatedBounds(
	centerX: number,
	centerY: number,
	halfWidth: number,
	halfHeight: number,
	rotation: number
): LinenBounds {
	return worldBox(centerX, centerY, rotation, {
		x: -halfWidth,
		y: -halfHeight,
		width: halfWidth * 2,
		height: halfHeight * 2
	});
}

/**
 * Hardware geometry for a placed phone, mirroring the V2 renderer: constants are native
 * capture pixels multiplied by the capture's output scale, the rim never exceeds the
 * shell, and every part shares the phone's single translate·rotate transform. The
 * literal 3px button tuck / 1.5px button radius of the reference are scaled by `sx`
 * so a 1320-wide export stays identical.
 */
function linenHardwareBox(
	phone: LinenPhone,
	box: Omit<LinenPhoneBox, 'hardware' | 'fitBounds'>,
	scale: LinenScale
): LinenHardwareBox | undefined {
	if (!phone.hardware) return undefined;
	const HW = LINEN_HARDWARE;
	const { screenWidth, screenHeight, border, centerX, centerY, rotation } = box;
	const kx = screenWidth / HW.referenceSize.width;
	const ky = screenHeight / HW.referenceSize.height;
	const displayRadius = HW.displayRadiusNative * box.scale;
	const rim = Math.min(border, HW.rimNative * box.scale);
	const projection = HW.buttonProjectionNative * box.scale;
	const sx = -screenWidth / 2;
	const sy = -screenHeight / 2;
	const bx = sx - border;
	const by = sy - border;
	const tuck = 3 * scale.sx;
	const buttons: LinenHardwareButton[] =
		phone.hardwareButtons === true
			? HW.buttons.map((button) => {
					const [rowStart, rowEnd] = button.rows;
					const local: LinenLocalRect = {
						x: button.side === 'left' ? bx - projection : bx + box.shellWidth - tuck,
						y: sy + rowStart * ky,
						width: projection + tuck,
						height: (rowEnd - rowStart) * ky
					};
					return {
						label: button.label,
						side: button.side,
						local,
						bounds: worldBox(centerX, centerY, rotation, local)
					};
				})
			: [];
	return {
		model: phone.hardware,
		kx,
		ky,
		displayRadius,
		bodyRadius: displayRadius + border,
		rim,
		glassBezel: border - rim,
		projection,
		bx,
		by,
		buttons,
		islandMode: phone.dynamicIsland ?? 'source',
		islandLocal: {
			x: sx + HW.island.x * kx,
			y: sy + HW.island.y * ky,
			width: HW.island.width * kx,
			height: HW.island.height * ky,
			radius: HW.island.radius * ky
		},
		outerBounds: rotatedBounds(
			centerX,
			centerY,
			box.shellWidth / 2 + (buttons.length ? projection : 0),
			box.shellHeight / 2,
			rotation
		)
	};
}

/** Source pixel sampled by the duplicate-island guard, for a capture of the given size. */
export function linenIslandProbePixel(source: { naturalWidth: number; naturalHeight: number }) {
	const HW = LINEN_HARDWARE;
	return {
		x: Math.round((HW.islandCenter.x * source.naturalWidth) / HW.referenceSize.width),
		y: Math.round((HW.islandCenter.y * source.naturalHeight) / HW.referenceSize.height)
	};
}

/**
 * Canonical phone placement shared by the stitch module and the renderer. Mirrors the
 * external renderer: the screen is the whole capture uniformly scaled (never stretched),
 * the shell adds `shell` on every side, and shell + screen rotate together about the
 * screen centre. Coordinates are output pixels for the given scale.
 */
export function linenPhoneBox(
	phone: LinenPhone,
	source: { naturalWidth: number; naturalHeight: number },
	scale: LinenScale
): LinenPhoneBox {
	const ratio =
		source.naturalWidth > 0 && source.naturalHeight > 0
			? source.naturalWidth / source.naturalHeight
			: LINEN_REFERENCE.width / LINEN_REFERENCE.height;
	const top = finite(phone.top, LINEN_PHONE.top) * scale.sy;
	const bottom = finite(phone.bottom, LINEN_PHONE.bottom) * scale.sy;
	const maxWidth = finite(phone.maxWidth, LINEN_PHONE.maxWidth) * scale.sx;
	const border = phone.frameless ? 0 : finite(phone.shell, LINEN_PHONE.shell) * scale.sx;
	const screenWidth =
		phone.mode === 'bottom-crop' ? maxWidth : Math.min(maxWidth, (bottom - top) * ratio);
	const screenHeight = screenWidth / ratio;
	const centerX = finite(phone.centerX, LINEN_PHONE.centerX) * scale.sx;
	const centerY = top + screenHeight / 2;
	const rotation = (finite(phone.rotation, 0) * Math.PI) / 180;
	const shellWidth = screenWidth + border * 2;
	const shellHeight = screenHeight + border * 2;
	const base = {
		screenWidth,
		screenHeight,
		shellWidth,
		shellHeight,
		border,
		radius: finite(phone.radius, LINEN_PHONE.radius) * scale.sx,
		centerX,
		centerY,
		rotation,
		scale: source.naturalWidth > 0 ? screenWidth / source.naturalWidth : 1,
		bounds: rotatedBounds(centerX, centerY, shellWidth / 2, shellHeight / 2, rotation),
		screenBounds: rotatedBounds(centerX, centerY, screenWidth / 2, screenHeight / 2, rotation)
	};
	const hardware = linenHardwareBox(phone, base, scale);
	return { ...base, hardware, fitBounds: hardware?.outerBounds ?? base.bounds };
}

/**
 * Same rejection rules as the external renderer's fit check; null when the phone fits.
 * With hardware buttons the rotated outer bounds (body + projection) must fit.
 */
export function linenPhoneFitError(
	box: LinenPhoneBox,
	phone: LinenPhone,
	worldWidth: number,
	height: number
): string | null {
	const bounds = box.fitBounds;
	if (
		box.screenWidth <= 0 ||
		box.screenHeight <= 0 ||
		bounds.left < 0 ||
		bounds.right > worldWidth ||
		bounds.top < 0 ||
		(phone.mode === 'full' && bounds.bottom > height)
	) {
		const what = box.hardware?.buttons.length ? 'phone, including its side buttons,' : 'phone';
		return `The ${what} does not fit the ${Math.round(worldWidth)} × ${height} canvas (left ${Math.round(bounds.left)}, right ${Math.round(bounds.right)}, top ${Math.round(bounds.top)}, bottom ${Math.round(bounds.bottom)}). Adjust its top, bottom, max width, center X, or rotation in the Composition tab.`;
	}
	return null;
}

/**
 * A connected pair has exactly one phone and it must cross the seam: the rotated screen
 * bounds have to straddle `seamX` inside the world, so both panels show the same device.
 */
export function linenSeamError(
	box: LinenPhoneBox,
	seamX: number,
	worldWidth: number
): string | null {
	const screen = box.screenBounds;
	const crosses = screen.left < seamX && seamX < screen.right;
	if (crosses && screen.left >= 0 && screen.right <= worldWidth) return null;
	const side = screen.right <= seamX ? 'left' : screen.left >= seamX ? 'right' : 'outside';
	return side === 'outside'
		? `The shared phone screen (left ${Math.round(screen.left)}, right ${Math.round(screen.right)}) leaves the ${worldWidth}-wide two-frame world. Move center X toward ${seamX} or reduce the max width.`
		: `The shared phone sits entirely in the ${side} frame (screen left ${Math.round(screen.left)}, right ${Math.round(screen.right)}) and never crosses the seam at ${seamX}. Move center X toward ${seamX}, widen the phone, or disconnect the pair.`;
}

/* ------------------------------------------------------------------ manifest import */

interface ManifestSlide {
	id: string;
	label?: string;
	image: ImageRef;
	headline: string;
	subtitle?: string;
	settings: LinenSettings;
	phoneOverride: Record<string, unknown>;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalRecord(value: unknown, what: string): Record<string, unknown> {
	return value === undefined ? {} : record(value, what);
}

function optionalString(value: unknown, max: number, what: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.length > max) fail(`${what} must be a string.`);
	return value;
}

function textLines(value: unknown, min: number, max: number, what: string): string[] {
	if (!Array.isArray(value) || value.length < min || value.length > max)
		fail(`${what} must be an array of ${min}–${max} explicit lines.`);
	return value.map((line, index) => {
		if (typeof line !== 'string' || !line.trim()) fail(`${what} line ${index + 1} is empty.`);
		if (line.includes('\n'))
			fail(`${what} line ${index + 1} contains a newline; use one array item per line.`);
		return line;
	});
}

/** Exactly the project's image rules (`image.ts`), so the converted project always reopens. */
function imageFor(key: unknown, images: Record<string, ImageRef>, what: string): ImageRef {
	if (typeof key !== 'string' || !key.trim()) fail(`${what} needs an image path.`);
	if (!Object.hasOwn(images, key)) fail(`${what}: no screenshot was provided for "${key}".`);
	try {
		return parseImageRef(images[key]);
	} catch (error) {
		fail(`Image "${key}": ${error instanceof Error ? error.message : 'invalid image.'}`);
	}
}

function manifestColors(
	theme: LinenTheme,
	quiet: boolean,
	...overrides: Record<string, unknown>[]
): LinenColors {
	const base = LINEN_PALETTES[quiet ? 'cream' : theme];
	const merged: Record<string, unknown> = { ...base };
	let shadowOverride: unknown;
	for (const override of overrides) {
		rejectUnknownKeys(override, LINEN_COLOR_KEYS, 'colors');
		Object.assign(merged, override);
		if (override.shadow !== undefined) shadowOverride = override.shadow;
	}
	// The renderer's default shadows are rgba strings. An override keeps its exact alpha;
	// a plain #RRGGBB override is opaque there, so it is opaque here too.
	const shadow =
		shadowOverride === undefined
			? { shadow: base.shadow, shadowOpacity: base.shadowOpacity }
			: parseShadowColor(shadowOverride);
	return parseLinenColors({ ...merged, ...shadow });
}

function manifestLayout(...overrides: Record<string, unknown>[]): LinenLayout {
	const merged: Record<string, unknown> = { ...LINEN_LAYOUT };
	for (const override of overrides) {
		rejectUnknownKeys(override, LINEN_LAYOUT_KEYS, 'layout');
		Object.assign(merged, override);
	}
	return parseLinenLayout(merged);
}

function manifestPhone(...overrides: Record<string, unknown>[]): LinenPhone {
	const merged: Record<string, unknown> = { ...LINEN_PHONE };
	for (const override of overrides) {
		rejectUnknownKeys(override, LINEN_PHONE_KEYS, 'phone');
		Object.assign(merged, override);
	}
	return parseLinenPhone(merged);
}

/**
 * Convert a `render-table-linen.mjs` manifest into a standard Composition (version 1).
 * `images` maps each manifest image path to an already-loaded ImageRef; nothing is read
 * from disk or the network. Global `colors`/`layout`/`phone` merge under per-slide
 * overrides, and the connected pair's `panorama.phone` merges over the left slide's phone
 * with the renderer's seam-centred default. The result passes `parseProject` unchanged.
 */
export function tableLinenFromManifest(
	manifest: unknown,
	images: Record<string, ImageRef>
): Composition {
	const source = record(manifest, 'The Table Linen manifest');
	if (source.version !== 1) fail('The manifest version must be 1.');
	const style = source.style ?? 'table-linen';
	if (style !== 'table-linen' && style !== 'linen-quiet')
		fail('The manifest style must be "table-linen" or "linen-quiet".');
	const quiet = style === 'linen-quiet';
	const name = optionalString(source.name, 200, 'The campaign name') || 'Billington';
	const manifestSlides: unknown[] = Array.isArray(source.slides) ? source.slides : [];
	const slideCount = manifestSlides.length;
	if (slideCount < 1 || slideCount > 10) fail('The manifest must contain 1–10 slides.');
	const imageMap = record(images, 'The image map');
	const globalColors = optionalRecord(source.colors, 'Manifest colors');
	const globalLayout = optionalRecord(source.layout, 'Manifest layout');
	const globalPhone = optionalRecord(source.phone, 'Manifest phone');
	const ids = new Set<string>();
	const slides: ManifestSlide[] = manifestSlides.map((entry, index) => {
		const slide = record(entry, `Slide ${index + 1}`);
		if (typeof slide.id !== 'string' || !KEBAB.test(slide.id) || slide.id.length > 200)
			fail(`Slide ${index + 1} needs a unique kebab-case id of at most 200 characters.`);
		if (ids.has(slide.id)) fail(`Slide id "${slide.id}" is used more than once.`);
		ids.add(slide.id);
		const where = `Slide "${slide.id}"`;
		const theme =
			slide.theme === undefined
				? defaultLinenTheme(index, slideCount)
				: slide.theme === 'teal' || slide.theme === 'cream'
					? slide.theme
					: fail(`${where}: theme must be "cream" or "teal".`);
		if (slide.band !== undefined && typeof slide.band !== 'boolean')
			fail(`${where}: band must be true or false.`);
		const headlineLines = textLines(slide.headline, 1, 2, `${where} headline`);
		headlineLines.forEach((line, lineIndex) =>
			linenHeadlineSpans(line, `${where} headline line ${lineIndex + 1}`)
		);
		const subtitleLines = textLines(slide.subtitle ?? [], 0, 2, `${where} subtitle`);
		const headline = headlineLines.join('\n');
		const subtitle = subtitleLines.length ? subtitleLines.join('\n') : undefined;
		if (headline.length > 180) fail(`${where}: the headline is longer than 180 characters.`);
		if (subtitle && subtitle.length > 300)
			fail(`${where}: the subtitle is longer than 300 characters.`);
		const phoneOverride = optionalRecord(slide.phone, `${where} phone`);
		return {
			id: slide.id,
			label: optionalString(slide.label, 200, `${where} label`),
			image: imageFor(slide.image, imageMap as Record<string, ImageRef>, where),
			headline,
			subtitle,
			phoneOverride,
			settings: {
				colors: manifestColors(
					theme,
					quiet,
					globalColors,
					optionalRecord(slide.colors, `${where} colors`)
				),
				layout: manifestLayout(globalLayout, optionalRecord(slide.layout, `${where} layout`)),
				phone: manifestPhone(globalPhone, phoneOverride),
				band: quiet ? false : slide.band !== false
			}
		};
	});

	const composition: Composition = {
		version: 1,
		name,
		device: 'iphone-6.9',
		style: LINEN_STYLE_ID,
		accent: LINEN_PALETTES.teal.dot,
		continuityMode: 'none',
		slides: slides.map(
			(slide): Slide => ({
				id: slide.id,
				device: 'iphone-6.9',
				...(slide.label !== undefined ? { label: slide.label } : {}),
				background: { kind: 'solid', colors: [slide.settings.colors.canvas] },
				frame: slide.settings.phone.frameless ? 'none' : 'bezel',
				layout: 'text-above',
				typography: {
					headline: slide.headline,
					...(slide.subtitle !== undefined ? { subtitle: slide.subtitle } : {}),
					fontColor: slide.settings.colors.headline,
					fontWeight: 400
				},
				effects: { shadow: slide.settings.phone.shadow ? 'soft' : 'none', glow: 0 },
				continuity: { inset: 0 },
				primaryImage: slide.image,
				linen: slide.settings
			})
		)
	};

	if (source.panorama !== undefined) {
		const panorama = record(source.panorama, 'The manifest panorama');
		if (panorama.enabled !== undefined && typeof panorama.enabled !== 'boolean')
			fail('The panorama enabled flag must be true or false.');
		if (panorama.enabled === true) {
			const leftIndex = slides.findIndex((slide) => slide.id === panorama.leftId);
			const rightIndex = slides.findIndex((slide) => slide.id === panorama.rightId);
			if (leftIndex < 0 || rightIndex < 0)
				fail('The panorama must reference existing leftId and rightId slides.');
			if (rightIndex !== leftIndex + 1)
				fail('The connected screenshots must be adjacent and in order.');
			const left = slides[leftIndex];
			composition.continuityMode = 'paired';
			composition.panorama = {
				leftId: left.id,
				rightId: slides[rightIndex].id,
				image: imageFor(panorama.image, imageMap as Record<string, ImageRef>, 'The panorama'),
				offset: 0,
				scale: 1,
				tilt: 0,
				linenPhone: manifestPhone(
					globalPhone,
					left.phoneOverride,
					{ centerX: LINEN_REFERENCE.width },
					optionalRecord(panorama.phone, 'Panorama phone')
				)
			};
		}
	}
	validateProjectSize(JSON.stringify(composition));
	return composition;
}

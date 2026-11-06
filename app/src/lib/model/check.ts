import { MAX_IMAGE_SIDE } from './image';
import { linenHeadlineSpans, linenLines, linenPlainText } from './linen';
import type { AspectFamily, Issue, PixelRect, SourceDimensions } from './contracts';
import type { Composition, FrameStyle } from './types';

/**
 * The Check: Billington's original campaign direction. The dinner check, not a bank: deep teal
 * cloth, cream paper, gold, serif headlines and a hand-drawn pen mark on the number that matters.
 *
 * Settings are per slide and additive. Everything else a frame needs already has a home:
 * `typography` for copy (`*italic*` markup), `layers` for lifted real-UI crops and art, `scale`
 * and `fontScale` for panel and type size, `frame` and `effects.shadow` for the panel treatment.
 * This module is pure and imports no renderer, so `project.ts` can depend on its parser.
 */

export const CHECK_STYLE_ID = 'the-check' as const;

export const CHECK_CANVASES = ['teal', 'cream', 'gold'] as const;
export type CheckCanvas = (typeof CHECK_CANVASES)[number];

/**
 * - `hero`: copy on top, capture below at about 82-84% of the frame width, cropped by the bottom.
 * - `detail`: copy on top, UI at nearly full width. With `panel: false`, layers carry all the UI.
 * - `editorial`: the capture leads and is cut off above the copy, which sits at the bottom.
 * - `closer`: centered copy with art layers, for the one frame that does not need to show the app.
 */
export const CHECK_PRESETS = ['hero', 'detail', 'editorial', 'closer'] as const;
export type CheckPreset = (typeof CHECK_PRESETS)[number];

export const CHECK_MARK_KINDS = ['ring', 'underline'] as const;
export type CheckMarkKind = (typeof CHECK_MARK_KINDS)[number];

/** What a pen mark points at when it is not a layer: the slide's own capture. */
export const CHECK_PANEL_ANCHOR = 'panel';

/** The one hand-drawn gold mark on a frame. It circles or underlines real pixels, never covers. */
export interface CheckMark {
	kind: CheckMarkKind;
	/** `panel`, or the `id` of an image layer on the same slide. */
	anchor: string;
	/** The region to mark, in whole source pixels of the anchor's image. */
	rect: PixelRect;
	/** Integer. The same seed draws the same stroke in every preview and export. */
	seed: number;
}

export interface CheckSettings {
	canvas: CheckCanvas;
	preset: CheckPreset;
	/** Draw the slide's capture as the main panel. Off when layers carry all of the UI. */
	panel: boolean;
	/** Print the campaign name above the copy. Off when an art layer carries the brand. */
	wordmark: boolean;
	mark?: CheckMark;
	/** The `id` of an image layer whose bottom edge tears like the end of a paper receipt. */
	tear?: string;
}

/** Per-target overrides: whole keys replace the slide's. `mark: null` removes it for that target. */
export type CheckSettingsPatch = Partial<Omit<CheckSettings, 'mark' | 'tear'>> & {
	mark?: CheckMark | null;
	tear?: string | null;
};

const SETTINGS_KEYS = ['canvas', 'preset', 'panel', 'wordmark', 'mark', 'tear'];
const MAX_LAYER_ID = 128;
const MARK_KEYS = ['kind', 'anchor', 'rect', 'seed'];
const RECT_KEYS = ['x', 'y', 'width', 'height'];
const MAX_SEED = 2147483647;

function fail(message: string): never {
	throw new Error(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		fail(`${what} must be an object.`);
	return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, known: readonly string[], what: string) {
	for (const key of Object.keys(value))
		if (!known.includes(key)) fail(`${what} has an unsupported key "${key}".`);
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], what: string): T {
	if (!choices.includes(value as T)) fail(`${what} must be one of ${choices.join(', ')}.`);
	return value as T;
}

function flag(value: unknown, what: string): boolean {
	if (typeof value !== 'boolean') fail(`${what} must be true or false.`);
	return value;
}

function wholeNumber(value: unknown, min: number, max: number, what: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
		fail(`${what} must be a whole number from ${min} to ${max}.`);
	return value;
}

function parseRect(value: unknown, what: string): PixelRect {
	const rect = record(value, what);
	rejectUnknownKeys(rect, RECT_KEYS, what);
	return {
		x: wholeNumber(rect.x, 0, MAX_IMAGE_SIDE - 1, `${what} x`),
		y: wholeNumber(rect.y, 0, MAX_IMAGE_SIDE - 1, `${what} y`),
		width: wholeNumber(rect.width, 1, MAX_IMAGE_SIDE, `${what} width`),
		height: wholeNumber(rect.height, 1, MAX_IMAGE_SIDE, `${what} height`)
	};
}

export function parseCheckMark(value: unknown): CheckMark {
	const mark = record(value, 'The pen mark');
	rejectUnknownKeys(mark, MARK_KEYS, 'The pen mark');
	if (typeof mark.anchor !== 'string' || !mark.anchor.trim() || mark.anchor.length > 200)
		fail('The pen mark needs an anchor: "panel" or an image layer id.');
	return {
		kind: oneOf(mark.kind, CHECK_MARK_KINDS, 'The pen mark kind'),
		anchor: mark.anchor,
		rect: parseRect(mark.rect, 'The pen mark region'),
		seed: wholeNumber(mark.seed, 0, MAX_SEED, 'The pen mark seed')
	};
}

/** Validate untrusted settings and return only the supported fields. */
function parseTear(value: unknown): string {
	if (typeof value !== 'string' || !value || value.length > MAX_LAYER_ID)
		fail('The torn edge must name an image layer.');
	return value;
}

export function parseCheckSettings(value: unknown): CheckSettings {
	const settings = record(value, 'The Check settings');
	rejectUnknownKeys(settings, SETTINGS_KEYS, 'The Check settings');
	return {
		canvas: oneOf(settings.canvas, CHECK_CANVASES, 'The Check canvas'),
		preset: oneOf(settings.preset, CHECK_PRESETS, 'The Check layout'),
		panel: flag(settings.panel, 'The Check panel'),
		wordmark: flag(settings.wordmark, 'The Check wordmark'),
		...(settings.mark !== undefined ? { mark: parseCheckMark(settings.mark) } : {}),
		...(settings.tear !== undefined ? { tear: parseTear(settings.tear) } : {})
	};
}

/** The same rules for a target's overrides; only the keys present are returned. */
export function parseCheckSettingsPatch(value: unknown): CheckSettingsPatch {
	const patch = record(value, 'The Check target settings');
	rejectUnknownKeys(patch, SETTINGS_KEYS, 'The Check target settings');
	return {
		...(patch.canvas !== undefined
			? { canvas: oneOf(patch.canvas, CHECK_CANVASES, 'The Check canvas') }
			: {}),
		...(patch.preset !== undefined
			? { preset: oneOf(patch.preset, CHECK_PRESETS, 'The Check layout') }
			: {}),
		...(patch.panel !== undefined ? { panel: flag(patch.panel, 'The Check panel') } : {}),
		...(patch.wordmark !== undefined
			? { wordmark: flag(patch.wordmark, 'The Check wordmark') }
			: {}),
		...(patch.mark === null
			? { mark: null }
			: patch.mark !== undefined
				? { mark: parseCheckMark(patch.mark) }
				: {}),
		...(patch.tear === null
			? { tear: null }
			: patch.tear !== undefined
				? { tear: parseTear(patch.tear) }
				: {})
	};
}

/**
 * What `projectForTarget` calls: a slide's settings with one target's overrides. No settings and
 * no overrides stays `undefined`, so a project that never used The Check does not gain the field.
 * Pure and non-mutating.
 */
export function applyCheckPatch(
	base: CheckSettings | undefined,
	patch: CheckSettingsPatch | undefined,
	fallback: () => CheckSettings = () => defaultCheckSettings(0, 1)
): CheckSettings | undefined {
	if (!patch) return base;
	const { mark, tear, ...rest } = patch;
	const { mark: baseMark, tear: baseTear, ...settings } = { ...(base ?? fallback()), ...rest };
	const nextMark = mark === null ? undefined : (mark ?? baseMark);
	const nextTear = tear === null ? undefined : (tear ?? baseTear);
	return {
		...settings,
		...(nextMark ? { mark: nextMark } : {}),
		...(nextTear ? { tear: nextTear } : {})
	};
}

/* ------------------------------------------------------------------ defaults */

/** First three read teal, cream, gold in a search row; no two adjacent frames repeat a canvas. */
const CANVAS_ORDER: readonly CheckCanvas[] = ['teal', 'cream', 'gold', 'cream', 'teal', 'gold'];
const PRESET_ORDER: readonly CheckPreset[] = [
	'hero',
	'detail',
	'hero',
	'editorial',
	'detail',
	'hero'
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of the signature targets.ts calls
export function defaultCheckSettings(index: number, _count: number): CheckSettings {
	const position = Math.max(0, Math.trunc(index));
	return {
		canvas: CANVAS_ORDER[position % CANVAS_ORDER.length],
		preset: PRESET_ORDER[position % PRESET_ORDER.length],
		panel: true,
		wordmark: true
	};
}

/** Complete settings for a slide, falling back to the campaign rhythm when none were saved. */
export function resolveCheckSettings(composition: Composition, index: number): CheckSettings {
	return composition.slides[index]?.check ?? defaultCheckSettings(index, composition.slides.length);
}

/* ------------------------------------------------------------------ palette */

export interface CheckPalette {
	canvas: string;
	/** Headline ink. */
	headline: string;
	/** The italic line. At least 3:1 on the canvas. */
	accent: string;
	support: string;
	wordmark: string;
	dot: string;
	/** Neutral panel edge: no metal, no buttons, no island. */
	edge: string;
	/** Pen ink. Marks sit on real UI, which is nearly white in light mode. */
	pen: string;
	/** Fill behind and under the panel where its corners are masked. */
	shadow: string;
	shadowOpacity: number;
}

/**
 * The one pen ink. Marks sit on real UI, so it is chosen against that surface: at least 3:1 on white
 * and on the palest tinted rows, which the earlier #C98A12 missed at 2.95:1.
 */
export const CHECK_PEN = '#B57A0C';

export const CHECK_PALETTES: Record<CheckCanvas, CheckPalette> = {
	teal: {
		canvas: '#1E5B57',
		headline: '#FBF6EF',
		accent: '#F2CE6B',
		support: '#E4F0EC',
		wordmark: '#FBF6EF',
		dot: '#F2CE6B',
		edge: '#0E2C2A',
		pen: CHECK_PEN,
		shadow: '#061A18',
		shadowOpacity: 0.42
	},
	cream: {
		canvas: '#FBF6EF',
		headline: '#16302D',
		accent: '#1E5B57',
		support: '#2F4542',
		wordmark: '#16302D',
		dot: CHECK_PEN,
		edge: '#16302D',
		pen: CHECK_PEN,
		shadow: '#1E3F3B',
		shadowOpacity: 0.2
	},
	gold: {
		canvas: '#E4B644',
		headline: '#16302D',
		accent: '#16302D',
		support: '#16302D',
		wordmark: '#16302D',
		dot: '#1E5B57',
		edge: '#16302D',
		pen: CHECK_PEN,
		shadow: '#6E4C06',
		shadowOpacity: 0.24
	}
};

function linearChannel(value: number): number {
	const channel = value / 255;
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
	const part = (offset: number) => parseInt(color.slice(offset, offset + 2), 16);
	return (
		0.2126 * linearChannel(part(1)) +
		0.7152 * linearChannel(part(3)) +
		0.0722 * linearChannel(part(5))
	);
}

/** WCAG contrast ratio of two #RRGGBB colors. */
export function contrastRatio(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------------ aspect families */

/** Nearest family by aspect. A catalog target's own `layoutFamily` takes precedence. */
export function checkFamily(width: number, height: number): AspectFamily {
	const aspect = width / height;
	if (aspect >= 1 / 0.6) return 'phone-landscape';
	if (aspect > 1) return 'wide-landscape';
	if (aspect >= 0.725) return 'tablet-portrait';
	if (aspect >= 0.6) return 'duo-portrait';
	return 'phone-tall';
}

interface FamilyPanel {
	/** Fraction of the frame width. */
	width: number;
	/** Fraction of the panel width. */
	radius: number;
}

interface FamilyLayout {
	flow: 'stack' | 'side';
	/** Every length below is in pixels of a frame this wide, scaled uniformly to the real width. */
	refWidth: number;
	margin: number;
	wordmarkTop: number;
	wordmarkSize: number;
	wordmarkGap: number;
	headlineMax: number;
	headlineMin: number;
	supportGap: number;
	supportSize: number;
	supportMin: number;
	supportMaxLines: number;
	panelGap: number;
	edge: number;
	/** Copy may use at most this fraction of the frame height (stack) or the column (side). */
	copyLimit: number;
	/** Side flow only: copy column width and the panel's top. */
	column: number;
	panelTop: number;
	bottomMargin: number;
	panels: Record<CheckPreset, FamilyPanel>;
}

const PANELS = (
	hero: number,
	detail: number,
	editorial: number,
	closer: number,
	radius: number
): Record<CheckPreset, FamilyPanel> => ({
	hero: { width: hero, radius },
	detail: { width: detail, radius },
	editorial: { width: editorial, radius },
	closer: { width: closer, radius }
});

/**
 * Authored per family, never derived by stretching one frame. Lengths scale by one factor, so a
 * glyph, a corner and a gap keep their proportions; a taller frame simply shows more of the crop.
 */
const FAMILY_LAYOUTS: Record<AspectFamily, FamilyLayout> = {
	'phone-tall': {
		flow: 'stack',
		refWidth: 1320,
		margin: 84,
		wordmarkTop: 112,
		wordmarkSize: 46,
		wordmarkGap: 38,
		headlineMax: 252,
		headlineMin: 124,
		supportGap: 32,
		supportSize: 54,
		supportMin: 46,
		supportMaxLines: 3,
		panelGap: 66,
		edge: 14,
		copyLimit: 0.6,
		column: 0,
		panelTop: 104,
		bottomMargin: 120,
		panels: PANELS(0.84, 0.92, 0.84, 0.72, 0.085)
	},
	'duo-portrait': {
		flow: 'stack',
		refWidth: 1398,
		margin: 84,
		wordmarkTop: 76,
		wordmarkSize: 44,
		wordmarkGap: 28,
		headlineMax: 216,
		headlineMin: 112,
		supportGap: 24,
		supportSize: 50,
		supportMin: 42,
		supportMaxLines: 2,
		panelGap: 48,
		edge: 12,
		copyLimit: 0.5,
		column: 0,
		panelTop: 72,
		bottomMargin: 76,
		panels: PANELS(0.86, 0.94, 0.84, 0.66, 0.06)
	},
	'tablet-portrait': {
		flow: 'stack',
		refWidth: 2064,
		margin: 132,
		wordmarkTop: 112,
		wordmarkSize: 62,
		wordmarkGap: 44,
		headlineMax: 372,
		headlineMin: 170,
		supportGap: 36,
		supportSize: 76,
		supportMin: 60,
		supportMaxLines: 2,
		panelGap: 72,
		edge: 16,
		copyLimit: 0.5,
		column: 0,
		panelTop: 104,
		bottomMargin: 104,
		panels: PANELS(0.9, 0.94, 0.86, 0.62, 0.04)
	},
	'wide-landscape': {
		flow: 'side',
		refWidth: 2752,
		margin: 150,
		wordmarkTop: 150,
		wordmarkSize: 62,
		wordmarkGap: 56,
		headlineMax: 270,
		headlineMin: 140,
		supportGap: 44,
		supportSize: 70,
		supportMin: 56,
		supportMaxLines: 4,
		panelGap: 110,
		edge: 16,
		copyLimit: 0.86,
		column: 0.36,
		panelTop: 150,
		bottomMargin: 150,
		panels: PANELS(0.54, 0.6, 0.54, 0.48, 0.028)
	},
	'phone-landscape': {
		flow: 'side',
		refWidth: 2868,
		margin: 110,
		wordmarkTop: 88,
		wordmarkSize: 46,
		wordmarkGap: 30,
		headlineMax: 176,
		headlineMin: 96,
		supportGap: 28,
		supportSize: 50,
		supportMin: 42,
		supportMaxLines: 3,
		panelGap: 80,
		edge: 12,
		copyLimit: 0.88,
		column: 0.31,
		panelTop: 88,
		bottomMargin: 88,
		panels: PANELS(0.6, 0.64, 0.6, 0.5, 0.03)
	}
};

/** Display type sits this tight; stacked lines still keep this much clear space between their ink. */
const HEADLINE_LEADING = 0.96;
/** Pixels of a 1320 wide frame, scaled with the frame. */
const HEADLINE_INK_GAP = 14;
const HEADLINE_TRACKING = 0;
const SUPPORT_LEADING = 1.24;
const SUPPORT_TRACKING = 0;

/* ------------------------------------------------------------------ text layout */

export interface CheckBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface CheckFont {
	role: 'display' | 'text';
	italic: boolean;
	weight: number;
	size: number;
	/** Letter spacing in pixels. */
	tracking: number;
}

/** A measured run: ink extents from the pen origin, as canvas `TextMetrics` reports them. */
export interface GlyphBox {
	advance: number;
	/** Ink left of the origin; negative when the first glyph starts to its right. */
	left: number;
	right: number;
	ascent: number;
	descent: number;
}

/** Real glyph metrics in the browser, a stand-in under test. */
export type CheckMeasure = (text: string, font: CheckFont) => GlyphBox;

export interface CheckRun {
	text: string;
	italic: boolean;
	/** Pen origin. */
	x: number;
}

export interface CheckLine {
	runs: CheckRun[];
	baseline: number;
	/** Measured ink. */
	bounds: CheckBounds;
}

export interface CheckCopyBlock {
	font: CheckFont;
	lines: CheckLine[];
}

export interface CheckWordmark {
	text: string;
	font: CheckFont;
	x: number;
	baseline: number;
	dot: { x: number; y: number; radius: number };
	bounds: CheckBounds;
}

export interface CheckPanelBox {
	/** The whole capture at one uniform scale. Top-left before rotation. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** Output pixels per source pixel. */
	scale: number;
	radius: number;
	/** Neutral edge width; 0 for a frameless panel. */
	edge: number;
	/** Radians about the capture's center. */
	rotation: number;
	/** Where the frame cuts the capture with a torn edge; the crop below it is not drawn. */
	cut?: number;
	/** Torn-edge scale: the frame's layout unit. */
	tearUnit: number;
	/** What the panel covers in output pixels, including its edge. */
	bounds: CheckBounds;
}

export interface CheckScene {
	family: AspectFamily;
	unit: number;
	palette: CheckPalette;
	wordmark?: CheckWordmark;
	headline: CheckCopyBlock;
	support: CheckCopyBlock;
	/** Every measured ink box of the copy, for collision checks. */
	copyBoxes: CheckBounds[];
	copyBounds: CheckBounds | null;
	panel?: CheckPanelBox;
}

interface WordToken {
	text: string;
	italic: boolean;
}

function unionBounds(boxes: readonly CheckBounds[]): CheckBounds | null {
	if (!boxes.length) return null;
	return {
		left: Math.min(...boxes.map((box) => box.left)),
		top: Math.min(...boxes.map((box) => box.top)),
		right: Math.max(...boxes.map((box) => box.right)),
		bottom: Math.max(...boxes.map((box) => box.bottom))
	};
}

/** Merge adjacent same-style words so kerning inside a phrase comes from the font. */
function runsOf(tokens: readonly WordToken[]): WordToken[] {
	const runs: WordToken[] = [];
	for (const token of tokens) {
		const last = runs[runs.length - 1];
		if (last && last.italic === token.italic) last.text += token.text;
		else runs.push({ ...token });
	}
	return runs;
}

interface SetLine {
	runs: { text: string; italic: boolean; offset: number }[];
	inkLeft: number;
	inkRight: number;
	ascent: number;
	descent: number;
}

function setLine(tokens: readonly WordToken[], font: CheckFont, measure: CheckMeasure): SetLine {
	const runs: SetLine['runs'] = [];
	let pen = 0;
	let inkLeft = Infinity;
	let inkRight = -Infinity;
	let ascent = 0;
	let descent = 0;
	for (const run of runsOf(tokens)) {
		const box = measure(run.text, { ...font, italic: run.italic });
		if (run.text.trim()) {
			inkLeft = Math.min(inkLeft, pen - box.left);
			inkRight = Math.max(inkRight, pen + box.right);
			ascent = Math.max(ascent, box.ascent);
			descent = Math.max(descent, box.descent);
		}
		runs.push({ text: run.text, italic: run.italic, offset: pen });
		pen += box.advance;
	}
	if (!Number.isFinite(inkLeft)) {
		inkLeft = 0;
		inkRight = 0;
	}
	return { runs, inkLeft, inkRight, ascent, descent };
}

/** One authored line as words and the spaces between them, trimmed at both ends. */
function tokensOf(line: string, where: string): WordToken[] {
	const tokens: WordToken[] = [];
	for (const span of linenHeadlineSpans(line, where)) {
		for (const part of span.text.split(/(\s+)/)) {
			if (part) tokens.push({ text: /^\s+$/.test(part) ? ' ' : part, italic: span.italic });
		}
	}
	while (tokens.length && !tokens[0].text.trim()) tokens.shift();
	while (tokens.length && !tokens[tokens.length - 1].text.trim()) tokens.pop();
	return tokens;
}

/** The same for text with no italic markup. A stray `*` is just a character here. */
function plainTokens(line: string): WordToken[] {
	const tokens: WordToken[] = [];
	for (const part of line.trim().split(/(\s+)/)) {
		if (part) tokens.push({ text: /^\s+$/.test(part) ? ' ' : part, italic: false });
	}
	return tokens;
}

/** Greedy wrap on spaces only. Returns null when a single word is wider than the column. */
function wrapTokens(
	tokens: readonly WordToken[],
	font: CheckFont,
	maxWidth: number,
	measure: CheckMeasure
): WordToken[][] | null {
	const lines: WordToken[][] = [];
	let current: WordToken[] = [];
	let pendingSpace: WordToken | null = null;
	const inkWidth = (line: readonly WordToken[]) => {
		const set = setLine(line, font, measure);
		return set.inkRight - set.inkLeft;
	};
	for (const token of tokens) {
		if (!token.text.trim()) {
			pendingSpace = token;
			continue;
		}
		const candidate = current.length
			? [...current, ...(pendingSpace ? [pendingSpace] : []), token]
			: [token];
		if (inkWidth(candidate) <= maxWidth) current = candidate;
		else {
			if (inkWidth([token]) > maxWidth) return null;
			lines.push(current);
			current = [token];
		}
		pendingSpace = null;
	}
	if (current.length) lines.push(current);
	return lines;
}

interface FittedBlock {
	font: CheckFont;
	lines: SetLine[];
	leading: number;
	capHeight: number;
	/** Least clear space between the ink of stacked lines. */
	inkGap: number;
}

function displayFont(size: number): CheckFont {
	return {
		role: 'display',
		italic: false,
		weight: 400,
		size,
		tracking: size * HEADLINE_TRACKING
	};
}

function textFont(size: number, weight = 500): CheckFont {
	return { role: 'text', italic: false, weight, size, tracking: size * SUPPORT_TRACKING };
}

function headlineAt(
	source: readonly WordToken[][],
	size: number,
	maxWidth: number,
	wrap: boolean,
	inkGap: number,
	measure: CheckMeasure
): FittedBlock | null {
	const font = displayFont(size);
	const lines: SetLine[] = [];
	for (const tokens of source) {
		if (!tokens.length) {
			lines.push(setLine([], font, measure));
			continue;
		}
		const whole = setLine(tokens, font, measure);
		if (whole.inkRight - whole.inkLeft <= maxWidth) {
			lines.push(whole);
			continue;
		}
		if (!wrap) return null;
		const wrapped = wrapTokens(tokens, font, maxWidth, measure);
		if (!wrapped) return null;
		lines.push(...wrapped.map((line) => setLine(line, font, measure)));
	}
	return {
		font,
		lines,
		leading: size * HEADLINE_LEADING,
		capHeight: measure('H', font).ascent,
		inkGap
	};
}

/** Top of the first line's caps to the lowest ink, including tight-leading corrections. */
function headlineHeight(block: FittedBlock): number {
	if (!block.lines.length) return 0;
	let baseline = block.capHeight;
	let bottom = baseline + block.lines[0].descent;
	block.lines.forEach((line, index) => {
		if (index > 0) {
			baseline = Math.max(baseline + block.leading, bottom + block.inkGap + line.ascent);
		}
		bottom = Math.max(baseline + line.descent, bottom);
	});
	return Math.max(bottom, baseline + block.font.size * 0.14);
}

function fitSupport(
	text: string,
	family: FamilyLayout,
	unit: number,
	maxWidth: number,
	measure: CheckMeasure,
	emphasis: number
): FittedBlock {
	const sourceLines = linenLines(linenPlainText(text))
		.map((line) => plainTokens(line))
		.filter((tokens) => tokens.length);
	const smallest = family.supportMin * unit;
	for (let size = family.supportSize * unit * emphasis; ; size = Math.max(smallest, size * 0.96)) {
		const font = textFont(size);
		const lines: SetLine[] = [];
		let fits = true;
		for (const tokens of sourceLines) {
			const wrapped = wrapTokens(tokens, font, maxWidth, measure);
			if (!wrapped) {
				fits = false;
				break;
			}
			lines.push(...wrapped.map((line) => setLine(line, font, measure)));
		}
		if (fits && lines.length <= family.supportMaxLines)
			return {
				font,
				lines,
				leading: size * SUPPORT_LEADING,
				capHeight: measure('H', font).ascent,
				inkGap: 0
			};
		if (size <= smallest)
			fail(
				`The supporting text needs more than ${family.supportMaxLines} lines at the smallest readable size. Shorten it to about ten words.`
			);
	}
}

function supportHeight(block: FittedBlock): number {
	if (!block.lines.length) return 0;
	const last = block.lines[block.lines.length - 1];
	return block.capHeight + (block.lines.length - 1) * block.leading + last.descent;
}

export interface CheckLayoutInput {
	width: number;
	height: number;
	/** The target's own family when the catalog declares one. */
	family?: AspectFamily;
	settings: CheckSettings;
	headline: string;
	support?: string;
	/** Printed by the wordmark. */
	name: string;
	/** `Slide.fontScale`. */
	fontScale?: number;
	/** `Slide.scale`. */
	panelScale?: number;
	/** `Slide.tilt`, in degrees. */
	tilt?: number;
	frame: FrameStyle;
	/** The capture this frame shows, or nothing for a placeholder. */
	source?: SourceDimensions;
	/** A connected pair's one shared panel, already placed in this frame's coordinates. */
	sharedPanel?: CheckPanelBox;
	/** Bottom of brand artwork at the top of the frame, which the copy must start below. */
	artBottom?: number;
	measure: CheckMeasure;
}

const SCALE_BOUNDS = [0.45, 1.8] as const;
const finiteOr = (value: number | undefined, fallback: number) =>
	value !== undefined && Number.isFinite(value) ? value : fallback;
const within = (value: number, [low, high]: readonly [number, number]) =>
	Math.max(low, Math.min(high, value));

function rotatedBounds(
	x: number,
	y: number,
	width: number,
	height: number,
	rotation: number,
	outset: number
): CheckBounds {
	const cx = x + width / 2;
	const cy = y + height / 2;
	const halfWidth = width / 2 + outset;
	const halfHeight = height / 2 + outset;
	const cos = Math.abs(Math.cos(rotation));
	const sin = Math.abs(Math.sin(rotation));
	const extentX = halfWidth * cos + halfHeight * sin;
	const extentY = halfWidth * sin + halfHeight * cos;
	return { left: cx - extentX, right: cx + extentX, top: cy - extentY, bottom: cy + extentY };
}

function placePanel(
	x: number,
	y: number,
	width: number,
	source: SourceDimensions,
	family: FamilyLayout,
	preset: CheckPreset,
	unit: number,
	frame: FrameStyle,
	rotation: number
): CheckPanelBox {
	const height = width * (source.naturalHeight / source.naturalWidth);
	const edge = frame === 'none' ? 0 : family.edge * unit;
	return {
		x,
		y,
		width,
		height,
		scale: width / source.naturalWidth,
		radius: width * family.panels[preset].radius,
		edge,
		rotation,
		tearUnit: unit,
		bounds: rotatedBounds(x, y, width, height, rotation, edge)
	};
}

/** Move a placed panel down so its rotated top clears `clearTop`. */
function dropTo(panel: CheckPanelBox, clearTop: number): CheckPanelBox {
	const delta = clearTop - panel.bounds.top;
	if (delta <= 0) return panel;
	return {
		...panel,
		y: panel.y + delta,
		bounds: {
			...panel.bounds,
			top: panel.bounds.top + delta,
			bottom: panel.bounds.bottom + delta
		}
	};
}

const SYNTHETIC_PORTRAIT: SourceDimensions = { naturalWidth: 1320, naturalHeight: 2868 };

function nameFits(
	name: string,
	family: FamilyLayout,
	unit: number,
	maxWidth: number,
	measure: CheckMeasure
) {
	const smallest = family.wordmarkSize * unit * 0.6;
	for (let size = family.wordmarkSize * unit; size >= smallest; size *= 0.94) {
		const font: CheckFont = {
			role: 'text',
			italic: false,
			weight: 600,
			size,
			tracking: 0
		};
		const box = measure(name, font);
		if (box.right + size * 0.62 <= maxWidth) return { font, box };
	}
	fail(
		`The campaign name "${name}" is too long for the wordmark. Shorten it or turn the wordmark off.`
	);
}

/**
 * Lay out one frame. Pure and deterministic for a given `measure`. Every text box comes from real
 * glyph ink, so italic overhang cannot clip. Copy that cannot fit throws a message that names the
 * fix; the panel is placed clear of the copy, so marketing text never lands on app UI.
 */
export function checkLayout(input: CheckLayoutInput): CheckScene {
	const { width, height, settings, measure } = input;
	const familyId = input.family ?? checkFamily(width, height);
	const family = FAMILY_LAYOUTS[familyId];
	const unit = width / family.refWidth;
	const palette = CHECK_PALETTES[settings.canvas];
	const preset = settings.preset;
	const side = family.flow === 'side' && preset !== 'closer';
	const editorial = preset === 'editorial';
	const centered = preset === 'closer';
	const signsOff = centered && !input.sharedPanel;
	const margin = family.margin * unit;
	const source = input.source ?? SYNTHETIC_PORTRAIT;
	const scale = within(finiteOr(input.panelScale, 1), SCALE_BOUNDS);
	const rotation = (within(finiteOr(input.tilt, 0), [-30, 30]) * Math.PI) / 180;
	const showPanel = settings.panel && !input.sharedPanel;

	// Column.
	const columnWidth = side ? family.column * width : width - margin * 2;
	const panelWidth = width * family.panels[preset].width * scale;
	const copyLeft = side && editorial ? width - margin - columnWidth : margin;
	const copyRight = copyLeft + columnWidth;

	// Vertical budget for the copy.
	const topInset = family.wordmarkTop * unit;
	const bottomInset = family.bottomMargin * unit;
	const sharedTop = input.sharedPanel?.bounds.top;
	const stackedLimit = height * family.copyLimit;
	const anchorBottom = editorial && !side && !input.sharedPanel;
	const zoneBottom = side
		? height - bottomInset
		: anchorBottom
			? height - bottomInset
			: sharedTop !== undefined
				? sharedTop - family.panelGap * unit
				: stackedLimit;
	const zoneTop = anchorBottom ? height - height * family.copyLimit - bottomInset : topInset;
	const zoneHeight = zoneBottom - zoneTop;

	// Wordmark.
	let wordmarkHeight = 0;
	let wordmarkFit: ReturnType<typeof nameFits> | undefined;
	if (settings.wordmark && input.name.trim()) {
		wordmarkFit = nameFits(input.name, family, unit, columnWidth, measure);
		wordmarkHeight = family.wordmarkSize * unit * 1.06;
	}
	const artReserve =
		input.artBottom !== undefined && !anchorBottom
			? Math.max(0, input.artBottom - topInset) + family.wordmarkGap * unit
			: 0;
	const reservedTop = wordmarkHeight ? wordmarkHeight + family.wordmarkGap * unit : artReserve;

	// Support first: its size is fixed, so only the headline flexes.
	const support = fitSupport(
		input.support ?? '',
		family,
		unit,
		columnWidth,
		measure,
		centered ? 1.3 : 1
	);
	const supportBlock = support.lines.length ? supportHeight(support) + family.supportGap * unit : 0;

	// Largest headline that fits: keep authored lines if at all possible, then allow wrapping.
	const authored = linenLines(input.headline).map((line, index) =>
		tokensOf(line, `Headline line ${index + 1}`)
	);
	const fontScale = within(finiteOr(input.fontScale, 1), [0.6, 1.6]);
	const largest = family.headlineMax * unit * fontScale;
	const smallest = family.headlineMin * unit;
	const available = zoneHeight - reservedTop - (signsOff ? 0 : supportBlock);
	const inkGap = (HEADLINE_INK_GAP * width) / 1320;
	let headline: FittedBlock | null = null;
	const attempts: readonly (readonly [boolean, number])[] = [
		[false, Math.max(smallest, largest * 0.62)],
		[true, smallest]
	];
	for (const [wrap, floor] of attempts) {
		for (let size = largest; size >= floor && !headline; size *= 0.985) {
			const block = headlineAt(authored, size, columnWidth, wrap, inkGap, measure);
			if (block && headlineHeight(block) <= available) headline = block;
		}
		if (headline) break;
	}
	if (!headline)
		fail(
			`This headline does not fit the ${Math.round(width)} × ${Math.round(height)} frame at a readable size. Shorten it, or use fewer lines.`
		);

	const headlineBlockHeight = headlineHeight(headline);
	const blockHeight = reservedTop + headlineBlockHeight + (signsOff ? 0 : supportBlock);
	const blockTop = anchorBottom ? zoneBottom - blockHeight : topInset;

	const place = (inkLeft: number, inkRight: number) =>
		centered ? (copyLeft + copyRight) / 2 - (inkLeft + inkRight) / 2 : copyLeft - inkLeft;

	// Lay the headline.
	const copyBoxes: CheckBounds[] = [];
	const headlineLines: CheckLine[] = [];
	let baseline = blockTop + reservedTop + headline.capHeight;
	let inkBottom = baseline;
	headline.lines.forEach((line, index) => {
		if (index > 0)
			baseline = Math.max(baseline + headline!.leading, inkBottom + inkGap + line.ascent);
		const origin = place(line.inkLeft, line.inkRight);
		const bounds: CheckBounds = {
			left: origin + line.inkLeft,
			right: origin + line.inkRight,
			top: baseline - line.ascent,
			bottom: baseline + line.descent
		};
		if (line.runs.length) {
			headlineLines.push({
				runs: line.runs.map((run) => ({
					text: run.text,
					italic: run.italic,
					x: origin + run.offset
				})),
				baseline,
				bounds
			});
			copyBoxes.push(bounds);
		}
		inkBottom = Math.max(inkBottom, baseline + line.descent);
	});
	const headlineBottom = blockTop + reservedTop + headlineBlockHeight;

	// Support under it. On a closer it signs off at the foot of the frame, below the artwork.
	const supportLines: CheckLine[] = [];
	const closerFoot =
		height - bottomInset - (support.lines.length ? supportHeight(support) : 0) + support.capHeight;
	let supportBaseline = signsOff
		? closerFoot
		: headlineBottom + family.supportGap * unit + support.capHeight;
	support.lines.forEach((line) => {
		const origin = place(line.inkLeft, line.inkRight);
		const bounds: CheckBounds = {
			left: origin + line.inkLeft,
			right: origin + line.inkRight,
			top: supportBaseline - line.ascent,
			bottom: supportBaseline + line.descent
		};
		supportLines.push({
			runs: line.runs.map((run) => ({
				text: run.text,
				italic: false,
				x: origin + run.offset
			})),
			baseline: supportBaseline,
			bounds
		});
		copyBoxes.push(bounds);
		supportBaseline += support.leading;
	});

	// Wordmark over it.
	let wordmark: CheckWordmark | undefined;
	if (wordmarkFit) {
		const { font, box } = wordmarkFit;
		const dotRadius = font.size * 0.2;
		const inset = font.size * 0.62;
		const fullWidth = inset + box.right;
		const x = centered ? (copyLeft + copyRight - fullWidth) / 2 : copyLeft;
		const textBaseline = blockTop + font.size * 0.86;
		const bounds: CheckBounds = {
			left: x,
			right: x + fullWidth,
			top: textBaseline - box.ascent,
			bottom: textBaseline + box.descent
		};
		wordmark = {
			text: input.name,
			font,
			x: x + inset,
			baseline: textBaseline,
			dot: { x: x + dotRadius, y: textBaseline - font.size * 0.33, radius: dotRadius },
			bounds
		};
		copyBoxes.push(bounds);
	}

	const copyBounds = unionBounds(copyBoxes);
	const gap = family.panelGap * unit;

	// Panel.
	let panel: CheckPanelBox | undefined = input.sharedPanel;
	if (showPanel) {
		if (side) {
			const clear = family.panelGap * unit;
			const x = editorial
				? copyLeft - clear - panelWidth
				: Math.max(copyRight + clear, width - margin - panelWidth);
			const fitted = panelWidth * (source.naturalHeight / source.naturalWidth);
			const top = family.panelTop * unit;
			const y = fitted < height - top * 2 ? (height - fitted) / 2 : top;
			panel = placePanel(x, y, panelWidth, source, family, preset, unit, input.frame, rotation);
		} else if (anchorBottom) {
			const top = family.panelTop * unit;
			const placed = placePanel(
				(width - panelWidth) / 2,
				top,
				panelWidth,
				source,
				family,
				preset,
				unit,
				input.frame,
				rotation
			);
			const cut = (copyBounds?.top ?? blockTop) - gap;
			if (cut <= top)
				fail(
					'The copy leaves no room for the screenshot. Shorten the headline or use the Hero layout.'
				);
			// A torn panel is a slip of paper, so it drops the device edge along with the bottom.
			panel =
				placed.height > cut - top
					? {
							...placed,
							cut,
							edge: 0,
							bounds: rotatedBounds(placed.x, placed.y, placed.width, cut - placed.y, 0, 0)
						}
					: placed;
		} else if (signsOff) {
			// A closer's panel sits between its headline and sign-off, and tears above the sign-off.
			const top = Math.max(headlineBottom, topInset) + gap;
			const placed = placePanel(
				(width - panelWidth) / 2,
				top,
				panelWidth,
				source,
				family,
				preset,
				unit,
				input.frame,
				0
			);
			const supportTop = supportLines[0]?.bounds.top ?? height;
			const cut = supportTop - gap;
			panel =
				placed.height > cut - top
					? {
							...placed,
							cut,
							edge: 0,
							bounds: rotatedBounds(placed.x, placed.y, placed.width, cut - placed.y, 0, 0)
						}
					: placed;
		} else {
			const clearTop = (copyBounds?.bottom ?? topInset) + gap;
			panel = dropTo(
				placePanel(
					(width - panelWidth) / 2,
					clearTop,
					panelWidth,
					source,
					family,
					preset,
					unit,
					input.frame,
					rotation
				),
				clearTop
			);
			if (height - panel.bounds.top < height * 0.14)
				fail(
					'The copy leaves almost no room for the screenshot. Shorten the headline or use fewer lines.'
				);
		}
	}

	return {
		family: familyId,
		unit,
		palette,
		wordmark,
		headline: { font: headline.font, lines: headlineLines },
		support: { font: support.font, lines: supportLines },
		copyBoxes,
		copyBounds,
		panel
	};
}

/**
 * A connected pair's one panel in world coordinates. Metric-free, because both exported frames
 * must agree on it before any text is measured; the copy of each frame then fits above it.
 */
export function checkPairPanel(
	width: number,
	height: number,
	source: SourceDimensions,
	placement: { offset: number; scale: number; tilt: number; frame: FrameStyle },
	family: AspectFamily = checkFamily(width, height)
): CheckPanelBox {
	const layout = FAMILY_LAYOUTS[family];
	const unit = width / layout.refWidth;
	const scale = within(finiteOr(placement.scale, 1), SCALE_BOUNDS);
	const panelWidth = width * layout.panels.hero.width * scale;
	const offset = within(finiteOr(placement.offset, 0), [-width * 0.65, width * 0.65]);
	const rotation = (within(finiteOr(placement.tilt, 0), [-45, 45]) * Math.PI) / 180;
	const top = height * (layout.flow === 'side' ? 0.1 : 0.34);
	return dropTo(
		placePanel(
			width + offset - panelWidth / 2,
			top,
			panelWidth,
			source,
			layout,
			'hero',
			unit,
			placement.frame,
			rotation
		),
		top
	);
}

/* ------------------------------------------------------------------ pen mark */

export interface CheckStrokePoint {
	x: number;
	y: number;
	/** Stroke width here. */
	width: number;
}

export interface CheckStroke {
	points: CheckStrokePoint[];
	bounds: CheckBounds;
}

/** mulberry32: small, seedable and stable across engines. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function strokeBounds(points: readonly CheckStrokePoint[]): CheckBounds {
	return {
		left: Math.min(...points.map((p) => p.x - p.width / 2)),
		right: Math.max(...points.map((p) => p.x + p.width / 2)),
		top: Math.min(...points.map((p) => p.y - p.width / 2)),
		bottom: Math.max(...points.map((p) => p.y + p.width / 2))
	};
}

/** How close a stroke's ink gets to the marked region. Negative means it covers some of it. */
export function checkStrokeClearance(stroke: CheckStroke, rect: PixelRect): number {
	let clearance = Infinity;
	for (const point of stroke.points) {
		const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
		const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
		const outside = Math.hypot(dx, dy);
		clearance = Math.min(clearance, (outside > 0 ? outside : -1) - point.width / 2);
	}
	return clearance;
}

/** Least pen width, as a share of its full width, where a stroke lands and lifts. */
const STROKE_TIP = 0.22;
/** A pen at full pressure, in pixels of a 1320 wide frame. It stays between 12 and 14 along the loop. */
const STROKE_WIDTH = 13.6;

function ringStroke(
	rect: PixelRect,
	seed: number,
	unit: number,
	inflate: number
): CheckStrokePoint[] {
	const random = seededRandom(seed);
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	const pad = Math.max(10 * unit, Math.min(rect.width, rect.height) * 0.1);
	// A superellipse hugs a wide target more closely than an ellipse. Its long axis stays tight and
	// its short axis gives the corners their room, so the loop reads as drawn around this number.
	const aspect = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
	const wide = Math.max(0, Math.min(1, (aspect - 1) / 1.5));
	const exponent = 2.3 + 0.7 * wide;
	const longReach = (1.35 - 0.26 * wide) * inflate;
	const shortReach = (1.35 + 0.29 * wide) * inflate;
	const landscape = rect.width >= rect.height;
	const rx = (rect.width / 2) * (landscape ? longReach : shortReach) + pad;
	const ry = (rect.height / 2) * (landscape ? shortReach : longReach) + pad;
	const start = -2.5 + random() * 0.9;
	const sweep = Math.PI * 2 + 0.3 + random() * 0.22;
	const lean = (random() - 0.5) * (6 / Math.max(rx, 1)) * unit;
	const phases = [random(), random(), random(), random()].map((value) => value * Math.PI * 2);
	// The loop opens outward as it closes, so its ends pass each other instead of meeting. It is
	// measured in frame pixels and shared around zero, which keeps the loop centered on its target.
	const passing = (15 + random() * 6) * unit;
	const count = 144;
	const cosLean = Math.cos(lean);
	const sinLean = Math.sin(lean);
	const points: CheckStrokePoint[] = [];
	for (let i = 0; i <= count; i++) {
		const t = i / count;
		const angle = start + sweep * t;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const px = Math.sign(cos) * Math.abs(cos) ** (2 / exponent) * rx;
		const py = Math.sign(sin) * Math.abs(sin) ** (2 / exponent) * ry;
		// A hand wanders by a few pixels whatever the size of the loop.
		const wander =
			unit *
			(2.2 * Math.sin(angle * 2 + phases[0]) +
				1.5 * Math.sin(angle * 3 + phases[1]) +
				0.9 * Math.sin(angle * 5 + phases[2]));
		const out = wander + passing * (t - 0.5);
		const length = Math.hypot(px, py) || 1;
		const x = px + (px / length) * out;
		const y = py + (py / length) * out;
		const taper = Math.min(1, t / 0.04, (1 - t) / 0.075);
		const pressure = 0.965 + 0.035 * Math.sin(angle * 1.5 + phases[3]);
		points.push({
			x: cx + x * cosLean - y * sinLean,
			y: cy + x * sinLean + y * cosLean,
			width:
				STROKE_WIDTH *
				unit *
				pressure *
				(STROKE_TIP + (1 - STROKE_TIP) * Math.sqrt(Math.max(0, taper)))
		});
	}
	return points;
}

function underlineStroke(
	rect: PixelRect,
	seed: number,
	unit: number,
	inflate: number
): CheckStrokePoint[] {
	const random = seededRandom(seed);
	const base = STROKE_WIDTH * unit;
	const drop = (14 * unit + base / 2) * inflate;
	const overhang = Math.max(10 * unit, rect.width * (0.03 + random() * 0.03));
	const left = rect.x - overhang;
	const right = rect.x + rect.width + overhang;
	const y = rect.y + rect.height + drop;
	const bow = 7 * unit * (0.6 + random() * 0.8);
	const rise = 5 * unit * (random() - 0.2);
	const phase = random() * Math.PI * 2;
	const count = 64;
	const points: CheckStrokePoint[] = [];
	for (let i = 0; i <= count; i++) {
		const t = i / count;
		const wander = 1.6 * unit * (1 + Math.sin(t * Math.PI * 3 + phase));
		const curve = Math.max(0, bow * Math.sin(Math.PI * t) + rise * t + wander);
		const taper = Math.min(1, t / 0.06, (1 - t) / 0.16);
		points.push({
			x: left + (right - left) * t,
			y: y + curve,
			width: base * (STROKE_TIP + (1 - STROKE_TIP) * Math.sqrt(Math.max(0, taper)))
		});
	}
	return points;
}

/**
 * The hand-drawn stroke around or under a region given in output pixels. It always clears the
 * region, so it can sit next to a number without covering a digit; the same seed gives the same
 * stroke at any preview size.
 */
export function checkMarkStroke(
	kind: CheckMarkKind,
	rect: PixelRect,
	seed: number,
	unit: number
): CheckStroke {
	const required = 3 * unit;
	for (let inflate = 1; ; inflate *= 1.04) {
		const points =
			kind === 'ring'
				? ringStroke(rect, seed, unit, inflate)
				: underlineStroke(rect, seed, unit, inflate);
		const stroke = { points, bounds: strokeBounds(points) };
		if (checkStrokeClearance(stroke, rect) >= required || inflate > 2) return stroke;
	}
}

/** One closed outline for the variable-width stroke, ready to fill. */
export function checkStrokeOutline(
	points: readonly CheckStrokePoint[]
): { x: number; y: number }[] {
	const left: { x: number; y: number }[] = [];
	const right: { x: number; y: number }[] = [];
	points.forEach((point, index) => {
		const previous = points[Math.max(0, index - 1)];
		const next = points[Math.min(points.length - 1, index + 1)];
		const dx = next.x - previous.x;
		const dy = next.y - previous.y;
		const length = Math.hypot(dx, dy) || 1;
		const nx = -dy / length;
		const ny = dx / length;
		left.push({ x: point.x + (nx * point.width) / 2, y: point.y + (ny * point.width) / 2 });
		right.push({ x: point.x - (nx * point.width) / 2, y: point.y - (ny * point.width) / 2 });
	});
	return [...left, ...right.reverse()];
}

/** A starting region for a new mark: a third of the anchor's width, centered. */
export function defaultCheckMark(anchor: string, area: PixelRect, seed: number): CheckMark {
	const width = Math.max(1, Math.round(area.width / 3));
	const height = Math.max(1, Math.round(Math.min(area.height / 3, width / 2)));
	return {
		kind: 'ring',
		anchor,
		rect: {
			x: area.x + Math.round((area.width - width) / 2),
			y: area.y + Math.round((area.height - height) / 2),
			width,
			height
		},
		seed
	};
}

/* ------------------------------------------------------------------ torn edge */

/**
 * The bottom of a cut panel, torn like the end of a paper receipt. The teeth are large enough to
 * survive store scale and uneven like real tearing, and they come out the same every time. `y` is
 * the deepest point, so no tooth reaches below the space reserved for the copy.
 */
export function checkTornEdge(
	left: number,
	right: number,
	y: number,
	unit: number
): { x: number; y: number }[] {
	const random = seededRandom(20261106);
	const span = right - left;
	const teeth = Math.max(1, Math.round(span / (64 * unit)));
	const pitch = span / teeth;
	const depth = 32 * unit;
	const tips = Array.from({ length: teeth }, () => depth * random() * 0.12);
	const deepest = Math.min(...tips);
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i <= teeth; i++) {
		const x = left + i * pitch;
		points.push({ x, y: y - depth * (0.82 + random() * 0.18) });
		if (i < teeth)
			points.push({ x: x + pitch * (0.38 + random() * 0.24), y: y - (tips[i] - deepest) });
	}
	return points;
}

/* ------------------------------------------------------------------ campaign helpers */

/** Style-level warnings no single frame can see. Pure; preflight can merge these with its own. */
export function checkLint(composition: Composition): Issue[] {
	if (composition.style !== CHECK_STYLE_ID) return [];
	const issues: Issue[] = [];
	const { slides, panorama, continuityMode } = composition;
	const left = panorama ? slides.findIndex((slide) => slide.id === panorama.leftId) : -1;
	if (continuityMode === 'paired' && left >= 0 && left < 3)
		issues.push({
			severity: 'warn',
			code: 'check-first-three-seam',
			message:
				'A connected pair falls in the first three frames, which search shows alone. Disconnect it, or move it later in the set.',
			slideIndex: left,
			target: composition.device
		});
	const settings = slides.map((_, index) => resolveCheckSettings(composition, index));
	settings.forEach((item, index) => {
		const previous = settings[index - 1];
		if (previous && previous.canvas === item.canvas && previous.preset === item.preset)
			issues.push({
				severity: 'warn',
				code: 'check-repeated-frame',
				message: `Frames ${index} and ${index + 1} use the same canvas and layout. Change one so the set keeps its rhythm.`,
				slideIndex: index,
				target: composition.device,
				control: 'check-preset'
			});
		const words = (slides[index].typography.subtitle ?? '').trim().split(/\s+/).filter(Boolean);
		if (words.length > 10)
			issues.push({
				severity: 'warn',
				code: 'check-long-support',
				message: `Frame ${index + 1}'s supporting text has ${words.length} words. Ten or fewer stay readable at store size.`,
				slideIndex: index,
				target: composition.device,
				control: 'subtitle'
			});
	});
	return issues;
}

/**
 * Apply The Check to an existing campaign without touching copy or images. A pair inside the
 * first three frames is disconnected, because each of those must work alone in search results;
 * later pairs stay connected on one canvas. Pure.
 */
export function applyCheckStyle(
	composition: Composition,
	// A stored pair can still share a canvas before this output has its first capture.
	connectedLeftId: string | undefined = composition.continuityMode === 'paired'
		? composition.panorama?.leftId
		: undefined
): Composition {
	const panorama = composition.panorama;
	const leftIndex = connectedLeftId
		? composition.slides.findIndex((slide) => slide.id === connectedLeftId)
		: -1;
	const keepPair = leftIndex >= 2;
	const count = composition.slides.length;
	const settings = composition.slides.map((slide, index) => {
		const current = slide.check ?? defaultCheckSettings(index, count);
		return keepPair && index === leftIndex + 1
			? {
					...current,
					canvas: (composition.slides[leftIndex].check ?? defaultCheckSettings(leftIndex, count))
						.canvas
				}
			: current;
	});
	return {
		...composition,
		style: CHECK_STYLE_ID,
		accent: CHECK_PALETTES.teal.accent,
		continuityMode: keepPair && panorama ? 'paired' : 'none',
		...(keepPair && panorama
			? { panorama: { ...panorama, tilt: 0, offset: 0, scale: 1 } }
			: { panorama: undefined }),
		slides: composition.slides.map((slide, index) => {
			const check = settings[index];
			const palette = CHECK_PALETTES[check.canvas];
			return {
				...slide,
				check,
				frame: 'none' as const,
				tilt: 0,
				scale: 1,
				effects: { shadow: 'soft' as const, glow: 0 },
				background: { kind: 'solid' as const, colors: [palette.canvas] },
				typography: { ...slide.typography, fontColor: palette.headline, fontWeight: 400 as const }
			};
		})
	};
}

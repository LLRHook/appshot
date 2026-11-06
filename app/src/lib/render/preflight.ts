import { imageRefForAsset, isSampleAsset } from '../model/assets';
import { sourceCompatibility } from '../model/capture';
import {
	CHECK_PALETTES,
	CHECK_STYLE_ID,
	checkLint,
	contrastRatio,
	resolveCheckSettings
} from '../model/check';
import type {
	DeviceClassId,
	ImageLayer,
	Issue,
	OutputTarget,
	Preflight,
	PreflightOptions,
	ProjectAsset,
	ProjectV2
} from '../model/contracts';
import {
	DEVICES,
	isDeviceId,
	OUTPUT_TARGETS,
	SPEC_SOURCE,
	TARGET_CLASS_GROUPS,
	TARGET_CLASSES,
	type DeviceId
} from '../model/devices';
import { MAX_FRAMES } from '../model/limits';
import {
	LINEN_STYLE_ID,
	linenPhoneBox,
	linenPlainText,
	linenScale,
	resolveLinenSettings,
	resolveSharedLinenPhone
} from '../model/linen';
import { createSlide, getStyle } from '../model/studio';
import { projectForTarget, sourceIssues } from '../model/targets';
import type { Composition } from '../model/types';
import { capturePlacement, renderSlide } from './canvas';
import { loadBundledFonts } from './fonts';
import { frameProfileError, imageLayerError } from './frames';

/**
 * Everything Appshot can tell about a campaign before a full-size render, all at once: files,
 * sources, layers, frames, type and copy. It measures through the same modules that paint, and a
 * small dry-run paint surfaces whatever the painters would refuse.
 *
 * Passing it means a campaign meets the file spec and the checks listed here. Sizes prove size
 * only, so it cannot prove native device UI, truthful claims, or what App Review will decide.
 */

/** Wide enough to exercise every paint path; metrics are unaffected because layout is output px. */
const DRY_RUN_WIDTH = 96;
/** Appshot's legibility floor, the large-text threshold of WCAG. A heuristic, not an Apple rule. */
const MIN_CONTRAST = 3;
/** Beyond this a real-UI callout is visibly soft. A heuristic, not an Apple rule. */
const LAYER_UPSCALE_WARN = 2;
/** Above this, most of the capture is off the frame however intentional the crop is. */
const HEAVY_CROP = 0.5;
/** Rounding, not a crop. */
const NEGLIGIBLE_CROP = 0.005;
const SPEC_STALE_DAYS = 90;
const DAY_MS = 86_400_000;

/* Controls an issue can focus. `additional-output` and the rest exist today, except where noted. */
const CONTROL_OUTPUTS = 'additional-output';
/** Not in the UI yet: the capture picker for one frame on one output. */
const CONTROL_SOURCE = 'frame-source';
/** Not in the UI yet: a frame's image layer list. */
const CONTROL_LAYERS = 'frame-layers';
/** Not in the UI yet: the storyboard's frame list. */
const CONTROL_FRAMES = 'frames';
/** Not in the UI yet: the text color field. */
const CONTROL_TEXT_COLOR = 'font-color';

/** Where the frame's main capture lands, from the painter's own layout, in output pixels. */
export interface CapturePlacement {
	/** The whole capture at its uniform scale, before any clipping. */
	width: number;
	height: number;
	/** Visible area divided by width, after frame edges or a torn cut; excludes rounded corners. */
	visibleHeight: number;
	/** Output pixels per source pixel. */
	scale: number;
}

export interface PreflightRuntime {
	/** Rejects when the bundled fonts cannot load. */
	loadFonts?(): Promise<void>;
	/** Paint a frame very small through the real renderer. Throws what a full render would. */
	dryRun?(composition: Composition, slideIndex: number): Promise<void>;
	/** The painter's own placement, when it exposes one. Null when no capture panel is drawn. */
	capturePlacement?(composition: Composition, slideIndex: number): Promise<CapturePlacement | null>;
	now?(): Date;
}

export interface PreflightRunOptions extends PreflightOptions {
	/** `false` skips fonts and the dry run: a quick read for a live panel, not a pass for export. */
	layout?: boolean;
	/** Dry-run progress, since a large matrix takes seconds. */
	onProgress?: (progress: { done: number; total: number }) => void;
}

export function hasBlockingIssue(issues: readonly Issue[]): boolean {
	return issues.some((issue) => issue.severity === 'block');
}

const describeSize = (target: Pick<OutputTarget, 'width' | 'height'>) =>
	`${target.width} × ${target.height}`;

/** "Frame 2", "Frames 1 and 2", "Frames 1, 2 and 3". */
function framesText(indices: readonly number[]): string {
	const numbers = indices.map((index) => index + 1);
	if (numbers.length === 1) return `Frame ${numbers[0]}`;
	return `Frames ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/* -------------------------------------------------------------------------- what Apple requires */

function classGroup(id: DeviceClassId) {
	return TARGET_CLASS_GROUPS.find((group) => group.id === id)!;
}

function addAdvice(id: DeviceClassId): string {
	return `Add the ${describeSize(classGroup(id).preferred[0])} output.`;
}

/**
 * Coverage comes from what the campaign declares. A project records its outputs and nothing else
 * about the app, so a platform it never mentions is noted, not assumed either way.
 */
function coverageIssues(project: ProjectV2): Issue[] {
	const declared = project.targets.filter(isDeviceId).map((id) => DEVICES[id]);
	const has = (classId: DeviceClassId) => declared.some((target) => target.classId === classId);
	const onIphone = declared.some((target) => target.platform === 'iphone');
	const onIpad = declared.some((target) => target.platform === 'ipad');
	const issues: Issue[] = [];
	const finding = (severity: Issue['severity'], code: string, message: string) =>
		issues.push({ severity, code, message, control: CONTROL_OUTPUTS });

	const medium = TARGET_CLASSES['iphone-di-medium'];
	if (onIphone && !has(medium.id))
		finding(
			'block',
			'required-class-missing',
			`${medium.label} is required and this campaign has no output for it. Apple: "${medium.requirement}" ${addAdvice(medium.id)}`
		);

	const faceId = TARGET_CLASSES['iphone-faceid-large'];
	if (onIphone && !has(faceId.id) && !has('iphone-di-large'))
		finding(
			'block',
			'conditional-class-missing',
			`This campaign has neither large iPhone class. Apple on ${faceId.label}: "${faceId.requirement}" ${addAdvice('iphone-di-large')}`
		);

	const tablet = TARGET_CLASSES['ipad-13'];
	if (onIpad && !has(tablet.id))
		finding(
			'block',
			'required-class-missing',
			`This campaign has iPad outputs but none for ${tablet.label}. Apple: "${tablet.requirement}" ${addAdvice(tablet.id)}`
		);
	if (!onIpad)
		finding(
			'info',
			'ipad-not-declared',
			`This campaign has no iPad output, so ${tablet.label} is not treated as required. If the app runs on iPad, Apple requires it: "${tablet.requirement}" ${addAdvice(tablet.id)}`
		);
	if (!onIphone)
		finding(
			'info',
			'iphone-not-declared',
			`This campaign has no iPhone output, so ${medium.label} is not treated as required. If the app runs on iPhone, Apple requires it. ${addAdvice(medium.id)}`
		);

	const duo = TARGET_CLASSES['iphone-duo'];
	const postures = new Set(declared.map((target) => target.posture).filter(Boolean));
	finding(
		'info',
		'future-class',
		postures.size
			? `${duo.label} is not required yet. Apple: "${duo.requirement}" Submitting these screenshots also shows a badge on the product page, so use only captures from a build that fills both Duo displays.`
			: `${duo.label} is not in this campaign and is not required yet. Apple: "${duo.requirement}"`
	);
	if (postures.size === 1) {
		const missing = postures.has('outer') ? 'inner' : 'outer';
		finding(
			'warn',
			'duo-display-missing',
			`This campaign has only one iPhone Duo display. The two show different UI, and Apple's page does not say whether one is enough. Add the ${missing} display, using its own captures, until App Store Connect settles it.`
		);
	}
	return issues;
}

function selectionIssues(
	project: ProjectV2,
	requested: readonly DeviceId[],
	selected: readonly OutputTarget[]
): Issue[] {
	const issues: Issue[] = [];
	if (!requested.length)
		issues.push({
			severity: 'block',
			code: 'no-outputs',
			message: 'Choose at least one output size to export.',
			control: CONTROL_OUTPUTS
		});
	for (const id of requested) {
		if (isDeviceId(id) && project.targets.includes(id)) continue;
		issues.push({
			severity: 'block',
			code: 'undeclared-output',
			message: `"${id}" is not one of this campaign's outputs. Add it to the campaign first.`,
			control: CONTROL_OUTPUTS
		});
	}
	const left = project.targets.length - selected.length;
	if (selected.length && left > 0)
		issues.push({
			severity: 'info',
			code: 'subset-export',
			message: `This covers ${selected.length} of the campaign's ${project.targets.length} outputs, so its export is labelled partial.`,
			control: CONTROL_OUTPUTS
		});
	return issues;
}

function frameCountIssues(project: ProjectV2): Issue[] {
	if (!project.slides.length)
		return [
			{
				severity: 'block',
				code: 'no-frames',
				message: `App Store Connect needs at least ${SPEC_SOURCE.minPerSize} screenshot per device size. Add a frame.`,
				control: CONTROL_FRAMES
			}
		];
	if (project.slides.length > MAX_FRAMES)
		return [
			{
				severity: 'block',
				code: 'too-many-frames',
				message: `This campaign has ${project.slides.length} frames. App Store Connect takes at most ${SPEC_SOURCE.maxPerSize} per device size, so remove ${project.slides.length - MAX_FRAMES}.`,
				control: CONTROL_FRAMES
			}
		];
	return [];
}

function specAgeIssues(now: Date): Issue[] {
	const age = (now.getTime() - Date.parse(SPEC_SOURCE.accessed)) / DAY_MS;
	if (age <= SPEC_STALE_DAYS) return [];
	return [
		{
			severity: 'warn',
			code: 'spec-stale',
			message: `Appshot last read Apple's screenshot specification on ${SPEC_SOURCE.accessed}, over ${SPEC_STALE_DAYS} days ago. Check its sizes against the current page: ${SPEC_SOURCE.url}`
		}
	];
}

/* ------------------------------------------------------------------------------------------ copy */

interface CopyRule {
	code: string;
	pattern: RegExp;
	what: string;
	reference: string;
}

const COPY_RULES: readonly CopyRule[] = [
	{
		code: 'copy-url',
		pattern: /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|app|co|ai)\b/i,
		what: 'a web address',
		reference: "Apple's asset guidance says to leave out URLs"
	},
	{
		code: 'copy-price',
		pattern:
			/[$€£¥]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:usd|eur|gbp|dollars?)\b|\bfree\b|\b\d+\s?% off\b|\bdiscounts?\b|\bon sale\b/i,
		what: 'a price or discount',
		reference: "App Review 2.3.7 and Apple's asset guidance say to leave out specific pricing"
	},
	{
		code: 'copy-copyright',
		pattern: /©|\(c\)\s?\d{4}/i,
		what: 'a copyright symbol',
		reference: "Apple's asset guidance says to leave out copyright symbols"
	},
	{
		code: 'copy-award',
		pattern: /\baward|\bwinner\b|\beditors?['’]?\s?choice\b|\bapp of the (?:day|year)\b/i,
		what: 'an award or Apple recognition',
		reference:
			"Apple's asset guidance excludes Apple-designated recognitions and unverifiable claims"
	},
	{
		code: 'copy-ranking',
		pattern: /#\s?1\b|\bno\.?\s?1\b|\bnumber one\b|\btop[- ]?\d+\b|\bbest\b|\branked\b/i,
		what: 'a ranking or superlative',
		reference: 'App Review 2.3.7 rules out claims that cannot be verified'
	},
	{
		code: 'copy-rating',
		pattern: /★|⭐|\b\d(?:\.\d)?[- ]?stars?\b|\brated\b|\b\d[\d,]*\+?\s?reviews?\b/i,
		what: 'a rating or review count',
		reference: 'App Review 2.3.7 rules out claims that cannot be verified'
	},
	{
		code: 'copy-other-platform',
		pattern: /\bandroid\b|\bgoogle play\b|\bplay store\b|\bwindows phone\b/i,
		what: 'another mobile platform',
		reference: 'App Review 2.3.10 rules out references to other mobile platforms'
	},
	{
		code: 'copy-for-kids',
		pattern: /\bfor (?:kids|children)\b/i,
		what: '"For Kids" wording',
		reference: 'App Review reserves terms like "For Kids" for the Kids Category'
	}
];

const COPY_FIELDS = [
	{
		name: 'headline',
		control: 'headline',
		read: (slide: ProjectV2['slides'][number]) => slide.typography.headline
	},
	{
		name: 'supporting text',
		control: 'subtitle',
		read: (slide: ProjectV2['slides'][number]) => slide.typography.subtitle
	},
	{ name: 'caption', control: 'badge', read: (slide: ProjectV2['slides'][number]) => slide.badge }
] as const;

/** Copy is shared by every output, so each finding is about the frame, not a target. */
function copyIssues(project: ProjectV2): Issue[] {
	const placeholder = createSlide(0).typography;
	const issues: Issue[] = [];
	if (
		!project.appName?.trim() &&
		(project.style !== CHECK_STYLE_ID ||
			project.targets.some((target) => {
				const composition = projectForTarget(project, target);
				return composition.slides.some(
					(_, index) => resolveCheckSettings(composition, index).wordmark
				);
			}))
	)
		issues.push({
			severity: 'warn',
			code: 'working-title-wordmark',
			control: 'app-name',
			message: `The screenshots print the campaign working title ("${project.name}"). Set the app name before exporting.`
		});
	project.slides.forEach((slide, slideIndex) => {
		for (const field of COPY_FIELDS) {
			const text = linenPlainText(field.read(slide) ?? '');
			for (const rule of COPY_RULES) {
				const found = rule.pattern.exec(text);
				if (found)
					issues.push({
						severity: 'warn',
						code: rule.code,
						message: `Frame ${slideIndex + 1}'s ${field.name} has ${rule.what} ("${found[0].trim()}"). ${rule.reference}.`,
						slideIndex,
						control: field.control
					});
			}
		}
		if (slide.typography.headline === placeholder.headline)
			issues.push({
				severity: 'warn',
				code: 'placeholder-copy',
				message: `Frame ${slideIndex + 1} still has Appshot's sample headline. Write its real one.`,
				slideIndex,
				control: 'headline'
			});
	});
	return issues;
}

/* ------------------------------------------------------------------------------ one frame's facts */

function inPair(composition: Composition, slideIndex: number): boolean {
	const { panorama, slides } = composition;
	const id = slides[slideIndex].id;
	return (
		composition.continuityMode === 'paired' &&
		!!panorama &&
		(panorama.leftId === id || panorama.rightId === id)
	);
}

/** A frame that deliberately draws no capture as its main panel. */
function isPanelOff(composition: Composition, slideIndex: number): boolean {
	return (
		composition.style === CHECK_STYLE_ID &&
		!inPair(composition, slideIndex) &&
		!resolveCheckSettings(composition, slideIndex).panel
	);
}

function isClassicStyle(composition: Composition): boolean {
	return composition.style !== CHECK_STYLE_ID && composition.style !== LINEN_STYLE_ID;
}

/** Text and its background, as the frame's own style will paint them. */
function contrastPairs(
	composition: Composition,
	slideIndex: number
): { what: string; ink: string; ground: string; control?: string }[] {
	const slide = composition.slides[slideIndex];
	if (composition.style === CHECK_STYLE_ID) {
		const palette = CHECK_PALETTES[resolveCheckSettings(composition, slideIndex).canvas];
		return [
			{ what: 'headline', ink: palette.headline, ground: palette.canvas, control: 'check-preset' },
			{ what: 'italic line', ink: palette.accent, ground: palette.canvas, control: 'check-preset' }
		];
	}
	if (composition.style === LINEN_STYLE_ID) {
		const { colors } = resolveLinenSettings(composition, slideIndex);
		return [{ what: 'headline', ink: colors.headline, ground: colors.canvas }];
	}
	const ink = slide.typography.fontColor || getStyle(composition.style).foreground;
	return slide.background.colors.map((ground) => ({
		what: 'headline',
		ink,
		ground,
		control: CONTROL_TEXT_COLOR
	}));
}

function contrastIssues(composition: Composition, target: OutputTarget): Issue[] {
	const issues: Issue[] = [];
	composition.slides.forEach((_, slideIndex) => {
		const worst = new Map<string, { ratio: number; control?: string }>();
		for (const pair of contrastPairs(composition, slideIndex)) {
			if (!/^#[0-9a-f]{6}$/i.test(pair.ink) || !/^#[0-9a-f]{6}$/i.test(pair.ground)) continue;
			const ratio = contrastRatio(pair.ink, pair.ground);
			const known = worst.get(pair.what);
			if (!known || ratio < known.ratio)
				worst.set(pair.what, { ratio, ...(pair.control ? { control: pair.control } : {}) });
		}
		for (const [what, { ratio, control }] of worst) {
			if (ratio >= MIN_CONTRAST) continue;
			issues.push({
				severity: 'warn',
				code: 'low-contrast',
				message: `Frame ${slideIndex + 1}'s ${what} has ${ratio.toFixed(1)}:1 contrast with its background. Appshot looks for at least ${MIN_CONTRAST}:1 (its own legibility check, not an Apple rule).`,
				target: target.id,
				slideIndex,
				...(control ? { control } : {})
			});
		}
	});
	return issues;
}

/* --------------------------------------------------------------------------------- images on it */

function layerIssues(project: ProjectV2, target: OutputTarget): Issue[] {
	const issues: Issue[] = [];
	project.slides.forEach((slide, slideIndex) => {
		const where = { target: target.id, slideIndex, control: CONTROL_LAYERS };
		const frame = `Frame ${slideIndex + 1}`;
		for (const layer of slide.variants?.[target.id]?.layers ?? []) {
			const name = `${layer.kind === 'art' ? 'artwork' : 'callout'} "${layer.id}"`;
			if (!Object.hasOwn(project.assets, layer.image)) {
				issues.push({
					...where,
					severity: 'block',
					code: 'layer-missing-asset',
					message: `${frame}'s ${name} on ${target.label} uses an image no longer in this campaign, so it would disappear. Add the image again or remove the layer.`
				});
				continue;
			}
			const asset = project.assets[layer.image];
			const resolved: ImageLayer = { ...layer, image: imageRefForAsset(asset) };
			const error = imageLayerError(resolved, target);
			if (error) {
				issues.push({
					...where,
					severity: 'block',
					code: 'layer-invalid',
					message: `${frame} on ${target.label}: ${error}`
				});
				continue;
			}
			if (layer.kind !== 'source-crop') continue;
			if (asset.provenance?.synthetic)
				issues.push({
					...where,
					severity: 'block',
					code: 'synthetic-source',
					message: `${frame}'s ${name} on ${target.label} crops a synthetic image, so it is for layout checks only and can never read store-ready.`
				});
			const compatibility = sourceCompatibility(asset, target);
			if (compatibility.level === 'wrong-class' || compatibility.level === 'wrong-orientation')
				issues.push({
					...where,
					severity: 'block',
					code: `layer-${compatibility.level}`,
					message: `${frame}'s ${name} crops real pixels from another screen: ${compatibility.message}`
				});
			else if (compatibility.level === 'unknown')
				issues.push({
					...where,
					severity: 'warn',
					code: 'layer-unverified',
					message: `${frame}'s ${name}: ${compatibility.message}`
				});
			if (layer.scale > LAYER_UPSCALE_WARN)
				issues.push({
					...where,
					severity: 'warn',
					code: 'layer-upscaled',
					message: `${frame}'s ${name} enlarges its pixels ${layer.scale.toFixed(1)}× on ${target.label}, so its UI will look soft. Reduce its scale.`
				});
		}
	});
	return issues;
}

/**
 * Every capture this output really draws, in frame order: the frame's own, and each real-UI crop,
 * which can come from a different capture. Art has no capture behind it.
 */
function frameAssets(
	project: ProjectV2,
	composition: Composition
): { slideIndex: number; asset: ProjectAsset }[] {
	return composition.slides.flatMap((slide, slideIndex) => {
		const own = isPanelOff(composition, slideIndex)
			? undefined
			: inPair(composition, slideIndex)
				? composition.panorama!.image.id
				: slide.primaryImage?.id;
		const crops = (slide.layers ?? [])
			.filter((layer) => layer.kind === 'source-crop')
			.map((layer) => layer.image.id);
		const ids = new Set([...(own === undefined ? [] : [own]), ...crops]);
		return [...ids]
			.filter((id) => Object.hasOwn(project.assets, id))
			.map((id) => ({ slideIndex, asset: project.assets[id] }));
	});
}

/** A recorded device can contradict a size. Only a wrong kind of device is certain enough to say. */
function wrongDeviceFamily(device: string, target: OutputTarget): boolean {
	const name = device.toLowerCase();
	const isDuo = name.includes('duo');
	const isPad = name.includes('ipad');
	const isPhone = name.includes('iphone') && !isDuo;
	if (target.classId === 'iphone-duo') return !isDuo && (isPad || isPhone);
	return target.platform === 'ipad' ? !isPad && (isPhone || isDuo) : !isPhone && (isPad || isDuo);
}

/**
 * Sample art on a frame. Art otherwise skips the capture checks, because it never claims to show
 * the app, but a bundled sample must not read as store-ready.
 */
function sampleArtIssues(
	project: ProjectV2,
	composition: Composition,
	target: OutputTarget
): Issue[] {
	return composition.slides.flatMap((slide, slideIndex) => {
		const art = (slide.layers ?? []).filter((layer) => layer.kind === 'art');
		const samples = art.some(
			({ image }) =>
				Object.hasOwn(project.assets, image.id) && isSampleAsset(project.assets[image.id])
		);
		if (!samples) return [];
		return {
			severity: 'block' as const,
			code: 'sample-source',
			message: `Frame ${slideIndex + 1} on ${target.label} uses Appshot's bundled sample art, which is not your app's. Remove that layer or add your own artwork.`,
			target: target.id,
			slideIndex,
			control: CONTROL_LAYERS
		};
	});
}

function provenanceIssues(
	project: ProjectV2,
	composition: Composition,
	target: OutputTarget
): Issue[] {
	const issues: Issue[] = sampleArtIssues(project, composition, target);
	const unverified: number[] = [];
	const unconfirmed: number[] = [];
	for (const { slideIndex, asset } of frameAssets(project, composition)) {
		const where = { target: target.id, slideIndex, control: CONTROL_SOURCE };
		const frame = `Frame ${slideIndex + 1}`;
		if (isSampleAsset(asset))
			issues.push({
				...where,
				severity: 'block',
				code: 'sample-source',
				message: `${frame} on ${target.label} uses one of Appshot's bundled samples, which is not your app. Add your own capture.`
			});
		const { provenance } = asset;
		if (provenance?.device && wrongDeviceFamily(provenance.device, target))
			issues.push({
				...where,
				severity: 'block',
				code: 'provenance-device-mismatch',
				message: `${frame}'s capture for ${target.label} records its device as ${provenance.device}, a different kind of device. Add a capture from ${TARGET_CLASSES[target.classId].devices[0]}.`
			});
		if (provenance?.synthetic) continue;
		if ((!provenance?.device || !provenance.os) && !unverified.includes(slideIndex))
			unverified.push(slideIndex);
		if (provenance?.fictionalData !== 'confirmed' && !unconfirmed.includes(slideIndex))
			unconfirmed.push(slideIndex);
	}
	if (unverified.length)
		issues.push({
			severity: 'warn',
			code: 'unverified-source',
			message: `${framesText(unverified)} on ${target.label}: no device or OS is recorded, so the export report reads "unverified source". An exact size does not show the capture has native UI.`,
			target: target.id,
			control: CONTROL_SOURCE
		});
	if (unconfirmed.length)
		issues.push({
			severity: 'warn',
			code: 'fictional-data-unconfirmed',
			message: `${framesText(unconfirmed)} on ${target.label}: nobody has confirmed these captures show only fictional account data, which App Review 2.3.9 asks for.`,
			target: target.id,
			control: CONTROL_SOURCE
		});
	return issues;
}

/** One submission's captures should come from one build. Reported once, across every output. */
function mixedBuildIssues(project: ProjectV2, compositions: readonly Composition[]): Issue[] {
	const seen = {
		appVersion: new Set<string>(),
		build: new Set<string>(),
		commit: new Set<string>()
	};
	for (const composition of compositions)
		for (const { asset } of frameAssets(project, composition))
			for (const key of ['appVersion', 'build', 'commit'] as const) {
				const value = asset.provenance?.[key];
				if (value) seen[key].add(value);
			}
	const mixed = (Object.entries(seen) as [string, Set<string>][])
		.filter(([, values]) => values.size > 1)
		.map(([key, values]) => `${key} (${[...values].join(', ')})`);
	return mixed.length
		? [
				{
					severity: 'warn',
					code: 'mixed-builds',
					message: `These captures come from more than one build: ${mixed.join('; ')}. Screenshots should show the build you submit.`,
					control: CONTROL_SOURCE
				}
			]
		: [];
}

/* ----------------------------------------------------------------------- frames, hardware, crops */

function frameProfileIssues(composition: Composition, target: OutputTarget): Issue[] {
	const issues: Issue[] = [];
	const illustrated: number[] = [];
	composition.slides.forEach((slide, slideIndex) => {
		const where = { target: target.id, slideIndex };
		if (composition.style === LINEN_STYLE_ID) {
			const phone = inPair(composition, slideIndex)
				? resolveSharedLinenPhone(composition)
				: resolveLinenSettings(composition, slideIndex).phone;
			const error = frameProfileError(phone.hardware, target);
			if (error)
				issues.push({
					...where,
					severity: 'block',
					code: 'frame-profile',
					message: `Frame ${slideIndex + 1}: ${error}`,
					control: 'phone-hardware'
				});
			else if (phone.hardware) illustrated.push(slideIndex);
			return;
		}
		if (!isClassicStyle(composition) || (slide.frame !== 'bezel' && slide.frame !== 'clay')) return;
		if (target.platform === 'ipad' || target.classId === 'iphone-duo')
			issues.push({
				...where,
				severity: 'block',
				code: 'frame-profile',
				message: `Frame ${slideIndex + 1} draws a phone frame with side buttons around a ${target.label} screen. Choose Fine outline or Screenshot only.`,
				control: 'frame-style'
			});
		else illustrated.push(slideIndex);
	});
	if (illustrated.length)
		issues.push({
			severity: 'warn',
			code: 'device-illustration',
			message: `${framesText(illustrated)} on ${target.label} draw${illustrated.length === 1 ? 's' : ''} an illustrated device. Apple's marketing guidelines ask for its own bezels and exclude simulated products, so this is a risk, not a known rejection. A frameless capture avoids it.`,
			target: target.id,
			control: composition.style === LINEN_STYLE_ID ? 'phone-hardware' : 'frame-style'
		});
	return issues;
}

interface CropFinding {
	hidden: number;
	/** What a person chose, as opposed to where a default happened to put the capture. */
	intent: string | null;
	control: string;
}

/** A measured crop, whoever measured it. An intentional one is noted, a default one is flagged. */
function cropIssue(finding: CropFinding, target: OutputTarget, slideIndex: number): Issue | null {
	if (finding.hidden <= NEGLIGIBLE_CROP) return null;
	const percent = Math.round(finding.hidden * 100);
	const base = `Frame ${slideIndex + 1} on ${target.label} hides about ${percent}% of its capture`;
	const heavy = finding.hidden > HEAVY_CROP;
	const severity = finding.intent && !heavy ? 'info' : 'warn';
	const advice = heavy
		? ` That is most of the screen. Check that what its headline promises is still visible.`
		: finding.intent
			? ''
			: ` Check that nothing important is cut, or say why it is fine.`;
	return {
		severity,
		code: 'capture-crop',
		message: `${base}${finding.intent ? ` (${finding.intent})` : ''}.${advice}`,
		target: target.id,
		slideIndex,
		control: finding.control
	};
}

/** Table Linen exposes its placement, so its crop is measured here without a paint. */
function linenCropFinding(composition: Composition, slideIndex: number, target: OutputTarget) {
	const pair = inPair(composition, slideIndex);
	const phone = pair
		? resolveSharedLinenPhone(composition)
		: resolveLinenSettings(composition, slideIndex).phone;
	if (phone.mode !== 'bottom-crop') return null;
	const source = pair ? composition.panorama!.image : composition.slides[slideIndex].primaryImage;
	if (!source) return null;
	const { screenBounds } = linenPhoneBox(phone, source, linenScale(target.width, target.height));
	const tall = screenBounds.bottom - screenBounds.top;
	const reason = phone.cropReason?.trim();
	return {
		hidden: tall > 0 ? Math.max(0, screenBounds.bottom - target.height) / tall : 0,
		intent: reason ? `crop reason: ${reason}` : null,
		control: 'crop-reason'
	} satisfies CropFinding;
}

function placementControl(composition: Composition): string {
	return composition.style === CHECK_STYLE_ID ? 'check-preset' : 'device-scale';
}

/** A The Check preset is a layout someone can choose. Classic styles have only their one default. */
function placementIntent(composition: Composition, slideIndex: number): string | null {
	if (composition.style !== CHECK_STYLE_ID) return null;
	const { check } = composition.slides[slideIndex];
	return check ? `The Check's ${check.preset} layout` : null;
}

/**
 * The Check and the classic styles keep their placement inside their painters. Until a painter
 * reports it (`PreflightRuntime.capturePlacement`) this says plainly that it was not measured.
 */
function unmeasuredCropIssues(composition: Composition, target: OutputTarget): Issue[] {
	const chosen: number[] = [];
	const unchosen: number[] = [];
	composition.slides.forEach((_, slideIndex) => {
		if (isPanelOff(composition, slideIndex)) return;
		(placementIntent(composition, slideIndex) ? chosen : unchosen).push(slideIndex);
	});
	const control = placementControl(composition);
	const issues: Issue[] = [];
	if (chosen.length)
		issues.push({
			severity: 'info',
			code: 'capture-crop-unmeasured',
			message: `${framesText(chosen)} on ${target.label} use The Check layouts that can run the capture off the frame. Appshot has not measured how much is hidden, so check that nothing important is cut.`,
			target: target.id,
			control
		});
	if (unchosen.length)
		issues.push({
			severity: 'warn',
			code: 'capture-crop-unmeasured',
			message: `${framesText(unchosen)} on ${target.label} use a default placement that can hide the bottom of the capture. Appshot has not measured how much, so check that nothing important is cut.`,
			target: target.id,
			control
		});
	return issues;
}

/* --------------------------------------------------------------------------------- in-use balance */

/** Per device, as App Review 2.3.3 counts it. Whether a capture is a splash screen is for a person. */
function inUseIssues(composition: Composition, target: OutputTarget): Issue[] {
	const count = composition.slides.length;
	if (!count) return [];
	const showing = composition.slides.filter(
		(slide, slideIndex) =>
			!isPanelOff(composition, slideIndex) ||
			slide.layers?.some((layer) => layer.kind === 'source-crop')
	).length;
	const needed = Math.floor(count / 2) + 1;
	if (showing >= needed) return [];
	return [
		{
			severity: 'block',
			code: 'in-use-minority',
			message: `Only ${showing} of ${count} frames on ${target.label} draw any app UI, and App Review 2.3.3 looks for more than half showing the app in use. Show real UI on ${needed - showing} more.`,
			target: target.id,
			control: CONTROL_SOURCE
		}
	];
}

function pairIssues(project: ProjectV2, target: OutputTarget): Issue[] {
	if (project.continuityMode !== 'paired' || !project.panorama) return [];
	if (project.panorama.variants?.[target.id]?.source) return [];
	return [
		{
			severity: 'info',
			code: 'pair-not-connected',
			message: `The connected pair has no shared capture for ${target.label}, so its two frames render separately there.`,
			target: target.id,
			control: CONTROL_SOURCE
		}
	];
}

function seamPositionIssues(project: ProjectV2): Issue[] {
	if (project.style === CHECK_STYLE_ID) return []; // `checkLint` says this for The Check.
	if (project.continuityMode !== 'paired' || !project.panorama) return [];
	const left = project.slides.findIndex((slide) => slide.id === project.panorama!.leftId);
	if (left < 0 || left >= 3) return [];
	return [
		{
			severity: 'warn',
			code: 'first-three-seam',
			message: `A connected pair falls in the first three frames, which search results can show alone. Disconnect it, or move it later in the set.`,
			slideIndex: left
		}
	];
}

/* -------------------------------------------------------------------------------------- dry run */

/** The painter says what to change; this only points at the control for it. */
function controlForPainterError(text: string): string | undefined {
	if (/frame was measured/i.test(text)) return 'phone-hardware';
	if (/campaign name|wordmark/i.test(text)) return 'app-name';
	if (/\bphone\b|center x/i.test(text)) return 'phone-top';
	if (/could not be loaded|lists it as/i.test(text)) return CONTROL_SOURCE;
	if (/artwork|callout/i.test(text)) return CONTROL_LAYERS;
	if (/pen mark/i.test(text)) return 'check-mark-kind';
	if (/supporting/i.test(text)) return 'subtitle';
	if (/headline|copy|text/i.test(text)) return 'headline';
	return undefined;
}

const painterText = (error: unknown) =>
	error instanceof Error && error.message ? error.message : 'It could not be painted.';

function painterIssue(text: string, target: OutputTarget, slideIndex: number): Issue {
	const control = controlForPainterError(text);
	const unreadable = /could not be loaded|lists it as/i.test(text);
	return {
		severity: 'block',
		code: unreadable ? 'source-unreadable' : 'layout-error',
		message: `Frame ${slideIndex + 1} on ${target.label} (${describeSize(target)}): ${text}`,
		target: target.id,
		slideIndex,
		...(control ? { control } : {})
	};
}

/* --------------------------------------------------------------------------------------- assembly */

/** The same finding on every selected output reads as one finding about the campaign. */
function collapseAcrossTargets(issues: readonly Issue[], targetCount: number): Issue[] {
	if (targetCount < 2) return [...issues];
	const key = (issue: Issue) =>
		`${issue.severity}|${issue.code}|${issue.slideIndex ?? ''}|${issue.message}`;
	const targets = new Map<string, Set<DeviceId>>();
	for (const issue of issues)
		if (issue.target) {
			const set = targets.get(key(issue)) ?? new Set<DeviceId>();
			set.add(issue.target);
			targets.set(key(issue), set);
		}
	const written = new Set<string>();
	const result: Issue[] = [];
	for (const issue of issues) {
		const shared = issue.target && targets.get(key(issue))?.size === targetCount;
		if (!shared) {
			result.push(issue);
			continue;
		}
		if (written.has(key(issue))) continue;
		written.add(key(issue));
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- it applies to all of them
		const { target, ...campaignWide } = issue;
		result.push(campaignWide);
	}
	return result;
}

export function createPreflight(runtime: PreflightRuntime = {}) {
	/** See `Preflight` in `contracts.ts`. Rejects with the signal's reason when cancelled. */
	return async function preflight(
		project: ProjectV2,
		options: PreflightRunOptions = {}
	): Promise<Issue[]> {
		const { signal, onProgress } = options;
		signal?.throwIfAborted();
		const requested = [...(options.targets ?? project.targets)];
		const wanted = requested.filter((id) => isDeviceId(id) && project.targets.includes(id));
		const selected = OUTPUT_TARGETS.filter((target) => wanted.includes(target.id));
		const issues: Issue[] = [
			...selectionIssues(project, requested, selected),
			...frameCountIssues(project),
			...coverageIssues(project),
			...specAgeIssues(runtime.now?.() ?? new Date()),
			...seamPositionIssues(project),
			...copyIssues(project)
		];

		const compositions = new Map<DeviceId, Composition>();
		for (const target of selected) {
			try {
				compositions.set(target.id, projectForTarget(project, target.id));
			} catch (error) {
				issues.push({
					severity: 'block',
					code: 'projection-failed',
					message: `${target.label} could not be prepared: ${error instanceof Error ? error.message : 'unknown error.'}`,
					target: target.id
				});
			}
		}

		issues.push(...mixedBuildIssues(project, [...compositions.values()]));
		for (const target of selected) {
			const composition = compositions.get(target.id);
			if (!composition) continue;
			const sources = sourceIssues(project, [target.id])
				.filter(
					(issue) =>
						issue.code !== 'missing-source' || !isPanelOff(composition, issue.slideIndex ?? -1)
				)
				.map((issue) => ({ control: CONTROL_SOURCE, ...issue }));
			issues.push(
				...sources,
				...layerIssues(project, target),
				...provenanceIssues(project, composition, target),
				...frameProfileIssues(composition, target),
				...contrastIssues(composition, target),
				...inUseIssues(composition, target),
				...pairIssues(project, target),
				...checkLint(composition)
			);
			if (composition.style === LINEN_STYLE_ID) {
				composition.slides.forEach((_, slideIndex) => {
					const finding = linenCropFinding(composition, slideIndex, target);
					const issue = finding && cropIssue(finding, target, slideIndex);
					if (issue) issues.push(issue);
				});
			} else if (!runtime.capturePlacement) {
				issues.push(...unmeasuredCropIssues(composition, target));
			}
		}

		if (options.layout !== false) {
			if (!runtime.dryRun) {
				issues.push({
					severity: 'warn',
					code: 'layout-not-checked',
					message: 'Layout and fonts were not checked in this environment.'
				});
			} else {
				const fontsReady = await (runtime.loadFonts?.() ?? Promise.resolve()).then(
					() => true,
					(error: unknown) => {
						issues.push({
							severity: 'block',
							code: 'fonts-unavailable',
							message:
								error instanceof Error && error.message
									? error.message
									: 'The app fonts could not be loaded.'
						});
						return false;
					}
				);
				signal?.throwIfAborted();
				if (fontsReady) {
					const total = compositions.size * project.slides.length;
					let done = 0;
					for (const target of selected) {
						const composition = compositions.get(target.id);
						if (!composition) continue;
						for (let slideIndex = 0; slideIndex < composition.slides.length; slideIndex++) {
							signal?.throwIfAborted();
							try {
								await runtime.dryRun(composition, slideIndex);
								const placement =
									composition.style === LINEN_STYLE_ID
										? null
										: await runtime.capturePlacement?.(composition, slideIndex);
								if (placement) {
									const source = inPair(composition, slideIndex)
										? composition.panorama?.image
										: composition.slides[slideIndex].primaryImage;
									const compatibility =
										source &&
										sourceCompatibility(source, target, source.naturalWidth * placement.scale);
									if (compatibility?.level === 'upscaled')
										issues.push({
											severity: compatibility.severity === 'block' ? 'block' : 'warn',
											code: 'upscaled',
											target: target.id,
											slideIndex,
											control: placementControl(composition),
											message: `Frame ${slideIndex + 1} on ${target.label}: ${compatibility.message}`
										});
									const issue = cropIssue(
										{
											hidden: 1 - placement.visibleHeight / placement.height,
											intent: placementIntent(composition, slideIndex),
											control: placementControl(composition)
										},
										target,
										slideIndex
									);
									if (issue) issues.push(issue);
								}
							} catch (error) {
								signal?.throwIfAborted();
								const text = painterText(error);
								// Static checks may already have reported this refusal.
								const known = issues.some(
									(issue) =>
										issue.target === target.id &&
										issue.slideIndex === slideIndex &&
										issue.message.includes(text)
								);
								if (!known) issues.push(painterIssue(text, target, slideIndex));
							}
							done++;
							onProgress?.({ done, total });
						}
					}
				}
			}
		}

		signal?.throwIfAborted();
		return collapseAcrossTargets(issues, selected.length);
	} satisfies Preflight;
}

async function dryRunFrame(composition: Composition, slideIndex: number): Promise<void> {
	const canvas = document.createElement('canvas');
	try {
		await renderSlide(canvas, composition, slideIndex, { width: DRY_RUN_WIDTH });
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

/** Runs in the browser, with real fonts and the real painters. */
export const preflight = createPreflight({
	loadFonts: loadBundledFonts,
	dryRun: dryRunFrame,
	capturePlacement
});

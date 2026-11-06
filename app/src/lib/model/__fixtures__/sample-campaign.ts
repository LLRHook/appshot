import {
	CHECK_PALETTES,
	CHECK_STYLE_ID,
	type CheckCanvas,
	type CheckMark,
	type CheckPreset,
	type CheckSettingsPatch
} from '../check';
import type {
	AssetId,
	ImageLayer,
	PixelRect,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	StoredSlide
} from '../contracts';
import { DEVICES, type DeviceId } from '../devices';
import type { Composition, ImageRef, Slide } from '../types';

/**
 * A test-only multi-target campaign in The Check: five frameless frames of crops, each display with
 * its own synthetic captures, crops, layers, marks and tear. It stands in for a real campaign where
 * a test needs target bindings, layers and marks together. Its geometry follows from each display's
 * size, so no measurement of any real capture is involved.
 */

export const CAMPAIGN_SCENES = ['almanac', 'season', 'gear', 'trail', 'summit', 'extra'] as const;
export type CampaignScene = (typeof CAMPAIGN_SCENES)[number];
/** One target's own captures. A scene with no capture yet leaves its frame without a source. */
export type CampaignSources = Partial<Record<CampaignScene, ImageRef>>;
export type CampaignAssets = Partial<Record<CampaignScene, ProjectAsset>>;

/** Layers raised above another layer of the same frame. */
export const LIFTED_LAYERS = ['callout'];

interface LayerSpec {
	id: string;
	/** Another capture of this target, when the frame's own does not show this. Omitted means its own. */
	scene?: CampaignScene;
	crop: PixelRect;
	x: number;
	y: number;
	scale: number;
	radius?: number;
	shadow?: ImageLayer['shadow'];
}

interface FrameGeometry {
	fontScale?: number;
	layers: LayerSpec[];
	mark: CheckMark;
	/** The layer whose bottom tears. */
	tear?: string;
}

interface FrameCopy {
	id: string;
	label: string;
	scene: CampaignScene;
	canvas: CheckCanvas;
	preset: CheckPreset;
	headline: string;
	support: string;
}

const FRAMES: readonly FrameCopy[] = [
	{
		id: 'almanac',
		label: 'Almanac',
		scene: 'almanac',
		canvas: 'gold',
		preset: 'editorial',
		headline: 'Fjord maps,\n*quietly kept.*',
		support: 'Tide tables and a pencil.'
	},
	{
		id: 'season',
		label: 'Season',
		scene: 'season',
		canvas: 'teal',
		preset: 'hero',
		headline: 'Winter light\n*on the ridge.*',
		support: 'Snow falls early up here.'
	},
	{
		id: 'gear',
		label: 'Gear',
		scene: 'gear',
		canvas: 'cream',
		preset: 'detail',
		headline: 'Rope and flask,\n*both dry.*',
		support: 'Everything fits the small bag.'
	},
	{
		id: 'trail',
		label: 'Trail',
		scene: 'trail',
		canvas: 'teal',
		preset: 'hero',
		headline: 'Fog above\n*the switchbacks.*',
		support: 'Cairns mark the upper path.'
	},
	{
		id: 'summit',
		label: 'Summit',
		scene: 'summit',
		canvas: 'gold',
		preset: 'detail',
		headline: 'Quartz glints\n*near the top.*',
		support: 'The view opens past the ridge.'
	}
];

export const CAMPAIGN_TARGETS: readonly DeviceId[] = [
	'iphone-6.9',
	'iphone-di-medium-1206x2622',
	'ipad-13',
	'iphone-duo-outer-1398x2034',
	'iphone-duo-inner-2007x2853'
];

/** The targets this campaign is laid out for. */
export function campaignTargets(): DeviceId[] {
	return [...CAMPAIGN_TARGETS];
}

/** One frame raised from `under`: the same source pixels, larger, over where they sit there. */
function raised(under: LayerSpec, crop: PixelRect, scale: number, shift = { x: 0, y: 0 }) {
	const twin = {
		x: under.x + (crop.x - under.crop.x) * under.scale,
		y: under.y + (crop.y - under.crop.y) * under.scale
	};
	return {
		id: 'callout',
		crop,
		x: Math.round(twin.x + (crop.width * (under.scale - scale)) / 2 + shift.x),
		y: Math.round(twin.y + (crop.height * (under.scale - scale)) / 2 + shift.y),
		scale,
		radius: Math.round(crop.height * 0.2),
		shadow: 'soft' as const
	};
}

/** The middle of a crop, wide enough that a ring around it stays inside the crop. */
function innerRect(crop: PixelRect): PixelRect {
	const width = Math.round(crop.width * 0.4);
	const height = Math.round(crop.height * 0.32);
	return {
		x: crop.x + Math.round((crop.width - width) / 2),
		y: crop.y + Math.round((crop.height - height) / 2),
		width,
		height
	};
}

function geometryOf(device: DeviceId): Record<string, FrameGeometry> {
	const { width: W, height: H } = DEVICES[device];
	const unit = W / 1320;
	const px = Math.round;
	const box = (x: number, y: number, width: number, height: number): PixelRect => ({
		x: px(x),
		y: px(y),
		width: px(width),
		height: px(height)
	});
	const corner = px(56 * unit);
	const card = (id: string, crop: PixelRect, x: number, y: number): LayerSpec => ({
		id,
		crop,
		x: px(x),
		y: px(y),
		scale: 1,
		radius: corner,
		shadow: 'soft'
	});
	const calloutSize = { width: 0.42 * W, height: 0.13 * W };

	const panel = card('panel', box(0.04 * W, 0.2 * H, 0.92 * W, 0.46 * H), 0.04 * W, 0.42 * H);
	const panelCallout = raised(
		panel,
		box(
			panel.crop.x + 0.42 * panel.crop.width,
			panel.crop.y + 0.12 * panel.crop.height,
			calloutSize.width,
			calloutSize.height
		),
		1.3
	);
	const panelFoot = panel.y + panel.crop.height;

	const list = card('list', box(0.05 * W, 0.2 * H, 0.86 * W, 0.48 * H), 0.04 * W, 0.4 * H);
	const listCrop = box(
		list.crop.x + 0.42 * list.crop.width,
		list.crop.y + 0.3 * list.crop.height,
		0.4 * W,
		calloutSize.height
	);
	// Past the card's right edge on purpose, so it reads as raised rather than almost aligned.
	const listRight = list.x + list.crop.width;
	const listCallout = raised(list, listCrop, 1.3);
	listCallout.x = px(listRight + 40 * unit - listCrop.width * 1.3);

	const dialog = card('dialog', box(0.06 * W, 0.22 * H, 0.88 * W, 0.44 * H), 0.06 * W, 0.4 * H);
	const dialogFoot = dialog.y + dialog.crop.height;
	const dialogCrop = box(
		dialog.crop.x + 0.1 * dialog.crop.width,
		dialog.crop.y + dialog.crop.height - calloutSize.height - 10 * unit,
		calloutSize.width,
		calloutSize.height
	);
	// Past the card's foot on purpose, for the same reason.
	const dialogCallout = raised(dialog, dialogCrop, 1.5);
	dialogCallout.y = px(dialogFoot + 36 * unit - dialogCrop.height * 1.5);

	const strip = card('strip', box(0.05 * W, 0.2 * H, 0.9 * W, 0.38 * H), 0.05 * W, 0.04 * H);

	const summary = card('summary', box(0.04 * W, 0.24 * H, 0.92 * W, 0.26 * H), 0.04 * W, 0.42 * H);
	const notes = card(
		'notes',
		box(0.04 * W, 0.52 * H, 0.92 * W, 0.14 * H),
		0.04 * W,
		summary.y + summary.crop.height + 24 * unit
	);

	return {
		trail: {
			layers: [
				panel,
				{
					id: 'extra',
					scene: 'extra',
					crop: box(0.08 * W, 0.2 * H, 0.46 * W, 0.12 * W),
					x: px(0.07 * W),
					y: px(panelFoot - 0.15 * W),
					scale: 1,
					radius: px(32 * unit),
					shadow: 'soft'
				},
				panelCallout
			],
			mark: { kind: 'ring', anchor: 'callout', rect: innerRect(panelCallout.crop), seed: 12 }
		},
		summit: {
			fontScale: 1.05,
			layers: [list, listCallout],
			mark: { kind: 'ring', anchor: 'callout', rect: innerRect(listCrop), seed: 27 }
		},
		gear: {
			layers: [dialog, dialogCallout],
			mark: { kind: 'ring', anchor: 'callout', rect: innerRect(dialogCrop), seed: 41 }
		},
		almanac: {
			tear: 'strip',
			layers: [strip],
			mark: {
				kind: 'ring',
				anchor: 'strip',
				rect: box(
					strip.crop.x + 0.46 * strip.crop.width,
					strip.crop.y + 0.4 * strip.crop.height,
					0.26 * W,
					0.05 * W
				),
				seed: 58
			}
		},
		season: {
			layers: [summary, notes],
			mark: {
				kind: 'underline',
				anchor: 'summary',
				rect: box(
					summary.crop.x + 0.3 * summary.crop.width,
					summary.crop.y + 0.46 * summary.crop.height,
					0.3 * W,
					0.04 * W
				),
				seed: 73
			}
		}
	};
}

/** Two rows next to what the `almanac` frame rings, for proving the pen stays off them. */
export function ringNeighbors(device: DeviceId): PixelRect[] {
	const { mark } = geometryOf(device).almanac;
	const { rect } = mark;
	const gap = Math.round(DEVICES[device].width * 0.08);
	return [
		{ ...rect, y: rect.y - gap - rect.height },
		{ ...rect, y: rect.y + rect.height + gap }
	];
}

function frameLayers<TImage>(
	geometry: FrameGeometry | undefined,
	source: TImage | undefined,
	scene: (key: CampaignScene) => TImage | undefined
): ImageLayer<TImage>[] {
	return (geometry?.layers ?? []).flatMap((layer) => {
		const image = layer.scene ? scene(layer.scene) : source;
		if (image === undefined) return [];
		return [
			{
				id: layer.id,
				kind: 'source-crop' as const,
				image,
				crop: layer.crop,
				x: layer.x,
				y: layer.y,
				scale: layer.scale,
				...(layer.radius !== undefined ? { radius: layer.radius } : {}),
				...(layer.shadow ? { shadow: layer.shadow } : {})
			}
		];
	});
}

/** A mark or tear is only kept when what it points at is on the frame for this target. */
function frameMarks(geometry: FrameGeometry | undefined, layers: readonly { id: string }[]) {
	const has = (id: string | undefined) => layers.some((layer) => layer.id === id);
	return {
		...(has(geometry?.mark.anchor) ? { mark: geometry!.mark } : {}),
		...(has(geometry?.tear) ? { tear: geometry!.tear } : {})
	} satisfies CheckSettingsPatch;
}

function sharedFields(copy: FrameCopy): Omit<StoredSlide, 'variants'> {
	const palette = CHECK_PALETTES[copy.canvas];
	return {
		id: copy.id,
		label: copy.label,
		background: { kind: 'solid', colors: [palette.canvas] },
		layout: 'text-above',
		typography: {
			headline: copy.headline,
			subtitle: copy.support,
			fontColor: palette.headline,
			fontWeight: 400
		},
		effects: { shadow: 'soft', glow: 0 },
		frame: 'none',
		check: { canvas: copy.canvas, preset: copy.preset, panel: false, wordmark: false }
	};
}

function assertNativeSize(device: DeviceId, scene: string, source?: ImageRef | ProjectAsset) {
	if (!source) return;
	const { width, height } = DEVICES[device];
	if (source.naturalWidth !== width || source.naturalHeight !== height)
		throw new Error(
			`The ${scene} capture for ${DEVICES[device].label} is ${source.naturalWidth} × ${source.naturalHeight}. This frame was laid out for a native ${width} × ${height} capture.`
		);
}

/** One target's campaign. `sources` are that target's own captures, never another's. */
export function createCampaignDemo(device: DeviceId, sources: CampaignSources): Composition {
	const geometry = geometryOf(device);
	for (const [scene, source] of Object.entries(sources)) assertNativeSize(device, scene, source);
	const slides = FRAMES.map((copy): Slide => {
		const spec = geometry[copy.id];
		const source = sources[copy.scene];
		const layers = frameLayers<ImageRef>(spec, source, (scene) => sources[scene]);
		const shared = sharedFields(copy);
		return {
			...shared,
			device,
			continuity: { inset: 0 },
			...(source ? { primaryImage: source } : {}),
			...(layers.length ? { layers } : {}),
			...(spec?.fontScale !== undefined ? { fontScale: spec.fontScale } : {}),
			check: { ...shared.check!, ...frameMarks(spec, layers) }
		};
	});
	return {
		version: 1,
		name: 'Sample campaign',
		device,
		style: CHECK_STYLE_ID,
		accent: CHECK_PALETTES.teal.accent,
		continuityMode: 'none',
		slides
	};
}

/**
 * The whole campaign as one stored project: one set of frames, with each target's own sources,
 * crops and pen marks. Only captures a frame uses are stored. A target with no capture for a frame
 * gets no source there, and preflight reports it.
 */
export function createCampaignProject(
	byTarget: Partial<Record<DeviceId, CampaignAssets>>
): ProjectV2 {
	const targets = Object.keys(byTarget) as DeviceId[];
	const assets: Record<AssetId, ProjectAsset> = {};
	for (const target of targets)
		for (const [scene, asset] of Object.entries(byTarget[target] ?? {}))
			assertNativeSize(target, scene, asset);
	const slides = FRAMES.map((copy): StoredSlide => {
		const variants: Partial<Record<DeviceId, SlideVariant>> = {};
		for (const target of targets) {
			const spec = geometryOf(target)[copy.id];
			const captures = byTarget[target] ?? {};
			const asset = captures[copy.scene];
			const layers = frameLayers<AssetId>(spec, asset?.id, (scene) => captures[scene]?.id);
			for (const scene of [copy.scene, ...(spec?.layers ?? []).map((layer) => layer.scene)]) {
				const used = scene && captures[scene];
				if (used) assets[used.id] = used;
			}
			variants[target] = {
				...(asset ? { source: { asset: asset.id } } : {}),
				...(layers.length ? { layers } : {}),
				...(spec?.fontScale !== undefined ? { fontScale: spec.fontScale } : {}),
				check: frameMarks(spec, layers)
			};
		}
		return { ...sharedFields(copy), variants };
	});
	return {
		version: 2,
		name: 'Sample campaign',
		appName: 'Sample campaign',
		style: CHECK_STYLE_ID,
		accent: CHECK_PALETTES.teal.accent,
		targets,
		assets,
		slides,
		continuityMode: 'none'
	};
}

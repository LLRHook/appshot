/**
 * Frozen interfaces for multi-target campaigns: the shapes the source model, scene renderer,
 * export and editor agree on. Nothing here is implemented yet and nothing in the product uses it;
 * the current single-target `Composition` flow stays the working path until these land.
 *
 *   ProjectV2 ──> projectForTarget(project, targetId) ──> Composition ──> renderSlide ──> PNG
 *      │                                                                     (one target)
 *      └───────> preflight(project) ──> Issue[]      exportMatrix(project) loops over targets
 *
 * The renderer stays single-target and never infers a missing source: it paints the Composition
 * it is given. Choosing, validating and reporting sources happen before it.
 */
import type { CheckSettingsPatch } from './check';
import type { DeviceId, DeviceSize } from './devices';
import type { LinenHardwareModel, LinenPhone, LinenSettings } from './linen';
import type { StyleId } from './studio';
import type { Composition, Effects, ImageRef, LayoutId, Panorama, Slide } from './types';

/* ---------------------------------------------------------------------- output targets */

/** Layout families by output aspect ratio. A target's scene layout is chosen per family. */
export const ASPECT_FAMILIES = [
	'phone-tall',
	'duo-portrait',
	'tablet-portrait',
	'wide-landscape',
	'phone-landscape'
] as const;
export type AspectFamily = (typeof ASPECT_FAMILIES)[number];

/** Display classes, matching `classes[].id` in the Apple screenshot specification data. */
export const DEVICE_CLASS_IDS = [
	'iphone-duo',
	'iphone-di-large',
	'iphone-faceid-large',
	'iphone-di-medium',
	'iphone-faceid-medium',
	'iphone-home-large',
	'iphone-home-medium',
	'iphone-home-4in',
	'iphone-home-3.5in',
	'ipad-13',
	'ipad-12.9',
	'ipad-11',
	'ipad-10.5',
	'ipad-9.7'
] as const;
export type DeviceClassId = (typeof DEVICE_CLASS_IDS)[number];

export type TargetStatus = 'required' | 'required-if-ipad' | 'conditional' | 'optional' | 'future';
export type Orientation = 'portrait' | 'landscape';
export type DuoPosture = 'outer' | 'inner';
/** Measured device hardware. Unset on a target means frameless; never borrow another device's. */
export type FrameProfileId = LinenHardwareModel;

/**
 * One exact output size. A target id is a `DeviceId`, so widening `DEVICES` to a catalog of
 * targets leaves every `DEVICES[composition.device]` lookup in the renderer working.
 */
export interface OutputTarget extends DeviceSize {
	classId: DeviceClassId;
	platform: 'iphone' | 'ipad';
	orientation: Orientation;
	/** Which iPhone Duo display this size belongs to. */
	posture?: DuoPosture;
	status: TargetStatus;
	layoutFamily: AspectFamily;
	frameProfile?: FrameProfileId;
}

export type ActiveTargets = (project: ProjectV2) => OutputTarget[];

/* ----------------------------------------------------------------- sources and provenance */

export interface SourceDimensions {
	naturalWidth: number;
	naturalHeight: number;
}

/** What a capture's own pixel size says about it. It proves size only, not native device UI. */
export interface CaptureClassification {
	/** Every class accepting exactly this size. Empty when none does; sizes can span classes. */
	classIds: readonly DeviceClassId[];
	orientation: Orientation | 'square';
	/** Nearest family by aspect ratio, or null when none is close. */
	aspectFamily: AspectFamily | null;
	posture?: DuoPosture;
}
export type ClassifyCapture = (width: number, height: number) => CaptureClassification;

export const SOURCE_COMPATIBILITY_LEVELS = [
	'native',
	'same-class',
	'upscaled',
	'wrong-orientation',
	'wrong-class',
	'unknown'
] as const;
/**
 * - `native`: exact size for the target's class.
 * - `same-class`: another accepted size of the class, aspect within tolerance.
 * - `upscaled`: fewer source pixels than placed pixels.
 * - `wrong-orientation`: portrait source in a landscape target, or the reverse.
 * - `wrong-class`: phone on tablet or Duo, tablet on phone, Duo mismatch.
 * - `unknown`: the size matches no class.
 */
export type SourceCompatibilityLevel = (typeof SOURCE_COMPATIBILITY_LEVELS)[number];

export interface SourceCompatibility {
	level: SourceCompatibilityLevel;
	/** `ok` needs no message in the UI. `wrong-*` is always `block`. */
	severity: IssueSeverity | 'ok';
	/** Placed pixels per source pixel, when a placement was given. Above 1 is enlargement. */
	upscale?: number;
	message: string;
}
export type CheckSourceCompatibility = (
	source: SourceDimensions,
	target: OutputTarget,
	placedWidthPx?: number
) => SourceCompatibility;

/** Where a capture came from. Anything absent reads as "unverified source" in reports. */
export interface CaptureProvenance {
	device?: string;
	os?: string;
	appVersion?: string;
	build?: string;
	commit?: string;
	appearance?: 'light' | 'dark';
	/** ISO 8601. */
	capturedAt?: string;
	tool?: string;
	/** Not a real capture from the device class. Synthetic output can never read store-ready. */
	synthetic?: boolean;
	/** Whether someone confirmed the capture shows only fictional account data. */
	fictionalData?: 'confirmed' | 'unconfirmed';
}

/* ------------------------------------------------------------------------------ issues */

export type IssueSeverity = 'block' | 'warn' | 'info';

/** One finding about a campaign. `block` stops store export; it never fails silently. */
export interface Issue {
	severity: IssueSeverity;
	/** Stable identifier for tests and grouping, e.g. `missing-source`, `wrong-class`. */
	code: string;
	/** Says what is wrong and what to do about it. */
	message: string;
	target?: DeviceId;
	slideIndex?: number;
	/** DOM id of the control that fixes this, e.g. `phone-top`, when one exists. */
	control?: string;
}

/* ------------------------------------------------------------------------ image layers */

/** Whole source pixels, inside the source image. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * An image painted over the scene: a real-UI callout or campaign art. `TImage` is an `AssetId`
 * when stored and a resolved `ImageRef` in a `Composition`.
 *
 * Placement is one uniform `scale`, so a layer cannot stretch its source.
 */
export interface ImageLayer<TImage = ImageRef> {
	id: string;
	/**
	 * `source-crop` lifts real pixels out of a capture and is the only way to enlarge app UI;
	 * never retype or redraw it. `art` is campaign artwork such as a wordmark or mascot.
	 */
	kind: 'source-crop' | 'art';
	image: TImage;
	crop: PixelRect;
	/** Top-left of the unrotated layer, in output pixels of the projected target. */
	x: number;
	y: number;
	/** Output pixels per source pixel. */
	scale: number;
	/** Degrees clockwise around the layer's center. */
	rotation?: number;
	/** Corner radius in output pixels. */
	radius?: number;
	shadow?: Effects['shadow'];
	/** `pixelated` is nearest-neighbor, for pixel art. Defaults to `smooth`. */
	sampling?: 'smooth' | 'pixelated';
}

/* -------------------------------------------------------------------- stored Project v2 */

/** Opaque key into `ProjectV2.assets`. */
export type AssetId = string;

/** One unique image. Identical bytes share one record however many frames use them. */
export interface ProjectAsset extends SourceDimensions {
	id: AssetId;
	/** SHA-256 of the bytes, lowercase hex. Absent only for migrated images not yet hashed. */
	sha256?: string;
	/** Sniffed from the bytes, not taken from a file name or claimed type. */
	mime: 'image/png' | 'image/jpeg' | 'image/webp';
	byteLength: number;
	/**
	 * Where the bytes are now: `data:` in portable files, `/demo/*.png` for bundled samples, and
	 * `blob:` in a browser session. Hydrating and dehydrating it belongs to persistence.
	 */
	url: string;
	/** Original file name, for the library and for error messages. */
	name?: string;
	provenance?: CaptureProvenance;
}

/** Binds a frame to the capture it shows on one target. */
export interface SourceBinding {
	asset: AssetId;
	/**
	 * A person accepted a blocking compatibility result, and why. Output stays usable as a draft
	 * and can never read store-ready.
	 */
	nonNative?: { reason: string };
}

/** What may differ per target. Anything unset comes from the slide; `source` has no fallback. */
export interface SlideVariant {
	source?: SourceBinding;
	/** Replaces whole settings groups (`layout`, `phone`, ...) for this target. */
	linen?: Partial<LinenSettings>;
	/** Whole keys replace the slide's. A pen mark's region is source pixels, so it varies here. */
	check?: CheckSettingsPatch;
	scale?: number;
	tilt?: number;
	fontScale?: number;
	layout?: LayoutId;
	layers?: ImageLayer<AssetId>[];
}

/** Copy and treatment shared by every target, plus each target's source and overrides. */
export interface StoredSlide extends Omit<
	Slide,
	'device' | 'primaryImage' | 'continuity' | 'layers'
> {
	variants?: Partial<Record<DeviceId, SlideVariant>>;
}

export interface PanoramaVariant {
	source?: SourceBinding;
	linenPhone?: LinenPhone;
	offset?: number;
	scale?: number;
	tilt?: number;
}

export interface StoredPanorama extends Omit<Panorama, 'image'> {
	variants?: Partial<Record<DeviceId, PanoramaVariant>>;
}

/** The saved campaign. One story and one set of copy, targeting several outputs. */
export interface ProjectV2 {
	version: 2;
	/**
	 * Which local autosave slot this document belongs to, so undoing across New or Open resumes the
	 * right slot. Session state assigned by persistence: never read from or written to a file.
	 */
	campaignId?: string;
	/** Working title. */
	name: string;
	/** Brand name printed in scenes, separate from the working title. Falls back to `name`. */
	appName?: string;
	style: StyleId;
	accent: string;
	/** Declared outputs, non-empty and unique. */
	targets: DeviceId[];
	assets: Record<AssetId, ProjectAsset>;
	slides: StoredSlide[];
	continuityMode: Composition['continuityMode'];
	panorama?: StoredPanorama;
}

/**
 * Resolve a stored campaign into the single-target document the renderer and legacy export use.
 *
 * Pure and deterministic: no I/O, clock or randomness, and the input is never mutated.
 * - Returns `version: 1`, `device: targetId` on the composition and every slide, `continuity:
 *   { inset: 0 }`, and `name: appName ?? name`. Variant fields override the slide's; another
 *   target's variant never leaks in.
 * - `primaryImage` is exactly this target's bound asset, or absent. It never substitutes another
 *   target's or class's source, and it does not judge compatibility; `preflight` reports both.
 * - A pair without this target's panorama source projects with no `panorama` and
 *   `continuityMode: 'none'`, because `Panorama.image` is required.
 * - Throws on a target outside `project.targets`, rather than falling back.
 *
 * The result passes `parseProject` when asset URLs are portable; session `blob:` URLs do not.
 */
export type ProjectForTarget = (project: ProjectV2, targetId: DeviceId) => Composition;

/* ------------------------------------------------------------------- preflight and export */

export interface PreflightOptions {
	/** Defaults to `project.targets`. */
	targets?: readonly DeviceId[];
	signal?: AbortSignal;
}
/** Everything wrong with a campaign before any full-size rendering, across frames and targets. */
export type Preflight = (project: ProjectV2, options?: PreflightOptions) => Promise<Issue[]>;

/** What an encoded PNG actually is, read from its bytes. */
export interface PngInspection {
	width: number;
	height: number;
	bitDepth: number;
	colorType: number;
}
export type InspectPng = (bytes: Uint8Array) => PngInspection;

export interface ExportManifestFile {
	/** Path inside the ZIP. */
	path: string;
	target: DeviceId;
	classId: DeviceClassId;
	width: number;
	height: number;
	slideId: string;
	slideIndex: number;
	sha256: string;
	/** Null only for a frame with no capture, such as an art-only frame. */
	source: {
		asset: AssetId;
		sha256?: string;
		compatibility: SourceCompatibilityLevel;
		nonNative?: { reason: string };
		provenance?: CaptureProvenance;
	} | null;
}

export interface ExportManifest {
	schema: 1;
	tool: 'appshot';
	/** ISO 8601. */
	createdAt: string;
	project: string;
	/** True whenever anything declared was left out. A partial set is never presented as whole. */
	partial: boolean;
	files: ExportManifestFile[];
	omitted: { target: DeviceId; slideIndex: number; reason: string }[];
}

export interface ExportMatrixOptions {
	/** Defaults to `project.targets`. */
	targets?: readonly DeviceId[];
	/** `store` (default) produces nothing while any `block` issue exists. `draft` labels output. */
	scope?: 'store' | 'draft';
	onProgress?: (progress: {
		done: number;
		total: number;
		target: DeviceId;
		slideIndex: number;
	}) => void;
	signal?: AbortSignal;
}

export type ExportMatrixResult =
	| { status: 'blocked'; issues: Issue[] }
	| { status: 'complete' | 'partial'; zip: Blob; manifest: ExportManifest; issues: Issue[] };

/** Every frame of every target, through `projectForTarget` and the one renderer. */
export type ExportMatrix = (
	project: ProjectV2,
	options?: ExportMatrixOptions
) => Promise<ExportMatrixResult>;

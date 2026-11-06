import { applyCheckPatch, CHECK_PANEL_ANCHOR } from './check';
import type {
	AssetId,
	ImageLayer,
	PanoramaVariant,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	SourceBinding,
	StoredPanorama,
	StoredSlide
} from './contracts';
import { isDeviceId, type DeviceId } from './devices';
import { documentsEqual } from '../editor/equal';
import { MAX_FRAMES } from './limits';
import type { LinenSettings } from './linen';
import { projectForTarget } from './targets';
import type { Composition, ImageRef, Slide } from './types';

/**
 * Every edit a stored campaign can receive, as pure functions: old document in, new document out,
 * input never mutated, and unchanged parts keep their identity. Each throws a user-readable Error
 * on an impossible request instead of quietly doing something else. Feed results to
 * `EditorStore.apply`, which adds undo, coalescing and autosave.
 *
 * Copy and treatment belong to the slide and reach every target. A target's source, placement and
 * layers belong to that target's variant, and writing one target never touches another.
 */

function omit<T extends object, K extends PropertyKey>(value: T, key: K): Omit<T, K> {
	const copy = { ...value } as T & Record<K, unknown>;
	delete copy[key];
	return copy;
}

/** Set one target's entry, or remove it when it holds nothing, keeping the map free of empties. */
function withVariant<T extends object>(
	variants: Partial<Record<DeviceId, T>> | undefined,
	targetId: DeviceId,
	variant: T
): Partial<Record<DeviceId, T>> | undefined {
	const others: Partial<Record<DeviceId, T>> = omit(variants ?? {}, targetId);
	const next = Object.keys(variant).length ? { ...others, [targetId]: variant } : others;
	return Object.keys(next).length ? next : undefined;
}

function withoutUndefined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function requireTarget(project: ProjectV2, targetId: DeviceId): void {
	if (!project.targets.includes(targetId))
		throw new Error(`"${targetId}" is not one of this campaign's outputs.`);
}

function requireAsset(project: ProjectV2, assetId: AssetId): ProjectAsset {
	if (!Object.hasOwn(project.assets, assetId))
		throw new Error('That image is not in this campaign. Add it first.');
	return project.assets[assetId];
}

function mapSlide(
	project: ProjectV2,
	slideId: string,
	change: (slide: StoredSlide) => StoredSlide
): ProjectV2 {
	if (!project.slides.some((slide) => slide.id === slideId))
		throw new Error('That frame is no longer in this campaign.');
	return {
		...project,
		slides: project.slides.map((slide) => (slide.id === slideId ? change(slide) : slide))
	};
}

/* ---------------------------------------------------------------------------- campaign identity */

/** The working title. Scenes print `appName`, and fall back to this only when it is unset. */
export function setWorkingTitle(project: ProjectV2, name: string): ProjectV2 {
	return { ...project, name };
}

/** The printed brand. Blank clears it, so scenes print the working title again. */
export function setAppName(project: ProjectV2, appName: string): ProjectV2 {
	return appName.trim() ? { ...project, appName } : omit(project, 'appName');
}

/* -------------------------------------------------------------------------------------- targets */

/** Declare an output. It starts with no sources: nothing is copied from another target. */
export function addTarget(project: ProjectV2, targetId: DeviceId): ProjectV2 {
	if (!isDeviceId(targetId)) throw new Error('That output size is not in the catalog.');
	if (project.targets.includes(targetId)) return project;
	return { ...project, targets: [...project.targets, targetId] };
}

/** Remove an output and everything stored for it. Its images stay in the library. */
export function removeTarget(project: ProjectV2, targetId: DeviceId): ProjectV2 {
	if (!project.targets.includes(targetId)) return project;
	if (project.targets.length === 1) throw new Error('A campaign needs at least one output size.');
	const without = <T extends object>(variants: Partial<Record<DeviceId, T>> | undefined) =>
		variants && withVariant(variants, targetId, {} as T);
	return {
		...project,
		targets: project.targets.filter((id) => id !== targetId),
		slides: project.slides.map((slide) =>
			withoutUndefined({ ...slide, variants: without(slide.variants) })
		),
		...(project.panorama
			? {
					panorama: withoutUndefined({
						...project.panorama,
						variants: without(project.panorama.variants)
					})
				}
			: {})
	};
}

/* -------------------------------------------------------------------------- shared slide fields */

/** Fields every target shares. `variants` has its own functions below. */
export type SharedSlidePatch = Partial<Omit<StoredSlide, 'id' | 'variants'>>;

/** Edit copy or treatment on every target at once. An undefined value clears an optional field. */
export function patchSlide(
	project: ProjectV2,
	slideId: string,
	patch: SharedSlidePatch
): ProjectV2 {
	return mapSlide(project, slideId, (slide) => withoutUndefined({ ...slide, ...patch }));
}

/* ----------------------------------------------------------------------- per-target slide fields */

/** Edit one target's settings. An undefined value removes that override, restoring the shared one. */
export function patchSlideVariant(
	project: ProjectV2,
	slideId: string,
	targetId: DeviceId,
	patch: Partial<SlideVariant>
): ProjectV2 {
	requireTarget(project, targetId);
	return mapSlide(project, slideId, (slide) => {
		const variant = withoutUndefined({ ...slide.variants?.[targetId], ...patch });
		return withoutUndefined({
			...slide,
			variants: withVariant(slide.variants, targetId, variant)
		});
	});
}

/** Show this capture on one target. It replaces any earlier choice and its accepted override. */
export function bindSource(
	project: ProjectV2,
	slideId: string,
	targetId: DeviceId,
	assetId: AssetId
): ProjectV2 {
	requireAsset(project, assetId);
	return patchSlideVariant(project, slideId, targetId, { source: { asset: assetId } });
}

export function unbindSource(project: ProjectV2, slideId: string, targetId: DeviceId): ProjectV2 {
	return patchSlideVariant(project, slideId, targetId, { source: undefined });
}

/**
 * A person accepts a blocked capture for drafts, with a reason, or withdraws that with `null`.
 * The output stays usable and can never read store-ready.
 */
export function setSourceOverride(
	project: ProjectV2,
	slideId: string,
	targetId: DeviceId,
	reason: string | null
): ProjectV2 {
	const slide = project.slides.find((candidate) => candidate.id === slideId);
	const source = slide?.variants?.[targetId]?.source;
	if (!source) throw new Error('Add a capture for this output first.');
	if (reason !== null && !reason.trim())
		throw new Error('Say why this capture is acceptable for a draft.');
	return patchSlideVariant(project, slideId, targetId, {
		source:
			reason === null ? { asset: source.asset } : { asset: source.asset, nonNative: { reason } }
	});
}

function requireLayerCrop(project: ProjectV2, layer: ImageLayer<AssetId>): void {
	const { naturalWidth, naturalHeight } = requireAsset(project, layer.image);
	const { x, y, width, height } = layer.crop;
	if (
		![x, y, width, height].every(Number.isInteger) ||
		x < 0 ||
		y < 0 ||
		width < 1 ||
		height < 1 ||
		x + width > naturalWidth ||
		y + height > naturalHeight
	)
		throw new Error('A layer crop must be whole pixels inside its image.');
	if (!(layer.scale > 0)) throw new Error('A layer needs a scale above zero.');
}

/** Replace one target's image layers, in paint order. */
export function setSlideLayers(
	project: ProjectV2,
	slideId: string,
	targetId: DeviceId,
	layers: readonly ImageLayer<AssetId>[]
): ProjectV2 {
	layers.forEach((layer) => requireLayerCrop(project, layer));
	if (new Set(layers.map((layer) => layer.id)).size !== layers.length)
		throw new Error('Each layer on a frame needs its own id.');
	return patchSlideVariant(project, slideId, targetId, {
		layers: layers.length ? [...layers] : undefined
	});
}

/* --------------------------------------------------------------------------------- frame order */

/** Insert a frame, at the end by default. */
export function addSlide(project: ProjectV2, slide: StoredSlide, index?: number): ProjectV2 {
	if (project.slides.length >= MAX_FRAMES)
		throw new Error(
			'A campaign can have up to 10 screenshots. Replace an existing image or remove a frame.'
		);
	if (project.slides.some((existing) => existing.id === slide.id))
		throw new Error('That frame is already in this campaign.');
	const slides = [...project.slides];
	slides.splice(index ?? slides.length, 0, slide);
	return { ...project, slides };
}

/** Copy a frame with every target's settings, keeping a connected pair adjacent. */
export function duplicateSlide(project: ProjectV2, slideId: string, newId: string): ProjectV2 {
	const index = project.slides.findIndex((slide) => slide.id === slideId);
	if (index < 0) throw new Error('That frame is no longer in this campaign.');
	const source = project.slides[index];
	return addSlide(
		project,
		{ ...source, id: newId, label: `${source.label ?? 'Screenshot'} copy` },
		index + (project.continuityMode === 'paired' && project.panorama?.leftId === slideId ? 2 : 1)
	);
}

export function removeSlide(project: ProjectV2, slideId: string): ProjectV2 {
	if (project.slides.length === 1) throw new Error('A campaign needs at least one screenshot.');
	if (!project.slides.some((slide) => slide.id === slideId))
		throw new Error('That frame is no longer in this campaign.');
	return { ...project, slides: project.slides.filter((slide) => slide.id !== slideId) };
}

export function moveSlide(project: ProjectV2, slideId: string, delta: number): ProjectV2 {
	const index = project.slides.findIndex((slide) => slide.id === slideId);
	if (index < 0) throw new Error('That frame is no longer in this campaign.');
	const destination = index + delta;
	if (destination < 0 || destination >= project.slides.length) return project;
	const slides = [...project.slides];
	const [moved] = slides.splice(index, 1);
	slides.splice(destination, 0, moved);
	return { ...project, slides };
}

/* ------------------------------------------------------------------------------- connected pair */

/** One target's panorama fields. An undefined value removes that override. */
export function patchPanoramaVariant(
	project: ProjectV2,
	targetId: DeviceId,
	patch: Partial<PanoramaVariant>
): ProjectV2 {
	requireTarget(project, targetId);
	if (!project.panorama) throw new Error('Connect two frames first.');
	const variant = withoutUndefined({ ...project.panorama.variants?.[targetId], ...patch });
	return {
		...project,
		panorama: withoutUndefined({
			...project.panorama,
			variants: withVariant(project.panorama.variants, targetId, variant)
		})
	};
}

/** The capture a connected pair shows on one target. */
export function bindPanoramaSource(
	project: ProjectV2,
	targetId: DeviceId,
	assetId: AssetId
): ProjectV2 {
	requireAsset(project, assetId);
	return patchPanoramaVariant(project, targetId, { source: { asset: assetId } });
}

/** Connect a frame to its right-hand neighbor. Each target still needs its own pair source. */
export function connectPair(
	project: ProjectV2,
	leftId: string,
	placement: Pick<StoredPanorama, 'offset' | 'scale' | 'tilt' | 'linenPhone'>
): ProjectV2 {
	const index = project.slides.findIndex((slide) => slide.id === leftId);
	const right = project.slides[index + 1];
	if (index < 0 || !right) throw new Error('Choose a frame with another frame to its right.');
	return {
		...project,
		continuityMode: 'paired',
		panorama: { leftId, rightId: right.id, ...placement }
	};
}

export function disconnectPair(project: ProjectV2): ProjectV2 {
	const pair = project.panorama;
	return {
		...omit(project, 'panorama'),
		continuityMode: 'none',
		slides: project.slides.map((slide) => {
			if (!pair || (slide.id !== pair.leftId && slide.id !== pair.rightId)) return slide;
			let variants = slide.variants;
			for (const target of project.targets) {
				const source = pair.variants?.[target]?.source;
				const ownSource = variants?.[target]?.source;
				// A pair's accepted reason still applies to the same capture after disconnecting.
				// Keep a frame's different capture or its more specific reason.
				if (
					source &&
					(!ownSource ||
						(ownSource.asset === source.asset && source.nonNative && !ownSource.nonNative))
				)
					variants = { ...variants, [target]: { ...variants?.[target], source } };
			}
			return variants === slide.variants ? slide : { ...slide, variants };
		})
	};
}

/* ----------------------------------------------------------------------------------- the library */

export interface AddedAssets {
	project: ProjectV2;
	/** The id each input ended up under, in order. Identical bytes share one id. */
	ids: AssetId[];
}

/**
 * Add images to the library. Identical bytes reuse the existing record, keeping whichever name and
 * provenance it already has and adding any it lacks. Binding them is a separate edit.
 */
export function addAssets(project: ProjectV2, assets: readonly ProjectAsset[]): AddedAssets {
	const next = { ...project.assets };
	const bySha = new Map(
		Object.values(next).flatMap((asset) =>
			asset.sha256 ? [[asset.sha256, asset.id] as const] : []
		)
	);
	let changed = false;
	const ids = assets.map((asset) => {
		const existing = asset.sha256 ? bySha.get(asset.sha256) : undefined;
		const id = existing ?? asset.id;
		const current = Object.hasOwn(next, id) ? next[id] : undefined;
		const merged = current ? { ...asset, ...current, id } : asset;
		if (!current || !documentsEqual(current, merged)) {
			next[id] = merged;
			changed = true;
		}
		if (asset.sha256) bySha.set(asset.sha256, id);
		return id;
	});
	return { project: changed ? { ...project, assets: next } : project, ids };
}

/** Each asset's number of uses across frames, layers and every target's pair. */
export function assetUsage(project: ProjectV2): Map<AssetId, number> {
	const usage = new Map<AssetId, number>(Object.keys(project.assets).map((id) => [id, 0]));
	const use = (id: AssetId | undefined) => {
		if (id !== undefined) usage.set(id, (usage.get(id) ?? 0) + 1);
	};
	for (const slide of project.slides) {
		for (const variant of Object.values(slide.variants ?? {})) {
			use(variant.source?.asset);
			variant.layers?.forEach((layer) => use(layer.image));
		}
	}
	for (const variant of Object.values(project.panorama?.variants ?? {})) use(variant.source?.asset);
	return usage;
}

/** Point references at other assets already in `project.assets`, after merging duplicates. */
export function rewriteAssetIds(
	project: ProjectV2,
	renames: ReadonlyMap<AssetId, AssetId>
): ProjectV2 {
	let result = project;
	for (const [from, to] of renames) {
		result = rewriteReferences(result, from, requireAsset(project, to), true);
	}
	return result;
}

/** Change every reference to an asset, or remove it when `next` is null. */
function rewriteReferences(
	project: ProjectV2,
	assetId: AssetId,
	next: ProjectAsset | null,
	sameImage = false
): ProjectV2 {
	// An accepted override was about the old image, so only the same bytes may keep it.
	const rebind = (source: SourceBinding, id: AssetId): SourceBinding =>
		sameImage ? { ...source, asset: id } : { asset: id };
	const slideVariant = (
		variant: SlideVariant,
		target: DeviceId,
		slide: StoredSlide
	): SlideVariant => {
		const rebound = { ...variant };
		if (variant.source?.asset === assetId) {
			if (next) rebound.source = rebind(variant.source, next.id);
			else delete rebound.source;
		}
		if (variant.layers?.some((layer) => layer.image === assetId)) {
			const layers = variant.layers.flatMap((layer) => {
				if (layer.image !== assetId) return [layer];
				if (!next) return [];
				const width = Math.min(layer.crop.width, next.naturalWidth - layer.crop.x);
				const height = Math.min(layer.crop.height, next.naturalHeight - layer.crop.y);
				return width >= 1 && height >= 1
					? [{ ...layer, image: next.id, crop: { ...layer.crop, width, height } }]
					: [];
			});
			if (layers.length) rebound.layers = layers;
			else delete rebound.layers;
		}
		const removedLayers = new Set(
			(variant.layers ?? [])
				.filter((layer) => !rebound.layers?.some((kept) => kept.id === layer.id))
				.map((layer) => layer.id)
		);
		const pair = project.continuityMode === 'paired' ? project.panorama : undefined;
		const pairSource =
			pair && (pair.leftId === slide.id || pair.rightId === slide.id)
				? pair.variants?.[target]?.source
				: undefined;
		const panelRemoved = !next && (pairSource ?? variant.source)?.asset === assetId;
		const settings = applyCheckPatch(slide.check, variant.check);
		const markRemoved =
			settings?.mark &&
			(removedLayers.has(settings.mark.anchor) ||
				(panelRemoved && settings.mark.anchor === CHECK_PANEL_ANCHOR));
		const tearRemoved = settings?.tear && removedLayers.has(settings.tear);
		if (markRemoved || tearRemoved)
			rebound.check = {
				...variant.check,
				...(markRemoved ? { mark: null } : {}),
				...(tearRemoved ? { tear: null } : {})
			};
		return rebound;
	};
	const panoramaVariant = (variant: PanoramaVariant): PanoramaVariant => {
		if (variant.source?.asset !== assetId) return variant;
		const rebound = { ...variant };
		if (next) rebound.source = rebind(variant.source, next.id);
		else delete rebound.source;
		return rebound;
	};
	const rewriteAll = <T extends object>(
		variants: Partial<Record<DeviceId, T>> | undefined,
		rewrite: (variant: T, target: DeviceId) => T
	) => {
		if (!variants) return undefined;
		const entries = Object.entries(variants)
			.map(([target, variant]) => [target, rewrite(variant as T, target as DeviceId)] as const)
			.filter(([, variant]) => Object.keys(variant).length);
		return entries.length
			? (Object.fromEntries(entries) as Partial<Record<DeviceId, T>>)
			: undefined;
	};
	return {
		...project,
		slides: project.slides.map((slide) => {
			// A pair can supply the panel even when the slide has no target variant of its own.
			const pair = project.panorama;
			const pairTargets =
				pair && (pair.leftId === slide.id || pair.rightId === slide.id)
					? Object.keys(pair.variants ?? {})
					: [];
			const variants = {
				...Object.fromEntries(pairTargets.map((target) => [target, {}])),
				...slide.variants
			};
			return withoutUndefined({
				...slide,
				variants: rewriteAll(variants, (variant, target) => slideVariant(variant, target, slide))
			});
		}),
		...(project.panorama
			? {
					panorama: withoutUndefined({
						...project.panorama,
						variants: rewriteAll(project.panorama.variants, panoramaVariant)
					})
				}
			: {})
	};
}

/** Take an image out of the campaign and unbind it everywhere. Frames then report no source. */
export function removeAsset(project: ProjectV2, assetId: AssetId): ProjectV2 {
	if (!Object.hasOwn(project.assets, assetId)) return project;
	const rewritten = rewriteReferences(project, assetId, null);
	return { ...rewritten, assets: omit(rewritten.assets, assetId) };
}

/**
 * Swap a capture everywhere it is used. Accepted overrides are cleared, since they were about the
 * old image, and a layer whose crop no longer fits the new image is trimmed or dropped.
 */
export function replaceAsset(project: ProjectV2, assetId: AssetId, next: ProjectAsset): ProjectV2 {
	requireAsset(project, assetId);
	const added = addAssets(project, [next]);
	const [newId] = added.ids;
	if (newId === assetId) return added.project;
	const rewritten = rewriteReferences(added.project, assetId, added.project.assets[newId]);
	return { ...rewritten, assets: omit(rewritten.assets, assetId) };
}

/* ---------------------------------------------------------------- edits made to a projected view */

const SHARED_SLIDE_KEYS = [
	'label',
	'badge',
	'background',
	'frame',
	'typography',
	'effects'
] as const;
const TARGET_SLIDE_KEYS = ['scale', 'tilt', 'fontScale', 'layout'] as const;

function assetIdOf(project: ProjectV2, image: ImageRef): AssetId {
	requireAsset(project, image.id);
	return image.id;
}

/** A new frame arrives from the single-target view: its copy is shared, its image is this target's. */
function storedFromProjected(project: ProjectV2, targetId: DeviceId, slide: Slide): StoredSlide {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- fields a stored slide does not have
	const { device, primaryImage, continuity, layers, ...shared } = slide;
	const variant: SlideVariant = {
		...(primaryImage ? { source: { asset: assetIdOf(project, primaryImage) } } : {}),
		...(layers?.length ? { layers: layers.map((layer) => storedLayer(project, layer)) } : {})
	};
	return {
		...shared,
		...(Object.keys(variant).length ? { variants: { [targetId]: variant } } : {})
	};
}

function storedLayer(project: ProjectV2, layer: ImageLayer): ImageLayer<AssetId> {
	return { ...layer, image: assetIdOf(project, layer.image) };
}

function reconcileLinen(
	stored: StoredSlide,
	variant: SlideVariant,
	before: Slide,
	after: Slide
): { shared?: LinenSettings; override?: Partial<LinenSettings> } {
	if (!after.linen) return {};
	if (!stored.linen) {
		// First Table Linen edit on this frame: its settings become the base every target shares.
		return { shared: after.linen };
	}
	const shared = { ...stored.linen };
	const override: Partial<LinenSettings> = { ...variant.linen };
	const write = <K extends keyof LinenSettings>(key: K, perTarget: boolean) => {
		if (documentsEqual(before.linen?.[key], after.linen![key])) return;
		const local = perTarget || Object.hasOwn(override, key);
		if (!local) {
			shared[key] = after.linen![key];
		} else if (documentsEqual(shared[key], after.linen![key])) {
			delete override[key];
		} else {
			override[key] = after.linen![key];
		}
	};
	// A frame's palette is part of the story. Its positions fit one display's shape.
	write('colors', false);
	write('band', false);
	write('layout', true);
	write('phone', true);
	return { shared, override };
}

function reconcileCheck(
	stored: StoredSlide,
	variant: SlideVariant,
	before: Slide,
	after: Slide
): Pick<StoredSlide, 'check'> & { override?: SlideVariant['check'] } {
	if (!after.check) return {};
	const { mark, tear, ...base } = after.check;
	const patch = { ...variant.check };
	// The first edit may already contain capture-pixel anchors. Only the unanchored settings
	// become the shared base, including when this target previously had settings of its own.
	const shared = stored.check ? { ...stored.check } : base;
	for (const key of ['canvas', 'preset', 'panel', 'wordmark'] as const) {
		if (before.check?.[key] === after.check[key]) continue;
		if (!Object.hasOwn(patch, key)) (shared[key] as unknown) = after.check[key];
		else (patch[key] as unknown) = after.check[key];
	}
	if (!documentsEqual(before.check?.mark, after.check.mark)) {
		// A pen mark's region is pixels of this target's capture, so it never reaches another target.
		patch.mark = after.check.mark ?? null;
	}
	// The torn edge points at this target's source-crop layer id, just like a pen mark's anchor.
	if (before.check?.tear !== after.check.tear) patch.tear = after.check.tear ?? null;
	const resolved = applyCheckPatch(shared, patch);
	return documentsEqual(resolved, after.check)
		? { check: shared, override: Object.keys(patch).length ? patch : undefined }
		: {
				check: base,
				override:
					mark || tear ? { ...(mark ? { mark } : {}), ...(tear ? { tear } : {}) } : undefined
			};
}

function reconcileSlide(
	project: ProjectV2,
	targetId: DeviceId,
	stored: StoredSlide,
	before: Slide,
	after: Slide
): StoredSlide {
	const next: StoredSlide = { ...stored };
	for (const key of SHARED_SLIDE_KEYS) {
		if (!documentsEqual(before[key], after[key])) (next[key] as unknown) = after[key];
	}
	const variant: SlideVariant = { ...stored.variants?.[targetId] };
	for (const key of TARGET_SLIDE_KEYS) {
		if (documentsEqual(before[key], after[key])) continue;
		if (documentsEqual(stored[key], after[key])) delete variant[key];
		else (variant[key] as unknown) = after[key];
	}
	if (before.primaryImage?.id !== after.primaryImage?.id) {
		if (after.primaryImage) variant.source = { asset: assetIdOf(project, after.primaryImage) };
		else delete variant.source;
	}
	if (!documentsEqual(before.layers, after.layers)) {
		if (after.layers?.length)
			variant.layers = after.layers.map((layer) => storedLayer(project, layer));
		else delete variant.layers;
	}
	if (!documentsEqual(before.linen, after.linen)) {
		const { shared, override } = reconcileLinen(stored, variant, before, after);
		if (shared) next.linen = shared;
		else delete next.linen;
		if (override && Object.keys(override).length) variant.linen = override;
		else delete variant.linen;
	}
	if (!documentsEqual(before.check, after.check)) {
		const { check, override } = reconcileCheck(stored, variant, before, after);
		if (check) next.check = check;
		else delete next.check;
		if (override) variant.check = override;
		else delete variant.check;
	}
	next.variants = withVariant(stored.variants, targetId, variant);
	return withoutUndefined(next);
}

function reconcilePanorama(
	project: ProjectV2,
	targetId: DeviceId,
	before: Composition,
	after: Composition
): Pick<ProjectV2, 'continuityMode'> & { panorama?: StoredPanorama } {
	const stored = project.panorama;
	const removed = before.panorama && !after.panorama;
	if (!after.panorama) {
		if (removed) return { continuityMode: 'none' };
		return {
			continuityMode:
				before.continuityMode === after.continuityMode
					? project.continuityMode
					: after.continuityMode,
			...(stored ? { panorama: stored } : {})
		};
	}
	const { image, leftId, rightId, offset, scale, tilt, linenPhone } = after.panorama;
	const samePair = stored?.leftId === leftId && stored?.rightId === rightId;
	// A different pair is a different picture, so other targets' placements do not carry over.
	const base: StoredPanorama = samePair
		? stored!
		: { leftId, rightId, offset, scale, tilt, ...(linenPhone ? { linenPhone } : {}) };
	const variant: PanoramaVariant = samePair ? { ...stored!.variants?.[targetId] } : {};
	const write = <K extends 'offset' | 'scale' | 'tilt' | 'linenPhone'>(
		key: K,
		value: StoredPanorama[K]
	) => {
		if (documentsEqual(base[key], value)) delete variant[key];
		else (variant[key] as unknown) = value;
	};
	write('offset', offset);
	write('scale', scale);
	write('tilt', tilt);
	write('linenPhone', linenPhone);
	if (before.panorama?.image.id !== image.id || !variant.source)
		variant.source = { asset: assetIdOf(project, image) };
	return {
		continuityMode: after.continuityMode,
		panorama: { ...base, variants: withVariant(base.variants, targetId, variant) }
	};
}

/**
 * Write an edit made to `projectForTarget(project, targetId)` back into the stored campaign, so
 * commands that edit a single-target document keep working on a multi-target one.
 *
 * Copy, frame treatment, palette, style and accent reach every target. Scale, tilt, type scale,
 * layout, positions, layers, images and pair placement stay on this target; other targets' stored
 * values are untouched. A changed `name` is the printed brand, so it updates `appName`.
 *
 * Holds this law: projecting the result gives back `edited`, except for `continuity`, which is
 * always `{ inset: 0 }`.
 */
export function applyProjectedEdit(
	project: ProjectV2,
	targetId: DeviceId,
	edited: Composition
): ProjectV2 {
	if (edited.device !== targetId)
		throw new Error('Switch outputs with the target selector, not by editing the document.');
	const before = projectForTarget(project, targetId);
	const stored = new Map(project.slides.map((slide) => [slide.id, slide]));
	const beforeSlides = new Map(before.slides.map((slide) => [slide.id, slide]));
	const slides = edited.slides.map((slide) => {
		const current = stored.get(slide.id);
		return current
			? reconcileSlide(project, targetId, current, beforeSlides.get(slide.id)!, slide)
			: storedFromProjected(project, targetId, slide);
	});
	return {
		...omit(project, 'panorama'),
		...(edited.name !== before.name ? { appName: edited.name } : {}),
		style: edited.style,
		accent: edited.accent,
		slides,
		...reconcilePanorama(project, targetId, before, edited)
	};
}

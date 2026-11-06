import { imageRefForAsset } from './assets';
import { sourceCompatibility } from './capture';
import { applyCheckPatch, defaultCheckSettings } from './check';
import type {
	ActiveTargets,
	AssetId,
	ImageLayer,
	Issue,
	ProjectForTarget,
	ProjectV2
} from './contracts';
import { DEVICES, type DeviceId } from './devices';
import { defaultLinenSettings, defaultLinenTheme } from './linen';
import { clearBrokenPanorama } from './project';
import type { Composition, ImageRef, Panorama, Slide } from './types';

/** Repairs a stored project after an edit, in `EditorStore`'s `normalize` slot. */
export const normalizeProjectV2: (project: ProjectV2) => ProjectV2 = clearBrokenPanorama;

export const activeTargets: ActiveTargets = (project) => project.targets.map((id) => DEVICES[id]);

function imageRef(project: ProjectV2, assetId: AssetId | undefined): ImageRef | undefined {
	if (assetId === undefined || !Object.hasOwn(project.assets, assetId)) return undefined;
	return imageRefForAsset(project.assets[assetId]);
}

/** Resolve a stored layer, keeping its crop inside the real source. */
function resolveLayer(project: ProjectV2, layer: ImageLayer<AssetId>): ImageLayer | null {
	const image = imageRef(project, layer.image);
	if (!image) return null;
	const x = Math.max(0, layer.crop.x);
	const y = Math.max(0, layer.crop.y);
	const width = Math.min(layer.crop.x + layer.crop.width, image.naturalWidth) - x;
	const height = Math.min(layer.crop.y + layer.crop.height, image.naturalHeight) - y;
	if (width < 1 || height < 1) return null;
	return { ...layer, image, crop: { x, y, width, height } };
}

/** See `ProjectForTarget` in `contracts.ts` for the rules this implements. */
export const projectForTarget: ProjectForTarget = (project, targetId) => {
	if (!project.targets.includes(targetId))
		throw new Error(`"${targetId}" is not one of this campaign's outputs.`);

	const count = project.slides.length;
	const left = project.panorama
		? project.slides.findIndex((slide) => slide.id === project.panorama!.leftId)
		: -1;
	const pair = left >= 0 && project.continuityMode === 'paired' ? [left, left + 1] : [];

	const slides = project.slides.map((slide, index): Slide => {
		const { variants, ...shared } = slide;
		const variant = variants?.[targetId];
		const primaryImage = imageRef(project, variant?.source?.asset);
		const layers = variant?.layers?.flatMap((layer) => resolveLayer(project, layer) ?? []);
		const linen = variant?.linen
			? {
					...(shared.linen ?? defaultLinenSettings(defaultLinenTheme(index, count, pair))),
					...variant.linen
				}
			: shared.linen;
		const check = applyCheckPatch(shared.check, variant?.check, () =>
			defaultCheckSettings(index, count)
		);
		return {
			...shared,
			device: targetId,
			continuity: { inset: 0 },
			...(primaryImage ? { primaryImage } : {}),
			...(variant?.scale !== undefined ? { scale: variant.scale } : {}),
			...(variant?.tilt !== undefined ? { tilt: variant.tilt } : {}),
			...(variant?.fontScale !== undefined ? { fontScale: variant.fontScale } : {}),
			...(variant?.layout !== undefined ? { layout: variant.layout } : {}),
			...(linen ? { linen } : {}),
			...(check ? { check } : {}),
			...(layers?.length ? { layers } : {})
		};
	});

	let panorama: Panorama | undefined;
	if (project.panorama) {
		const { variants, ...placement } = project.panorama;
		const variant = variants?.[targetId];
		const image = imageRef(project, variant?.source?.asset);
		if (image) {
			const linenPhone = variant?.linenPhone ?? placement.linenPhone;
			panorama = {
				leftId: placement.leftId,
				rightId: placement.rightId,
				image,
				offset: variant?.offset ?? placement.offset,
				scale: variant?.scale ?? placement.scale,
				tilt: variant?.tilt ?? placement.tilt,
				...(linenPhone ? { linenPhone } : {})
			};
		}
	}

	const composition: Composition = {
		version: 1,
		name: project.appName ?? project.name,
		device: targetId,
		style: project.style,
		accent: project.accent,
		continuityMode: panorama ? project.continuityMode : 'none',
		slides
	};
	return panorama ? { ...composition, panorama } : composition;
};

/**
 * Every frame's source for each output: what is missing, and how each bound capture relates to its
 * output. `block` findings keep a campaign from reading store-ready; a `nonNative` override stays a
 * `block` because it is usable as a draft only. Size checks prove size, never native device UI.
 */
export function sourceIssues(
	project: ProjectV2,
	targets: readonly DeviceId[] = project.targets
): Issue[] {
	const issues: Issue[] = [];
	for (const targetId of targets) {
		const target = DEVICES[targetId];
		project.slides.forEach((slide, slideIndex) => {
			const where = { target: targetId, slideIndex };
			const frame = `Frame ${slideIndex + 1}`;
			const panorama =
				project.continuityMode === 'paired' &&
				project.panorama &&
				(project.panorama.leftId === slide.id || project.panorama.rightId === slide.id)
					? project.panorama.variants?.[targetId]?.source
					: undefined;
			const binding = panorama ?? slide.variants?.[targetId]?.source;
			if (!binding) {
				issues.push({
					...where,
					severity: 'block',
					code: 'missing-source',
					message: `${frame} has no capture for ${target.label}. Add one from this display; another display's capture is not used in its place.`
				});
				return;
			}
			if (!Object.hasOwn(project.assets, binding.asset)) {
				issues.push({
					...where,
					severity: 'block',
					code: 'missing-asset',
					message: `${frame}'s capture for ${target.label} is no longer in this campaign. Add it again.`
				});
				return;
			}
			const asset = project.assets[binding.asset];
			if (binding.nonNative) {
				issues.push({
					...where,
					severity: 'block',
					code: 'non-native-source',
					message: `${frame} uses a capture accepted for drafts only on ${target.label}: "${binding.nonNative.reason}". It can never read store-ready.`
				});
			} else {
				const compatibility = sourceCompatibility(asset, target);
				if (compatibility.severity !== 'ok')
					issues.push({
						...where,
						severity: compatibility.severity,
						code: compatibility.level,
						message: `${frame}: ${compatibility.message}`
					});
			}
			if (asset.provenance?.synthetic)
				issues.push({
					...where,
					severity: 'block',
					code: 'synthetic-source',
					message: `${frame}'s capture for ${target.label} is synthetic, so it is for layout checks only and can never read store-ready.`
				});
		});
	}
	return issues;
}

import { checkPairPanel } from '../model/check';
import { DEVICES } from '../model/devices';
import { linenPhoneBox, linenScale, resolveSharedLinenPhone } from '../model/linen';
import type { Composition, Slide } from '../model/types';

export interface PhoneGeometry {
	centerX: number;
	centerY: number;
	width: number;
	height: number;
	rotation: number;
}

export interface PanoramaGeometry {
	leftIndex: number;
	rightIndex: number;
	panelWidth: number;
	panelHeight: number;
	worldWidth: number;
	viewportX: number;
	phone: PhoneGeometry;
}

const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const positiveWhole = (value: unknown) =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Rotated half-height of a phone: how far it reaches above and below its center. */
function halfExtent(phone: PhoneGeometry): number {
	return (
		(Math.abs(Math.cos(phone.rotation)) * phone.height) / 2 +
		(Math.abs(Math.sin(phone.rotation)) * phone.width) / 2
	);
}

/**
 * The band a sample style reserves for its copy. Pure, so the shared phone can stay clear of the
 * copy of both frames before any text is measured. The wordmark sits at a fixed distance from the
 * top in width units, so a short landscape frame must start its copy below it.
 */
export function classicCopyBand(slide: Slide, width: number, height: number) {
	const below = slide.layout === 'text-below';
	const badge = slide.badge?.trim();
	const badgeY = below ? height * 0.666 : Math.max(height * 0.099, width * 0.148);
	const titleY = badgeY + (badge ? width * 0.075 : 0);
	return { below, badgeY, titleY, top: below ? badgeY : titleY };
}

/**
 * Keep a sample style's phone clear of its copy: marketing text never lands on app UI. The phone
 * moves along the axis the layout already crops on, and is untouched when it was already clear.
 */
export function clearClassicCopy(
	phone: PhoneGeometry,
	slides: readonly Slide[],
	width: number,
	height: number
): PhoneGeometry {
	const clearance = width * 0.035;
	const extent = halfExtent(phone);
	let centerY = phone.centerY;
	for (const slide of slides) {
		const band = classicCopyBand(slide, width, height);
		if (band.below) centerY = Math.min(centerY, band.top - clearance - extent);
		else centerY = Math.max(centerY, band.titleY + height * 0.14 + clearance + extent);
	}
	return centerY === phone.centerY ? phone : { ...phone, centerY };
}

/**
 * Canonical two-panel world. Both exported panels draw this exact world and
 * differ ONLY in viewportX; neither the phone nor backdrop is laid out twice.
 * offset is measured in export pixels, scale is a multiplier, tilt is degrees.
 */
export function computePanoramaGeometry(
	composition: Composition,
	slideIndex: number
): PanoramaGeometry | null {
	const panorama = composition.panorama;
	if (composition.continuityMode !== 'paired' || !panorama) return null;
	if (!Number.isSafeInteger(slideIndex)) return null;
	const leftIndex = composition.slides.findIndex((slide) => slide.id === panorama.leftId);
	const rightIndex = composition.slides.findIndex((slide) => slide.id === panorama.rightId);
	if (leftIndex < 0 || rightIndex !== leftIndex + 1) return null;
	if (slideIndex !== leftIndex && slideIndex !== rightIndex) return null;
	const leftSlide = composition.slides[leftIndex];
	const rightSlide = composition.slides[rightIndex];
	if (leftSlide.id === rightSlide.id) return null;
	// Both exports crop one world, so they must have one size and draw one real bitmap.
	if (
		!Object.hasOwn(DEVICES, composition.device) ||
		!Object.hasOwn(DEVICES, leftSlide.device) ||
		!Object.hasOwn(DEVICES, rightSlide.device)
	)
		return null;
	const leftPanel = DEVICES[leftSlide.device];
	const rightPanel = DEVICES[rightSlide.device];
	if (leftPanel.width !== rightPanel.width || leftPanel.height !== rightPanel.height) return null;
	if (
		!positiveWhole(panorama.image.naturalWidth) ||
		!positiveWhole(panorama.image.naturalHeight) ||
		!panorama.image.blobUrl
	)
		return null;
	const { width, height } = DEVICES[composition.device];
	if (composition.style === 'the-check') {
		const panel = checkPairPanel(width, height, panorama.image, {
			offset: panorama.offset,
			scale: panorama.scale,
			tilt: panorama.tilt,
			frame: leftSlide.frame
		});
		return {
			leftIndex,
			rightIndex,
			panelWidth: width,
			panelHeight: height,
			worldWidth: width * 2,
			viewportX: slideIndex === leftIndex ? 0 : width,
			phone: {
				centerX: panel.x + panel.width / 2,
				centerY: panel.y + panel.height / 2,
				width: panel.width,
				height: panel.height,
				rotation: panel.rotation
			}
		};
	}
	if (composition.style === 'table-linen') {
		// Table Linen owns explicit reference-pixel geometry; legacy offset/scale/tilt are
		// not applied so an imported campaign renders exactly as its manifest describes.
		const box = linenPhoneBox(
			resolveSharedLinenPhone(composition),
			panorama.image,
			linenScale(width, height)
		);
		return {
			leftIndex,
			rightIndex,
			panelWidth: width,
			panelHeight: height,
			worldWidth: width * 2,
			viewportX: slideIndex === leftIndex ? 0 : width,
			phone: {
				centerX: box.centerX,
				centerY: box.centerY,
				width: box.shellWidth,
				height: box.shellHeight,
				rotation: box.rotation
			}
		};
	}
	const below = leftSlide.layout === 'text-below';
	const phoneWidth = width * (below ? 0.68 : 0.78) * clamp(finite(panorama.scale, 1), 0.45, 1.8);
	const bezel =
		leftSlide.frame === 'none' ? 0 : phoneWidth * (leftSlide.frame === 'clay' ? 0.035 : 0.022);
	const phoneHeight =
		(phoneWidth - bezel * 2) * (panorama.image.naturalHeight / panorama.image.naturalWidth) +
		bezel * 2;
	return {
		leftIndex,
		rightIndex,
		panelWidth: width,
		panelHeight: height,
		worldWidth: width * 2,
		viewportX: slideIndex === leftIndex ? 0 : width,
		phone: clearClassicCopy(
			{
				centerX: width + clamp(finite(panorama.offset, 0), -width * 0.65, width * 0.65),
				centerY: height * (below ? 0.295 : 0.705),
				width: phoneWidth,
				height: phoneHeight,
				rotation: (clamp(finite(panorama.tilt, 0), -45, 45) * Math.PI) / 180
			},
			[leftSlide, rightSlide],
			width,
			height
		)
	};
}

/** Convert a phone-local point to a particular panel's coordinates. */
export function panoramaPointToSlide(geometry: PanoramaGeometry, x: number, y: number) {
	const { phone } = geometry;
	return {
		x:
			phone.centerX +
			x * Math.cos(phone.rotation) -
			y * Math.sin(phone.rotation) -
			geometry.viewportX,
		y: phone.centerY + x * Math.sin(phone.rotation) + y * Math.cos(phone.rotation)
	};
}

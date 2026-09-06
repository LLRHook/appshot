import { DEVICES } from '../model/devices';
import { linenPhoneBox, linenScale, resolveSharedLinenPhone } from '../model/linen';
import type { Composition } from '../model/types';

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
	const leftIndex = composition.slides.findIndex((slide) => slide.id === panorama.leftId);
	const rightIndex = composition.slides.findIndex((slide) => slide.id === panorama.rightId);
	if (leftIndex < 0 || rightIndex !== leftIndex + 1) return null;
	if (slideIndex !== leftIndex && slideIndex !== rightIndex) return null;
	if (
		![panorama.image.naturalWidth, panorama.image.naturalHeight].every(
			(value) => Number.isFinite(value) && value > 0
		)
	)
		return null;
	const { width, height } = DEVICES[composition.device];
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
	const leftSlide = composition.slides[leftIndex];
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
		phone: {
			centerX: width + clamp(finite(panorama.offset, 0), -width * 0.65, width * 0.65),
			centerY: height * (below ? 0.295 : 0.705),
			width: phoneWidth,
			height: phoneHeight,
			rotation: (clamp(finite(panorama.tilt, 0), -45, 45) * Math.PI) / 180
		}
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

import { assetIdForHash, sha256Hex, type AssetMime } from './assets';
import type {
	AspectFamily,
	CaptureClassification,
	CheckSourceCompatibility,
	ClassifyCapture,
	DeviceClassId,
	OutputTarget,
	ProjectAsset,
	SourceCompatibility,
	SourceDimensions
} from './contracts';
import { OUTPUT_TARGETS, TARGET_CLASSES } from './devices';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from './image';

/**
 * What a capture file really is: format from its bytes, size from decoding it, and how that size
 * relates to Apple's display classes. All of this proves the file's size, not that it shows native
 * UI from that device; a resized capture can have an exact size and still be the wrong screen.
 */

/* --------------------------------------------------------------------------- classification */

const TARGETS_BY_SIZE = new Map<string, OutputTarget[]>();
for (const target of OUTPUT_TARGETS) {
	const key = `${target.width}x${target.height}`;
	TARGETS_BY_SIZE.set(key, [...(TARGETS_BY_SIZE.get(key) ?? []), target]);
}

/** The aspect family of a size, by short side over long side. Null when no family is close. */
export function aspectFamilyOf(width: number, height: number): AspectFamily | null {
	if (!(width > 0) || !(height > 0)) return null;
	const ratio = Math.min(width, height) / Math.max(width, height);
	if (ratio < 0.44 || ratio > 0.8) return null;
	if (width > height) return ratio < 0.6 ? 'phone-landscape' : 'wide-landscape';
	if (ratio < 0.6) return 'phone-tall';
	return ratio < 0.725 ? 'duo-portrait' : 'tablet-portrait';
}

export const classifyCapture: ClassifyCapture = (width, height) => {
	const matches = TARGETS_BY_SIZE.get(`${width}x${height}`) ?? [];
	const posture = matches.find((target) => target.posture)?.posture;
	const classification: CaptureClassification = {
		classIds: matches.map((target) => target.classId),
		orientation: width > height ? 'landscape' : width < height ? 'portrait' : 'square',
		aspectFamily: aspectFamilyOf(width, height),
		...(posture ? { posture } : {})
	};
	return classification;
};

/* ------------------------------------------------------------------------ source compatibility */

/** Enlarging a little is invisible; past this it is reported. */
const UPSCALE_WARN = 1.05;
/** Past this each source pixel covers more than four output pixels, and the UI visibly softens. */
const UPSCALE_BLOCK = 2;
/** Sizes of one class closer than this in shape place with no visible crop. */
const SAME_SHAPE = 0.01;
/** An unlisted size further than this from the target's shape cannot be a capture of that screen. */
const UNKNOWN_SHAPE = 0.1;

const describe = (width: number, height: number) => `${width} × ${height}`;

const classNames = (classIds: readonly DeviceClassId[]) =>
	[...new Set(classIds)].map((id) => TARGET_CLASSES[id].label).join(' and ');

const captureAdvice = (target: OutputTarget) => {
	const { devices } = TARGET_CLASSES[target.classId];
	const display = target.posture ? ` on its ${target.posture} display` : '';
	return `Add a ${target.orientation} capture from ${devices[0]}${display}.`;
};

/**
 * How a capture relates to one output, most serious finding first. Exact size is `native`, but
 * that means size only; a person can accept a blocking result with a reason (`nonNative`), which
 * keeps output usable as a draft and never store-ready.
 */
export const sourceCompatibility: CheckSourceCompatibility = (source, target, placedWidthPx) => {
	const width = source.naturalWidth;
	const height = source.naturalHeight;
	const placed =
		placedWidthPx !== undefined && Number.isFinite(placedWidthPx) && placedWidthPx > 0
			? placedWidthPx
			: undefined;
	const upscale = placed !== undefined ? placed / width : undefined;
	const result = (
		level: SourceCompatibility['level'],
		severity: SourceCompatibility['severity'],
		message: string
	): SourceCompatibility => ({
		level,
		severity,
		...(upscale !== undefined ? { upscale } : {}),
		message
	});

	if (!(width > 0) || !(height > 0))
		return result('unknown', 'block', `This image has no usable size. ${captureAdvice(target)}`);

	const size = describe(width, height);
	const found = classifyCapture(width, height);
	const wrongOrientation = () =>
		result(
			'wrong-orientation',
			'block',
			`This ${found.orientation} ${size} capture does not fit the ${target.orientation} ${target.label} output. ${captureAdvice(target)}`
		);

	if (found.classIds.length && !found.classIds.includes(target.classId))
		return result(
			'wrong-class',
			'block',
			`This ${size} capture is from ${classNames(found.classIds)}, not ${TARGET_CLASSES[target.classId].label}. Another display's screen must not stand in for this one. ${captureAdvice(target)}`
		);
	if (found.classIds.length && target.posture && found.posture !== target.posture)
		return result(
			'wrong-class',
			'block',
			`This ${size} capture is from the iPhone Duo ${found.posture} display, not its ${target.posture} display. The two show different UI. ${captureAdvice(target)}`
		);
	if (found.orientation !== 'square' && found.orientation !== target.orientation)
		return wrongOrientation();

	const shapeDifference = Math.abs(width / height / (target.width / target.height) - 1);
	const inClass = found.classIds.length > 0;
	if (!inClass && shapeDifference > UNKNOWN_SHAPE) {
		return found.aspectFamily
			? result(
					'wrong-class',
					'block',
					`This ${size} capture is not an accepted App Store size, and its shape does not match the ${target.label} display. ${captureAdvice(target)}`
				)
			: result(
					'unknown',
					'block',
					`This ${size} image is not shaped like any device screen, so it cannot show the ${target.label} display. ${captureAdvice(target)}`
				);
	}

	const enlargement = upscale ?? target.width / width;
	if (enlargement > UPSCALE_BLOCK)
		return result(
			'upscaled',
			'block',
			`This ${size} capture is too small: it would be enlarged ${enlargement.toFixed(1)}× and look soft. ${captureAdvice(target)}`
		);
	if (upscale !== undefined && upscale > UPSCALE_WARN)
		return result(
			'upscaled',
			'warn',
			`This ${size} capture is placed ${upscale.toFixed(2)}× larger than its pixels, so its UI will look slightly soft.`
		);

	if (width === target.width && height === target.height)
		return result(
			'native',
			'ok',
			`${size} is the exact ${target.label} size. Size alone does not prove it shows native UI from this device.`
		);
	if (inClass)
		return shapeDifference <= SAME_SHAPE
			? result(
					'same-class',
					'ok',
					`${size} is another accepted ${TARGET_CLASSES[target.classId].label} size, so it will be resampled to fit.`
				)
			: result(
					'same-class',
					'warn',
					`${size} is another accepted ${TARGET_CLASSES[target.classId].label} size, but its shape differs by ${(shapeDifference * 100).toFixed(1)}%, so part of it may be cropped.`
				);
	return result(
		'unknown',
		'warn',
		`${size} is not an accepted App Store size, so this source cannot be verified. Use an unedited capture from the device.`
	);
};

/* ------------------------------------------------------------------------------ format sniffing */

export interface SniffedImage {
	mime: AssetMime;
	/** Read from the file header, before decoding. Null if the header could not be parsed. */
	width: number | null;
	height: number | null;
	/** Whether the PNG format itself has an alpha channel. False for JPEG; null for WebP. */
	hasAlpha: boolean | null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
	return signature.every((value, index) => bytes[offset + index] === value);
}

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

function sniffPng(bytes: Uint8Array): SniffedImage {
	const valid = bytes.length >= 26 && startsWith(bytes, ascii('IHDR'), 12);
	if (!valid) return { mime: 'image/png', width: null, height: null, hasAlpha: null };
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const colorType = bytes[25];
	return {
		mime: 'image/png',
		width: view.getUint32(16),
		height: view.getUint32(20),
		hasAlpha: colorType === 4 || colorType === 6
	};
}

/** Walk JPEG segments to the frame header. Non-frame SOF codes are huffman and arithmetic tables. */
function sniffJpeg(bytes: Uint8Array): SniffedImage {
	const unknown: SniffedImage = { mime: 'image/jpeg', width: null, height: null, hasAlpha: false };
	let offset = 2;
	while (offset + 9 <= bytes.length) {
		if (bytes[offset] !== 0xff) return unknown;
		const marker = bytes[offset + 1];
		if (marker === 0xff) {
			offset++;
			continue;
		}
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return {
				mime: 'image/jpeg',
				height: (bytes[offset + 5] << 8) | bytes[offset + 6],
				width: (bytes[offset + 7] << 8) | bytes[offset + 8],
				hasAlpha: false
			};
		}
		if (marker === 0xd9 || marker === 0xda) return unknown;
		offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
	}
	return unknown;
}

function sniffWebp(bytes: Uint8Array): SniffedImage {
	const unknown: SniffedImage = { mime: 'image/webp', width: null, height: null, hasAlpha: null };
	const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
	if (startsWith(bytes, ascii('VP8X'), 12) && bytes.length >= 30)
		return { ...unknown, width: u24(24) + 1, height: u24(27) + 1 };
	if (startsWith(bytes, ascii('VP8L'), 12) && bytes.length >= 25 && bytes[20] === 0x2f) {
		const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
		return { ...unknown, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (
		startsWith(bytes, ascii('VP8 '), 12) &&
		bytes.length >= 30 &&
		startsWith(bytes, [0x9d, 0x01, 0x2a], 23)
	)
		return {
			...unknown,
			width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
			height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
		};
	return unknown;
}

/** What a file's own bytes say it is, whatever its name or claimed type. Null if unsupported. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
	if (startsWith(bytes, PNG_SIGNATURE)) return sniffPng(bytes);
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return sniffJpeg(bytes);
	if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8))
		return sniffWebp(bytes);
	return null;
}

/* -------------------------------------------------------------------------------- reading files */

export type CaptureRejection =
	| 'too-large'
	| 'unsupported-format'
	| 'too-many-pixels'
	| 'undecodable'
	| 'unreadable';

/** One file that could not be used. `message` names the file and says what to do. */
export class CaptureError extends Error {
	readonly code: CaptureRejection;
	readonly fileName: string;
	constructor(code: CaptureRejection, fileName: string, message: string) {
		super(message);
		this.name = 'CaptureError';
		this.code = code;
		this.fileName = fileName;
	}
}

export interface CaptureFile extends SourceDimensions {
	name: string;
	/** Carries the sniffed MIME type, whatever the file claimed. */
	blob: Blob;
	mime: AssetMime;
	sha256: string;
	byteLength: number;
	classification: CaptureClassification;
	/** The file's name or claimed type disagreed with its bytes. */
	mislabeled: boolean;
	/** Worth showing whether or not a target is known. Each names the file. */
	notes: string[];
	/** How it relates to `options.target`, when one was given. */
	compatibility?: SourceCompatibility;
}

export interface ReadCaptureOptions {
	/** Decodes the real image and reports its size. Defaults to the browser's image decoder. */
	decode?: (blob: Blob) => Promise<{ width: number; height: number }>;
	/** Report how each capture relates to this output. */
	target?: OutputTarget;
	/** Pixels wide the capture will be placed at, for the enlargement check. */
	placedWidthPx?: number;
}

async function decodeInBrowser(blob: Blob): Promise<{ width: number; height: number }> {
	const url = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return { width: image.naturalWidth, height: image.naturalHeight };
	} finally {
		URL.revokeObjectURL(url);
	}
}

const EXTENSION_MIMES: Record<string, AssetMime> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp'
};

const FORMAT_NAMES: Record<AssetMime, string> = {
	'image/png': 'PNG',
	'image/jpeg': 'JPEG',
	'image/webp': 'WebP'
};

function fitsImageLimits(width: number, height: number): boolean {
	return width <= MAX_IMAGE_SIDE && height <= MAX_IMAGE_SIDE && width * height <= MAX_IMAGE_PIXELS;
}

/**
 * Read one screenshot file: real format from its bytes, real size from decoding it. A JPEG named
 * `.png` is accepted as the JPEG it is, and noted. Every failure is a `CaptureError` naming the file.
 */
export async function readCapture(
	file: File,
	options: ReadCaptureOptions = {}
): Promise<CaptureFile> {
	const { name } = file;
	if (file.size > MAX_IMAGE_BYTES)
		throw new CaptureError('too-large', name, `${name} is too large. Choose an image under 12 MB.`);
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = new Uint8Array(await file.arrayBuffer());
	} catch {
		throw new CaptureError(
			'unreadable',
			name,
			`${name} could not be read. Try selecting it again.`
		);
	}
	const sniffed = sniffImage(bytes);
	if (!sniffed)
		throw new CaptureError(
			'unsupported-format',
			name,
			`${name} is not a real image file Appshot can use. Choose a PNG, JPG, or WebP screenshot.`
		);
	const tooManyPixels = () =>
		new CaptureError(
			'too-many-pixels',
			name,
			`${name} is too large. Choose a screenshot under 24 megapixels, with each side under 8000 pixels.`
		);
	// Checked from the header first, so an oversized image is refused without being decoded.
	if (sniffed.width !== null && sniffed.height !== null) {
		if (!fitsImageLimits(sniffed.width, sniffed.height)) throw tooManyPixels();
	}
	const { mime } = sniffed;
	const blob = new Blob([bytes], { type: mime });
	let decoded: { width: number; height: number };
	try {
		decoded = await (options.decode ?? decodeInBrowser)(blob);
	} catch {
		throw new CaptureError(
			'undecodable',
			name,
			`${name} looks like a ${FORMAT_NAMES[mime]} but could not be opened. It may be damaged; export it again from the device.`
		);
	}
	if (!(decoded.width > 0) || !(decoded.height > 0))
		throw new CaptureError(
			'undecodable',
			name,
			`${name} looks like a ${FORMAT_NAMES[mime]} but has no pixels. Export it again from the device.`
		);
	if (!fitsImageLimits(decoded.width, decoded.height)) throw tooManyPixels();

	const extension = name.toLowerCase().split('.').pop() ?? '';
	const namedMime = name.includes('.') ? EXTENSION_MIMES[extension] : undefined;
	const claimedMime = Object.values(EXTENSION_MIMES).includes(file.type as AssetMime);
	const mislabeled =
		(namedMime !== undefined && namedMime !== mime) || (claimedMime && file.type !== mime);
	const classification = classifyCapture(decoded.width, decoded.height);
	const notes: string[] = [];
	if (mislabeled)
		notes.push(`${name} is really a ${FORMAT_NAMES[mime]}. It was kept as one, unchanged.`);
	if (!classification.classIds.length)
		notes.push(
			`${name} is ${describe(decoded.width, decoded.height)}, which is not an accepted App Store size.`
		);
	return {
		name,
		blob,
		mime,
		sha256: await sha256Hex(bytes),
		byteLength: bytes.byteLength,
		naturalWidth: decoded.width,
		naturalHeight: decoded.height,
		classification,
		mislabeled,
		notes,
		...(options.target
			? {
					compatibility: sourceCompatibility(
						{ naturalWidth: decoded.width, naturalHeight: decoded.height },
						options.target,
						options.placedWidthPx
					)
				}
			: {})
	};
}

export interface RejectedCapture {
	name: string;
	code: CaptureRejection;
	/** Names the file and says what to do. */
	message: string;
}

export interface CaptureBatch {
	accepted: CaptureFile[];
	rejected: RejectedCapture[];
}

/** Read several files in order, one at a time. A bad file is reported and the rest still load. */
export async function readCaptures(
	files: Iterable<File>,
	options: ReadCaptureOptions = {}
): Promise<CaptureBatch> {
	const batch: CaptureBatch = { accepted: [], rejected: [] };
	for (const file of files) {
		try {
			batch.accepted.push(await readCapture(file, options));
		} catch (error) {
			batch.rejected.push(
				error instanceof CaptureError
					? { name: error.fileName, code: error.code, message: error.message }
					: {
							name: file.name,
							code: 'unreadable',
							message: `${file.name} could not be read. Try selecting it again.`
						}
			);
		}
	}
	return batch;
}

/** The project record for a capture whose bytes now live at `url`. */
export function assetFromCapture(capture: CaptureFile, url: string): ProjectAsset {
	return {
		id: assetIdForHash(capture.sha256),
		sha256: capture.sha256,
		mime: capture.mime,
		byteLength: capture.byteLength,
		url,
		naturalWidth: capture.naturalWidth,
		naturalHeight: capture.naturalHeight,
		name: capture.name
	};
}

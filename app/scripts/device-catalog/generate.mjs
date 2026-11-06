// Generates src/lib/model/device-catalog.generated.ts from the verified Apple spec data beside
// this file. Run `node scripts/device-catalog/generate.mjs` after changing device-specs.json.
//
// device-specs.json is a machine-checked table of Apple's screenshot page (accessed 2026-11-05:
// 62 sizes, 14 classes), holding only what Apple publishes plus notes on reading that page.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const here = path.dirname(fileURLToPath(import.meta.url));
const SPECS = path.join(here, 'device-specs.json');
const OUTPUT = path.resolve(here, '../../src/lib/model/device-catalog.generated.ts');

/**
 * The three ids existing projects already use. Their sizes must not move: `iphone-6.7` is the
 * historical key for Apple's 1284×2778 upload class, despite the name.
 */
const LEGACY_IDS = {
	'iphone-di-large/1320x2868': { id: 'iphone-6.9', label: 'iPhone 6.9"' },
	'iphone-faceid-large/1284x2778': { id: 'iphone-6.7', label: 'iPhone 6.5"' },
	'ipad-13/2064x2752': { id: 'ipad-13', label: 'iPad 13"' }
};

/** Appshot's short names; Apple's wording stays in `appleLabel`. */
const CLASS_LABELS = {
	'iphone-duo': 'iPhone Duo',
	'iphone-di-large': 'iPhone Dynamic Island, large',
	'iphone-faceid-large': 'iPhone Face ID, large',
	'iphone-di-medium': 'iPhone Dynamic Island, medium',
	'iphone-faceid-medium': 'iPhone Face ID, medium',
	'iphone-home-large': 'iPhone Home Button, large',
	'iphone-home-medium': 'iPhone Home Button, medium',
	'iphone-home-4in': 'iPhone Home Button, 4"',
	'iphone-home-3.5in': 'iPhone Home Button, 3.5"',
	'ipad-13': 'iPad 13"',
	'ipad-12.9': 'iPad 12.9"',
	'ipad-11': 'iPad 11"',
	'ipad-10.5': 'iPad 10.5"',
	'ipad-9.7': 'iPad 9.7"'
};

const STATUSES = {
	'future-required': 'future',
	required: 'required',
	'required-if-ipad': 'required-if-ipad',
	conditional: 'conditional',
	optional: 'optional'
};

/** Measured hardware exists only for this size. Other targets stay frameless, never borrowed. */
const FRAME_PROFILES = { 'iphone-6.9': 'iphone-17-pro-max' };

/** Same bands as `aspectFamilyOf` in `capture.ts`; `catalog.spec.ts` holds the two together. */
function layoutFamily(width, height) {
	const ratio = Math.min(width, height) / Math.max(width, height);
	if (width > height) return ratio < 0.6 ? 'phone-landscape' : 'wide-landscape';
	if (ratio < 0.6) return 'phone-tall';
	return ratio < 0.725 ? 'duo-portrait' : 'tablet-portrait';
}

function postureOf(size) {
	if (size.note === 'outer display') return 'outer';
	if (size.note === 'inner display') return 'inner';
	return undefined;
}

function targetFor(specClass, size) {
	const { width, height, orientation, note } = size;
	const posture = postureOf(size);
	const legacy = LEGACY_IDS[`${specClass.id}/${width}x${height}`];
	const id =
		legacy?.id ??
		(posture
			? `${specClass.id}-${posture}-${width}x${height}`
			: `${specClass.id}-${width}x${height}`);
	const statusBar = note?.includes('without status bar')
		? ', no status bar'
		: note?.includes('with status bar')
			? ', status bar'
			: '';
	const label =
		legacy?.label ??
		`${CLASS_LABELS[specClass.id]}${posture ? ` ${posture}` : ''}${orientation === 'landscape' ? ' landscape' : ''}${statusBar}`;
	const frameProfile = FRAME_PROFILES[id];
	return {
		id,
		label,
		width,
		height,
		classId: specClass.id,
		platform: specClass.family,
		orientation,
		...(posture ? { posture } : {}),
		status: STATUSES[specClass.status],
		layoutFamily: layoutFamily(width, height),
		...(frameProfile ? { frameProfile } : {})
	};
}

/** The catalog as plain data. Throws on anything the contract cannot represent. */
export function buildCatalog(specs) {
	const targets = specs.classes.flatMap((specClass) => {
		if (!CLASS_LABELS[specClass.id]) throw new Error(`No label for class "${specClass.id}".`);
		if (!STATUSES[specClass.status]) throw new Error(`Unknown status "${specClass.status}".`);
		if (specClass.family !== 'iphone' && specClass.family !== 'ipad')
			throw new Error(`Unknown family "${specClass.family}".`);
		return specClass.accepted_sizes.map((size) => targetFor(specClass, size));
	});
	if (new Set(targets.map((target) => target.id)).size !== targets.length)
		throw new Error('Two catalog sizes generated the same id.');
	return {
		specSource: {
			url: specs.meta.source,
			accessed: specs.meta.accessed,
			pageLastModified: specs.meta.page_last_modified,
			minPerSize: specs.meta.count_per_device_size.min,
			maxPerSize: specs.meta.count_per_device_size.max,
			formats: specs.meta.formats,
			countVerbatim: specs.meta.count_per_device_size.verbatim,
			alphaVerbatim: specs.meta.alpha.verbatim,
			scalingVerbatim: specs.meta.display_scaling_verbatim,
			complianceCaveat: specs.meta.compliance_caveat
		},
		classes: specs.classes.map((specClass) => ({
			id: specClass.id,
			platform: specClass.family,
			label: CLASS_LABELS[specClass.id],
			appleLabel: specClass.apple_label,
			status: STATUSES[specClass.status],
			devices: specClass.devices,
			requirement: specClass.requirement_verbatim,
			scalingFallback: specClass.scaling_fallback_verbatim,
			notes: specClass.notes
		})),
		targets
	};
}

/** The generated TypeScript module, formatted with the repository's Prettier settings. */
export async function renderCatalog(specs) {
	const { specSource, classes, targets } = buildCatalog(specs);
	const source = `// GENERATED by scripts/device-catalog/generate.mjs from device-specs.json. Do not edit by hand.
export const SPEC_SOURCE = ${JSON.stringify(specSource)} as const;

export const TARGET_CLASS_DATA = ${JSON.stringify(classes)} as const;

export const TARGET_DATA = ${JSON.stringify(targets)} as const;
`;
	const options = await prettier.resolveConfig(OUTPUT);
	return prettier.format(source, { ...options, parser: 'typescript' });
}

export async function readSpecs() {
	return JSON.parse(await readFile(SPECS, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await writeFile(OUTPUT, await renderCatalog(await readSpecs()));
	console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
}

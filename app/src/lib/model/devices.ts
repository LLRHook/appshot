import type { DeviceClassId, OutputTarget, TargetStatus } from './contracts';
import { SPEC_SOURCE, TARGET_CLASS_DATA, TARGET_DATA } from './device-catalog.generated';

export { SPEC_SOURCE };

/**
 * One exact accepted output size. Generated from Apple's published table (`SPEC_SOURCE`), so a
 * project can only name sizes Apple lists. `iphone-6.9`, `iphone-6.7` (1284×2778) and `ipad-13`
 * are kept from older projects; every other id is `<classId>[-<posture>]-<width>x<height>`.
 */
export type DeviceId = (typeof TARGET_DATA)[number]['id'];

export interface DeviceSize {
	id: DeviceId;
	label: string;
	width: number;
	height: number;
}

/** Every accepted size in Apple's order. The same pixel size can appear under two classes. */
export const OUTPUT_TARGETS: readonly OutputTarget[] = TARGET_DATA;

export const DEVICES = Object.fromEntries(
	OUTPUT_TARGETS.map((target) => [target.id, target])
) as Record<DeviceId, OutputTarget>;

export function isDeviceId(value: unknown): value is DeviceId {
	return typeof value === 'string' && Object.hasOwn(DEVICES, value);
}

export interface TargetClass {
	id: DeviceClassId;
	platform: OutputTarget['platform'];
	/** Appshot's short name. */
	label: string;
	/** Apple's wording. */
	appleLabel: string;
	status: TargetStatus;
	devices: readonly string[];
	/** Apple's statement, verbatim, when the class has a requirement. */
	requirement: string | null;
	scalingFallback: string | null;
	notes: string | null;
}

export const TARGET_CLASSES = Object.fromEntries(
	TARGET_CLASS_DATA.map((targetClass) => [targetClass.id, targetClass])
) as unknown as Record<DeviceClassId, TargetClass>;

export function targetsForClass(classId: DeviceClassId): OutputTarget[] {
	return OUTPUT_TARGETS.filter((target) => target.classId === classId);
}

/**
 * The sizes a campaign starts from and a picker should offer. Between them they meet Apple's
 * stated requirements: the required iPhone class, the large iPhone class that also discharges the
 * conditional Face ID class, the iPad class apps on iPad need, and both iPhone Duo displays.
 */
export const RECOMMENDED_TARGET_IDS = [
	'iphone-di-medium-1206x2622',
	'iphone-6.9',
	'ipad-13',
	'iphone-duo-outer-1398x2034',
	'iphone-duo-inner-2007x2853'
] as const satisfies readonly DeviceId[];

export const RECOMMENDED_TARGETS: readonly OutputTarget[] = RECOMMENDED_TARGET_IDS.map(
	(id) => DEVICES[id]
);

/**
 * What a size picker lists instead of all 62 rows: the recommended sizes, then any other size the
 * campaign already uses so its current value always has an option.
 */
export function targetPickerOptions(selected: readonly DeviceId[] = []): OutputTarget[] {
	const options = [...RECOMMENDED_TARGETS];
	for (const id of selected) if (!options.includes(DEVICES[id])) options.push(DEVICES[id]);
	return options;
}

export interface TargetClassGroup extends TargetClass {
	targets: readonly OutputTarget[];
	/** The sizes to offer first: recommended ones, else the class's largest portrait size. */
	preferred: readonly OutputTarget[];
}

function preferredTargets(targets: readonly OutputTarget[]): OutputTarget[] {
	const recommended = targets.filter((target) => RECOMMENDED_TARGETS.includes(target));
	if (recommended.length) return recommended;
	const portrait = targets.filter((target) => target.orientation === 'portrait');
	return [
		portrait.reduce((best, target) =>
			target.width * target.height > best.width * best.height ? target : best
		)
	];
}

/** Every class with its sizes, in Apple's order, for a readiness panel or an "all sizes" view. */
export const TARGET_CLASS_GROUPS: readonly TargetClassGroup[] = Object.values(TARGET_CLASSES).map(
	(targetClass) => {
		const targets = targetsForClass(targetClass.id);
		return { ...targetClass, targets, preferred: preferredTargets(targets) };
	}
);

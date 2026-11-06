import {
	CHECK_PALETTES,
	CHECK_STYLE_ID,
	type CheckCanvas,
	type CheckMark,
	type CheckPreset,
	type CheckSettingsPatch
} from './check';
import type {
	AssetId,
	ImageLayer,
	PixelRect,
	ProjectAsset,
	ProjectV2,
	SlideVariant,
	StoredSlide
} from './contracts';
import { DEVICES, type DeviceId } from './devices';
import type { Composition, ImageRef, Slide } from './types';

/**
 * Billington's campaign in The Check, as an ordinary editable Composition: five frames of real UI,
 * none of them gated on a capability the current release cannot reach. The first three each prove
 * one benefit on their own, a fair result, who had what and shared plates; the last two show the
 * arithmetic and how the bill gets in. There is no scan, link, publication, payment or account claim.
 *
 * Every frame is frameless real UI: no drawn device, status bar or hardware. Crops are real source
 * pixels at one uniform scale, measured per target from that target's native captures, so nothing is
 * retyped, recolored or stretched. Each frame lifts one real element well above its size in the app.
 */

export const BILLINGTON_SCENES = [
	'result',
	'entry',
	'summary',
	'assign',
	'split',
	'breakdown'
] as const;
export type BillingtonScene = (typeof BILLINGTON_SCENES)[number];
/** One target's own captures. A scene with no capture yet leaves its frame without a source. */
export type BillingtonSources = Partial<Record<BillingtonScene, ImageRef>>;
export type BillingtonAssets = Partial<Record<BillingtonScene, ProjectAsset>>;

interface LayerSpec {
	id: string;
	/** Another capture of this target, when the frame's own does not show this. Omitted means its own. */
	scene?: BillingtonScene;
	crop: PixelRect;
	x: number;
	y: number;
	scale: number;
	radius?: number;
	shadow?: ImageLayer['shadow'];
}

interface FrameGeometry {
	fontScale?: number;
	layers?: LayerSpec[];
	mark?: CheckMark;
	/** The layer whose bottom tears like a receipt. */
	tear?: string;
}

/** Real Billington marks, unmodified, for an art layer. The default campaign shows real UI only. */
export const BRAND_ART = {
	billy: {
		id: 'brand-billy',
		blobUrl: '/brand/billy.png',
		naturalWidth: 1024,
		naturalHeight: 1536
	},
	wordmark: {
		id: 'brand-wordmark',
		blobUrl: '/brand/billington-wordmark.png',
		naturalWidth: 1536,
		naturalHeight: 1024
	}
} as const satisfies Record<string, ImageRef>;

interface FrameCopy {
	id: string;
	label: string;
	scene: BillingtonScene;
	canvas: CheckCanvas;
	preset: CheckPreset;
	headline: string;
	support: string;
}

/** Every line maps to a row of Billington's claim evidence, and stays within what it permits. */
const FRAMES: readonly FrameCopy[] = [
	{
		id: 'result',
		label: 'The result',
		scene: 'result',
		canvas: 'teal',
		preset: 'hero',
		headline: 'Split the bill.\n*Fairly.*',
		support: 'Everyone pays for what they actually had.'
	},
	{
		id: 'assign',
		label: 'Who had what',
		scene: 'assign',
		canvas: 'gold',
		preset: 'detail',
		headline: 'Tap who had\n*what.*',
		support: 'Every dish goes to whoever ordered it.'
	},
	{
		id: 'shared',
		label: 'Shared plates',
		scene: 'split',
		canvas: 'teal',
		preset: 'detail',
		headline: 'Shared the fries?\n*Split just those.*',
		support: 'Evenly or by percentage. Tax and tip follow.'
	},
	{
		id: 'line-by-line',
		label: 'Line by line',
		scene: 'breakdown',
		canvas: 'cream',
		preset: 'editorial',
		headline: 'Each share,\n*line by line.*',
		support: 'Shared plates, tax and tip included.'
	},
	{
		id: 'entry',
		label: 'Add the bill',
		scene: 'summary',
		canvas: 'gold',
		preset: 'hero',
		headline: 'Add the bill.\n*Skip the math.*',
		support: 'Enter tax and tip. Billington adds it up.'
	}
];

/** Native 1320 × 2868 captures. */
const LARGE: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.12,
		layers: [
			{
				id: 'shares',
				crop: { x: 77, y: 1478, width: 1060, height: 1082 },
				x: 24,
				y: 1430,
				scale: 1.2,
				radius: 72,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				crop: { x: 275, y: 385, width: 771, height: 360 },
				x: 24,
				y: 896,
				scale: 1.65,
				radius: 72,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'shares',
			rect: { x: 924, y: 1630, width: 165, height: 48 },
			seed: 11
		}
	},
	assign: {
		fontScale: 1.07,
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 60, y: 402, width: 707, height: 240 },
				x: 24,
				y: 860,
				scale: 1.799,
				radius: 72,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 24, y: 733, width: 1272, height: 1517 },
				x: 24,
				y: 1351,
				scale: 1,
				radius: 64,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'people',
			rect: { x: 293, y: 450, width: 84, height: 84 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				crop: { x: 66, y: 330, width: 1188, height: 1942 },
				x: 24,
				y: 790,
				scale: 1.0707,
				radius: 72,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 985, y: 818, width: 181, height: 103 },
				x: 848,
				y: 1236,
				scale: 2.46,
				radius: 56,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1016, y: 852, width: 118, height: 36 },
			seed: 37
		}
	},
	'line-by-line': {
		fontScale: 1.1,
		tear: 'receipt',
		layers: [
			{
				id: 'total',
				crop: { x: 48, y: 342, width: 1224, height: 459 },
				x: 24,
				y: 104,
				scale: 1.039,
				radius: 62,
				shadow: 'soft'
			},
			{
				id: 'receipt',
				crop: { x: 50, y: 1370, width: 1220, height: 1204 },
				x: 25,
				y: 620,
				scale: 1.04,
				radius: 62,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'receipt',
			rect: { x: 981, y: 1999, width: 243, height: 36 },
			seed: 41
		}
	},
	entry: {
		layers: [
			{
				id: 'bill',
				scene: 'entry',
				crop: { x: 60, y: 1262, width: 1200, height: 496 },
				x: 24,
				y: 730,
				scale: 1.06,
				radius: 62,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 60, y: 1830, width: 1200, height: 760 },
				x: 24,
				y: 1276,
				scale: 1.06,
				radius: 62,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 73, y: 1882, width: 1173, height: 612 },
				x: 24,
				y: 2102,
				scale: 1.0844,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 972, y: 2364, width: 232, height: 74 },
				x: 756,
				y: 2584,
				scale: 2.2,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'grand-total',
			rect: { x: 984, y: 2381, width: 206, height: 41 },
			seed: 17
		}
	}
};

/** Native 1206 × 2622 captures. Same UI metrics as the large phone on a shorter screen. */
const MEDIUM: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.12,
		layers: [
			{
				id: 'shares',
				crop: { x: 73, y: 1228, width: 952, height: 1082 },
				x: 22,
				y: 1234,
				scale: 1.2206,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				// This class's result capture is scrolled under the bar, so the whole card comes from
				// the same bill's breakdown capture.
				id: 'total',
				scene: 'breakdown',
				crop: { x: 188, y: 385, width: 830, height: 360 },
				x: 22,
				y: 790,
				scale: 1.4,
				radius: 66,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'shares',
			rect: { x: 810, y: 1380, width: 165, height: 48 },
			seed: 11
		}
	},
	assign: {
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 60, y: 401, width: 707, height: 240 },
				x: 22,
				y: 681,
				scale: 1.6436,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 24, y: 739, width: 1158, height: 1501 },
				x: 24,
				y: 1121,
				scale: 1,
				radius: 58,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'people',
			rect: { x: 293, y: 449, width: 84, height: 84 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				crop: { x: 61, y: 303, width: 1084, height: 1797 },
				x: 22,
				y: 696,
				scale: 1.072,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 876, y: 793, width: 182, height: 103 },
				x: 768,
				y: 1158,
				scale: 2.26,
				radius: 52,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 908, y: 827, width: 118, height: 36 },
			seed: 37
		}
	},
	'line-by-line': {
		fontScale: 1.2,
		tear: 'receipt',
		layers: [
			{
				id: 'total',
				crop: { x: 48, y: 342, width: 1110, height: 459 },
				x: 22,
				y: 96,
				scale: 1.047,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'receipt',
				crop: { x: 50, y: 1370, width: 1106, height: 964 },
				x: 22,
				y: 600,
				scale: 1.0506,
				radius: 58,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'receipt',
			rect: { x: 867, y: 1999, width: 243, height: 36 },
			seed: 41
		}
	},
	entry: {
		layers: [
			{
				id: 'tax',
				scene: 'entry',
				crop: { x: 60, y: 1500, width: 1086, height: 258 },
				x: 22,
				y: 680,
				scale: 1.07,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 60, y: 1829, width: 1086, height: 761 },
				x: 22,
				y: 976,
				scale: 1.07,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 73, y: 1873, width: 1059, height: 614 },
				x: 22,
				y: 1810,
				scale: 1.0972,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 858, y: 2356, width: 232, height: 74 },
				x: 690,
				y: 2300,
				scale: 2.1,
				radius: 42,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'grand-total',
			rect: { x: 875, y: 2372, width: 196, height: 42 },
			seed: 17
		}
	}
};

/**
 * Native 2064 × 2752 captures. Billington's iPad UI is a stretched phone layout, shown as it is: a
 * row's name and amount sit nearly 2000 px apart, so a whole row can never grow. Each frame's real
 * element is lifted far past its size in the app instead, and the people and their shares are two
 * aligned crops of the same rows, with the blank middle of each row left out and a gap between them.
 */
const TABLET: Record<string, FrameGeometry> = {
	result: {
		fontScale: 0.92,
		layers: [
			{
				id: 'total',
				crop: { x: 708, y: 205, width: 646, height: 223 },
				x: 95,
				y: 925,
				scale: 2.9,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'people',
				crop: { x: 48, y: 951, width: 790, height: 725 },
				x: 95,
				y: 1596,
				scale: 1.5,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'shares',
				crop: { x: 1500, y: 951, width: 445, height: 725 },
				x: 1300,
				y: 1596,
				scale: 1.5,
				radius: 64,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'shares',
			rect: { x: 1796, y: 1023, width: 118, height: 40 },
			seed: 11
		}
	},
	assign: {
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 57, y: 207, width: 438, height: 160 },
				x: 42,
				y: 965,
				scale: 3,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 12, y: 421, width: 2040, height: 1212 },
				x: 42,
				y: 1470,
				scale: 0.97,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'people',
			rect: { x: 194, y: 239, width: 56, height: 56 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				crop: { x: 104, y: 481, width: 1857, height: 1630 },
				x: 66,
				y: 997,
				scale: 1.04,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 1781, y: 808, width: 121, height: 68 },
				x: 1540,
				y: 1228,
				scale: 3.6,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1801, y: 831, width: 81, height: 24 },
			seed: 37
		}
	},
	'line-by-line': {
		tear: 'receipt',
		layers: [
			{
				id: 'total',
				crop: { x: 32, y: 168, width: 2000, height: 306 },
				x: 80,
				y: 84,
				scale: 0.952,
				radius: 44,
				shadow: 'soft'
			},
			{
				id: 'receipt',
				crop: { x: 32, y: 851, width: 2000, height: 1195 },
				x: 80,
				y: 400,
				scale: 0.952,
				radius: 56,
				shadow: 'soft'
			},
			{
				// Item rows here are too close together to ring one, so Leo's share carries the mark.
				id: 'share',
				crop: { x: 1781, y: 1010, width: 147, height: 65 },
				x: 1640,
				y: 504,
				scale: 2.4,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1799, y: 1027, width: 112, height: 32 },
			seed: 41
		}
	},
	entry: {
		layers: [
			{
				id: 'bill',
				scene: 'entry',
				crop: { x: 32, y: 649, width: 2000, height: 462 },
				x: 37,
				y: 960,
				scale: 0.995,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 32, y: 1152, width: 2000, height: 551 },
				x: 37,
				y: 1440,
				scale: 0.995,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 48, y: 2093, width: 1968, height: 411 },
				x: 37,
				y: 2010,
				scale: 1.011,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1808, y: 2400, width: 196, height: 80 },
				x: 1361,
				y: 2285,
				scale: 3.4,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'grand-total',
			rect: { x: 1843, y: 2427, width: 131, height: 28 },
			seed: 17
		}
	}
};

/**
 * Native 1398 × 2034 captures. On the outer display the system status column sits beside and
 * sometimes over the phone layout, which is the app's real behaviour today. Crops show real UI clear
 * of it, and nothing is retouched. This display's result captures scroll the bill's total card away,
 * so frame 1's total is the same bill's Total Bill figure from the assignment screen.
 */
const DUO_OUTER: Record<string, FrameGeometry> = {
	result: {
		layers: [
			{
				id: 'total',
				scene: 'assign',
				crop: { x: 34, y: 1848, width: 256, height: 80 },
				x: 785,
				y: 300,
				scale: 2.3,
				radius: 48,
				shadow: 'soft'
			},
			{
				id: 'shares',
				crop: { x: 52, y: 642, width: 1038, height: 1058 },
				x: 55,
				y: 640,
				scale: 1.24,
				radius: 60,
				shadow: 'dramatic'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'shares',
			rect: { x: 750, y: 754, width: 165, height: 48 },
			seed: 11
		}
	},
	assign: {
		fontScale: 1.2,
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 60, y: 219, width: 707, height: 226 },
				x: 24,
				y: 677,
				scale: 1.909,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 32, y: 549, width: 1334, height: 904 },
				x: 24,
				y: 1120,
				scale: 1.012,
				radius: 56,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'people',
			rect: { x: 293, y: 264, width: 84, height: 84 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				crop: { x: 48, y: 151, width: 1050, height: 1289 },
				x: 123,
				y: 620,
				scale: 1.097,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 829, y: 641, width: 181, height: 103 },
				x: 831,
				y: 1076,
				scale: 2.65,
				radius: 58,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 860, y: 675, width: 118, height: 36 },
			seed: 37
		}
	},
	'line-by-line': {
		tear: 'receipt',
		layers: [
			{
				id: 'receipt',
				crop: { x: 48, y: 768, width: 1050, height: 960 },
				x: 24,
				y: 48,
				scale: 1.2857,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'receipt',
			rect: { x: 807, y: 1396, width: 243, height: 36 },
			seed: 41
		}
	},
	entry: {
		layers: [
			{
				id: 'bill',
				scene: 'entry',
				crop: { x: 60, y: 1100, width: 1278, height: 470 },
				x: 24,
				y: 640,
				scale: 1.05,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 73, y: 1050, width: 1251, height: 614 },
				x: 24,
				y: 1170,
				scale: 1.0792,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1050, y: 1532, width: 232, height: 74 },
				x: 810,
				y: 1640,
				scale: 2.2,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'grand-total',
			rect: { x: 1067, y: 1549, width: 196, height: 42 },
			seed: 17
		}
	}
};

/** Native 2007 × 2853 captures of the open display. The phone layout fills the safe area. */
const DUO_INNER: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.2,
		layers: [
			{
				id: 'shares',
				crop: { x: 36, y: 1445, width: 1935, height: 1082 },
				x: 36,
				y: 1624,
				scale: 1,
				radius: 76,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				scene: 'breakdown',
				crop: { x: 494, y: 445, width: 1018, height: 360 },
				x: 36,
				y: 1000,
				scale: 1.9,
				radius: 76,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'shares',
			rect: { x: 1611, y: 1597, width: 165, height: 48 },
			seed: 11
		}
	},
	assign: {
		fontScale: 1.25,
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 60, y: 461, width: 707, height: 240 },
				x: 36,
				y: 985,
				scale: 2.737,
				radius: 76,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 24, y: 791, width: 1959, height: 1214 },
				x: 36,
				y: 1654,
				scale: 0.9877,
				radius: 70,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'people',
			rect: { x: 293, y: 510, width: 84, height: 84 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				crop: { x: 101, y: 356, width: 1805, height: 1934 },
				x: 74,
				y: 861,
				scale: 1.03,
				radius: 70,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 1637, y: 846, width: 182, height: 103 },
				x: 1363,
				y: 1225,
				scale: 3.2,
				radius: 72,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1669, y: 880, width: 118, height: 36 },
			seed: 37
		}
	},
	'line-by-line': {
		fontScale: 1.25,
		tear: 'receipt',
		layers: [
			{
				id: 'total',
				crop: { x: 48, y: 402, width: 1911, height: 459 },
				x: 36,
				y: 110,
				scale: 1.0126,
				radius: 70,
				shadow: 'soft'
			},
			{
				id: 'receipt',
				crop: { x: 50, y: 1428, width: 1907, height: 966 },
				x: 36,
				y: 620,
				scale: 1.0147,
				radius: 70,
				shadow: 'soft'
			},
			{
				// Item rows here are too close together to ring one, so Leo's share carries the mark.
				id: 'share',
				crop: { x: 1583, y: 1665, width: 220, height: 96 },
				x: 1461,
				y: 804,
				scale: 2.2,
				radius: 52,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1611, y: 1690, width: 165, height: 48 },
			seed: 41
		}
	},
	entry: {
		layers: [
			{
				id: 'tax',
				scene: 'entry',
				crop: { x: 60, y: 1553, width: 1887, height: 265 },
				x: 36,
				y: 850,
				scale: 1.025,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 60, y: 1889, width: 1887, height: 761 },
				x: 36,
				y: 1152,
				scale: 1.025,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 73, y: 1866, width: 1860, height: 614 },
				x: 36,
				y: 1962,
				scale: 1.04,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1640, y: 2330, width: 260, height: 110 },
				x: 1400,
				y: 2404,
				scale: 2.2,
				radius: 56,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'grand-total',
			rect: { x: 1676, y: 2365, width: 196, height: 42 },
			seed: 17
		}
	}
};

const GEOMETRY: Partial<Record<DeviceId, Record<string, FrameGeometry>>> = {
	'iphone-6.9': LARGE,
	'iphone-di-medium-1206x2622': MEDIUM,
	'ipad-13': TABLET,
	'iphone-duo-outer-1398x2034': DUO_OUTER,
	'iphone-duo-inner-2007x2853': DUO_INNER
};

function frameLayers<TImage>(
	geometry: FrameGeometry | undefined,
	source: TImage | undefined,
	scene: (key: BillingtonScene) => TImage | undefined
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

/** A mark is only kept when what it marks is on the frame for this target. */
function frameMark(
	geometry: FrameGeometry | undefined,
	layers: readonly { id: string }[]
): CheckMark | undefined {
	const mark = geometry?.mark;
	return mark && layers.some((layer) => layer.id === mark.anchor) ? mark : undefined;
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
		// Frameless: layers carry all of the UI, so nothing draws a device around it.
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

/** The targets whose frames have been measured from native captures. */
export function campaignTargets(): DeviceId[] {
	return Object.keys(GEOMETRY) as DeviceId[];
}

/** One target's campaign. `sources` are that target's own native captures, never another's. */
export function createCheckDemo(device: DeviceId, sources: BillingtonSources): Composition {
	const geometry = GEOMETRY[device] ?? {};
	for (const [scene, source] of Object.entries(sources)) assertNativeSize(device, scene, source);
	const slides = FRAMES.map((copy): Slide => {
		const spec = geometry[copy.id];
		const source = sources[copy.scene];
		const layers = frameLayers<ImageRef>(spec, source, (scene) => sources[scene]);
		const shared = sharedFields(copy);
		const mark = frameMark(spec, layers);
		return {
			...shared,
			device,
			continuity: { inset: 0 },
			...(source ? { primaryImage: source } : {}),
			...(layers.length ? { layers } : {}),
			...(spec?.fontScale !== undefined ? { fontScale: spec.fontScale } : {}),
			check: {
				...shared.check!,
				...(mark ? { mark } : {}),
				...(spec?.tear && layers.some((layer) => layer.id === spec.tear) ? { tear: spec.tear } : {})
			}
		};
	});
	return {
		version: 1,
		name: 'Billington',
		device,
		style: CHECK_STYLE_ID,
		accent: CHECK_PALETTES.teal.accent,
		continuityMode: 'none',
		slides
	};
}

/**
 * The whole campaign as one stored project: one story, with each target's own sources, crops and
 * pen marks. Only captures a frame uses are stored. A target with no capture for a frame gets no
 * source there, and preflight reports it.
 */
export function createCheckProject(
	byTarget: Partial<Record<DeviceId, BillingtonAssets>>
): ProjectV2 {
	const targets = Object.keys(byTarget) as DeviceId[];
	const assets: Record<AssetId, ProjectAsset> = {};
	for (const target of targets)
		for (const [scene, asset] of Object.entries(byTarget[target] ?? {}))
			assertNativeSize(target, scene, asset);
	const slides = FRAMES.map((copy): StoredSlide => {
		const variants: Partial<Record<DeviceId, SlideVariant>> = {};
		for (const target of targets) {
			const spec = GEOMETRY[target]?.[copy.id];
			const captures = byTarget[target] ?? {};
			const asset = captures[copy.scene];
			const layers = frameLayers<AssetId>(spec, asset?.id, (scene) => captures[scene]?.id);
			for (const scene of [copy.scene, ...(spec?.layers ?? []).map((layer) => layer.scene)]) {
				const used = scene && captures[scene];
				if (used) assets[used.id] = used;
			}
			const mark = frameMark(spec, layers);
			const check: CheckSettingsPatch = {
				...(mark ? { mark } : {}),
				...(spec?.tear && layers.some((layer) => layer.id === spec.tear) ? { tear: spec.tear } : {})
			};
			variants[target] = {
				...(asset ? { source: { asset: asset.id } } : {}),
				...(layers.length ? { layers } : {}),
				...(spec?.fontScale !== undefined ? { fontScale: spec.fontScale } : {}),
				check
			};
		}
		return { ...sharedFields(copy), variants };
	});
	return {
		version: 2,
		name: 'Billington',
		appName: 'Billington',
		style: CHECK_STYLE_ID,
		accent: CHECK_PALETTES.teal.accent,
		targets,
		assets,
		slides,
		continuityMode: 'none'
	};
}

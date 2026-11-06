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
		support: 'Billington adds up subtotal, tax and tip.'
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
				y: 1471,
				scale: 1.2,
				radius: 72,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				crop: { x: 275, y: 385, width: 771, height: 385 },
				x: 24,
				y: 896,
				scale: 1.65,
				radius: 72,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 885, y: 1587, width: 242, height: 134 },
				x: 952,
				y: 1587,
				scale: 1.42,
				radius: 56,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
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
				crop: { x: 80, y: 402, width: 667, height: 240 },
				x: 32,
				y: 844,
				scale: 1.883,
				radius: 72,
				shadow: 'soft'
			},
			{
				// The list's fork tiles and dots stay out of the crop, which puts dish names on the
				// headline's margin. The last row is a text-free peek, so the list visibly runs on.
				id: 'dishes',
				crop: { x: 228, y: 533, width: 1052, height: 1175 },
				x: 32,
				y: 1466,
				scale: 1.1939,
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
				x: 851,
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
				// Total's own value at a larger scale, on its label's baseline and the amounts' right edge.
				// It carries no shadow, so no plate shows on the white card.
				id: 'grand-total',
				crop: { x: 971, y: 2375, width: 232, height: 69 },
				x: 759,
				y: 2589,
				scale: 2.2,
				radius: 40
			}
		],
		mark: {
			kind: 'underline',
			anchor: 'grand-total',
			rect: { x: 989, y: 2382, width: 196, height: 36 },
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
				y: 1250,
				scale: 1.2206,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				// This class's result capture is scrolled under the bar, so the whole card comes from the
				// same bill's breakdown capture.
				id: 'total',
				scene: 'breakdown',
				crop: { x: 188, y: 385, width: 830, height: 382 },
				x: 22,
				y: 775,
				scale: 1.4,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 771, y: 1337, width: 243, height: 134 },
				x: 839,
				y: 1370,
				scale: 1.42,
				radius: 52,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 810, y: 1380, width: 165, height: 48 },
			seed: 11
		}
	},
	assign: {
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 80, y: 401, width: 667, height: 240 },
				x: 24,
				y: 688,
				scale: 1.736,
				radius: 66,
				shadow: 'soft'
			},
			{
				// As on the large phone: dish names on the headline's margin, the last row a text-free
				// peek.
				id: 'dishes',
				crop: { x: 228, y: 533, width: 938, height: 1172 },
				x: 24,
				y: 1176,
				scale: 1.2345,
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
				crop: { x: 61, y: 305, width: 1084, height: 1795 },
				x: 22,
				y: 698,
				scale: 1.072,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 876, y: 793, width: 182, height: 103 },
				x: 773,
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
				crop: { x: 60, y: 1490, width: 1086, height: 268 },
				x: 22,
				y: 669,
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
				crop: { x: 857, y: 2364, width: 232, height: 71 },
				x: 668,
				y: 2303,
				scale: 2.1,
				radius: 38
			}
		],
		mark: {
			kind: 'underline',
			anchor: 'grand-total',
			rect: { x: 875, y: 2374, width: 196, height: 36 },
			seed: 17
		}
	}
};

/**
 * Native 2064 × 2752 captures. Billington's iPad UI is a stretched phone layout, shown as it is: a
 * row's name and amount sit nearly 2000 px apart, so a whole row can never grow. The result list stays
 * one real card at full width with its ringed share lifted, and the dish list enlarges the left of
 * each row, with the real end of the ringed person's row lifted onto it to say who.
 */
const TABLET: Record<string, FrameGeometry> = {
	result: {
		layers: [
			{
				id: 'shares',
				crop: { x: 52, y: 945, width: 1893, height: 731 },
				x: 42,
				y: 1842,
				scale: 1.046,
				radius: 64,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				crop: { x: 689, y: 172, width: 683, height: 297 },
				x: 42,
				y: 1005,
				scale: 2.899,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 1771, y: 993, width: 168, height: 100 },
				x: 1501,
				y: 1765,
				scale: 3.1,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1796, y: 1023, width: 118, height: 40 },
			seed: 11
		}
	},
	assign: {
		layers: [
			{
				id: 'people',
				scene: 'entry',
				crop: { x: 57, y: 207, width: 633, height: 160 },
				x: 82,
				y: 956,
				scale: 3,
				radius: 64,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 155, y: 426, width: 974, height: 654 },
				x: 82,
				y: 1477,
				scale: 1.95,
				radius: 60,
				shadow: 'soft'
			},
			{
				// The real end of Leo's own row: its share and avatar, with the blank middle of the row
				// left out and the lift plainly a lift.
				id: 'owner',
				crop: { x: 1855, y: 870, width: 155, height: 125 },
				x: 1632,
				y: 2332,
				scale: 1.95,
				radius: 40,
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
				crop: { x: 104, y: 483, width: 1855, height: 1628 },
				x: 64,
				y: 999,
				scale: 1.04,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				// This lift covers the row's plus icon outright and stays clear of the bar above it.
				id: 'share',
				crop: { x: 1777, y: 806, width: 129, height: 75 },
				x: 1589,
				y: 1262,
				scale: 3.4,
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
				crop: { x: 1772, y: 998, width: 165, height: 90 },
				x: 1620,
				y: 490,
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
				y: 990,
				scale: 0.995,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 32, y: 1152, width: 2000, height: 551 },
				x: 37,
				y: 1482,
				scale: 0.995,
				radius: 56,
				shadow: 'soft'
			},
			{
				// The crop runs on into the real white under the card, which holds the pen mark without a
				// tab.
				id: 'summary',
				crop: { x: 48, y: 2093, width: 1968, height: 433 },
				x: 37,
				y: 2062,
				scale: 1.011,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1823, y: 2425, width: 162, height: 48 },
				x: 1501,
				y: 2339,
				scale: 3.2,
				radius: 40
			}
		],
		mark: {
			kind: 'underline',
			anchor: 'grand-total',
			rect: { x: 1843, y: 2428, width: 131, height: 24 },
			seed: 17
		}
	}
};

/**
 * Native 1398 × 2034 captures. On the outer display the system status column sits beside and
 * sometimes over the phone layout, which is the app's real behaviour today. Crops show real UI clear
 * of it, and nothing is retouched. This display's result captures scroll the bill's total card away,
 * so frame 1's total is the same bill's Total from Bill Summary.
 */
const DUO_OUTER: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.1,
		layers: [
			{
				id: 'shares',
				crop: { x: 72, y: 695, width: 913, height: 995 },
				x: 84,
				y: 650,
				scale: 1.35,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				scene: 'summary',
				crop: { x: 1050, y: 1532, width: 232, height: 74 },
				x: 714,
				y: 312,
				scale: 2.6,
				radius: 48,
				shadow: 'soft'
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
				crop: { x: 80, y: 219, width: 667, height: 226 },
				x: 28,
				y: 670,
				scale: 2.012,
				radius: 64,
				shadow: 'soft'
			},
			{
				// Rows 2 and 3, whose people differ in color here; row 1's Maya and row 2's Nora share one.
				// A text-free peek of row 4 shows the list runs on.
				id: 'dishes',
				crop: { x: 234, y: 832, width: 1090, height: 690 },
				x: 0,
				y: 1150,
				scale: 1.2826,
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
				crop: { x: 50, y: 156, width: 1046, height: 1285 },
				x: 125,
				y: 625,
				scale: 1.097,
				radius: 60,
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
				scale: 1.0563,
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
				crop: { x: 1049, y: 1545, width: 232, height: 70 },
				x: 837,
				y: 1656,
				scale: 2.2,
				radius: 40
			}
		],
		mark: {
			kind: 'underline',
			anchor: 'grand-total',
			rect: { x: 1067, y: 1551, width: 196, height: 37 },
			seed: 17
		}
	}
};

/**
 * Native 2007 × 2853 captures of the open display. The phone layout fills the safe area, so a dish
 * row's name and avatar sit about 1500 px apart. The dish list enlarges the left of each row, with
 * the real end of the ringed person's row lifted onto it to say who.
 */
const DUO_INNER: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.2,
		layers: [
			{
				id: 'shares',
				crop: { x: 66, y: 1500, width: 1766, height: 1040 },
				x: 36,
				y: 1660,
				scale: 1.096,
				radius: 76,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				scene: 'breakdown',
				crop: { x: 494, y: 445, width: 1018, height: 370 },
				x: 36,
				y: 985,
				scale: 1.9,
				radius: 76,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 1575, y: 1555, width: 237, height: 132 },
				x: 1511,
				y: 1652,
				scale: 1.94,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
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
				crop: { x: 62, y: 465, width: 700, height: 230 },
				x: 41,
				y: 969,
				scale: 2.75,
				radius: 76,
				shadow: 'soft'
			},
			{
				id: 'dishes',
				crop: { x: 228, y: 1094, width: 1040, height: 657 },
				x: 41,
				y: 1639,
				scale: 1.85,
				radius: 70,
				shadow: 'soft'
			},
			{
				// The real end of Leo's own row: its share and avatar, with the blank middle of the row
				// left out and the lift plainly a lift.
				id: 'owner',
				crop: { x: 1692, y: 1458, width: 234, height: 170 },
				x: 1485,
				y: 2310,
				scale: 1.85,
				radius: 44,
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
				crop: { x: 101, y: 360, width: 1805, height: 1930 },
				x: 74,
				y: 865,
				scale: 1.03,
				radius: 70,
				shadow: 'dramatic'
			},
			{
				id: 'share',
				crop: { x: 1645, y: 851, width: 167, height: 95 },
				x: 1431,
				y: 1250,
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
				crop: { x: 1583, y: 1652, width: 220, height: 125 },
				x: 1461,
				y: 773,
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
				crop: { x: 60, y: 1545, width: 1887, height: 273 },
				x: 36,
				y: 842,
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
				crop: { x: 1658, y: 2361, width: 232, height: 77 },
				x: 1436,
				y: 2428,
				scale: 2.2,
				radius: 44
			}
		],
		mark: {
			kind: 'underline',
			anchor: 'grand-total',
			rect: { x: 1676, y: 2367, width: 196, height: 36 },
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

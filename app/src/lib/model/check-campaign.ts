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
 * retyped, recolored or stretched. Each frame raises real elements well above their size in the app,
 * as plain callouts over the real UI they come from.
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
		support: 'Evenly or by percentage.'
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
			rect: { x: 929, y: 1634, width: 159, height: 38 },
			seed: 79
		}
	},
	assign: {
		fontScale: 1.07,
		layers: [
			{
				// One real Assign Items view at its true size: every card keeps both edges, and the 100%
				// stays under its Subtotal and Assigned header. The next row's top shows the list runs on.
				id: 'dishes',
				crop: { x: 24, y: 200, width: 1272, height: 2108 },
				x: 24,
				y: 760,
				scale: 1,
				radius: 64,
				shadow: 'soft'
			},
			{
				// The real end of Leo's own row, lifted plainly in place from the same capture.
				id: 'owner',
				crop: { x: 1000, y: 1404, width: 256, height: 187 },
				x: 810,
				y: 1840,
				scale: 1.9,
				radius: 48,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'owner',
			rect: { x: 1149, y: 1503, width: 54, height: 55 },
			seed: 66
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
				// Inside the chip's own border, so the plate has one edge.
				id: 'share',
				crop: { x: 989, y: 822, width: 172, height: 93 },
				x: 873,
				y: 1248,
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
			rect: { x: 982, y: 1992, width: 247, height: 47 },
			seed: 39
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
				crop: { x: 75, y: 1884, width: 1170, height: 609 },
				x: 24,
				y: 2102,
				scale: 1.0872,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				// A callout, not native type: Total's own value on a raised card that hangs past the Bill
				// Summary's foot, below its divider.
				id: 'grand-total',
				crop: { x: 965, y: 2366, width: 244, height: 84 },
				x: 735,
				y: 2612,
				scale: 2.2,
				radius: 40,
				shadow: 'soft'
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
			rect: { x: 815, y: 1384, width: 159, height: 38 },
			seed: 79
		}
	},
	assign: {
		layers: [
			{
				// As on the large phone, from its Subtotal and Assigned header down.
				id: 'dishes',
				crop: { x: 22, y: 344, width: 1162, height: 1956 },
				x: 22,
				y: 666,
				scale: 1,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'owner',
				crop: { x: 886, y: 1404, width: 256, height: 187 },
				x: 698,
				y: 1602,
				scale: 1.9,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'owner',
			rect: { x: 1034, y: 1501, width: 56, height: 55 },
			seed: 66
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
				crop: { x: 881, y: 798, width: 172, height: 93 },
				x: 795,
				y: 1170,
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
			rect: { x: 868, y: 1992, width: 247, height: 47 },
			seed: 39
		}
	},
	entry: {
		layers: [
			{
				// Both fields of the real card, so Subtotal and Tax read together.
				id: 'bill',
				scene: 'entry',
				crop: { x: 60, y: 1272, width: 1086, height: 466 },
				x: 44,
				y: 620,
				scale: 1.03,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 60, y: 1846, width: 1086, height: 732 },
				x: 44,
				y: 1120,
				scale: 1.03,
				radius: 58,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 75, y: 1876, width: 1056, height: 609 },
				x: 44,
				y: 1894,
				scale: 1.059,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 851, y: 2358, width: 244, height: 84 },
				x: 630,
				y: 2395,
				scale: 2.1,
				radius: 38,
				shadow: 'soft'
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
 * row's name and amount sit nearly 2000 px apart, so a whole row can never grow. Each frame's base is
 * real UI near its real size, whole rows edge to edge. What must read at search scale is enlarged as a
 * plainly raised detail, and a row's two ends stay far apart with its blank middle open between them.
 */
const TABLET: Record<string, FrameGeometry> = {
	result: {
		layers: [
			{
				// One real result screen at one scale, from the bill's card down to the last person. Its
				// total and the ringed share are enlarged as details, plainly raised off it.
				id: 'shares',
				crop: { x: 20, y: 150, width: 2024, height: 1530 },
				x: 40,
				y: 1080,
				scale: 0.98,
				radius: 64,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				crop: { x: 850, y: 345, width: 364, height: 88 },
				x: 577,
				y: 1262,
				scale: 2.5,
				radius: 44,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 1771, y: 1004, width: 168, height: 74 },
				x: 1499,
				y: 1768,
				scale: 2.96,
				radius: 56,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1805, y: 1030, width: 104, height: 24 },
			seed: 79
		}
	},
	assign: {
		layers: [
			{
				// The whole Assign Items view: every row whole, with its dish at one end and its owner at the
				// other, as the stretched layout really sets them.
				id: 'dishes',
				crop: { x: 20, y: 76, width: 2024, height: 1568 },
				x: 40,
				y: 1060,
				scale: 0.98,
				radius: 60,
				shadow: 'soft'
			},
			{
				// The row's dish, enlarged where it sits.
				id: 'dish',
				crop: { x: 44, y: 870, width: 336, height: 115 },
				x: 40,
				y: 1767,
				scale: 2.2,
				radius: 44,
				shadow: 'soft'
			},
			{
				// The complete row end, enlarged over its original so the avatar and percentage appear once.
				id: 'owner',
				crop: { x: 1858, y: 874, width: 168, height: 136 },
				x: 1678.6,
				y: 1755,
				scale: 2.05,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'owner',
			rect: { x: 1950, y: 941, width: 36, height: 37 },
			seed: 23
		}
	},
	shared: {
		layers: [
			{
				id: 'dialog',
				// Closes on the last person's real card, above the dialog's buttons.
				crop: { x: 104, y: 483, width: 1855, height: 1645 },
				x: 39,
				y: 930,
				scale: 1.07,
				radius: 60,
				shadow: 'dramatic'
			},
			{
				// Inside the chip's own border. It stops short of the row's plus icon and the bar above.
				id: 'share',
				crop: { x: 1785, y: 811, width: 114, height: 62 },
				x: 1648,
				y: 1200,
				scale: 3.3,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1807, y: 833, width: 76, height: 20 },
			seed: 83
		}
	},
	'line-by-line': {
		tear: 'receipt',
		layers: [
			{
				id: 'receipt',
				// Paper continues behind all enlarged lines, including Tax & Tip, before it tears.
				crop: { x: 32, y: 168, width: 2000, height: 1700 },
				x: 40,
				y: 84,
				scale: 0.992,
				radius: 56,
				shadow: 'soft'
			},
			{
				// Each end of Leo's item lines, enlarged where it sits, with the lines' blank middle between.
				id: 'names',
				crop: { x: 136, y: 1206, width: 288, height: 240 },
				x: 40,
				y: 1020,
				scale: 2.96,
				radius: 44,
				shadow: 'soft'
			},
			{
				id: 'lines',
				crop: { x: 1800, y: 1206, width: 224, height: 240 },
				x: 1361,
				y: 1020,
				scale: 2.96,
				radius: 44,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'lines',
			rect: { x: 1839, y: 1266, width: 161, height: 34 },
			seed: 39
		}
	},
	entry: {
		layers: [
			{
				id: 'bill',
				scene: 'entry',
				crop: { x: 40, y: 668, width: 1984, height: 444 },
				x: 37,
				y: 1010,
				scale: 1.003,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 40, y: 1160, width: 1984, height: 544 },
				x: 37,
				y: 1487,
				scale: 1.003,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 50, y: 2096, width: 1964, height: 406 },
				x: 37,
				y: 2064,
				scale: 1.0132,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1826, y: 2414, width: 165, height: 64 },
				x: 1469,
				y: 2387,
				scale: 3.2,
				radius: 44,
				shadow: 'soft'
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
				// From the top of Leo's row. The list runs off the foot below Oliver's share.
				id: 'shares',
				crop: { x: 72, y: 645, width: 913, height: 1045 },
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
			rect: { x: 755, y: 758, width: 159, height: 38 },
			seed: 79
		}
	},
	assign: {
		fontScale: 1.15,
		layers: [
			{
				// All four rows this display shows, each whole. The header above them runs under the status
				// column here, so the crop starts below it.
				id: 'dishes',
				crop: { x: 24, y: 536, width: 1350, height: 1214 },
				x: 24,
				y: 715,
				scale: 1,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'owner',
				crop: { x: 1080, y: 1218, width: 256, height: 187 },
				x: 887,
				y: 1273,
				scale: 1.9,
				radius: 48,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'owner',
			rect: { x: 1226, y: 1316, width: 56, height: 55 },
			seed: 66
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
				crop: { x: 833, y: 646, width: 172, height: 93 },
				x: 849,
				y: 1090,
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
			rect: { x: 808, y: 1389, width: 246, height: 48 },
			seed: 73
		}
	},
	entry: {
		layers: [
			{
				id: 'bill',
				scene: 'entry',
				crop: { x: 60, y: 1085, width: 1278, height: 485 },
				x: 24,
				y: 674,
				scale: 1.0563,
				radius: 56,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 75, y: 1053, width: 1248, height: 609 },
				x: 24,
				y: 1220,
				scale: 1.0817,
				radius: 56,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1043, y: 1535, width: 244, height: 84 },
				x: 813,
				y: 1728,
				scale: 2.2,
				radius: 40,
				shadow: 'soft'
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
 * row's name and avatar sit about 1500 px apart. Rows stay whole. Each end of the one that must read
 * at search scale is enlarged where it sits, with the row's blank middle open between them.
 */
const DUO_INNER: Record<string, FrameGeometry> = {
	result: {
		fontScale: 1.2,
		layers: [
			{
				id: 'shares',
				crop: { x: 66, y: 1320, width: 1766, height: 1220 },
				x: 36,
				y: 1475,
				scale: 1.096,
				radius: 76,
				shadow: 'dramatic'
			},
			{
				id: 'total',
				scene: 'breakdown',
				crop: { x: 313, y: 445, width: 1382, height: 385 },
				x: 36,
				y: 985,
				scale: 1.4,
				radius: 76,
				shadow: 'soft'
			},
			{
				id: 'share',
				crop: { x: 1575, y: 1555, width: 237, height: 132 },
				x: 1516,
				y: 1640,
				scale: 1.92,
				radius: 60,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'share',
			rect: { x: 1616, y: 1601, width: 159, height: 38 },
			seed: 79
		}
	},
	assign: {
		fontScale: 1.1,
		layers: [
			{
				// One real Assign Items view from its header down, every row whole. The next row's top shows
				// the list runs on.
				id: 'dishes',
				crop: { x: 36, y: 418, width: 1935, height: 1960 },
				x: 36,
				y: 915,
				scale: 1,
				radius: 70,
				shadow: 'soft'
			},
			{
				// The row's dish, enlarged where it sits.
				id: 'dish',
				crop: { x: 84, y: 1460, width: 480, height: 170 },
				x: 36,
				y: 1894,
				scale: 1.7,
				radius: 48,
				shadow: 'soft'
			},
			{
				// The complete row end at a modest scale, covering its original without reaching the next row.
				id: 'owner',
				crop: { x: 1700, y: 1463, width: 234, height: 197 },
				x: 1596.6,
				y: 1888,
				scale: 1.6,
				radius: 48,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'owner',
			rect: { x: 1835, y: 1562, width: 56, height: 55 },
			seed: 66
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
				crop: { x: 1645, y: 851, width: 167, height: 92 },
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
				// Keep the receipt continuous behind the last enlarged line, above the copy.
				crop: { x: 50, y: 1428, width: 1907, height: 1180 },
				x: 36,
				y: 620,
				scale: 1.0147,
				radius: 70,
				shadow: 'soft'
			},
			{
				// Each end of Leo's item lines, enlarged where it sits, with the lines' blank middle between.
				id: 'names',
				crop: { x: 200, y: 1950, width: 440, height: 396 },
				x: 36,
				y: 1041,
				scale: 1.95,
				radius: 52,
				shadow: 'soft'
			},
			{
				id: 'lines',
				crop: { x: 1624, y: 1950, width: 324, height: 396 },
				x: 1339,
				y: 1041,
				scale: 1.95,
				radius: 52,
				shadow: 'soft'
			}
		],
		mark: {
			kind: 'ring',
			anchor: 'lines',
			rect: { x: 1669, y: 2050, width: 243, height: 51 },
			seed: 39
		}
	},
	entry: {
		layers: [
			{
				// Both fields of the real card, so Subtotal and Tax read together.
				id: 'bill',
				scene: 'entry',
				crop: { x: 60, y: 1332, width: 1887, height: 466 },
				x: 36,
				y: 860,
				scale: 1.0255,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'tip',
				scene: 'entry',
				crop: { x: 60, y: 1906, width: 1887, height: 732 },
				x: 36,
				y: 1358,
				scale: 1.0255,
				radius: 66,
				shadow: 'soft'
			},
			{
				id: 'summary',
				crop: { x: 75, y: 1869, width: 1857, height: 609 },
				x: 36,
				y: 2129,
				scale: 1.042,
				radius: 66,
				shadow: 'dramatic'
			},
			{
				id: 'grand-total',
				crop: { x: 1652, y: 2351, width: 244, height: 84 },
				x: 1398,
				y: 2611,
				scale: 2.2,
				radius: 44,
				shadow: 'soft'
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

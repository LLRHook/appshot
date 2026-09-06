import type { StyleId } from './studio';
import type { DeviceId } from './devices';
import type { LinenPhone, LinenSettings } from './linen';

export type FrameStyle = 'bezel' | 'clay' | 'wireframe' | 'none';
export type LayoutId =
	| 'text-above'
	| 'text-below'
	| 'text-left'
	| 'text-right'
	| 'centered'
	| 'split';
export type BackgroundKind = 'solid' | 'linear' | 'radial' | 'mesh';

export interface Background {
	kind: BackgroundKind;
	colors: string[];
	angle?: number;
	noise?: number;
}

export interface Typography {
	headline: string;
	subtitle?: string;
	fontColor: string;
	fontWeight: 400 | 500 | 600 | 700 | 800;
}

export interface Effects {
	shadow: 'none' | 'soft' | 'dramatic';
	glow: number;
}

export interface ImageRef {
	id: string;
	blobUrl: string;
	naturalWidth: number;
	naturalHeight: number;
}

export interface SlideContinuity {
	incoming?: ImageRef;
	outgoing?: ImageRef;
	inset: number;
}

export interface Slide {
	label?: string;
	tilt?: number;
	scale?: number;
	badge?: string;
	fontScale?: number;
	id: string;
	device: DeviceId;
	background: Background;
	frame: FrameStyle;
	layout: LayoutId;
	typography: Typography;
	effects: Effects;
	primaryImage?: ImageRef;
	continuity: SlideContinuity;
	/** Resolved Table Linen settings; ignored by the five original styles. */
	linen?: LinenSettings;
}

export interface Panorama {
	leftId: string;
	rightId: string;
	image: ImageRef;
	offset: number;
	scale: number;
	tilt: number;
	/** Table Linen only: the shared phone in 2640×2868 reference world pixels. */
	linenPhone?: LinenPhone;
}

export interface Composition {
	name: string;
	style: StyleId;
	accent: string;
	panorama?: Panorama;
	version: 1;
	device: DeviceId;
	slides: Slide[];
	continuityMode: 'none' | 'paired';
}

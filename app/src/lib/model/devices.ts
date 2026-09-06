export type DeviceId = 'iphone-6.9' | 'iphone-6.7' | 'ipad-13';

export interface DeviceSize {
	id: DeviceId;
	label: string;
	width: number;
	height: number;
}

// The legacy iphone-6.7 project key maps to Apple’s current 6.5-inch upload class.
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
export const DEVICES: Record<DeviceId, DeviceSize> = {
	'iphone-6.9': { id: 'iphone-6.9', label: 'iPhone 6.9"', width: 1320, height: 2868 },
	'iphone-6.7': { id: 'iphone-6.7', label: 'iPhone 6.5"', width: 1284, height: 2778 },
	'ipad-13': { id: 'ipad-13', label: 'iPad 13"', width: 2064, height: 2752 }
};

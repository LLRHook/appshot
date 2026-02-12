export interface DeviceSize {
	label: string;
	width: number;
	height: number;
	device: string;
}

export const DEVICE_SIZES: DeviceSize[] = [
	{ label: 'iPhone 6.9"', width: 1320, height: 2868, device: 'iphone' },
	{ label: 'iPhone 6.7"', width: 1284, height: 2778, device: 'iphone' },
	{ label: 'iPhone 6.5"', width: 1242, height: 2688, device: 'iphone' },
	{ label: 'iPad 13"', width: 2064, height: 2752, device: 'ipad' },
];

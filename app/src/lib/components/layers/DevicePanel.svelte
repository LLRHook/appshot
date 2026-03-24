<script lang="ts">
	import type { DeviceFrameConfig, DeviceFrameStyle, DeviceType } from '$lib/layers';

	let {
		config = $bindable(),
	}: {
		config: DeviceFrameConfig;
	} = $props();

	const frameStyles: { value: DeviceFrameStyle; label: string; desc: string }[] = [
		{ value: 'bezel', label: 'Bezel', desc: 'Realistic dark frame + Dynamic Island' },
		{ value: 'clay', label: 'Clay', desc: 'Matte colored frame, soft modern look' },
		{ value: 'wireframe', label: 'Wireframe', desc: 'Thin outline, transparent fill' },
		{ value: 'none', label: 'None', desc: 'Bare screenshot with rounded corners' },
	];

	const deviceTypes: { value: DeviceType; label: string }[] = [
		{ value: 'iphone', label: 'iPhone' },
		{ value: 'ipad', label: 'iPad' },
	];

	let showFrameColor = $derived(config.style !== 'none');
	let showThickness = $derived(config.style !== 'none' && config.style !== 'wireframe');
	let showRadiusControls = $derived(config.style !== 'none');
</script>

<div class="space-y-4">
	<!-- Frame style -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Frame Style</label>
		<div class="grid grid-cols-2 gap-1.5">
			{#each frameStyles as style (style.value)}
				<button
					class="rounded-lg border px-2.5 py-2 text-left transition {config.style === style.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}"
					onclick={() => {
						const update: Partial<DeviceFrameConfig> = { style: style.value };
						// Sync clayColor when switching to clay
						if (style.value === 'clay') {
							update.clayColor = config.frameColor;
						}
						config = { ...config, ...update };
					}}
				>
					<span class="block text-xs font-medium {config.style === style.value ? 'text-teal-700' : 'text-gray-700'}">{style.label}</span>
					<span class="block text-[10px] {config.style === style.value ? 'text-teal-500' : 'text-gray-400'}">{style.desc}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Device type -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Device</label>
		<div class="flex gap-1.5">
			{#each deviceTypes as dt (dt.value)}
				<button
					class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition {config.device === dt.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
					onclick={() => config = { ...config, device: dt.value }}
				>
					{dt.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Frame color (all styles except none) -->
	{#if showFrameColor}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Frame Color</label>
			<div class="flex items-center gap-2">
				<input
					type="color"
					value={config.frameColor}
					oninput={(e) => {
						const color = (e.target as HTMLInputElement).value;
						const update: Partial<DeviceFrameConfig> = { frameColor: color };
						if (config.style === 'clay') update.clayColor = color;
						config = { ...config, ...update };
					}}
					class="h-8 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<input
					type="text"
					value={config.frameColor}
					oninput={(e) => {
						const color = (e.target as HTMLInputElement).value;
						const update: Partial<DeviceFrameConfig> = { frameColor: color };
						if (config.style === 'clay') update.clayColor = color;
						config = { ...config, ...update };
					}}
					class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
				/>
			</div>
		</div>
	{/if}

	<!-- Frame thickness (bezel and clay only) -->
	{#if showThickness}
		<div>
			<div class="mb-1 flex items-center justify-between">
				<label class="text-xs font-medium text-gray-600">Frame Thickness</label>
				<span class="text-[10px] text-gray-400">{config.frameThickness}</span>
			</div>
			<input
				type="range"
				min="0"
				max="100"
				value={config.frameThickness}
				oninput={(e) => config = { ...config, frameThickness: parseInt((e.target as HTMLInputElement).value) }}
				class="w-full accent-teal-500"
			/>
		</div>
	{/if}

	<!-- Frame border radius -->
	{#if showRadiusControls}
		<div>
			<div class="mb-1 flex items-center justify-between">
				<label class="text-xs font-medium text-gray-600">Frame Radius</label>
				<span class="text-[10px] text-gray-400">{config.frameBorderRadius}</span>
			</div>
			<input
				type="range"
				min="0"
				max="100"
				value={config.frameBorderRadius}
				oninput={(e) => config = { ...config, frameBorderRadius: parseInt((e.target as HTMLInputElement).value) }}
				class="w-full accent-teal-500"
			/>
		</div>

		<div>
			<div class="mb-1 flex items-center justify-between">
				<label class="text-xs font-medium text-gray-600">Screen Radius</label>
				<span class="text-[10px] text-gray-400">{config.screenBorderRadius}</span>
			</div>
			<input
				type="range"
				min="0"
				max="100"
				value={config.screenBorderRadius}
				oninput={(e) => config = { ...config, screenBorderRadius: parseInt((e.target as HTMLInputElement).value) }}
				class="w-full accent-teal-500"
			/>
		</div>
	{/if}

	<!-- Device scale -->
	<div>
		<div class="mb-1 flex items-center justify-between">
			<label class="text-xs font-medium text-gray-600">Device Scale</label>
			<span class="text-[10px] text-gray-400">{config.deviceScale}%</span>
		</div>
		<input
			type="range"
			min="50"
			max="150"
			value={config.deviceScale}
			oninput={(e) => config = { ...config, deviceScale: parseInt((e.target as HTMLInputElement).value) }}
			class="w-full accent-teal-500"
		/>
	</div>
</div>

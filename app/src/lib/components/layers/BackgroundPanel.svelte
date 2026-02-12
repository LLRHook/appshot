<script lang="ts">
	import type { BackgroundConfig, BackgroundType } from '$lib/layers';

	let {
		config = $bindable(),
	}: {
		config: BackgroundConfig;
	} = $props();

	const bgTypes: { value: BackgroundType; label: string; desc: string }[] = [
		{ value: 'linear-gradient', label: 'Linear', desc: 'Two-color directional gradient' },
		{ value: 'radial-gradient', label: 'Radial', desc: 'Circular gradient from center' },
		{ value: 'mesh', label: 'Mesh', desc: 'Blurred color orbs (premium look)' },
		{ value: 'solid', label: 'Solid', desc: 'Single flat color' },
	];
</script>

<div class="space-y-4">
	<!-- Type selector -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Type</label>
		<div class="grid grid-cols-2 gap-1.5">
			{#each bgTypes as bg (bg.value)}
				<button
					class="rounded-lg border px-2.5 py-2 text-left transition {config.type === bg.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}"
					onclick={() => config = { ...config, type: bg.value }}
				>
					<span class="block text-xs font-medium {config.type === bg.value ? 'text-teal-700' : 'text-gray-700'}">{bg.label}</span>
					<span class="block text-[10px] {config.type === bg.value ? 'text-teal-500' : 'text-gray-400'}">{bg.desc}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Color 1 (always shown) -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">
			{config.type === 'solid' ? 'Color' : 'Color 1'}
		</label>
		<div class="flex items-center gap-2">
			<input
				type="color"
				value={config.color1}
				oninput={(e) => config = { ...config, color1: (e.target as HTMLInputElement).value }}
				class="h-8 w-8 cursor-pointer rounded border border-gray-200"
			/>
			<input
				type="text"
				value={config.color1}
				oninput={(e) => config = { ...config, color1: (e.target as HTMLInputElement).value }}
				class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
			/>
		</div>
	</div>

	<!-- Color 2 (gradient + mesh) -->
	{#if config.type !== 'solid'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Color 2</label>
			<div class="flex items-center gap-2">
				<input
					type="color"
					value={config.color2}
					oninput={(e) => config = { ...config, color2: (e.target as HTMLInputElement).value }}
					class="h-8 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<input
					type="text"
					value={config.color2}
					oninput={(e) => config = { ...config, color2: (e.target as HTMLInputElement).value }}
					class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
				/>
			</div>
		</div>
	{/if}

	<!-- Color 3 (mesh only) -->
	{#if config.type === 'mesh'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Color 3</label>
			<div class="flex items-center gap-2">
				<input
					type="color"
					value={config.color3}
					oninput={(e) => config = { ...config, color3: (e.target as HTMLInputElement).value }}
					class="h-8 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<input
					type="text"
					value={config.color3}
					oninput={(e) => config = { ...config, color3: (e.target as HTMLInputElement).value }}
					class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
				/>
			</div>
		</div>
	{/if}

	<!-- Angle (linear gradient only) -->
	{#if config.type === 'linear-gradient'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Angle</label>
			<div class="flex items-center gap-2">
				<input
					type="range"
					min="0"
					max="360"
					value={config.angle}
					oninput={(e) => config = { ...config, angle: Number((e.target as HTMLInputElement).value) }}
					class="w-full accent-teal-600"
				/>
				<span class="w-10 text-right text-xs font-mono text-gray-500">{config.angle}&deg;</span>
			</div>
		</div>
	{/if}

	<!-- Preview swatch -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Preview</label>
		<div
			class="h-16 w-full rounded-lg border border-gray-200"
			style:background={
				config.type === 'linear-gradient' ? `linear-gradient(${config.angle}deg, ${config.color1}, ${config.color2})`
				: config.type === 'radial-gradient' ? `radial-gradient(circle at center, ${config.color1}, ${config.color2})`
				: config.type === 'solid' ? config.color1
				: `linear-gradient(135deg, ${config.color1} 0%, ${config.color2} 50%, ${config.color3} 100%)`
			}
		></div>
	</div>
</div>

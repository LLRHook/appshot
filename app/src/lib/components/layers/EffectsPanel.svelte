<script lang="ts">
	import type { EffectsConfig, ShadowDepth, GlowIntensity } from '$lib/layers';

	let {
		config = $bindable(),
	}: {
		config: EffectsConfig;
	} = $props();

	const shadows: { value: ShadowDepth; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'subtle', label: 'Subtle' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'dramatic', label: 'Dramatic' },
		{ value: 'custom', label: 'Custom' },
	];

	const glows: { value: GlowIntensity; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'subtle', label: 'Subtle' },
		{ value: 'bright', label: 'Bright' },
		{ value: 'custom', label: 'Custom' },
	];
</script>

<div class="space-y-4">
	<!-- Shadow depth -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Shadow</label>
		<div class="flex flex-wrap gap-1">
			{#each shadows as s (s.value)}
				<button
					class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {config.shadow === s.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
					onclick={() => config = { ...config, shadow: s.value }}
				>
					{s.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Custom shadow controls -->
	{#if config.shadow === 'custom'}
		<div class="space-y-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
			<div class="flex items-center gap-2">
				<label class="w-16 text-xs text-gray-500">Color</label>
				<input
					type="color"
					value={config.shadowColor}
					oninput={(e) => config = { ...config, shadowColor: e.currentTarget.value }}
					class="h-6 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<span class="text-xs text-gray-400">{config.shadowColor}</span>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Blur</label>
					<span class="text-xs text-gray-400">{config.shadowBlur}px</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					value={config.shadowBlur}
					oninput={(e) => config = { ...config, shadowBlur: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Spread</label>
					<span class="text-xs text-gray-400">{config.shadowSpread}px</span>
				</div>
				<input
					type="range"
					min="0"
					max="50"
					value={config.shadowSpread}
					oninput={(e) => config = { ...config, shadowSpread: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Offset X</label>
					<span class="text-xs text-gray-400">{config.shadowOffsetX}px</span>
				</div>
				<input
					type="range"
					min="-50"
					max="50"
					value={config.shadowOffsetX}
					oninput={(e) => config = { ...config, shadowOffsetX: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Offset Y</label>
					<span class="text-xs text-gray-400">{config.shadowOffsetY}px</span>
				</div>
				<input
					type="range"
					min="-50"
					max="50"
					value={config.shadowOffsetY}
					oninput={(e) => config = { ...config, shadowOffsetY: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
		</div>
	{/if}

	<!-- Glow -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Glow</label>
		<div class="flex flex-wrap gap-1">
			{#each glows as g (g.value)}
				<button
					class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {config.glow === g.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
					onclick={() => config = { ...config, glow: g.value }}
				>
					{g.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Custom glow controls -->
	{#if config.glow === 'custom'}
		<div class="space-y-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
			<div class="flex items-center gap-2">
				<label class="w-16 text-xs text-gray-500">Color</label>
				<input
					type="color"
					value={config.glowColor}
					oninput={(e) => config = { ...config, glowColor: e.currentTarget.value }}
					class="h-6 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<span class="text-xs text-gray-400">{config.glowColor}</span>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Intensity</label>
					<span class="text-xs text-gray-400">{config.glowIntensity}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					value={config.glowIntensity}
					oninput={(e) => config = { ...config, glowIntensity: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
			<div>
				<div class="flex items-center justify-between">
					<label class="text-xs text-gray-500">Radius</label>
					<span class="text-xs text-gray-400">{config.glowRadius}px</span>
				</div>
				<input
					type="range"
					min="0"
					max="200"
					value={config.glowRadius}
					oninput={(e) => config = { ...config, glowRadius: parseInt(e.currentTarget.value) }}
					class="w-full accent-teal-500"
				/>
			</div>
		</div>
	{/if}

	<!-- Noise intensity -->
	<div>
		<div class="flex items-center justify-between">
			<label class="text-xs font-medium text-gray-600">Noise Texture</label>
			<span class="text-xs text-gray-400">{config.noiseIntensity > 0 ? config.noiseIntensity : 'Off'}</span>
		</div>
		<input
			type="range"
			min="0"
			max="100"
			value={config.noiseIntensity}
			oninput={(e) => {
				const val = parseInt(e.currentTarget.value);
				config = { ...config, noiseIntensity: val, noise: val > 0 };
			}}
			class="mt-1 w-full accent-teal-500"
		/>
	</div>

	<!-- Background blur / frosted glass -->
	<div>
		<div class="flex items-center justify-between">
			<label class="text-xs font-medium text-gray-600">Background Blur</label>
			<span class="text-xs text-gray-400">{config.backgroundBlur > 0 ? config.backgroundBlur + 'px' : 'Off'}</span>
		</div>
		<input
			type="range"
			min="0"
			max="50"
			value={config.backgroundBlur}
			oninput={(e) => config = { ...config, backgroundBlur: parseInt(e.currentTarget.value) }}
			class="mt-1 w-full accent-teal-500"
		/>
	</div>
</div>

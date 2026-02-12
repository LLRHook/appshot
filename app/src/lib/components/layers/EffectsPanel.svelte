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
	];

	const glows: { value: GlowIntensity; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'subtle', label: 'Subtle' },
		{ value: 'bright', label: 'Bright' },
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

	<!-- Noise -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Noise Texture</label>
		<button
			class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {config.noise ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
			onclick={() => config = { ...config, noise: !config.noise }}
		>
			{config.noise ? 'On' : 'Off'}
		</button>
	</div>
</div>

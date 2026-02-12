<script lang="ts">
	import { PRESETS, type Preset } from '$lib/presets';
	import type { ComposableConfig } from '$lib/layers';

	let {
		onApply,
	}: {
		onApply: (config: ComposableConfig) => void;
	} = $props();

	function presetGradient(preset: Preset): string {
		const bg = preset.config.background;
		if (bg.type === 'linear-gradient') {
			return `linear-gradient(${bg.angle}deg, ${bg.color1}, ${bg.color2})`;
		} else if (bg.type === 'radial-gradient') {
			return `radial-gradient(circle, ${bg.color1}, ${bg.color2})`;
		} else if (bg.type === 'mesh') {
			return `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 50%, ${bg.color3} 100%)`;
		} else {
			return bg.color1;
		}
	}
</script>

<div class="space-y-3">
	<p class="text-[10px] text-gray-400">Pick a preset to start from, then customize any layer.</p>

	<div class="grid grid-cols-2 gap-2">
		{#each PRESETS as preset (preset.id)}
			<button
				class="group overflow-hidden rounded-xl border border-gray-200 text-left transition hover:border-teal-400 hover:shadow-sm"
				onclick={() => onApply(preset.config)}
			>
				<div
					class="h-16 w-full"
					style:background={presetGradient(preset)}
				></div>
				<div class="px-2.5 py-2">
					<span class="block text-xs font-medium text-gray-700 group-hover:text-teal-700">{preset.name}</span>
					<span class="block text-[10px] text-gray-400 line-clamp-2">{preset.description}</span>
				</div>
			</button>
		{/each}
	</div>
</div>

<script lang="ts">
	import type { Preset } from '$lib/presets';

	let { preset }: { preset: Preset } = $props();

	function presetBackground(p: Preset): string {
		const bg = p.config.background;
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

	const bgStyle = $derived(`background: ${presetBackground(preset)}`);
	const thumbSrc = $derived(`/templates/${preset.id}/thumb.png`);

	let imgFailed = $state(false);
</script>

<a
	href="/editor?preset={preset.id}"
	class="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-gray-300"
>
	{#if !imgFailed}
		<img
			src={thumbSrc}
			alt="{preset.name} preview"
			class="mb-3 h-48 w-full rounded-xl border border-gray-200 bg-gray-50 object-cover"
			onerror={() => imgFailed = true}
		/>
	{:else}
		<div
			class="mb-3 flex h-48 items-center justify-center rounded-xl"
			style={bgStyle}
		>
			<div class="rounded-lg bg-white/20 px-4 py-6 backdrop-blur-sm">
				<div class="h-2 w-16 rounded bg-white/60 mb-2"></div>
				<div class="h-16 w-10 rounded-lg bg-white/40"></div>
			</div>
		</div>
	{/if}
	<h3 class="text-sm font-semibold text-gray-900 group-hover:text-teal-700">
		{preset.name}
	</h3>
	<p class="mt-1 text-xs text-gray-500">{preset.description}</p>
</a>

<script lang="ts">
	import type { LayoutConfig, LayoutType } from '$lib/layers';

	let {
		config = $bindable(),
	}: {
		config: LayoutConfig;
	} = $props();

	const layouts: { value: LayoutType; label: string; desc: string }[] = [
		{ value: 'text-above', label: 'Text Above', desc: 'Headline top, device below' },
		{ value: 'text-left', label: 'Text Left', desc: 'Text left, device right' },
		{ value: 'text-right', label: 'Text Right', desc: 'Device left, text right' },
		{ value: 'split', label: 'Split', desc: 'Device + crop detail card' },
		{ value: 'centered', label: 'Centered', desc: 'Device centered, no headline' },
		{ value: 'duo-side-by-side', label: 'Duo Side', desc: 'Two devices side-by-side' },
		{ value: 'duo-overlap', label: 'Duo Overlap', desc: 'Overlapping devices with depth' },
	];
</script>

<div class="space-y-4">
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Layout</label>
		<div class="grid grid-cols-2 gap-1.5">
			{#each layouts as l (l.value)}
				<button
					class="rounded-lg border px-2.5 py-2 text-left transition {config.type === l.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}"
					onclick={() => config = { ...config, type: l.value }}
				>
					<span class="block text-xs font-medium {config.type === l.value ? 'text-teal-700' : 'text-gray-700'}">{l.label}</span>
					<span class="block text-[10px] {config.type === l.value ? 'text-teal-500' : 'text-gray-400'}">{l.desc}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if config.type.startsWith('duo')}
		<p class="rounded-lg bg-blue-50 px-3 py-2 text-[10px] text-blue-600">
			Duo layouts use two screenshots. Upload both in the gallery above.
		</p>
	{/if}

	{#if !config.type.startsWith('duo')}
		<div>
			<label class="mb-1.5 block text-xs font-medium text-gray-600">Panoramic</label>
			<div class="flex gap-1.5">
				<button
					class="flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition {!config.panoramic ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}"
					onclick={() => config = { ...config, panoramic: false }}
				>
					Off
				</button>
				<button
					class="flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition {config.panoramic ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}"
					onclick={() => config = { ...config, panoramic: true }}
				>
					On
				</button>
			</div>
		</div>

		{#if config.panoramic}
			<div>
				<div class="flex items-center justify-between mb-1">
					<label class="text-[10px] text-gray-500">Total Slides</label>
					<span class="text-[10px] font-mono text-gray-400">{config.totalSlides}</span>
				</div>
				<input type="range" min="2" max="6" step="1" value={config.totalSlides}
					oninput={(e) => config = { ...config, totalSlides: Number(e.currentTarget.value) }}
					class="w-full accent-teal-500" />
			</div>
			<p class="rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
				Upload one wide screenshot. Each slide shows a different portion.
			</p>
		{/if}
	{/if}
</div>

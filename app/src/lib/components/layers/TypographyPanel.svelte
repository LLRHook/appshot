<script lang="ts">
	import type { TypographyConfig } from '$lib/layers';

	let {
		config = $bindable(),
		onHeadlineAI,
	}: {
		config: TypographyConfig;
		onHeadlineAI?: () => void;
	} = $props();

	const weights = [
		{ value: 400, label: 'Regular' },
		{ value: 500, label: 'Medium' },
		{ value: 600, label: 'Semibold' },
		{ value: 700, label: 'Bold' },
		{ value: 800, label: 'Heavy' },
	];
</script>

<div class="space-y-4">
	<!-- Headline -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Headline</label>
		<div class="flex gap-1">
			<input
				type="text"
				maxlength="40"
				value={config.headline}
				oninput={(e) => config = { ...config, headline: (e.target as HTMLInputElement).value }}
				class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
			/>
			{#if onHeadlineAI}
				<button
					onclick={onHeadlineAI}
					class="shrink-0 rounded-lg border border-gray-200 px-2 py-2 text-xs hover:bg-gray-50"
					title="AI Headlines"
				>
					&#10022;
				</button>
			{/if}
		</div>
	</div>

	<!-- Subtitle -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Subtitle</label>
		<input
			type="text"
			maxlength="60"
			value={config.subtitle}
			oninput={(e) => config = { ...config, subtitle: (e.target as HTMLInputElement).value }}
			class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
			placeholder="Optional subtitle text"
		/>
	</div>

	<!-- Font Color -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Text Color</label>
		<div class="flex items-center gap-2">
			<input
				type="color"
				value={config.fontColor}
				oninput={(e) => config = { ...config, fontColor: (e.target as HTMLInputElement).value }}
				class="h-8 w-8 cursor-pointer rounded border border-gray-200"
			/>
			<input
				type="text"
				value={config.fontColor}
				oninput={(e) => config = { ...config, fontColor: (e.target as HTMLInputElement).value }}
				class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
			/>
		</div>
	</div>

	<!-- Font Weight -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Font Weight</label>
		<div class="flex flex-wrap gap-1">
			{#each weights as w (w.value)}
				<button
					class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {config.fontWeight === w.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
					onclick={() => config = { ...config, fontWeight: w.value }}
				>
					{w.label}
				</button>
			{/each}
		</div>
	</div>
</div>

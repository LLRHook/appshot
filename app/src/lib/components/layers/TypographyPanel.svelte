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

	const fonts = [
		{ value: '', label: 'System Default' },
		{ value: 'Georgia', label: 'Georgia' },
		{ value: 'Courier New', label: 'Courier New' },
		{ value: 'Impact', label: 'Impact' },
		{ value: 'Inter', label: 'Inter', google: true },
		{ value: 'Roboto', label: 'Roboto', google: true },
		{ value: 'Open Sans', label: 'Open Sans', google: true },
		{ value: 'Montserrat', label: 'Montserrat', google: true },
		{ value: 'Playfair Display', label: 'Playfair Display', google: true },
		{ value: 'Poppins', label: 'Poppins', google: true },
		{ value: 'Lato', label: 'Lato', google: true },
		{ value: 'Raleway', label: 'Raleway', google: true },
	];

	const alignments: { value: TypographyConfig['textAlign']; label: string }[] = [
		{ value: '', label: 'Auto' },
		{ value: 'left', label: 'Left' },
		{ value: 'center', label: 'Center' },
		{ value: 'right', label: 'Right' },
	];

	let subtitleOpen = $state(false);
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

	<!-- Font Family -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Font Family</label>
		<select
			value={config.fontFamily}
			onchange={(e) => config = { ...config, fontFamily: (e.target as HTMLSelectElement).value }}
			class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
		>
			{#each fonts as f (f.value)}
				<option value={f.value}>{f.label}</option>
			{/each}
		</select>
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

	<!-- Font Size -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Font Size — {config.fontSize}%</label>
		<input
			type="range"
			min="50"
			max="200"
			step="5"
			value={config.fontSize}
			oninput={(e) => config = { ...config, fontSize: parseInt((e.target as HTMLInputElement).value) }}
			class="w-full accent-teal-500"
		/>
	</div>

	<!-- Text Alignment -->
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">Text Alignment</label>
		<div class="flex gap-1">
			{#each alignments as a (a.value)}
				<button
					class="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition {config.textAlign === a.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
					onclick={() => config = { ...config, textAlign: a.value }}
				>
					{a.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Text Shadow -->
	<div>
		<label class="mb-1.5 flex items-center gap-2 text-xs font-medium text-gray-600">
			<input
				type="checkbox"
				checked={config.textShadow}
				onchange={(e) => config = { ...config, textShadow: (e.target as HTMLInputElement).checked }}
				class="rounded accent-teal-500"
			/>
			Text Shadow
		</label>
		{#if config.textShadow}
			<div class="ml-5 space-y-2">
				<div class="flex items-center gap-2">
					<input
						type="color"
						value={config.textShadowColor}
						oninput={(e) => config = { ...config, textShadowColor: (e.target as HTMLInputElement).value }}
						class="h-6 w-6 cursor-pointer rounded border border-gray-200"
					/>
					<input
						type="text"
						value={config.textShadowColor}
						oninput={(e) => config = { ...config, textShadowColor: (e.target as HTMLInputElement).value }}
						class="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
					/>
				</div>
				<div>
					<label class="mb-0.5 block text-xs text-gray-500">Blur — {config.textShadowBlur}px</label>
					<input
						type="range"
						min="0"
						max="20"
						step="1"
						value={config.textShadowBlur}
						oninput={(e) => config = { ...config, textShadowBlur: parseInt((e.target as HTMLInputElement).value) }}
						class="w-full accent-teal-500"
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Subtitle Styling -->
	<div>
		<button
			onclick={() => subtitleOpen = !subtitleOpen}
			class="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
		>
			Subtitle Styling
			<span class="text-[10px] text-gray-400">{subtitleOpen ? '▲' : '▼'}</span>
		</button>
		{#if subtitleOpen}
			<div class="mt-2 space-y-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
				<!-- Subtitle Color -->
				<div>
					<label class="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
						Color
						<button
							class="text-[10px] {config.subtitleColor ? 'text-teal-600' : 'text-gray-400'}"
							onclick={() => config = { ...config, subtitleColor: config.subtitleColor ? '' : config.fontColor }}
						>
							{config.subtitleColor ? 'custom' : 'inherit'}
						</button>
					</label>
					{#if config.subtitleColor}
						<div class="flex items-center gap-2">
							<input
								type="color"
								value={config.subtitleColor}
								oninput={(e) => config = { ...config, subtitleColor: (e.target as HTMLInputElement).value }}
								class="h-6 w-6 cursor-pointer rounded border border-gray-200"
							/>
							<input
								type="text"
								value={config.subtitleColor}
								oninput={(e) => config = { ...config, subtitleColor: (e.target as HTMLInputElement).value }}
								class="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
							/>
						</div>
					{/if}
				</div>

				<!-- Subtitle Weight -->
				<div>
					<label class="mb-1 block text-xs font-medium text-gray-600">Weight</label>
					<div class="flex flex-wrap gap-1">
						<button
							class="rounded-lg border px-2 py-1 text-[10px] font-medium transition {config.subtitleWeight === 0 ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
							onclick={() => config = { ...config, subtitleWeight: 0 }}
						>
							Inherit
						</button>
						{#each weights as w (w.value)}
							<button
								class="rounded-lg border px-2 py-1 text-[10px] font-medium transition {config.subtitleWeight === w.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
								onclick={() => config = { ...config, subtitleWeight: w.value }}
							>
								{w.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Subtitle Size -->
				<div>
					<label class="mb-0.5 block text-xs font-medium text-gray-600">Size — {config.subtitleSize}%</label>
					<input
						type="range"
						min="50"
						max="200"
						step="5"
						value={config.subtitleSize}
						oninput={(e) => config = { ...config, subtitleSize: parseInt((e.target as HTMLInputElement).value) }}
						class="w-full accent-teal-500"
					/>
				</div>
			</div>
		{/if}
	</div>
</div>

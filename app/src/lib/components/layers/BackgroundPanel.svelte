<script lang="ts">
	import type { BackgroundConfig, BackgroundType, GradientStop } from '$lib/layers';

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
		{ value: 'image', label: 'Image', desc: 'Upload a background image' },
	];

	const fitModes: { value: BackgroundConfig['imageFit']; label: string }[] = [
		{ value: 'cover', label: 'Cover' },
		{ value: 'contain', label: 'Contain' },
		{ value: 'fill', label: 'Fill' },
	];

	function handleImageUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			config = { ...config, imageUrl: reader.result as string };
		};
		reader.readAsDataURL(file);
	}

	function addGradientStop() {
		const stops = [...config.gradientStops];
		// Default: place new stop midway between last stop and 100
		const lastPos = stops.length > 0 ? stops[stops.length - 1].position : 0;
		const newPos = Math.min(Math.round((lastPos + 100) / 2), 100);
		stops.push({ color: '#888888', position: newPos });
		config = { ...config, gradientStops: stops };
	}

	function removeGradientStop(index: number) {
		const stops = config.gradientStops.filter((_, i) => i !== index);
		config = { ...config, gradientStops: stops };
	}

	function updateStop(index: number, field: keyof GradientStop, value: string | number) {
		const stops = config.gradientStops.map((s, i) =>
			i === index ? { ...s, [field]: value } : s
		);
		config = { ...config, gradientStops: stops };
	}

	const isGradient = $derived(config.type === 'linear-gradient' || config.type === 'radial-gradient');
	const useStops = $derived(isGradient && config.gradientStops.length > 0);

	// Build a CSS gradient string for the preview
	const previewBg = $derived.by(() => {
		if (config.type === 'image') {
			if (config.imageUrl) return `url(${config.imageUrl})`;
			return '#333';
		}
		if (config.type === 'solid') return config.color1;

		// For gradients (linear/radial), use stops if available, else color1/color2
		let colorStops: string;
		if (config.gradientStops.length > 0) {
			const sorted = [...config.gradientStops].sort((a, b) => a.position - b.position);
			colorStops = sorted.map(s => `${s.color} ${s.position}%`).join(', ');
		} else {
			colorStops = `${config.color1}, ${config.color2}`;
		}

		if (config.type === 'linear-gradient') {
			return `linear-gradient(${config.angle}deg, ${colorStops})`;
		}
		if (config.type === 'radial-gradient') {
			return `radial-gradient(circle at ${config.radialCenterX}% ${config.radialCenterY}%, ${colorStops})`;
		}
		// mesh
		return `linear-gradient(135deg, ${config.color1} 0%, ${config.color2} 50%, ${config.color3} 100%)`;
	});
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

	<!-- Image upload (image type only) -->
	{#if config.type === 'image'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Image</label>
			<input
				type="file"
				accept="image/*"
				onchange={handleImageUpload}
				class="w-full text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-teal-700 hover:file:bg-teal-100"
			/>
			{#if config.imageUrl}
				<div class="mt-2 h-16 w-full overflow-hidden rounded-lg border border-gray-200">
					<img src={config.imageUrl} alt="Background" class="h-full w-full object-cover" />
				</div>
			{/if}
		</div>

		<!-- Fit mode -->
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Fit Mode</label>
			<div class="flex gap-1.5">
				{#each fitModes as fm (fm.value)}
					<button
						class="flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition {config.imageFit === fm.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
						onclick={() => config = { ...config, imageFit: fm.value }}
					>
						{fm.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Blur -->
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Blur</label>
			<div class="flex items-center gap-2">
				<input
					type="range"
					min="0"
					max="30"
					value={config.imageBlur}
					oninput={(e) => config = { ...config, imageBlur: Number((e.target as HTMLInputElement).value) }}
					class="w-full accent-teal-600"
				/>
				<span class="w-10 text-right text-xs font-mono text-gray-500">{config.imageBlur}px</span>
			</div>
		</div>

		<!-- Overlay -->
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Overlay</label>
			<div class="flex items-center gap-2">
				<input
					type="color"
					value={config.imageOverlayColor}
					oninput={(e) => config = { ...config, imageOverlayColor: (e.target as HTMLInputElement).value }}
					class="h-8 w-8 cursor-pointer rounded border border-gray-200"
				/>
				<input
					type="range"
					min="0"
					max="100"
					value={config.imageOverlayOpacity}
					oninput={(e) => config = { ...config, imageOverlayOpacity: Number((e.target as HTMLInputElement).value) }}
					class="w-full accent-teal-600"
				/>
				<span class="w-10 text-right text-xs font-mono text-gray-500">{config.imageOverlayOpacity}%</span>
			</div>
		</div>
	{/if}

	<!-- Color 1 (always shown for non-image types) -->
	{#if config.type !== 'image'}
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
	{/if}

	<!-- Color 2 (gradient + mesh) -->
	{#if config.type !== 'solid' && config.type !== 'image'}
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

	<!-- Radial center (radial gradient only) -->
	{#if config.type === 'radial-gradient'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Center X</label>
			<div class="flex items-center gap-2">
				<input
					type="range"
					min="0"
					max="100"
					value={config.radialCenterX}
					oninput={(e) => config = { ...config, radialCenterX: Number((e.target as HTMLInputElement).value) }}
					class="w-full accent-teal-600"
				/>
				<span class="w-10 text-right text-xs font-mono text-gray-500">{config.radialCenterX}%</span>
			</div>
		</div>
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Center Y</label>
			<div class="flex items-center gap-2">
				<input
					type="range"
					min="0"
					max="100"
					value={config.radialCenterY}
					oninput={(e) => config = { ...config, radialCenterY: Number((e.target as HTMLInputElement).value) }}
					class="w-full accent-teal-600"
				/>
				<span class="w-10 text-right text-xs font-mono text-gray-500">{config.radialCenterY}%</span>
			</div>
		</div>
	{/if}

	<!-- Gradient stops (linear/radial only) -->
	{#if isGradient}
		<div>
			<div class="mb-1 flex items-center justify-between">
				<label class="text-xs font-medium text-gray-600">Gradient Stops</label>
				<button
					onclick={addGradientStop}
					class="rounded border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
				>
					+ Add Stop
				</button>
			</div>
			{#if config.gradientStops.length > 0}
				<p class="mb-2 text-[10px] text-gray-400">Overrides Color 1/2 when stops are present</p>
				<div class="space-y-2">
					{#each config.gradientStops as stop, i (i)}
						<div class="flex items-center gap-2">
							<input
								type="color"
								value={stop.color}
								oninput={(e) => updateStop(i, 'color', (e.target as HTMLInputElement).value)}
								class="h-7 w-7 cursor-pointer rounded border border-gray-200"
							/>
							<input
								type="range"
								min="0"
								max="100"
								value={stop.position}
								oninput={(e) => updateStop(i, 'position', Number((e.target as HTMLInputElement).value))}
								class="w-full accent-teal-600"
							/>
							<span class="w-8 text-right text-[10px] font-mono text-gray-500">{stop.position}%</span>
							<button
								onclick={() => removeGradientStop(i)}
								class="text-gray-400 hover:text-red-500"
								title="Remove stop"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-[10px] text-gray-400">No stops added. Using Color 1 &amp; 2.</p>
			{/if}
		</div>
	{/if}

	<!-- Preview swatch -->
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Preview</label>
		<div
			class="h-16 w-full rounded-lg border border-gray-200"
			style:background={previewBg}
			style:background-size={config.type === 'image' ? 'cover' : undefined}
		></div>
	</div>
</div>

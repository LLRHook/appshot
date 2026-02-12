<script lang="ts">
	import type { PerspectiveConfig, PerspectivePreset } from '$lib/layers';
	import { PERSPECTIVE_PRESETS } from '$lib/layers';

	let {
		config = $bindable(),
	}: {
		config: PerspectiveConfig;
	} = $props();

	let showAdvanced = $state(false);

	const presets: { value: PerspectivePreset; label: string }[] = [
		{ value: 'flat', label: 'Flat' },
		{ value: 'tilt-left', label: 'Tilt Left' },
		{ value: 'tilt-right', label: 'Tilt Right' },
		{ value: 'isometric', label: 'Isometric' },
		{ value: 'hero-shot', label: 'Hero Shot' },
	];

	function applyPreset(preset: PerspectivePreset) {
		const values = PERSPECTIVE_PRESETS[preset];
		config = { preset, ...values };
	}

	function updateAdvanced(field: keyof PerspectiveConfig, value: number) {
		config = { ...config, preset: 'flat', [field]: value };
	}
</script>

<div class="space-y-4">
	<div>
		<label class="mb-1.5 block text-xs font-medium text-gray-600">3D Angle</label>
		<div class="grid grid-cols-2 gap-1.5">
			{#each presets as p (p.value)}
				<button
					class="rounded-lg border px-2.5 py-2 text-left transition {config.preset === p.value ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}"
					onclick={() => applyPreset(p.value)}
				>
					<span class="block text-xs font-medium {config.preset === p.value ? 'text-teal-700' : 'text-gray-700'}">{p.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<button
		class="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
		onclick={() => showAdvanced = !showAdvanced}
	>
		{showAdvanced ? 'Hide' : 'Show'} Advanced
	</button>

	{#if showAdvanced}
		<div class="space-y-3">
			<div>
				<div class="flex items-center justify-between mb-1">
					<label class="text-[10px] text-gray-500">Tilt X</label>
					<span class="text-[10px] font-mono text-gray-400">{config.rotateX}°</span>
				</div>
				<input type="range" min="-60" max="60" step="1" value={config.rotateX}
					oninput={(e) => updateAdvanced('rotateX', Number(e.currentTarget.value))}
					class="w-full accent-teal-500" />
			</div>
			<div>
				<div class="flex items-center justify-between mb-1">
					<label class="text-[10px] text-gray-500">Tilt Y</label>
					<span class="text-[10px] font-mono text-gray-400">{config.rotateY}°</span>
				</div>
				<input type="range" min="-60" max="60" step="1" value={config.rotateY}
					oninput={(e) => updateAdvanced('rotateY', Number(e.currentTarget.value))}
					class="w-full accent-teal-500" />
			</div>
			<div>
				<div class="flex items-center justify-between mb-1">
					<label class="text-[10px] text-gray-500">Rotate Z</label>
					<span class="text-[10px] font-mono text-gray-400">{config.rotateZ}°</span>
				</div>
				<input type="range" min="-30" max="30" step="1" value={config.rotateZ}
					oninput={(e) => updateAdvanced('rotateZ', Number(e.currentTarget.value))}
					class="w-full accent-teal-500" />
			</div>
			<div>
				<div class="flex items-center justify-between mb-1">
					<label class="text-[10px] text-gray-500">Depth</label>
					<span class="text-[10px] font-mono text-gray-400">{config.perspective}px</span>
				</div>
				<input type="range" min="400" max="2000" step="50" value={config.perspective}
					oninput={(e) => updateAdvanced('perspective', Number(e.currentTarget.value))}
					class="w-full accent-teal-500" />
			</div>
		</div>
	{/if}
</div>

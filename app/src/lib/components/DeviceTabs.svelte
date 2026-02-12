<script lang="ts">
	import { DEVICE_SIZES, type DeviceSize } from '$lib/templates';

	let {
		selected,
		onSelect,
	}: {
		selected: DeviceSize;
		onSelect: (device: DeviceSize) => void;
	} = $props();
</script>

<div class="flex gap-1 rounded-xl bg-gray-100 p-1">
	{#each DEVICE_SIZES as size (size.label)}
		<button
			class="flex flex-col items-center rounded-lg px-3 py-2 text-xs transition {selected.label === size.label ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
			onclick={() => onSelect(size)}
		>
			<span>{size.label}</span>
			<span class="mt-0.5 text-[10px] font-mono text-gray-400">{size.width}&times;{size.height}</span>
		</button>
	{/each}
</div>

<script lang="ts">
	let {
		screenshots,
		currentSlide = $bindable(0),
	}: {
		screenshots: string[];
		currentSlide: number;
	} = $props();
</script>

{#if screenshots.length > 1}
	<div class="flex items-center gap-2 overflow-x-auto py-1">
		<span class="shrink-0 text-xs font-medium text-gray-500">Slides:</span>
		{#each screenshots as src, i (i)}
			<button
				onclick={() => currentSlide = i}
				class="relative h-12 w-8 shrink-0 overflow-hidden rounded-md border-2 transition {currentSlide === i ? 'border-teal-500 shadow-sm' : 'border-gray-200 opacity-60 hover:opacity-100'}"
			>
				<img {src} alt="Slide {i + 1}" class="h-full w-full object-cover" />
				<span class="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[8px] text-white">
					{i + 1}
				</span>
			</button>
		{/each}
	</div>
{/if}

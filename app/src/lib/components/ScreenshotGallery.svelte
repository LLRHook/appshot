<script lang="ts">
	let {
		screenshots = $bindable<string[]>([]),
		maxSlots = 10,
		slotLabels = [] as string[],
	}: {
		screenshots: string[];
		maxSlots?: number;
		slotLabels?: string[];
	} = $props();

	let dragOverIndex: number | null = $state(null);
	let dragSourceIndex: number | null = $state(null);

	function handleFiles(files: FileList | null) {
		if (!files) return;
		const remaining = maxSlots - screenshots.length;
		const toProcess = Array.from(files).slice(0, remaining);
		for (const file of toProcess) {
			if (!file.type.startsWith('image/')) continue;
			const reader = new FileReader();
			reader.onload = () => {
				screenshots = [...screenshots, reader.result as string];
			};
			reader.readAsDataURL(file);
		}
	}

	function handleDropZone(event: DragEvent) {
		event.preventDefault();
		handleFiles(event.dataTransfer?.files ?? null);
	}

	function removeScreenshot(index: number) {
		screenshots = screenshots.filter((_, i) => i !== index);
	}

	function handleDragStart(index: number) {
		dragSourceIndex = index;
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (dragSourceIndex !== null && dragSourceIndex !== index) {
			dragOverIndex = index;
		}
	}

	function handleDrop(event: DragEvent, index: number) {
		event.preventDefault();
		if (dragSourceIndex !== null && dragSourceIndex !== index) {
			const reordered = [...screenshots];
			const [moved] = reordered.splice(dragSourceIndex, 1);
			reordered.splice(index, 0, moved);
			screenshots = reordered;
		}
		dragSourceIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		dragSourceIndex = null;
		dragOverIndex = null;
	}
</script>

<div class="space-y-3">
	<p class="mb-1 text-xs font-medium text-gray-600">
		Screenshots ({screenshots.length}{maxSlots < 10 ? `/${maxSlots}` : ''})
	</p>

	<!-- Slot-based layout for composed templates -->
	{#if slotLabels.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each slotLabels as label, i (i)}
				{#if screenshots[i]}
					<div
						class="group relative h-20 w-14 shrink-0 cursor-grab overflow-hidden rounded-lg border-2 transition {dragOverIndex === i ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}"
						draggable="true"
						role="listitem"
						ondragstart={() => handleDragStart(i)}
						ondragover={(e) => handleDragOver(e, i)}
						ondrop={(e) => handleDrop(e, i)}
						ondragend={handleDragEnd}
					>
						<img src={screenshots[i]} alt={label} class="h-full w-full object-cover" />
						<span class="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[10px] text-white">
							{label}
						</span>
						<button
							onclick={() => removeScreenshot(i)}
							class="absolute -right-0.5 -top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
						>
							&times;
						</button>
					</div>
				{:else}
					<div
						class="flex h-20 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-400"
						role="button"
						tabindex="0"
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer?.files ?? null); }}
						onclick={() => document.getElementById('gallery-input')?.click()}
						onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('gallery-input')?.click(); }}
					>
						<span class="px-0.5 text-center text-[9px] leading-tight text-gray-400">{label}</span>
					</div>
				{/if}
			{/each}
		</div>
	{:else if screenshots.length > 0}
		<!-- Series mode: plain thumbnail strip -->
		<div class="flex flex-wrap gap-2">
			{#each screenshots as src, i (i)}
				<div
					class="group relative h-20 w-14 shrink-0 cursor-grab overflow-hidden rounded-lg border-2 transition {dragOverIndex === i ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}"
					draggable="true"
					role="listitem"
					ondragstart={() => handleDragStart(i)}
					ondragover={(e) => handleDragOver(e, i)}
					ondrop={(e) => handleDrop(e, i)}
					ondragend={handleDragEnd}
				>
					<img {src} alt="Screenshot {i + 1}" class="h-full w-full object-cover" />
					<span class="absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[10px] text-white">
						{i + 1}
					</span>
					<button
						onclick={() => removeScreenshot(i)}
						class="absolute -right-0.5 -top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
					>
						&times;
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Drop zone for adding more -->
	{#if screenshots.length < maxSlots}
		<div
			class="flex h-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-400 hover:bg-teal-50"
			role="button"
			tabindex="0"
			ondragover={(e) => e.preventDefault()}
			ondrop={handleDropZone}
			onclick={() => document.getElementById('gallery-input')?.click()}
			onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('gallery-input')?.click(); }}
		>
			<span class="text-xs text-gray-400">
				{screenshots.length === 0 ? 'Drop screenshots or click to upload' : 'Add more screenshots'}
			</span>
			<input
				id="gallery-input"
				type="file"
				accept="image/*"
				multiple
				class="hidden"
				onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
			/>
		</div>
	{/if}
</div>

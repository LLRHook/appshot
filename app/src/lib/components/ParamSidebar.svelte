<script lang="ts">
	import type { TemplateSchema, ParamDef } from '$lib/templates';
	import type { ParamValues } from '$lib/stores';

	let {
		schema,
		params = $bindable(),
		onHeadlineAI,
	}: {
		schema: TemplateSchema;
		params: ParamValues;
		onHeadlineAI?: () => void;
	} = $props();

	function handleImageUpload(key: string, event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			params = { ...params, [key]: reader.result as string };
		};
		reader.readAsDataURL(file);
	}

	function handleDrop(key: string, event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (!file || !file.type.startsWith('image/')) return;

		const reader = new FileReader();
		reader.onload = () => {
			params = { ...params, [key]: reader.result as string };
		};
		reader.readAsDataURL(file);
	}

	const paramEntries = $derived(Object.entries(schema.params) as [string, ParamDef][]);
</script>

<div class="space-y-4">
	{#each paramEntries as [key, param] (key)}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600" for="param-{key}">
				{param.label}
			</label>

			{#if param.type === 'text'}
				<div class="flex gap-1">
					<input
						id="param-{key}"
						type="text"
						maxlength={param.maxLength}
						value={params[key] ?? ''}
						oninput={(e) => params = { ...params, [key]: (e.target as HTMLInputElement).value }}
						class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
					/>
					{#if key === 'headline' && onHeadlineAI}
						<button
							onclick={onHeadlineAI}
							class="shrink-0 rounded-lg border border-gray-200 px-2 py-2 text-xs hover:bg-gray-50"
							title="AI Headlines"
						>
							✦
						</button>
					{/if}
				</div>

			{:else if param.type === 'enum'}
				<div class="flex flex-wrap gap-1">
					{#each param.options ?? [] as option (option)}
						<button
							class="rounded-lg border px-3 py-1.5 text-xs font-medium transition {params[key] === option ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}"
							onclick={() => params = { ...params, [key]: option }}
						>
							{option}
						</button>
					{/each}
				</div>

			{:else if param.type === 'color'}
				<div class="flex items-center gap-2">
					<input
						id="param-{key}"
						type="color"
						value={params[key] ?? '#000000'}
						oninput={(e) => params = { ...params, [key]: (e.target as HTMLInputElement).value }}
						class="h-8 w-8 cursor-pointer rounded border border-gray-200"
					/>
					<input
						type="text"
						value={params[key] ?? ''}
						oninput={(e) => params = { ...params, [key]: (e.target as HTMLInputElement).value }}
						class="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
					/>
				</div>

			{:else if param.type === 'number'}
				<div class="flex items-center gap-2">
					<input
						id="param-{key}"
						type="range"
						min={param.min ?? 0}
						max={param.max ?? 100}
						value={params[key] ?? 0}
						oninput={(e) => params = { ...params, [key]: Number((e.target as HTMLInputElement).value) }}
						class="w-full accent-teal-600"
					/>
					<span class="w-10 text-right text-xs font-mono text-gray-500">{params[key]}</span>
				</div>

			{:else if param.type === 'image'}
				<div
					class="relative flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-400 hover:bg-teal-50"
					role="button"
					tabindex="0"
					ondragover={(e) => e.preventDefault()}
					ondrop={(e) => handleDrop(key, e)}
					onclick={() => document.getElementById(`file-${key}`)?.click()}
					onkeydown={(e) => { if (e.key === 'Enter') document.getElementById(`file-${key}`)?.click(); }}
				>
					{#if params[key]}
						<img src={String(params[key])} alt="Uploaded" class="h-full w-full rounded-lg object-contain" />
					{:else}
						<span class="text-xs text-gray-400">Drop image or click to upload</span>
					{/if}
					<input
						id="file-{key}"
						type="file"
						accept="image/*"
						class="hidden"
						onchange={(e) => handleImageUpload(key, e)}
					/>
				</div>
			{/if}
		</div>
	{/each}
</div>

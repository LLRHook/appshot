<script lang="ts">
	import { buildTemplateUrl } from '$lib/stores';
	import type { ParamValues } from '$lib/stores';

	let {
		templateId,
		params,
		aspectWidth = 1320,
		aspectHeight = 2868,
	}: {
		templateId: string;
		params: ParamValues;
		aspectWidth?: number;
		aspectHeight?: number;
	} = $props();

	const iframeSrc = $derived(buildTemplateUrl(templateId, params));
	const aspectRatio = $derived(`${aspectWidth} / ${aspectHeight}`);
</script>

<div class="flex h-full w-full items-center justify-center p-4">
	<div
		class="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
		style="aspect-ratio: {aspectRatio}; max-height: 100%; max-width: 100%;"
	>
		<iframe
			src={iframeSrc}
			title="Preview"
			class="h-full w-full border-0"
			sandbox="allow-scripts allow-same-origin"
		></iframe>
	</div>
</div>

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

	let iframeEl: HTMLIFrameElement | undefined = $state();

	// Send data URL images to iframe via postMessage (too large for URL params)
	$effect(() => {
		if (!iframeEl?.contentWindow) return;
		const dataUrlParams: Record<string, string> = {};
		for (const [key, value] of Object.entries(params)) {
			if (typeof value === 'string' && value.startsWith('data:')) {
				dataUrlParams[key] = value;
			}
		}
		if (Object.keys(dataUrlParams).length > 0) {
			iframeEl.contentWindow.postMessage({ type: 'setImages', images: dataUrlParams }, '*');
		}
	});

	function onIframeLoad() {
		// Re-send data URL images after iframe navigates
		if (!iframeEl?.contentWindow) return;
		for (const [key, value] of Object.entries(params)) {
			if (typeof value === 'string' && value.startsWith('data:')) {
				iframeEl.contentWindow.postMessage({ type: 'setImages', images: { [key]: value } }, '*');
			}
		}
	}
</script>

<div class="flex h-full w-full items-center justify-center p-4">
	<div
		class="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
		style="aspect-ratio: {aspectRatio}; max-height: 100%; max-width: 100%;"
	>
		<iframe
			bind:this={iframeEl}
			src={iframeSrc}
			title="Preview"
			class="h-full w-full border-0"
			sandbox="allow-scripts allow-same-origin"
			onload={onIframeLoad}
		></iframe>
	</div>
</div>

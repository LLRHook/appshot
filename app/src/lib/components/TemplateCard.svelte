<script lang="ts">
	import type { TemplateSchema } from '$lib/templates';

	let { template }: { template: TemplateSchema } = $props();

	const THUMB_STYLES: Record<string, string> = {
		'gradient-bezel': 'background: linear-gradient(135deg, #D4A574, #328983)',
		'clean-flat': 'background: #F5F5F5',
		'dark-minimal': 'background: #111',
	};

	const thumbStyle = $derived(THUMB_STYLES[template.id] || 'background: #e5e7eb');
	const thumbSrc = $derived(`/templates/${template.id}/thumb.png`);

	let imgFailed = $state(false);
</script>

<a
	href="/editor?template={template.id}"
	class="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-gray-300"
>
	{#if !imgFailed}
		<img
			src={thumbSrc}
			alt="{template.name} preview"
			class="mb-3 h-48 w-full rounded-xl object-cover"
			onerror={() => imgFailed = true}
		/>
	{:else}
		<div
			class="mb-3 flex h-48 items-center justify-center rounded-xl"
			style={thumbStyle}
		>
			<div class="rounded-lg bg-white/20 px-4 py-6 backdrop-blur-sm">
				<div class="h-2 w-16 rounded bg-white/60 mb-2"></div>
				<div class="h-16 w-10 rounded-lg bg-white/40"></div>
			</div>
		</div>
	{/if}
	<h3 class="text-sm font-semibold text-gray-900 group-hover:text-teal-700">
		{template.name}
	</h3>
	<p class="mt-1 text-xs text-gray-500">{template.description}</p>
</a>

<script lang="ts">
	import { TEMPLATES } from '$lib/templates';
	import TemplateCard from '$lib/components/TemplateCard.svelte';
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<h1 class="text-xl font-bold text-gray-900">Appshot</h1>
			<span class="text-xs text-gray-400">App Store Screenshot Generator</span>
		</div>
	</header>

	<!-- Hero -->
	<section class="border-b border-gray-100 bg-white">
		<div class="mx-auto max-w-5xl px-6 py-16 text-center">
			<h2 class="text-4xl font-bold tracking-tight text-gray-900">
				App Store screenshots,<br />done in minutes
			</h2>
			<p class="mx-auto mt-4 max-w-lg text-lg text-gray-500">
				Upload your app screenshots, pick a template, customize colors and text, export at exact App Store dimensions.
			</p>
			<a
				href="/editor?template=gradient-bezel"
				class="mt-8 inline-block rounded-xl bg-teal-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
			>
				Start Creating
			</a>
		</div>
	</section>

	<!-- Features -->
	<section class="border-b border-gray-100">
		<div class="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<div class="mb-3 text-2xl">&#x1F3A8;</div>
				<h3 class="text-sm font-semibold text-gray-900">Templates</h3>
				<p class="mt-1 text-xs text-gray-500">Pre-built layouts with gradients, device bezels, and varied compositions.</p>
			</div>
			<div>
				<div class="mb-3 text-2xl">&#x26A1;</div>
				<h3 class="text-sm font-semibold text-gray-900">Live Preview</h3>
				<p class="mt-1 text-xs text-gray-500">Real-time preview as you tweak every parameter. What you see is what you export.</p>
			</div>
			<div>
				<div class="mb-3 text-2xl">&#x2728;</div>
				<h3 class="text-sm font-semibold text-gray-900">AI Headlines</h3>
				<p class="mt-1 text-xs text-gray-500">Generate marketing copy with Claude. Describe your app, get headline options.</p>
			</div>
			<div>
				<div class="mb-3 text-2xl">&#x1F4F1;</div>
				<h3 class="text-sm font-semibold text-gray-900">One-Click Export</h3>
				<p class="mt-1 text-xs text-gray-500">Export at exact App Store dimensions. iPhone 6.9", 6.7", 6.5", iPad 13".</p>
			</div>
		</div>
	</section>

	<!-- Templates -->
	<section>
		<div class="mx-auto max-w-5xl px-6 py-16">
			<h2 class="mb-2 text-2xl font-bold text-gray-900">Templates</h2>
			<p class="mb-8 text-sm text-gray-500">Pick a template to start composing your App Store screenshots.</p>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each TEMPLATES as template (template.id)}
					<TemplateCard {template} />
				{/each}
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-gray-200 bg-white">
		<div class="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-gray-400">
			Appshot &mdash; Local-first App Store screenshot generator
		</div>
	</footer>
</div>

<script lang="ts">
	import { PRESETS } from '$lib/presets';
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
		<div class="mx-auto max-w-5xl px-6 py-16">
			<div class="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
				<div class="text-center lg:text-left lg:flex-1">
					<h2 class="text-4xl font-bold tracking-tight text-gray-900">
						App Store screenshots,<br />done in minutes
					</h2>
					<p class="mx-auto mt-4 max-w-lg text-lg text-gray-500 lg:mx-0">
						Pick a preset or compose from scratch. Mix backgrounds, device frames, layouts, and effects to create professional screenshots.
					</p>
					<div class="mt-8 flex flex-wrap items-center gap-3 justify-center lg:justify-start">
						<a
							href="/editor?preset=gradient-bezel"
							class="inline-block rounded-xl bg-teal-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
						>
							Start from Preset
						</a>
						<a
							href="/editor"
							class="inline-block rounded-xl border border-gray-300 px-8 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
						>
							Start from Scratch
						</a>
					</div>
				</div>

				<!-- Before / After illustration -->
				<div class="flex items-center gap-4 lg:flex-1">
					<div class="flex flex-col items-center gap-2">
						<div class="h-52 w-24 rounded-lg border-2 border-dashed border-gray-300 bg-gray-100 flex items-center justify-center">
							<div class="space-y-1.5 px-2">
								<div class="h-1.5 w-full rounded bg-gray-300"></div>
								<div class="h-8 w-full rounded bg-gray-200"></div>
								<div class="h-1.5 w-3/4 rounded bg-gray-300"></div>
								<div class="h-6 w-full rounded bg-gray-200"></div>
							</div>
						</div>
						<span class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Raw</span>
					</div>
					<div class="text-2xl text-gray-300">&rarr;</div>
					<div class="flex flex-col items-center gap-2">
						<div class="h-52 w-24 rounded-xl shadow-lg overflow-hidden" style="background: linear-gradient(135deg, #D4A574, #328983)">
							<div class="flex h-full flex-col items-center justify-center gap-2 p-2">
								<div class="h-1.5 w-12 rounded bg-white/70"></div>
								<div class="h-28 w-16 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
									<div class="space-y-1 px-1.5">
										<div class="h-1 w-full rounded bg-white/40"></div>
										<div class="h-5 w-full rounded bg-white/30"></div>
										<div class="h-1 w-3/4 rounded bg-white/40"></div>
										<div class="h-4 w-full rounded bg-white/30"></div>
									</div>
								</div>
							</div>
						</div>
						<span class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Composed</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features -->
	<section class="border-b border-gray-100">
		<div class="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<div class="mb-3 text-2xl">&#x1F3A8;</div>
				<h3 class="text-sm font-semibold text-gray-900">Composable Layers</h3>
				<p class="mt-1 text-xs text-gray-500">Mix backgrounds, device frames, layouts, and effects independently.</p>
			</div>
			<div>
				<div class="mb-3 text-2xl">&#x26A1;</div>
				<h3 class="text-sm font-semibold text-gray-900">Live Preview</h3>
				<p class="mt-1 text-xs text-gray-500">Real-time preview as you tweak every layer. What you see is what you export.</p>
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

	<!-- Presets Gallery -->
	<section>
		<div class="mx-auto max-w-5xl px-6 py-16">
			<h2 class="mb-2 text-2xl font-bold text-gray-900">Presets</h2>
			<p class="mb-8 text-sm text-gray-500">Start from a preset and customize every layer, or create your own from scratch.</p>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each PRESETS as preset (preset.id)}
					<TemplateCard {preset} />
				{/each}
				<!-- Start from scratch card -->
				<a
					href="/editor"
					class="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 p-8 transition hover:border-teal-400 hover:bg-teal-50/30"
				>
					<div class="mb-3 text-3xl text-gray-300 group-hover:text-teal-400">+</div>
					<span class="text-sm font-semibold text-gray-500 group-hover:text-teal-700">Start from Scratch</span>
					<span class="mt-1 text-xs text-gray-400">Build your own layer combination</span>
				</a>
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

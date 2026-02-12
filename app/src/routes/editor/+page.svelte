<script lang="ts">
	import { page } from '$app/state';
	import { getTemplate, getTemplateDefaults, DEVICE_SIZES, type DeviceSize } from '$lib/templates';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';
	import DeviceTabs from '$lib/components/DeviceTabs.svelte';
	import ExportButton from '$lib/components/ExportButton.svelte';
	import ScreenshotGallery from '$lib/components/ScreenshotGallery.svelte';
	import type { ParamValues } from '$lib/stores';

	const templateId = $derived(page.url.searchParams.get('template') || '');
	const template = $derived(getTemplate(templateId));

	let params: ParamValues = $state({});
	let selectedDevice: DeviceSize = $state(DEVICE_SIZES[0]);

	// Screenshot gallery state
	let screenshots: string[] = $state([]);

	// Detect template mode from params
	const imageParamKeys = $derived(
		template ? Object.entries(template.params).filter(([, p]) => p.type === 'image').map(([k]) => k) : []
	);
	const isSeriesMode = $derived(template ? 'slide' in template.params : false);
	const isMultiImage = $derived(imageParamKeys.length > 1 || isSeriesMode);
	const galleryMaxSlots = $derived(isSeriesMode ? 10 : imageParamKeys.length);
	const hiddenImageParams = $derived(isMultiImage ? new Set(imageParamKeys) : new Set<string>());

	// For series mode: also hide slide and total_slides — managed automatically
	const hiddenParams = $derived(() => {
		const hidden = new Set(hiddenImageParams);
		if (isSeriesMode) {
			hidden.add('slide');
			hidden.add('total_slides');
		}
		return hidden;
	});

	// Current slide for series mode
	let currentSlide = $state(0);

	// Map gallery screenshots to template params
	$effect(() => {
		if (!isMultiImage || screenshots.length === 0) return;

		if (isSeriesMode) {
			// Series: map current screenshot to src, auto-set slide counts
			const updates: Record<string, string | number> = {
				total_slides: screenshots.length,
				slide: currentSlide + 1,
			};
			if (screenshots[currentSlide]) {
				updates.src = screenshots[currentSlide];
			}
			params = { ...params, ...updates };
		} else {
			// Composed: map screenshots to src_1, src_2, etc.
			const updates: Record<string, string> = {};
			for (let i = 0; i < imageParamKeys.length; i++) {
				if (screenshots[i]) {
					updates[imageParamKeys[i]] = screenshots[i];
				}
			}
			params = { ...params, ...updates };
		}
	});

	// AI Headlines state
	let showHeadlineAI = $state(false);
	let aiDescription = $state('');
	let aiHeadlines: string[] = $state([]);
	let aiLoading = $state(false);

	// Mobile sidebar state
	let sidebarOpen = $state(false);

	// Style Match state
	let showStyleMatch = $state(false);
	let styleMatchLoading = $state(false);
	let matchedStyle: Record<string, string | number> | null = $state(null);

	// Initialize params when template loads
	$effect(() => {
		if (template) {
			const defaults = getTemplateDefaults(template);
			defaults.device = selectedDevice.device;
			params = defaults;
		}
	});

	// Sync device param when device tab changes (without reading params to avoid loop)
	function onDeviceChange(device: DeviceSize) {
		selectedDevice = device;
		params = { ...params, device: device.device };
	}

	async function generateHeadlines() {
		aiLoading = true;
		try {
			const res = await fetch('/api/ai/headlines', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ description: aiDescription }),
			});
			const data = await res.json();
			aiHeadlines = data.headlines || [];
		} catch {
			aiHeadlines = ['Split Bills Instantly', 'Fair Shares, No Math', 'Who Owes What?', 'Bill Splitting, Solved'];
		} finally {
			aiLoading = false;
		}
	}

	function selectHeadline(headline: string) {
		params = { ...params, headline };
		showHeadlineAI = false;
	}

	async function handleStyleMatchUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		styleMatchLoading = true;
		matchedStyle = null;

		const reader = new FileReader();
		reader.onload = async () => {
			try {
				const res = await fetch('/api/ai/style-match', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ image: reader.result }),
				});
				const data = await res.json();
				matchedStyle = data.style || null;
			} catch {
				matchedStyle = { gradient_from: '#2C3E50', gradient_to: '#3498DB', gradient_angle: 145, layout: 'text-left' };
			} finally {
				styleMatchLoading = false;
			}
		};
		reader.readAsDataURL(file);
	}

	function applyMatchedStyle() {
		if (!matchedStyle) return;
		params = { ...params, ...matchedStyle };
		showStyleMatch = false;
		matchedStyle = null;
	}
</script>

{#if template}
	<div class="flex h-screen flex-col bg-gray-50 lg:flex-row">
		<!-- Sidebar: collapsible on mobile, always visible on desktop -->
		<aside class="w-full shrink-0 overflow-y-auto border-b border-gray-200 bg-white lg:w-80 lg:border-b-0 lg:border-r {sidebarOpen ? '' : 'max-lg:hidden'}">
			<div class="border-b border-gray-100 px-4 py-3">
				<div class="flex items-center justify-between">
					<a href="/" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back</a>
					<div class="flex items-center gap-2">
						<button
							onclick={() => showStyleMatch = true}
							class="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
							title="Match competitor style"
						>
							Match Style
						</button>
						<h2 class="text-sm font-semibold text-gray-900">{template.name}</h2>
					</div>
				</div>
			</div>
			<div class="p-4">
				{#if isMultiImage}
					<div class="mb-4">
						<ScreenshotGallery bind:screenshots maxSlots={galleryMaxSlots} />
					</div>
				{/if}
				<ParamSidebar
					schema={template}
					bind:params
					onHeadlineAI={() => showHeadlineAI = !showHeadlineAI}
					hiddenParams={hiddenParams()}
				/>
			</div>
			<!-- Close sidebar button on mobile -->
			<div class="border-t border-gray-100 p-3 lg:hidden">
				<button
					onclick={() => sidebarOpen = false}
					class="w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600"
				>
					Done
				</button>
			</div>
		</aside>

		<!-- Mobile toolbar: back + toggle sidebar + template name -->
		<div class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
			<a href="/" class="text-sm text-gray-500 hover:text-gray-700">&larr;</a>
			<span class="text-sm font-semibold text-gray-900">{template.name}</span>
			<button
				onclick={() => sidebarOpen = !sidebarOpen}
				class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
			>
				{sidebarOpen ? 'Preview' : 'Edit'}
			</button>
		</div>

		<div class="flex min-h-0 flex-1 flex-col {sidebarOpen ? 'max-lg:hidden' : ''}">
			<div class="min-h-0 flex-1">
				<LivePreview
					{templateId}
					{params}
					aspectWidth={selectedDevice.width}
					aspectHeight={selectedDevice.height}
				/>
			</div>

			<!-- Sticky footer: device tabs + export -->
			<div class="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-4 py-3">
				<div class="flex items-center justify-between gap-2">
					<div class="overflow-x-auto">
						<DeviceTabs selected={selectedDevice} onSelect={onDeviceChange} />
					</div>
					<ExportButton {templateId} {params} {selectedDevice} />
				</div>
			</div>
		</div>
	</div>

	<!-- AI Headlines Modal -->
	{#if showHeadlineAI}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
			<div class="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-sm font-semibold text-gray-900">AI Headlines</h3>
					<button class="text-gray-400 hover:text-gray-600" onclick={() => showHeadlineAI = false}>
						&times;
					</button>
				</div>
				<p class="mb-3 text-xs text-gray-500">Describe your app and we'll generate headline suggestions.</p>
				<textarea
					bind:value={aiDescription}
					placeholder="e.g., A bill splitting app for friends that makes it easy to track who owes what"
					class="mb-3 w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
					rows="3"
				></textarea>
				<button
					onclick={generateHeadlines}
					disabled={aiLoading || !aiDescription.trim()}
					class="mb-4 w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
				>
					{aiLoading ? 'Generating...' : 'Generate Headlines'}
				</button>
				{#if aiHeadlines.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each aiHeadlines as headline (headline)}
							<button
								onclick={() => selectHeadline(headline)}
								class="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 transition hover:border-teal-400 hover:bg-teal-50"
							>
								{headline}
							</button>
						{/each}
					</div>
				{:else}
					<p class="text-center text-xs text-gray-400">Mock mode &mdash; add ANTHROPIC_API_KEY for real results</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Style Match Modal -->
	{#if showStyleMatch}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
			<div class="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-sm font-semibold text-gray-900">Match Style</h3>
					<button class="text-gray-400 hover:text-gray-600" onclick={() => { showStyleMatch = false; matchedStyle = null; }}>
						&times;
					</button>
				</div>
				<p class="mb-3 text-xs text-gray-500">Upload a competitor's App Store screenshot to extract its visual style.</p>

				<label
					class="mb-4 flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-teal-400"
				>
					<span class="text-sm text-gray-400">
						{styleMatchLoading ? 'Analyzing...' : 'Drop image or click to upload'}
					</span>
					<input type="file" accept="image/*" class="hidden" onchange={handleStyleMatchUpload} />
				</label>

				{#if matchedStyle}
					<div class="mb-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
						<p class="text-xs font-medium text-gray-600">Extracted Style:</p>
						{#each Object.entries(matchedStyle) as [key, value] (key)}
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">{key}</span>
								<div class="flex items-center gap-2">
									{#if typeof value === 'string' && value.startsWith('#')}
										<span class="inline-block h-4 w-4 rounded" style="background: {value}"></span>
									{/if}
									<span class="text-xs font-mono text-gray-700">{value}</span>
								</div>
							</div>
						{/each}
					</div>
					<button
						onclick={applyMatchedStyle}
						class="w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700"
					>
						Apply Style
					</button>
				{:else if !styleMatchLoading}
					<p class="text-center text-xs text-gray-400">Mock mode &mdash; add ANTHROPIC_API_KEY for real results</p>
				{/if}
			</div>
		</div>
	{/if}
{:else}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="text-lg text-gray-700">Template not found: "{templateId}"</p>
			<a href="/" class="mt-2 inline-block text-sm text-teal-600 hover:underline">&larr; Back to templates</a>
		</div>
	</div>
{/if}

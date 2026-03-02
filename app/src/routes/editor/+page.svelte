<script lang="ts">
	import { untrack, onMount } from 'svelte';
	import { page } from '$app/state';
	import { DEVICE_SIZES, type DeviceSize } from '$lib/templates';
	import { DEFAULT_CONFIG, configToParams, type ComposableConfig } from '$lib/layers';
	import { getPresetConfig } from '$lib/presets';
	import { loadEditorState, saveEditorState, clearSavedState, compressScreenshots } from '$lib/persistence';
	import LayerSidebar from '$lib/components/LayerSidebar.svelte';
	import LivePreview from '$lib/components/LivePreview.svelte';
	import DeviceTabs from '$lib/components/DeviceTabs.svelte';
	import ExportButton from '$lib/components/ExportButton.svelte';
	import ScreenshotGallery from '$lib/components/ScreenshotGallery.svelte';
	import SlideNavigator from '$lib/components/SlideNavigator.svelte';
	import type { ParamValues } from '$lib/stores';

	// Initialize from preset or defaults
	const presetId = $derived(page.url.searchParams.get('preset') || '');
	let config: ComposableConfig = $state(structuredClone(DEFAULT_CONFIG));

	// Flatten config to params for template URL + export
	const flatParams = $derived(configToParams(config));

	let selectedDevice: DeviceSize = $state(DEVICE_SIZES[0]);
	let screenshots: string[] = $state([]);
	let currentSlide = $state(0);
	let saveStatus: 'idle' | 'saved' | 'quota-warning' = $state('idle');

	// Determine layout mode
	const isDuo = $derived(config.layout.type === 'duo-side-by-side' || config.layout.type === 'duo-overlap');
	const isPanoramic = $derived(config.layout.panoramic && !isDuo);
	const isMultiImage = $derived(isDuo);
	const galleryMaxSlots = $derived(isDuo ? 2 : isPanoramic ? 1 : 10);
	const gallerySlotLabels = $derived(
		config.layout.type === 'duo-side-by-side' ? ['Left', 'Right']
		: config.layout.type === 'duo-overlap' ? ['Back', 'Front']
		: []
	);

	// Clamp currentSlide when totalSlides changes in panoramic mode
	$effect(() => {
		if (isPanoramic && currentSlide >= config.layout.totalSlides) {
			currentSlide = config.layout.totalSlides - 1;
		}
	});

	// Build params with images included
	const paramsWithImages = $derived.by(() => {
		const p: ParamValues = { ...flatParams, device: selectedDevice.device };

		if (isDuo) {
			if (screenshots[0]) p.src_1 = screenshots[0];
			if (screenshots[1]) p.src_2 = screenshots[1];
		} else if (isPanoramic && screenshots.length > 0) {
			p.src = screenshots[0];
			p.slide = currentSlide;
			p.total_slides = config.layout.totalSlides;
		} else if (screenshots.length > 0) {
			if (screenshots[currentSlide]) p.src = screenshots[currentSlide];
		}

		return p;
	});

	// Restore from localStorage once on mount (only if no preset param)
	onMount(() => {
		if (!presetId) {
			const saved = loadEditorState();
			if (saved) {
				config = saved.config;
				screenshots = saved.screenshots;
				currentSlide = saved.currentSlide;
				const match = DEVICE_SIZES.find(d => d.label === saved.selectedDeviceLabel);
				if (match) selectedDevice = match;
			}
		}
	});

	// Apply preset when URL ?preset= param changes
	$effect(() => {
		const pId = presetId;
		if (pId) {
			const presetConfig = getPresetConfig(pId);
			if (presetConfig) {
				config = structuredClone(presetConfig);
			}
		}
	});

	// Cache compressed screenshots so we only re-compress when images change
	let cachedRawScreenshots: string[] = [];
	let cachedCompressed: string[] = [];

	// Auto-save to localStorage (debounced, skips initial render)
	let saveTimer: ReturnType<typeof setTimeout>;
	let hasInitialized = false;
	$effect(() => {
		// Touch reactive dependencies for Svelte tracking
		void JSON.stringify(config);
		void screenshots.length;
		void selectedDevice.label;
		void currentSlide;

		if (!hasInitialized) {
			hasInitialized = true;
			return;
		}

		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			const raw = untrack(() => screenshots);
			const needsRecompress = raw.length !== cachedRawScreenshots.length ||
				raw.some((url, i) => url !== cachedRawScreenshots[i]);

			let compressed: string[];
			if (needsRecompress) {
				compressed = await compressScreenshots(raw);
				cachedRawScreenshots = raw;
				cachedCompressed = compressed;
			} else {
				compressed = cachedCompressed;
			}

			const result = saveEditorState({
				config: untrack(() => config),
				screenshots: compressed,
				selectedDeviceLabel: untrack(() => selectedDevice.label),
				currentSlide: untrack(() => currentSlide),
			});
			saveStatus = result;
		}, 500);

		return () => clearTimeout(saveTimer);
	});

	// Sync device type in config when device tab changes
	function onDeviceChange(device: DeviceSize) {
		selectedDevice = device;
		config = {
			...untrack(() => config),
			device: { ...untrack(() => config.device), device: device.device as 'iphone' | 'ipad' },
		};
	}

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
		config = { ...config, typography: { ...config.typography, headline } };
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
		// Map old style-match response to composable config
		const bg = { ...config.background };
		if (matchedStyle.gradient_from) bg.color1 = String(matchedStyle.gradient_from);
		if (matchedStyle.gradient_to) bg.color2 = String(matchedStyle.gradient_to);
		if (matchedStyle.gradient_angle) bg.angle = Number(matchedStyle.gradient_angle);
		const layout = { ...config.layout };
		if (matchedStyle.layout) layout.type = String(matchedStyle.layout) as typeof layout.type;
		config = { ...config, background: bg, layout };
		showStyleMatch = false;
		matchedStyle = null;
	}

	function resetEditor() {
		if (!confirm('Reset editor to defaults? This will clear your saved state and screenshots.')) return;
		clearSavedState();
		config = structuredClone(DEFAULT_CONFIG);
		screenshots = [];
		currentSlide = 0;
		selectedDevice = DEVICE_SIZES[0];
		saveStatus = 'idle';
		hasInitialized = false;
		cachedRawScreenshots = [];
		cachedCompressed = [];
	}

	const presetName = $derived.by(() => {
		if (!presetId) return 'Custom';
		const preset = getPresetConfig(presetId);
		return preset ? presetId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Custom';
	});
</script>

<div class="flex h-screen flex-col bg-gray-50 lg:flex-row">
	<!-- Sidebar: collapsible on mobile, always visible on desktop -->
	<aside class="w-full shrink-0 overflow-y-auto border-b border-gray-200 bg-white lg:w-80 lg:border-b-0 lg:border-r {sidebarOpen ? '' : 'max-lg:hidden'}">
		<div class="border-b border-gray-100 px-4 py-3">
			<div class="flex items-center justify-between">
				<a href="/" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back</a>
				<div class="flex items-center gap-2">
					{#if saveStatus === 'saved'}
						<span class="text-xs text-gray-400">Saved</span>
					{:else if saveStatus === 'quota-warning'}
						<span class="text-xs text-amber-500" title="Screenshots too large to save">Saved (no images)</span>
					{/if}
					<button
						onclick={resetEditor}
						class="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
						title="Reset to defaults"
					>
						Reset
					</button>
					<button
						onclick={() => showStyleMatch = true}
						class="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50"
						title="Match competitor style"
					>
						Match Style
					</button>
					<h2 class="text-sm font-semibold text-gray-900">{presetName}</h2>
				</div>
			</div>
		</div>

		{#if isMultiImage}
			<div class="border-b border-gray-100 p-4">
				<ScreenshotGallery bind:screenshots maxSlots={galleryMaxSlots} slotLabels={gallerySlotLabels} />
			</div>
		{:else}
			<div class="border-b border-gray-100 p-4">
				<ScreenshotGallery bind:screenshots maxSlots={10} />
			</div>
		{/if}

		<LayerSidebar
			bind:config
			{screenshots}
			onHeadlineAI={() => showHeadlineAI = !showHeadlineAI}
		/>

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

	<!-- Mobile toolbar -->
	<div class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
		<a href="/" class="text-sm text-gray-500 hover:text-gray-700">&larr;</a>
		<span class="text-sm font-semibold text-gray-900">{presetName}</span>
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
				templateId="composable"
				params={paramsWithImages}
				aspectWidth={selectedDevice.width}
				aspectHeight={selectedDevice.height}
			/>
		</div>

		<!-- Slide navigator for multi-screenshot (non-duo) or panoramic -->
		{#if isPanoramic && screenshots.length > 0}
			<div class="border-t border-gray-100 bg-white px-4 py-2">
				<SlideNavigator screenshots={Array.from({ length: config.layout.totalSlides }, () => screenshots[0])} bind:currentSlide />
			</div>
		{:else if !isDuo && screenshots.length > 1}
			<div class="border-t border-gray-100 bg-white px-4 py-2">
				<SlideNavigator {screenshots} bind:currentSlide />
			</div>
		{/if}

		<!-- Sticky footer: device tabs + export -->
		<div class="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-4 py-3">
			<div class="flex items-center justify-between gap-2">
				<div class="overflow-x-auto">
					<DeviceTabs selected={selectedDevice} onSelect={onDeviceChange} />
				</div>
				<ExportButton
					templateId="composable"
					params={paramsWithImages}
					{selectedDevice}
					seriesScreenshots={isPanoramic && screenshots.length > 0
						? Array.from({ length: config.layout.totalSlides }, () => screenshots[0])
						: !isDuo ? screenshots : []}
					panoramic={isPanoramic}
				/>
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

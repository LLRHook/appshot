<script lang="ts">
	import type { ComposableConfig, BackgroundConfig } from '$lib/layers';
	import BackgroundPanel from './layers/BackgroundPanel.svelte';
	import DevicePanel from './layers/DevicePanel.svelte';
	import LayoutPanel from './layers/LayoutPanel.svelte';
	import TypographyPanel from './layers/TypographyPanel.svelte';
	import EffectsPanel from './layers/EffectsPanel.svelte';
	import PresetsPanel from './layers/PresetsPanel.svelte';

	let {
		config = $bindable(),
		screenshots = [],
		onHeadlineAI,
	}: {
		config: ComposableConfig;
		screenshots?: string[];
		onHeadlineAI?: () => void;
	} = $props();

	type Tab = 'presets' | 'background' | 'device' | 'layout' | 'type' | 'effects';
	let activeTab: Tab = $state('presets');

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'presets', label: 'Presets' },
		{ id: 'background', label: 'BG' },
		{ id: 'device', label: 'Device' },
		{ id: 'layout', label: 'Layout' },
		{ id: 'type', label: 'Type' },
		{ id: 'effects', label: 'FX' },
	];

	function applyPreset(presetConfig: ComposableConfig) {
		config = { ...presetConfig };
		activeTab = 'background';
	}

	// AI Auto-Style
	let autoStyleLoading = $state(false);

	async function handleAutoStyle() {
		if (screenshots.length === 0) return;
		autoStyleLoading = true;
		try {
			const res = await fetch('/api/ai/suggest-style', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ image: screenshots[0] }),
			});
			const data = await res.json();
			if (data.background) {
				const bg: BackgroundConfig = {
					type: data.background.type || config.background.type,
					color1: data.background.color1 || config.background.color1,
					color2: data.background.color2 || config.background.color2,
					color3: data.background.color3 || config.background.color3,
					angle: data.background.angle ?? config.background.angle,
				};
				config = {
					...config,
					background: bg,
					typography: {
						...config.typography,
						fontColor: data.fontColor || config.typography.fontColor,
					},
				};
				activeTab = 'background';
			}
		} catch {
			// Silently fail — user can manually set
		} finally {
			autoStyleLoading = false;
		}
	}
</script>

<div class="flex flex-col">
	<!-- Tab bar -->
	<div class="flex border-b border-gray-100 px-2">
		{#each tabs as tab (tab.id)}
			<button
				class="flex-1 border-b-2 px-1 py-2.5 text-[11px] font-medium transition {activeTab === tab.id ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}"
				onclick={() => activeTab = tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Auto-Style button (shown when screenshots exist) -->
	{#if screenshots.length > 0}
		<div class="border-b border-gray-100 px-4 py-2">
			<button
				onclick={handleAutoStyle}
				disabled={autoStyleLoading}
				class="w-full rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 transition hover:bg-teal-100 disabled:opacity-50"
			>
				{autoStyleLoading ? 'Analyzing screenshot...' : '&#10022; Auto-Style from Screenshot'}
			</button>
		</div>
	{/if}

	<!-- Panel content -->
	<div class="p-4">
		{#if activeTab === 'presets'}
			<PresetsPanel onApply={applyPreset} />
		{:else if activeTab === 'background'}
			<BackgroundPanel bind:config={config.background} />
		{:else if activeTab === 'device'}
			<DevicePanel bind:config={config.device} />
		{:else if activeTab === 'layout'}
			<LayoutPanel bind:config={config.layout} />
		{:else if activeTab === 'type'}
			<TypographyPanel bind:config={config.typography} {onHeadlineAI} />
		{:else if activeTab === 'effects'}
			<EffectsPanel bind:config={config.effects} />
		{/if}
	</div>
</div>

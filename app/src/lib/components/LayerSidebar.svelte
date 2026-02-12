<script lang="ts">
	import type { ComposableConfig } from '$lib/layers';
	import BackgroundPanel from './layers/BackgroundPanel.svelte';
	import DevicePanel from './layers/DevicePanel.svelte';
	import LayoutPanel from './layers/LayoutPanel.svelte';
	import TypographyPanel from './layers/TypographyPanel.svelte';
	import EffectsPanel from './layers/EffectsPanel.svelte';
	import PresetsPanel from './layers/PresetsPanel.svelte';

	let {
		config = $bindable(),
		onHeadlineAI,
	}: {
		config: ComposableConfig;
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

<script lang="ts">
	import SlidePreview from '$lib/components/SlidePreview.svelte';
	import { DEVICES } from '$lib/model/devices';
	import type { Composition } from '$lib/model/types';

	let {
		composition,
		appName = composition.name,
		selected = 0,
		onselect
	}: {
		composition: Composition;
		appName?: string;
		selected?: number;
		onselect: (index: number) => void;
	} = $props();

	let appearance = $state<'light' | 'dark'>('light');
	const device = $derived(DEVICES[composition.device]);
	const firstThree = $derived(composition.slides.slice(0, 3));
</script>

<section class="store-preview" aria-label="First three screenshots at store size">
	<div class="preview-heading">
		<div>
			<strong>The first three, at a glance.</strong>
			<p>Check the headlines and the story at the size people browse.</p>
		</div>
		<div class="appearance" role="group" aria-label="Store preview appearance">
			<button
				class:active={appearance === 'light'}
				aria-pressed={appearance === 'light'}
				onclick={() => (appearance = 'light')}>Light</button
			><button
				class:active={appearance === 'dark'}
				aria-pressed={appearance === 'dark'}
				onclick={() => (appearance = 'dark')}>Dark</button
			>
		</div>
	</div>
	<div class="store-surface" class:dark={appearance === 'dark'}>
		<div class="app-row">
			<span class="app-icon" aria-hidden="true"
				>{appName.trim().slice(0, 1).toUpperCase() || 'A'}</span
			>
			<div><strong>{appName}</strong><span>App screenshots</span></div>
		</div>
		<div class="search-strip">
			{#each firstThree as slide, index (slide.id)}
				<button
					class="search-frame"
					class:selected={index === selected}
					style:aspect-ratio={`${device.width}/${device.height}`}
					aria-label={`Edit store preview screenshot ${index + 1}`}
					aria-pressed={index === selected}
					onclick={() => onselect(index)}><SlidePreview {composition} {index} width={396} /></button
				>
			{/each}
		</div>
	</div>
	<p class="preview-caption">
		Approximate search presentation · {device.width} × {device.height} output
	</p>
</section>

<style>
	.store-preview {
		width: 100%;
		padding: 28px;
	}
	.preview-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 20px;
		max-width: 640px;
		margin: 0 auto 28px;
	}
	.preview-heading strong {
		font-size: 16px;
		font-weight: 600;
	}
	.preview-heading p,
	.preview-caption {
		color: #75736d;
		font-size: 12px;
		line-height: 1.5;
	}
	.preview-heading p {
		margin: 5px 0 0;
	}
	.appearance {
		display: flex;
		gap: 3px;
		padding: 3px;
		border: 1px solid #dedbd4;
		border-radius: 8px;
		background: #eeeae3;
	}
	.appearance button {
		padding: 6px 10px;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: #6c6961;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}
	.appearance button.active {
		background: white;
		color: #262c29;
		box-shadow: 0 1px 3px #0000000d;
	}
	.store-surface {
		box-sizing: border-box;
		width: 410px;
		max-width: 100%;
		margin: 0 auto;
		padding: 22px 16px;
		border: 1px solid #e4e3df;
		border-radius: 20px;
		background: #fff;
		color: #161616;
		box-shadow: 0 8px 35px #35332508;
	}
	.store-surface.dark {
		border-color: #292929;
		background: #080808;
		color: #f8f8f8;
	}
	.app-row {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-bottom: 16px;
	}
	.app-icon {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border: 1px solid #80808025;
		border-radius: 11px;
		background: #1e5b57;
		color: #fbf6ef;
		font-family: 'Instrument Serif', Georgia, serif;
		font-size: 32px;
	}
	.app-row > div {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.app-row strong {
		overflow: hidden;
		font-size: 16px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.app-row div span {
		color: #848484;
		font-size: 11px;
	}
	.search-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: start;
		gap: 7px;
	}
	.search-frame {
		display: block;
		width: 100%;
		overflow: hidden;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: #eee;
		cursor: pointer;
	}
	.search-frame.selected {
		outline: 2px solid #65918b;
		outline-offset: 2px;
	}
	.search-frame :global(canvas) {
		display: block;
		width: 100%;
		height: auto;
	}
	.preview-caption {
		margin: 16px 0 0;
		text-align: center;
	}
	@media (max-width: 600px) {
		.store-preview {
			padding: 20px 12px;
		}
		.preview-heading {
			flex-direction: column;
			gap: 12px;
		}
	}
</style>

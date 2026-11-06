<script lang="ts">
	import { getStudio } from '$lib/editor/studio.svelte';
	import { imageRefForAsset } from '$lib/model/assets';
	import { sourceCompatibility } from '$lib/model/capture';
	import type { CaptureProvenance, ProjectAsset } from '$lib/model/contracts';
	let { asset, index }: { asset: ProjectAsset; index: number } = $props();
	const studio = getStudio();
	let reason = $state('');
	const compatibility = $derived(sourceCompatibility(asset, studio.device));
	const fields: {
		key: 'device' | 'os' | 'appVersion' | 'build' | 'commit' | 'capturedAt';
		label: string;
	}[] = [
		{ key: 'device', label: 'Device' },
		{ key: 'os', label: 'OS version' },
		{ key: 'appVersion', label: 'App version' },
		{ key: 'build', label: 'Build' },
		{ key: 'commit', label: 'Source commit' },
		{ key: 'capturedAt', label: 'Captured at (ISO date)' }
	];
</script>

<details class="source-record">
	<summary>Capture record</summary>
	<p>
		This record follows this image across outputs. Record its actual capture device and build; an
		exact size alone cannot verify native UI.
	</p>
	{#each fields as field (field.key)}
		<label
			>{field.label}<input
				aria-label={`${field.label} for screenshot ${index + 1}`}
				maxlength="200"
				value={asset.provenance?.[field.key] ?? ''}
				onchange={(event) =>
					studio.setCaptureProvenance(asset.id, {
						[field.key]: event.currentTarget.value.trim() || undefined
					})}
			/></label
		>
	{/each}
	<label
		>Appearance<select
			aria-label={`Appearance for screenshot ${index + 1}`}
			value={asset.provenance?.appearance ?? ''}
			onchange={(event) =>
				studio.setCaptureProvenance(asset.id, {
					appearance: (event.currentTarget.value || undefined) as CaptureProvenance['appearance']
				})}
		>
			<option value="">Not recorded</option><option value="light">Light</option><option value="dark"
				>Dark</option
			>
		</select></label
	>
	<label class="source-confirm"
		><input
			type="checkbox"
			aria-label={`Fictional account data confirmed for screenshot ${index + 1}`}
			checked={asset.provenance?.fictionalData === 'confirmed'}
			onchange={(event) =>
				studio.setCaptureProvenance(asset.id, {
					fictionalData: event.currentTarget.checked ? 'confirmed' : 'unconfirmed'
				})}
		/>
		I confirmed this capture shows only fictional account data.</label
	>
	{#if asset.provenance?.tool === 'appshot-sample'}<p>
			Bundled sample. Replace it with your app before store export.
		</p>{/if}
	{#if asset.provenance?.synthetic}<p>
			This image is marked synthetic and remains for internal review.
		</p>{/if}
	{#if compatibility.severity === 'block'}
		<p>{compatibility.message}</p>
		<label
			>Reason to use it in a draft<input
				aria-label={`Draft override reason for screenshot ${index + 1}`}
				maxlength="200"
				bind:value={reason}
			/></label
		>
		<button
			class="button compact"
			disabled={!reason.trim()}
			onclick={() => studio.useAsset(imageRefForAsset(asset), reason)}>Use for draft</button
		>
		<p>This override always blocks App Store export.</p>
	{/if}
</details>

<style>
	.source-record {
		grid-column: 1 / -1;
		font-size: 10px;
		color: #4f5c46;
	}
	summary {
		cursor: pointer;
		padding: 4px 0;
	}
	p {
		font-size: 10px;
		line-height: 1.45;
		margin: 7px 0;
	}
	label {
		display: grid;
		gap: 3px;
		margin: 7px 0;
	}
	input,
	select {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 5px;
		font: inherit;
	}
	.source-confirm {
		grid-template-columns: auto 1fr;
		align-items: start;
		gap: 5px;
	}
	.source-confirm input {
		width: auto;
		margin: 2px 0;
	}
</style>

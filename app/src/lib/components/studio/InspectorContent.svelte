<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { LINEN_PALETTES, type LinenColorKey } from '$lib/model/linen';
	import LinenColorField from './LinenColorField.svelte';
	import ToggleRow from './ToggleRow.svelte';

	const studio = getStudio();
	const PALETTE_FIELDS: { key: LinenColorKey; label: string }[] = [
		{ key: 'canvas', label: 'Canvas' },
		{ key: 'band', label: 'Band' },
		{ key: 'headline', label: 'Headline' },
		{ key: 'accent', label: 'Italic accent' },
		{ key: 'subtitle', label: 'Supporting' }
	];
	const ADVANCED_PALETTE_FIELDS: { key: LinenColorKey; label: string }[] = [
		{ key: 'wordmark', label: 'Wordmark' },
		{ key: 'dot', label: 'Gold dot' },
		{ key: 'shell', label: 'Phone shell' },
		{ key: 'shellEdge', label: 'Shell edge' },
		{ key: 'shadow', label: 'Shadow' }
	];
</script>

<section class="control-section">
	<label class="field-label" for="app-name">App name on screenshots <span>ALL OUTPUTS</span></label>
	<input
		id="app-name"
		maxlength="50"
		value={studio.store.project.appName ?? ''}
		placeholder={studio.store.project.name}
		onchange={(event) => studio.setAppName(event.currentTarget.value)}
	/>
</section>

{#if studio.isLinen || studio.isCheck}
	<section class="control-section">
		<label class="field-label" for="headline"
			>Headline<span>{studio.slide.typography.headline.length}/180</span></label
		><textarea
			id="headline"
			class="headline-input linen-headline"
			maxlength="180"
			rows="3"
			value={studio.slide.typography.headline}
			oninput={(event) => studio.typography('headline', event.currentTarget.value)}
		></textarea>
		<p class="field-help">
			<Icon name="info" size={12} />Each row is one line. Wrap accent words in asterisks, like
			*these words*, to set them in serif italic in the accent color.
		</p>
		<label class="field-label" for="subtitle"
			>Supporting text<span>{(studio.slide.typography.subtitle ?? '').length}/300</span></label
		><textarea
			id="subtitle"
			rows="3"
			maxlength="300"
			value={studio.slide.typography.subtitle ?? ''}
			oninput={(event) => studio.typography('subtitle', event.currentTarget.value)}
		></textarea>
		<p class="field-help">Each row is drawn as its own line under the headline.</p>
		{#if studio.isLinen}
			<div class="field-label">Theme<span>THIS FRAME</span></div>
			<div class="theme-switch" role="group" aria-label="Table Linen theme">
				<button
					class:active={studio.linenTheme === 'teal'}
					aria-pressed={studio.linenTheme === 'teal'}
					onclick={() => studio.applyLinenTheme('teal')}
					><i style:background={LINEN_PALETTES.teal.canvas}></i>Teal</button
				><button
					class:active={studio.linenTheme === 'cream'}
					aria-pressed={studio.linenTheme === 'cream'}
					onclick={() => studio.applyLinenTheme('cream')}
					><i style:background={LINEN_PALETTES.cream.canvas}></i>Cream</button
				>
			</div>
			<ToggleRow
				id="band-label"
				label="Linen band"
				on={studio.linen.band}
				flip={() => studio.patchLinen({ band: !studio.linen.band })}
			/>
			<div class="palette-grid">
				{#each PALETTE_FIELDS as field (field.key)}
					<LinenColorField key={field.key} label={field.label} />
				{/each}
			</div>
			<details class="advanced">
				<summary>Advanced palette</summary>
				<div class="palette-grid">
					{#each ADVANCED_PALETTE_FIELDS as field (field.key)}
						{#if !studio.linenPhone.hardware || (field.key !== 'shell' && field.key !== 'shellEdge')}
							<LinenColorField key={field.key} label={field.label} />
						{/if}
					{/each}
				</div>
				{#if studio.isLinked}
					<p class="field-help">
						{studio.linenPhone.hardware
							? 'The shadow belongs'
							: 'Phone shell, shell edge and shadow belong'} to the one shared phone; editing
						{studio.linenPhone.hardware ? 'it' : 'them'} here changes both frames. Wordmark and dot stay
						per frame.
					</p>
				{/if}
				<label class="field-label" for="shadow-opacity"
					>Shadow opacity<span>{Math.round(studio.hardwareColors.shadowOpacity * 100)}%</span
					></label
				><input
					id="shadow-opacity"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={studio.hardwareColors.shadowOpacity}
					oninput={(event) => studio.linenShadowOpacity(Number(event.currentTarget.value))}
				/>
			</details>
		{:else}
			<label class="field-label" for="text-size"
				>Type size<span>{Math.round((studio.slide.fontScale ?? 1) * 100)}%</span></label
			>
			<input
				id="text-size"
				type="range"
				min="0.7"
				max="1.3"
				step="0.05"
				value={studio.slide.fontScale ?? 1}
				oninput={(event) =>
					studio.patchSlide({ fontScale: Number(event.currentTarget.value) }, 'fontScale')}
			/>
		{/if}
	</section>
{:else}
	<section class="control-section">
		<label class="field-label" for="headline"
			>Headline<span>{studio.slide.typography.headline.length}/100</span></label
		><textarea
			id="headline"
			class="headline-input"
			maxlength="100"
			rows="3"
			value={studio.slide.typography.headline}
			oninput={(event) => studio.typography('headline', event.currentTarget.value)}
		></textarea><label class="field-label" for="subtitle">Supporting text</label><textarea
			id="subtitle"
			rows="3"
			maxlength="220"
			value={studio.slide.typography.subtitle ?? ''}
			oninput={(event) => studio.typography('subtitle', event.currentTarget.value)}
		></textarea><label class="field-label" for="badge">Eyebrow / caption</label><input
			id="badge"
			value={studio.slide.badge ?? ''}
			maxlength="60"
			oninput={(event) => studio.patchSlide({ badge: event.currentTarget.value }, 'badge')}
		/>
		<div class="color-row">
			<label class="color-field"
				>Text color<span
					><input
						type="color"
						aria-label="Text color"
						id="font-color"
						value={studio.slide.typography.fontColor}
						oninput={(event) => studio.typography('fontColor', event.currentTarget.value)}
					/><code>{studio.slide.typography.fontColor}</code></span
				></label
			><label class="color-field"
				>Set accent<span
					><input
						type="color"
						aria-label="Campaign accent"
						value={studio.composition.accent}
						oninput={(event) => studio.setAccent(event.currentTarget.value)}
					/><code>{studio.composition.accent}</code></span
				></label
			>
		</div>
		<label class="field-label" for="text-size"
			>Type size<span>{Math.round((studio.slide.fontScale ?? 1) * 100)}%</span></label
		><input
			id="text-size"
			type="range"
			min="0.7"
			max="1.3"
			step="0.05"
			value={studio.slide.fontScale ?? 1}
			oninput={(event) =>
				studio.patchSlide({ fontScale: Number(event.currentTarget.value) }, 'fontScale')}
		/>
	</section>
{/if}
<section class="control-section">
	<div class="field-label">
		Screenshot<button class="text-link" onclick={() => studio.pick('replace')}
			>{studio.displayedImage ? 'Replace' : 'Upload'}<Icon name="arrow" size={12} /></button
		>
	</div>
	<button id="frame-source" class="current-asset" onclick={() => studio.pick('replace')}
		>{#if studio.displayedImage}<img
				src={studio.displayedImage.blobUrl}
				alt="Current raw screenshot"
			/>
			<div>
				<strong>{studio.isLinked ? 'Connected screenshot' : 'Original screenshot'}</strong><span
					>{studio.displayedImage.naturalWidth} × {studio.displayedImage.naturalHeight}</span
				><small>Click to replace image</small>
			</div>{:else}<Icon name="upload" size={24} /><span>Upload an app screenshot</span
			>{/if}</button
	>
</section>

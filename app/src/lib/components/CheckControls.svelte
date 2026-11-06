<script lang="ts">
	import ToggleRow from '$lib/components/studio/ToggleRow.svelte';
	import NumberField from '$lib/components/studio/NumberField.svelte';
	import {
		CHECK_PALETTES,
		CHECK_PANEL_ANCHOR,
		defaultCheckMark,
		type CheckCanvas,
		type CheckMark,
		type CheckPreset,
		type CheckSettings,
		type CheckSettingsPatch
	} from '$lib/model/check';
	import type { ImageLayer, PixelRect, SourceDimensions } from '$lib/model/contracts';
	import { MAX_IMAGE_SIDE } from '$lib/model/image';

	/**
	 * Frame controls for The Check. Self-contained: it reads settings through props and reports
	 * every change through `onchange`, with whole keys in the patch. `coalesce` names a control
	 * whose live edits should join one undo step until its `change` event.
	 */
	let {
		settings,
		layers = [],
		source,
		onchange
	}: {
		settings: CheckSettings;
		/** This frame's image layers, so a mark can point at one by name. */
		layers?: readonly ImageLayer[];
		/** The frame's capture, used to place a new mark. */
		source?: SourceDimensions;
		onchange: (patch: CheckSettingsPatch, coalesce?: string) => void;
	} = $props();

	const CANVASES: { id: CheckCanvas; label: string }[] = [
		{ id: 'teal', label: 'Teal' },
		{ id: 'cream', label: 'Cream' },
		{ id: 'gold', label: 'Gold' }
	];
	const PRESETS: { id: CheckPreset; label: string; help: string }[] = [
		{
			id: 'hero',
			label: 'Hero',
			help: 'Copy on top. The screenshot runs off the bottom at about 84% of the frame width.'
		},
		{
			id: 'detail',
			label: 'Detail',
			help: 'Copy on top. The UI fills nearly the whole width, so its text stays readable.'
		},
		{
			id: 'editorial',
			label: 'Editorial',
			help: 'The screenshot leads and tears off above the copy at the bottom of the frame.'
		},
		{
			id: 'closer',
			label: 'Closer',
			help: 'Centered copy for artwork. Use it once, and keep most frames showing the app.'
		}
	];
	const RECT_FIELDS: { key: keyof PixelRect; label: string; min: number }[] = [
		{ key: 'x', label: 'Left', min: 0 },
		{ key: 'y', label: 'Top', min: 0 },
		{ key: 'width', label: 'Width', min: 1 },
		{ key: 'height', label: 'Height', min: 1 }
	];

	const preset = $derived(PRESETS.find((item) => item.id === settings.preset) ?? PRESETS[0]);
	const crops = $derived(layers.filter((layer) => layer.kind === 'source-crop'));

	function areaOf(anchor: string): PixelRect {
		const layer = layers.find((item) => item.id === anchor);
		if (layer) return layer.crop;
		return {
			x: 0,
			y: 0,
			width: source?.naturalWidth ?? 1320,
			height: source?.naturalHeight ?? 2868
		};
	}

	function defaultAnchor(): string {
		return layers.find((layer) => layer.kind === 'source-crop')?.id ?? CHECK_PANEL_ANCHOR;
	}

	function toggleMark() {
		if (settings.mark) {
			onchange({ mark: null });
			return;
		}
		const anchor = defaultAnchor();
		onchange({ mark: defaultCheckMark(anchor, areaOf(anchor), 1) });
	}

	function patchMark(patch: Partial<CheckMark>, coalesce?: string) {
		if (settings.mark) onchange({ mark: { ...settings.mark, ...patch } }, coalesce);
	}

	function setAnchor(anchor: string) {
		patchMark({ anchor, rect: defaultCheckMark(anchor, areaOf(anchor), 1).rect });
	}

	function setRect(key: keyof PixelRect, value: number, min: number) {
		if (!settings.mark || !Number.isFinite(value)) return;
		const max = key === 'x' || key === 'y' ? MAX_IMAGE_SIDE - 1 : MAX_IMAGE_SIDE;
		const rect = { ...settings.mark.rect, [key]: Math.min(max, Math.max(min, Math.round(value))) };
		patchMark({ rect }, `check.mark.${key}`);
	}
</script>

<section class="control-section check-controls">
	<div class="field-label">Canvas<span>THIS FRAME</span></div>
	<div class="theme-switch" role="group" aria-label="The Check canvas">
		{#each CANVASES as canvas (canvas.id)}
			<button
				type="button"
				class:active={settings.canvas === canvas.id}
				aria-pressed={settings.canvas === canvas.id}
				onclick={() => onchange({ canvas: canvas.id })}
				><i style:background={CHECK_PALETTES[canvas.id].canvas}></i>{canvas.label}</button
			>
		{/each}
	</div>

	<label class="field-label" for="check-preset">Layout</label>
	<select
		id="check-preset"
		value={settings.preset}
		onchange={(event) => onchange({ preset: event.currentTarget.value as CheckPreset })}
	>
		{#each PRESETS as item (item.id)}<option value={item.id}>{item.label}</option>{/each}
	</select>
	<p class="field-help">{preset.help}</p>

	<ToggleRow
		id="check-panel-label"
		label="Screenshot panel"
		on={settings.panel}
		flip={() => onchange({ panel: !settings.panel })}
	/>
	<ToggleRow
		id="check-wordmark-label"
		label="Campaign name"
		on={settings.wordmark}
		flip={() => onchange({ wordmark: !settings.wordmark })}
	/>
	<p class="field-help">
		Turn the panel off when lifted crops carry all of the UI. Turn the name off when a logo layer
		carries the brand.
	</p>

	{#if crops.length}
		<label class="field-label" for="check-tear">Torn edge</label>
		<select
			id="check-tear"
			value={settings.tear ?? ''}
			onchange={(event) => onchange({ tear: event.currentTarget.value || null })}
		>
			<option value="">None</option>
			{#each crops as layer (layer.id)}<option value={layer.id}>Layer: {layer.id}</option>{/each}
		</select>
		<p class="field-help">Tears the bottom of that layer like the end of a paper receipt.</p>
	{/if}

	<ToggleRow id="check-mark-label" label="Pen mark" on={Boolean(settings.mark)} flip={toggleMark} />
	{#if settings.mark}
		{@const mark = settings.mark}
		<label class="field-label" for="check-mark-kind">Stroke</label>
		<select
			id="check-mark-kind"
			value={mark.kind}
			onchange={(event) => patchMark({ kind: event.currentTarget.value as CheckMark['kind'] })}
		>
			<option value="ring">Circle it</option>
			<option value="underline">Underline it</option>
		</select>
		<label class="field-label" for="check-mark-anchor">Marks</label>
		<select
			id="check-mark-anchor"
			value={mark.anchor}
			onchange={(event) => setAnchor(event.currentTarget.value)}
		>
			<option value={CHECK_PANEL_ANCHOR}>The screenshot</option>
			{#each layers as layer (layer.id)}<option value={layer.id}>Layer: {layer.id}</option>{/each}
		</select>
		<div class="num-grid">
			{#each RECT_FIELDS as field (field.key)}
				<NumberField
					id={`check-mark-${field.key}`}
					label={field.label}
					step={1}
					bounds={[
						field.min,
						field.key === 'x' || field.key === 'y' ? MAX_IMAGE_SIDE - 1 : MAX_IMAGE_SIDE
					]}
					value={mark.rect[field.key]}
					apply={(value) => setRect(field.key, value, field.min)}
				/>
			{/each}
		</div>
		<p class="field-help">
			Source pixels of what it marks. The stroke goes around or under this area and never over it.
		</p>
		<button type="button" class="check-redraw" onclick={() => patchMark({ seed: mark.seed + 1 })}
			>Redraw the stroke</button
		>
	{/if}
</section>

<style>
	.check-controls select {
		width: 100%;
	}
	.check-redraw {
		width: 100%;
		margin-top: 8px;
		padding: 8px 10px;
		border: 1px solid currentColor;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.check-redraw:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
</style>

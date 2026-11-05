<script lang="ts">
	import { getStudio } from '$lib/editor/studio.svelte';
	import {
		LINEN_LAYOUT_BOUNDS,
		LINEN_PHONE_BOUNDS,
		type LinenLayout,
		type LinenPhone
	} from '$lib/model/linen';
	import type { Slide } from '$lib/model/types';
	import NumberField from './NumberField.svelte';
	import ToggleRow from './ToggleRow.svelte';

	const studio = getStudio();
	const LAYOUT_FIELDS: { key: keyof LinenLayout; label: string; step: number }[] = [
		{ key: 'margin', label: 'Left margin', step: 1 },
		{ key: 'wordmarkTop', label: 'Wordmark top', step: 1 },
		{ key: 'headlineTop', label: 'Headline top', step: 1 },
		{ key: 'headlineWidth', label: 'Headline width', step: 1 },
		{ key: 'headlineSize', label: 'Headline size', step: 1 },
		{ key: 'headlineLeading', label: 'Headline leading', step: 1 },
		{ key: 'headlineTracking', label: 'Headline tracking', step: 0.01 },
		{ key: 'subtitleTop', label: 'Supporting top', step: 1 },
		{ key: 'subtitleWidth', label: 'Supporting width', step: 1 },
		{ key: 'subtitleSize', label: 'Supporting size', step: 1 },
		{ key: 'subtitleLeading', label: 'Supporting leading', step: 1 },
		{ key: 'bandTop', label: 'Band top', step: 1 }
	];
</script>

{#if studio.isLinen}
	<section class="control-section">
		<div class="field-label">
			Phone{#if studio.isLinked}<span>SHARED ACROSS BOTH FRAMES</span>{/if}
		</div>
		<p class="field-help">
			{studio.isLinked
				? 'One phone crosses the seam. Center X counts across the 2640-pixel two-frame world; 1320 is the seam.'
				: 'Positions are 1320 × 2868 reference pixels and scale with the export size.'}
		</p>
		<label class="field-label" for="phone-hardware">Frame preset</label><select
			id="phone-hardware"
			value={studio.linenPhone.hardware ?? 'simple'}
			onchange={(event) => studio.linenHardware(event.currentTarget.value)}
			><option value="simple">Simple frame</option><option value="iphone-17-pro-max"
				>iPhone 17 Pro Max</option
			></select
		>
		{#if studio.linenPhone.hardware}
			<label class="field-label" for="phone-island">Dynamic Island</label><select
				id="phone-island"
				value={studio.linenPhone.dynamicIsland ?? 'source'}
				onchange={(event) =>
					studio.patchLinenPhone({
						dynamicIsland: event.currentTarget.value as LinenPhone['dynamicIsland']
					})}
				><option value="source">Already in the screenshot</option><option value="draw"
					>Add hardware cutout</option
				></select
			>
			<ToggleRow
				id="phone-buttons-label"
				label="Side buttons"
				on={studio.linenPhone.hardwareButtons === true}
				flip={() => studio.patchLinenPhone({ hardwareButtons: !studio.linenPhone.hardwareButtons })}
			/>
			<p class="field-help">
				Silver rim, black bezel and 150-pixel display corners calibrated to the iPhone 17 Pro Max
				simulator. The cutout is only added over a light island area; a screenshot that already
				shows its island is never doubled.
			</p>
		{/if}
		<div class="num-grid">
			<NumberField
				id="phone-top"
				label="Top"
				value={studio.linenPhone.top}
				bounds={LINEN_PHONE_BOUNDS.top}
				step={1}
				apply={(v) => studio.linenPhoneNumber('top', v)}
			/>
			<NumberField
				id="phone-bottom"
				label="Bottom"
				value={studio.linenPhone.bottom}
				bounds={LINEN_PHONE_BOUNDS.bottom}
				step={1}
				apply={(v) => studio.linenPhoneNumber('bottom', v)}
			/>
			<NumberField
				id="phone-width"
				label="Max width"
				value={studio.linenPhone.maxWidth}
				bounds={LINEN_PHONE_BOUNDS.maxWidth}
				step={1}
				apply={(v) => studio.linenPhoneNumber('maxWidth', v)}
			/>
			<NumberField
				id="phone-center"
				label="Center X"
				value={studio.linenPhone.centerX}
				bounds={LINEN_PHONE_BOUNDS.centerX}
				step={1}
				apply={(v) => studio.linenPhoneNumber('centerX', v)}
			/>
			<NumberField
				id="phone-shell"
				label="Shell"
				value={studio.linenPhone.shell}
				bounds={LINEN_PHONE_BOUNDS.shell}
				step={1}
				apply={(v) => studio.linenPhoneNumber('shell', v)}
			/>
			{#if !studio.linenPhone.hardware}
				<NumberField
					id="phone-radius"
					label="Corner radius"
					value={studio.linenPhone.radius}
					bounds={LINEN_PHONE_BOUNDS.radius}
					step={1}
					apply={(v) => studio.linenPhoneNumber('radius', v)}
				/>
			{/if}
		</div>
		<label class="field-label" for="phone-rotation"
			>Rotation<span>{studio.linenPhone.rotation}°</span></label
		><input
			id="phone-rotation"
			type="range"
			min="-8"
			max="8"
			step="0.1"
			value={studio.linenPhone.rotation}
			oninput={(event) => studio.linenPhoneNumber('rotation', Number(event.currentTarget.value))}
		/>
		<ToggleRow
			id="frameless-label"
			label="Frameless screen"
			on={studio.linenPhone.frameless}
			flip={() => studio.patchLinenPhone({ frameless: !studio.linenPhone.frameless })}
		/>
		<ToggleRow
			id="phone-shadow-label"
			label="Soft shadow"
			on={studio.linenPhone.shadow}
			flip={() => studio.patchLinenPhone({ shadow: !studio.linenPhone.shadow })}
		/>
		<label class="field-label" for="phone-mode">Fit</label><select
			id="phone-mode"
			value={studio.linenPhone.mode}
			onchange={(event) =>
				studio.patchLinenPhone({ mode: event.currentTarget.value as LinenPhone['mode'] })}
			><option value="full">Whole screenshot between top and bottom</option><option
				value="bottom-crop">Max width, cropped at the bottom edge</option
			></select
		>
		{#if studio.linenPhone.mode === 'bottom-crop'}
			<label class="field-label" for="crop-reason">Crop reason</label><input
				id="crop-reason"
				maxlength="200"
				value={studio.linenPhone.cropReason ?? ''}
				onchange={(event) => studio.patchLinenPhone({ cropReason: event.currentTarget.value })}
			/>
			<p class="field-help">An intentional bottom crop is saved with its reason.</p>
		{/if}
	</section>
	<section class="control-section">
		<details class="advanced">
			<summary>Type layout<span>REFERENCE PX</span></summary>
			<div class="num-grid">
				{#each LAYOUT_FIELDS as field (field.key)}
					<NumberField
						id={`layout-${field.key}`}
						label={field.label}
						value={studio.linen.layout[field.key]}
						bounds={LINEN_LAYOUT_BOUNDS[field.key]}
						step={field.step}
						apply={(v) => studio.linenLayout(field.key, v)}
					/>
				{/each}
			</div>
		</details>
	</section>
{:else}
	<section class="control-section">
		<label class="field-label" for="layout">Text placement</label><select
			id="layout"
			value={studio.slide.layout}
			onchange={(event) =>
				studio.patchSlide({ layout: event.currentTarget.value as Slide['layout'] })}
			><option value="text-above">Above the device</option><option value="text-below"
				>Below the device</option
			><option value="centered">Centered statement</option></select
		><label class="field-label" for="frame-style">Device frame</label><select
			id="frame-style"
			value={studio.slide.frame}
			onchange={(event) =>
				studio.patchSlide({ frame: event.currentTarget.value as Slide['frame'] })}
			><option value="bezel">Graphite / realistic</option><option value="clay"
				>Porcelain / clay</option
			><option value="wireframe">Fine outline</option><option value="none">Screenshot only</option
			></select
		><label class="field-label" for="device-scale"
			>Device scale<span>{Math.round((studio.slide.scale ?? 1) * 100)}%</span></label
		><input
			disabled={studio.isLinked}
			id="device-scale"
			type="range"
			min="0.6"
			max="1.4"
			step="0.05"
			value={studio.slide.scale ?? 1}
			oninput={(event) => studio.patchSlide({ scale: Number(event.currentTarget.value) }, 'scale')}
		/><label class="field-label" for="rotation"
			>Rotation<span>{studio.slide.tilt ?? 0}°</span></label
		><input
			disabled={studio.isLinked}
			id="rotation"
			type="range"
			min="-30"
			max="30"
			step="1"
			value={studio.slide.tilt ?? 0}
			oninput={(event) => studio.patchSlide({ tilt: Number(event.currentTarget.value) }, 'tilt')}
		/>{#if studio.isLinked}<p class="field-help">
				Use the connected-device controls below for this pair.
			</p>{/if}<label class="field-label" for="background-kind">Background fill</label><select
			id="background-kind"
			value={studio.slide.background.kind}
			onchange={(event) =>
				studio.patchSlide({
					background: {
						...studio.slide.background,
						kind: event.currentTarget.value as Slide['background']['kind'],
						colors:
							studio.slide.background.colors.length > 1
								? studio.slide.background.colors
								: [studio.slide.background.colors[0], studio.direction.accent]
					}
				})}
			><option value="solid">Solid color</option><option value="linear">Linear gradient</option
			><option value="radial">Radial glow</option></select
		>
		<div class="color-row">
			<label class="color-field"
				>Background<span
					><input
						type="color"
						aria-label="Background color"
						value={studio.slide.background.colors[0]}
						oninput={(event) =>
							studio.patchSlide(
								{
									background: {
										...studio.slide.background,
										colors: [
											event.currentTarget.value,
											studio.slide.background.colors[1] ?? studio.direction.accent
										]
									}
								},
								'background.start'
							)}
					/><code>{studio.slide.background.colors[0]}</code></span
				></label
			>{#if studio.slide.background.kind !== 'solid'}<label class="color-field"
					>Gradient end<span
						><input
							type="color"
							aria-label="Gradient end color"
							value={studio.slide.background.colors[1] ?? studio.direction.accent}
							oninput={(event) =>
								studio.patchSlide(
									{
										background: {
											...studio.slide.background,
											colors: [studio.slide.background.colors[0], event.currentTarget.value]
										}
									},
									'background.end'
								)}
						/><code>{studio.slide.background.colors[1] ?? studio.direction.accent}</code></span
					></label
				>{/if}
		</div>
		<label class="field-label" for="shadow">Shadow</label><select
			id="shadow"
			value={studio.slide.effects.shadow}
			onchange={(event) =>
				studio.patchSlide({
					effects: {
						...studio.slide.effects,
						shadow: event.currentTarget.value as Slide['effects']['shadow']
					}
				})}
			><option value="dramatic">Studio depth</option><option value="soft">Soft shadow</option
			><option value="none">No shadow</option></select
		><label class="field-label" for="glow"
			>Device glow<span>{Math.round(studio.slide.effects.glow * 100)}%</span></label
		><input
			id="glow"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={studio.slide.effects.glow}
			oninput={(event) =>
				studio.patchSlide(
					{ effects: { ...studio.slide.effects, glow: Number(event.currentTarget.value) } },
					'effects.glow'
				)}
		/>
	</section>
{/if}

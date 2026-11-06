<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { applyCheckPatch } from '$lib/model/check';
	import type { ImageLayer, PixelRect } from '$lib/model/contracts';
	import {
		MAX_ART_SCALE,
		MAX_LAYER_SCALE,
		MAX_SLIDE_LAYERS,
		MIN_LAYER_SCALE
	} from '$lib/model/limits';

	const studio = getStudio();
	let selectedId = $state('');
	let expanded = $state(false);
	let artworkInput: HTMLInputElement;
	let drag: { pointer: number; x: number; y: number; crop: PixelRect; ratio: number } | undefined;
	const layers = $derived(studio.slide.layers ?? []);
	const count = $derived(layers.length);
	const selected = $derived(layers.find((layer) => layer.id === selectedId) ?? layers.at(-1));
	$effect(() => {
		if (count > 0) expanded = true;
	});
	const fields: { key: keyof PixelRect; label: string }[] = [
		{ key: 'x', label: 'Crop left' },
		{ key: 'y', label: 'Crop top' },
		{ key: 'width', label: 'Crop width' },
		{ key: 'height', label: 'Crop height' }
	];
	const positionFields = [
		{ key: 'x', label: 'Left' },
		{ key: 'y', label: 'Top' }
	] as const;

	function update(patch: Partial<ImageLayer>, coalesce?: string) {
		if (!selected) return;
		studio.patchSlide(
			{
				layers: layers.map((layer) => (layer.id === selected.id ? { ...layer, ...patch } : layer))
			},
			coalesce
		);
	}

	function crop(patch: Partial<PixelRect>, coalesce?: string) {
		if (!selected) return;
		const next = { ...selected.crop, ...patch };
		const image = selected.image;
		next.width = Math.max(1, Math.min(image.naturalWidth, Math.round(next.width)));
		next.height = Math.max(1, Math.min(image.naturalHeight, Math.round(next.height)));
		next.x = Math.max(0, Math.min(image.naturalWidth - next.width, Math.round(next.x)));
		next.y = Math.max(0, Math.min(image.naturalHeight - next.height, Math.round(next.y)));
		update({ crop: next }, coalesce);
	}

	function liftDetail() {
		const image = studio.displayedImage;
		if (!image || count >= MAX_SLIDE_LAYERS) return;
		const width = Math.round(image.naturalWidth * 0.8);
		const height = Math.round(Math.min(image.naturalHeight * 0.22, width * 0.65));
		const layer: ImageLayer = {
			id: `detail-${crypto.randomUUID()}`,
			kind: 'source-crop',
			image,
			crop: {
				x: Math.round((image.naturalWidth - width) / 2),
				y: Math.round(image.naturalHeight * 0.4),
				width,
				height
			},
			x: studio.device.width * 0.1,
			y: studio.device.height * 0.65,
			scale: (studio.device.width * 0.8) / width,
			radius: studio.device.width * 0.02,
			shadow: 'soft'
		};
		studio.patchSlide({ layers: [...layers, layer] });
		selectedId = layer.id;
	}

	function remove() {
		if (!selected) return;
		const mark = studio.check.mark?.anchor === selected.id;
		const tear = studio.check.tear === selected.id;
		studio.patchSlide({
			layers: layers.filter((layer) => layer.id !== selected.id),
			...(studio.isCheck && (mark || tear)
				? {
						check: applyCheckPatch(studio.check, {
							...(mark ? { mark: null } : {}),
							...(tear ? { tear: null } : {})
						})
					}
				: {})
		});
	}

	function reorder(delta: number) {
		if (!selected) return;
		const index = layers.indexOf(selected);
		const destination = index + delta;
		if (destination < 0 || destination >= layers.length) return;
		const next = [...layers];
		[next[index], next[destination]] = [next[destination], next[index]];
		studio.patchSlide({ layers: next });
	}

	function startDrag(event: PointerEvent) {
		if (!selected || event.button !== 0) return;
		const target = event.currentTarget as HTMLButtonElement;
		target.setPointerCapture(event.pointerId);
		drag = {
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			crop: { ...selected.crop },
			ratio: selected.image.naturalWidth / target.clientWidth
		};
	}
	function moveDrag(event: PointerEvent) {
		if (!drag || drag.pointer !== event.pointerId) return;
		crop(
			{
				x: drag.crop.x + (event.clientX - drag.x) * drag.ratio,
				y: drag.crop.y + (event.clientY - drag.y) * drag.ratio
			},
			`layer:${selected?.id}:crop`
		);
	}
	function endDrag() {
		drag = undefined;
		studio.store.checkpoint();
	}
	function moveWithKeys(event: KeyboardEvent) {
		if (!selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
			return;
		event.preventDefault();
		const step = event.shiftKey ? 10 : 1;
		crop({
			x:
				selected.crop.x +
				(event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
			y: selected.crop.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)
		});
	}
</script>

<details class="control-section layer-controls" bind:open={expanded}>
	<summary id="frame-layers">Callouts &amp; artwork <span>{layers.length || '+'}</span></summary>
	<p class="field-help">
		Lift a detail from your screenshot, or add a logo. Edits belong to this output size.
	</p>
	<div class="layer-actions">
		<button
			class="button"
			disabled={!studio.displayedImage || count >= MAX_SLIDE_LAYERS}
			onclick={liftDetail}><Icon name="plus" size={14} />Lift a detail</button
		>
		<button
			class="button"
			disabled={studio.processing || count >= MAX_SLIDE_LAYERS}
			onclick={() => artworkInput.click()}><Icon name="image" size={14} />Add artwork</button
		>
	</div>
	<input
		hidden
		bind:this={artworkInput}
		type="file"
		accept="image/png,image/jpeg,image/webp"
		aria-label="Upload artwork"
		onchange={(event) => {
			void studio.uploadArtwork(event.currentTarget.files);
			event.currentTarget.value = '';
		}}
	/>
	{#if selected}
		<label class="field-label" for="selected-layer">Selected layer</label>
		<select
			id="selected-layer"
			value={selected.id}
			onchange={(event) => (selectedId = event.currentTarget.value)}
		>
			{#each layers as layer, index (layer.id)}<option value={layer.id}
					>{index + 1}. {layer.kind === 'art' ? 'Artwork' : 'Detail'} · {studio.store.project
						.assets[layer.image.id]?.name ?? 'Screenshot'}</option
				>{/each}
		</select>
		<button
			class="crop-source"
			style:aspect-ratio={`${selected.image.naturalWidth}/${selected.image.naturalHeight}`}
			style:max-width={`${(230 * selected.image.naturalWidth) / selected.image.naturalHeight}px`}
			aria-label="Move crop with a drag or arrow keys"
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onkeydown={moveWithKeys}
		>
			<img src={selected.image.blobUrl} alt="Source for this layer" draggable="false" />
			<span
				class="crop-box"
				style:left={`${(selected.crop.x / selected.image.naturalWidth) * 100}%`}
				style:top={`${(selected.crop.y / selected.image.naturalHeight) * 100}%`}
				style:width={`${(selected.crop.width / selected.image.naturalWidth) * 100}%`}
				style:height={`${(selected.crop.height / selected.image.naturalHeight) * 100}%`}
			></span>
		</button>
		<p class="crop-hint">Drag to move the crop · Shift + arrows moves 10 pixels</p>
		<div class="num-grid">
			{#each fields as field (field.key)}
				<label class="num-field" for={`layer-crop-${field.key}`}
					>{field.label}<input
						id={`layer-crop-${field.key}`}
						type="number"
						min={field.key === 'width' || field.key === 'height' ? 1 : 0}
						step="1"
						value={selected.crop[field.key]}
						oninput={(event) => {
							const n = event.currentTarget.valueAsNumber;
							if (Number.isFinite(n))
								crop({ [field.key]: n }, `layer:${selected.id}:crop:${field.key}`);
						}}
						onchange={() => studio.store.checkpoint()}
					/></label
				>
			{/each}
		</div>
		<div class="num-grid">
			{#each positionFields as field (field.key)}
				<label class="num-field" for={`layer-${field.key}`}
					>{field.label}<input
						id={`layer-${field.key}`}
						type="number"
						min="-16000"
						max="16000"
						step="1"
						value={Math.round(selected[field.key])}
						oninput={(event) => {
							const n = event.currentTarget.valueAsNumber;
							if (Number.isFinite(n))
								update(
									{ [field.key]: Math.max(-16000, Math.min(16000, n)) },
									`layer:${selected.id}:${field.key}`
								);
						}}
						onchange={() => studio.store.checkpoint()}
					/></label
				>
			{/each}
			<label class="num-field" for="layer-scale"
				>Scale %<input
					id="layer-scale"
					type="number"
					min="1"
					max={(selected.kind === 'art' ? MAX_ART_SCALE : MAX_LAYER_SCALE) * 100}
					step="1"
					value={Math.round(selected.scale * 100)}
					oninput={(event) => {
						const n = event.currentTarget.valueAsNumber;
						if (Number.isFinite(n))
							update(
								{
									scale: Math.max(
										MIN_LAYER_SCALE,
										Math.min(selected.kind === 'art' ? MAX_ART_SCALE : MAX_LAYER_SCALE, n / 100)
									)
								},
								`layer:${selected.id}:scale`
							);
					}}
					onchange={() => studio.store.checkpoint()}
				/></label
			>
			<label class="num-field" for="layer-rotation"
				>Rotation °<input
					id="layer-rotation"
					type="number"
					min="-180"
					max="180"
					step="1"
					value={selected.rotation ?? 0}
					onchange={(event) =>
						update({
							rotation: Math.max(-180, Math.min(180, event.currentTarget.valueAsNumber || 0))
						})}
				/></label
			>
			<label class="num-field" for="layer-radius"
				>Corners<input
					id="layer-radius"
					type="number"
					min="0"
					max="4000"
					step="1"
					value={selected.radius ?? 0}
					onchange={(event) =>
						update({ radius: Math.max(0, Math.min(4000, event.currentTarget.valueAsNumber || 0)) })}
				/></label
			>
		</div>
		<label class="field-label" for="layer-shadow">Layer shadow</label>
		<select
			id="layer-shadow"
			value={selected.shadow ?? 'none'}
			onchange={(event) => update({ shadow: event.currentTarget.value as ImageLayer['shadow'] })}
			><option value="none">None</option><option value="soft">Soft</option><option value="dramatic"
				>Deep</option
			></select
		>
		{#if selected.kind === 'art'}
			<label class="field-label" for="layer-sampling">Artwork detail</label>
			<select
				id="layer-sampling"
				value={selected.sampling ?? 'smooth'}
				onchange={(event) =>
					update({ sampling: event.currentTarget.value as ImageLayer['sampling'] })}
				><option value="smooth">Smooth</option><option value="pixelated">Pixel art</option></select
			>
		{/if}
		<div class="layer-order">
			<button
				class="text-button"
				disabled={layers.indexOf(selected) === 0}
				onclick={() => reorder(-1)}>Send back</button
			>
			<button
				class="text-button"
				disabled={layers.indexOf(selected) === layers.length - 1}
				onclick={() => reorder(1)}>Bring forward</button
			>
			<button class="text-button remove-layer" onclick={remove}>Remove layer</button>
		</div>
	{/if}
</details>

<style>
	.layer-controls summary {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		cursor: pointer;
		color: #405737;
		font-size: 12px;
		font-weight: 600;
	}
	.layer-controls summary span {
		color: #8a947d;
		font-weight: 400;
	}
	.layer-actions {
		display: flex;
		gap: 6px;
		margin: 12px 0 18px;
	}
	.layer-actions .button {
		flex: 1;
		padding: 8px;
		font-size: 10px;
		justify-content: center;
	}
	.layer-controls select {
		width: 100%;
	}
	.crop-source {
		position: relative;
		display: block;
		width: 100%;
		overflow: hidden;
		padding: 0;
		margin: 12px auto 0;
		border: 1px solid #c4cbbd;
		border-radius: 6px;
		background: #e5e9dd;
		cursor: grab;
		touch-action: none;
	}
	.crop-source:active {
		cursor: grabbing;
	}
	.crop-source img {
		display: block;
		width: 100%;
		height: auto;
		opacity: 0.55;
		pointer-events: none;
	}
	.crop-box {
		position: absolute;
		border: 2px solid #38694d;
		box-shadow:
			0 0 0 1px #fff9,
			0 0 0 500px #182a1933;
		pointer-events: none;
	}
	.crop-hint {
		margin: 6px 0 12px;
		color: #7d8971;
		font-size: 9px;
		line-height: 1.5;
	}
	.layer-order {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 13px;
	}
	.layer-order .text-button {
		font-size: 10px;
	}
	.remove-layer {
		margin-left: auto;
		color: #a65e4c;
	}
	.crop-source:focus-visible,
	summary:focus-visible {
		outline: 2px solid #5b7750;
		outline-offset: 3px;
	}
</style>

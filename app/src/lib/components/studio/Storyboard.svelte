<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import SlidePreview from '$lib/components/SlidePreview.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { targetPickerOptions, type DeviceId } from '$lib/model/devices';
	import StorePreview from './StorePreview.svelte';

	const studio = getStudio();
	let joined = $state(true);
	let zoom = $state(100);
	let storePreview = $state(false);
</script>

<main class="workspace">
	<section class="campaign-heading">
		<div>
			<div class="eyebrow">THE SCREENSHOT STUDIO</div>
			<input
				class="campaign-name"
				aria-label="Campaign name"
				maxlength="50"
				value={studio.store.project.name}
				onchange={(event) => studio.setName(event.currentTarget.value)}
			/>
			<p>A great first impression starts here.</p>
		</div>
		<button class="button" onclick={() => studio.pick('upload')}
			><Icon name="plus" size={16} />Add screenshots</button
		>
	</section>
	<div class="canvas-toolbar">
		<div class="storyboard-label">
			<Icon name="layers" size={16} /><strong>Storyboard</strong><span class="count"
				>{studio.composition.slides.length}</span
			>
		</div>
		<div class="canvas-tools">
			<select
				id="output-size"
				aria-label="Active output"
				value={studio.targetId}
				onchange={(event) => studio.chooseDevice(event.currentTarget.value as DeviceId)}
				>{#each targetPickerOptions(studio.store.project.targets) as target (target.id)}<option
						value={target.id}>{target.label} · {target.width} × {target.height}</option
					>{/each}</select
			>
			<button
				class:enabled={storePreview}
				onclick={() => (storePreview = !storePreview)}
				aria-pressed={storePreview}><Icon name="grid" size={14} />Store preview</button
			>
			<button class:enabled={joined} onclick={() => (joined = !joined)} aria-pressed={joined}
				><Icon name="link" size={14} />Seam preview</button
			><span class="toolbar-divider"></span><button
				class="icon-button"
				onclick={() => studio.store.undo()}
				disabled={!studio.store.canUndo}
				aria-label="Undo"
				title="Undo (⌘Z)"><Icon name="undo" size={15} /></button
			><button
				class="icon-button"
				onclick={() => studio.store.redo()}
				disabled={!studio.store.canRedo}
				aria-label="Redo"
				title="Redo (⇧⌘Z)"><Icon name="redo" size={15} /></button
			><select
				aria-label="Preview zoom"
				value={zoom}
				onchange={(event) => (zoom = Number(event.currentTarget.value))}
				><option value={80}>80%</option><option value={100}>100%</option><option value={125}
					>125%</option
				><option value={150}>150%</option></select
			>
		</div>
	</div>
	<div
		id="frames"
		tabindex="-1"
		class="stage"
		ondragover={(event) => event.preventDefault()}
		ondrop={(event) => {
			event.preventDefault();
			void studio.upload(event.dataTransfer?.files ?? null);
		}}
		role="region"
		aria-label="Campaign canvas"
	>
		{#if storePreview}
			<StorePreview
				composition={studio.composition}
				appName={studio.store.project.appName ?? studio.store.project.name}
				selected={studio.selected}
				onselect={(index) => studio.store.select(index)}
			/>
		{:else}
			<div class="canvas-strip" style:--frame-width={`${(204 * zoom) / 100}px`}>
				{#each studio.composition.slides as item, index (item.id)}
					{@const connectedBefore =
						joined &&
						studio.composition.continuityMode === 'paired' &&
						studio.composition.panorama?.rightId === item.id}
					{@const connectedAfter =
						joined &&
						studio.composition.continuityMode === 'paired' &&
						studio.composition.panorama?.leftId === item.id}
					<div
						class="frame-column"
						class:connected-before={connectedBefore}
						class:connected-after={connectedAfter}
					>
						<div class="frame-label">
							<span>{String(index + 1).padStart(2, '0')}</span><span
								>{item.label ?? 'Screenshot'}</span
							>{#if studio.composition.panorama?.leftId === item.id && studio.composition.continuityMode === 'paired'}<Icon
									name="link"
									size={13}
								/>{/if}
						</div>
						<button
							class="frame"
							class:selected={index === studio.selected}
							style:aspect-ratio={`${studio.device.width}/${studio.device.height}`}
							onclick={() => studio.store.select(index)}
							aria-label={`Select screenshot ${index + 1}`}
							aria-pressed={index === studio.selected}
							><SlidePreview
								composition={studio.composition}
								{index}
								width={Math.round((528 * zoom) / 100)}
							/></button
						>
						<div class="frame-meta">
							<span
								>{index === studio.selected
									? 'Editing this frame'
									: `${studio.device.width} × ${studio.device.height}`}</span
							>{#if index === studio.selected}<span class="selected-dot"></span>{/if}
						</div>
					</div>
				{/each}
				{#if studio.composition.slides.length < 10}<button
						class="add-frame"
						onclick={() => studio.addSlide()}
						aria-label="Add blank screenshot"
						><Icon name="plus" size={25} /><span>New frame</span></button
					>{/if}
			</div>
		{/if}
	</div>
	<div class="workspace-bottom">
		<div>
			<span class="small-spark"><Icon name="spark" size={16} /></span>
			<div>
				<strong>One story. Every frame.</strong>
				<p>
					{studio.composition.panorama && studio.composition.continuityMode === 'paired'
						? 'Your connected device is perfectly aligned across both exports.'
						: 'Keep a consistent style, then give each screenshot its own moment.'}
				</p>
			</div>
		</div>
		<span class="format-label"
			>PNG<span>·</span>{studio.device.label}<span>·</span>{studio.composition.slides.length} frames</span
		>
	</div>
</main>

<style>
	#output-size {
		width: clamp(110px, 16vw, 200px);
		max-width: 200px;
	}
</style>

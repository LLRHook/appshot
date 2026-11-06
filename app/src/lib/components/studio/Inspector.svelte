<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { LINEN_PHONE_BOUNDS } from '$lib/model/linen';
	import InspectorComposition from './InspectorComposition.svelte';
	import InspectorContent from './InspectorContent.svelte';
	import OutputTargets from './OutputTargets.svelte';

	const studio = getStudio();
</script>

<aside class="inspector">
	<div class="inspector-heading">
		<div>
			<span class="eyebrow">SCREENSHOT {String(studio.selected + 1).padStart(2, '0')}</span>
			<h2>Make it yours.</h2>
		</div>
		<button
			class="icon-button"
			onclick={() => studio.duplicate()}
			disabled={studio.composition.slides.length >= 10}
			aria-label="Duplicate screenshot"
			title="Duplicate screenshot"><Icon name="copy" size={17} /></button
		>
	</div>
	<div class="inspector-tabs">
		<button
			class:active={studio.inspectorTab === 'content'}
			onclick={() => (studio.inspectorTab = 'content')}
			><Icon name="type" size={15} />Content</button
		><button
			class:active={studio.inspectorTab === 'device'}
			onclick={() => (studio.inspectorTab = 'device')}
			><Icon name="sliders" size={15} />Composition</button
		>
	</div>
	<div class="inspector-scroll">
		{#if studio.inspectorTab === 'content'}
			<InspectorContent />
		{:else}
			<InspectorComposition />
		{/if}
		<section class="connection-card" class:linked={studio.isLinked}>
			<div class="connection-heading">
				<span><Icon name="link" size={17} />Across the seam</span><button
					class="switch"
					class:on={studio.isLinked}
					onclick={() => studio.toggleLink()}
					role="switch"
					aria-checked={studio.isLinked}
					aria-label="Connect adjacent screenshots"
					disabled={!studio.isLinked &&
						(studio.selected === studio.composition.slides.length - 1 ||
							!studio.slide.primaryImage)}><span></span></button
				>
			</div>
			<p>
				{studio.isLinked
					? 'One device. Two frames. A continuous composition.'
					: 'Let your device flow into the next screenshot.'}
			</p>
			{#if studio.isLinked && studio.composition.panorama && studio.isLinen}
				<p class="field-help">
					The shared phone crosses the seam at 1320 of the two-frame world. Phone edits in the
					Composition tab apply to both frames.
				</p>
				<div class="pair-controls">
					<label
						>Center X<input
							type="number"
							aria-label="Shared phone center"
							min={LINEN_PHONE_BOUNDS.centerX[0]}
							max={LINEN_PHONE_BOUNDS.centerX[1]}
							value={studio.linenPhone.centerX}
							onchange={(event) =>
								studio.linenPhoneNumber('centerX', Number(event.currentTarget.value))}
						/></label
					><label
						>Rotation<input
							type="number"
							aria-label="Shared phone rotation"
							min="-8"
							max="8"
							step="0.1"
							value={studio.linenPhone.rotation}
							onchange={(event) =>
								studio.linenPhoneNumber('rotation', Number(event.currentTarget.value))}
						/></label
					>
				</div>
			{:else if studio.isLinked && studio.composition.panorama}<label
					class="field-label"
					for="seam-position"
					>Horizontal position<span>{studio.composition.panorama.offset}px</span></label
				><input
					id="seam-position"
					type="range"
					min="-400"
					max="400"
					step="10"
					value={studio.composition.panorama.offset}
					oninput={(event) => studio.setPanorama('offset', Number(event.currentTarget.value))}
				/>
				<div class="pair-controls">
					<label
						>Scale<input
							type="number"
							aria-label="Connected device scale"
							min="0.6"
							max="1.4"
							step="0.05"
							value={studio.composition.panorama.scale}
							onchange={(event) =>
								studio.setPanorama(
									'scale',
									Math.max(0.6, Math.min(1.4, Number(event.currentTarget.value) || 1))
								)}
						/></label
					><label
						>Rotation<input
							type="number"
							aria-label="Connected device rotation"
							min="-30"
							max="30"
							value={studio.composition.panorama.tilt}
							onchange={(event) =>
								studio.setPanorama(
									'tilt',
									Math.max(-30, Math.min(30, Number(event.currentTarget.value) || 0))
								)}
						/></label
					>
				</div>{/if}
		</section>
		<OutputTargets
			targets={studio.targets}
			active={studio.targetId}
			issues={studio.issues}
			sourceCounts={studio.sourceCounts}
			slideCount={studio.composition.slides.length}
			checking={studio.checkingReadiness}
			onselect={(id) => studio.chooseDevice(id)}
			onadd={(id) => studio.chooseDevice(id)}
			onremove={(id) => studio.removeOutput(id)}
			onfix={(issue) => studio.focusIssue(issue)}
		/>
	</div>
	<div class="inspector-footer">
		<div>
			<button
				class="icon-button"
				aria-label="Move screenshot left"
				onclick={() => studio.moveSlide(-1)}
				disabled={studio.selected === 0}><Icon name="back" size={16} /></button
			><span>{studio.selected + 1} of {studio.composition.slides.length}</span><button
				class="icon-button"
				aria-label="Move screenshot right"
				onclick={() => studio.moveSlide(1)}
				disabled={studio.selected === studio.composition.slides.length - 1}
				><Icon name="chevron" size={16} /></button
			>
		</div>
		<button
			class="icon-button danger"
			aria-label="Delete screenshot"
			onclick={() => studio.remove()}
			disabled={studio.composition.slides.length === 1}><Icon name="trash" size={16} /></button
		>
	</div>
</aside>

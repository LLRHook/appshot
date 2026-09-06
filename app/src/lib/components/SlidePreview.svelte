<script lang="ts">
	import type { Composition } from '$lib/model/types';
	import { renderSlide } from '$lib/render';
	let {
		composition,
		index,
		width = 396
	}: { composition: Composition; index: number; width?: number } = $props();
	let error = $state('');
	function paint(
		node: HTMLCanvasElement,
		config: { composition: Composition; index: number; width: number }
	) {
		let active = true;
		async function update(value: typeof config) {
			try {
				await renderSlide(node, value.composition, value.index, { width: value.width });
				if (active) error = '';
			} catch (e) {
				if (active) error = e instanceof Error ? e.message : 'Preview unavailable';
			}
		}
		void update(config);
		return {
			update,
			destroy() {
				active = false;
			}
		};
	}
</script>

<canvas
	use:paint={{ composition, index, width }}
	aria-label={`Screenshot ${index + 1}: ${composition.slides[index]?.typography.headline}`}
	data-slide={index}
></canvas>
{#if error}<span class="render-error">{error}</span>{/if}

<style>
	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.render-error {
		position: absolute;
		inset: auto 8px 8px;
		background: #fff4f0;
		color: #7b2c20;
		padding: 8px;
		font-size: 11px;
		border-radius: 6px;
	}
</style>

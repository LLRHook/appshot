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
		// The renderer already makes the canvas atomic (latest call wins). The error text
		// needs the same guard: only the newest update, and never a destroyed one, may set
		// or clear it, so a superseded render that resolves late cannot hide a newer error.
		let revision = 0;
		async function update(value: typeof config) {
			const current = ++revision;
			try {
				await renderSlide(node, value.composition, value.index, { width: value.width });
				if (current === revision) error = '';
			} catch (e) {
				if (current === revision) error = e instanceof Error ? e.message : 'Preview unavailable';
			}
		}
		void update(config);
		return {
			update,
			destroy() {
				revision++;
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

<script lang="ts">
	import type { Composition } from '$lib/model/types';
	import { renderSlide } from '$lib/render';
	import { documentsEqual } from '$lib/editor/equal';
	import { linenPlainText } from '$lib/model/linen';
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
		let previous: unknown;
		function inputs(value: typeof config) {
			const { composition: project, index, width } = value;
			const slide = project.slides[index];
			const pair = project.continuityMode === 'paired' ? project.panorama : undefined;
			const connected = pair && (pair.leftId === slide?.id || pair.rightId === slide?.id);
			return {
				slide,
				index,
				width,
				name: project.name,
				device: project.device,
				style: project.style,
				accent: project.accent,
				count: project.slides.length,
				pairIds: pair && [pair.leftId, pair.rightId],
				panorama: connected ? pair : undefined,
				pairSlides: connected
					? project.slides.filter((item) => item.id === pair.leftId || item.id === pair.rightId)
					: undefined
			};
		}
		async function update(value: typeof config) {
			const next = inputs(value);
			if (documentsEqual(previous, next)) return;
			previous = next;
			const current = ++revision;
			try {
				await renderSlide(node, value.composition, value.index, { width: value.width });
				if (current === revision) error = '';
			} catch (e) {
				if (current === revision) {
					previous = undefined;
					error = e instanceof Error ? e.message : 'Preview unavailable';
				}
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
	aria-label={`Screenshot ${index + 1}: ${linenPlainText(composition.slides[index]?.typography.headline ?? '')}`}
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

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { download } from '$lib/model/project';
	import { exportCampaign, exportContactSheet, exportSlide } from '$lib/render';

	const studio = getStudio();
	let busy = $state(false);
	let progress = $state(0);

	async function runExport(kind: 'all' | 'one' | 'sheet') {
		busy = true;
		progress = 0;
		studio.error = '';
		const { composition, selected, filename } = studio;
		try {
			const blob =
				kind === 'all'
					? await exportCampaign(
							composition,
							(done, total) => (progress = Math.round((done / total) * 100))
						)
					: kind === 'one'
						? await exportSlide(composition, selected)
						: await exportContactSheet(composition);
			download(
				blob,
				`${filename}-${kind === 'all' ? 'app-store-set.zip' : kind === 'one' ? `${String(selected + 1).padStart(2, '0')}.png` : 'contact-sheet.png'}`
			);
			progress = 100;
			studio.notify(
				kind === 'all' ? 'Your complete screenshot set is ready.' : 'Your image is ready.'
			);
			studio.exportDialog?.close();
		} catch (e) {
			studio.error = e instanceof Error ? e.message : 'Export failed. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={studio.exportDialog}
	class="export-dialog"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div class="dialog-header">
		<span class="export-icon"><Icon name="download" size={25} /></span><button
			class="icon-button"
			onclick={() => studio.exportDialog?.close()}
			disabled={busy}
			aria-label="Close export dialog"><Icon name="close" /></button
		>
	</div>
	<div class="eyebrow">READY FOR YOUR CLOSE-UP</div>
	<h2>From studio<br />to the App Store.</h2>
	<p class="dialog-subtitle">Your whole story, at exactly the right size.</p>
	<div class="export-summary">
		<strong
			>{studio.composition.name}<span>{studio.composition.slides.length} screenshots</span></strong
		><span>{studio.device.label}<b>{studio.device.width} × {studio.device.height} px</b></span>
	</div>
	{#if !studio.allHaveImages}<p class="export-warning">
			Some frames have no app screenshot. Add an image to every frame before exporting.
		</p>{/if}{#if studio.error}<p class="export-warning" role="alert">{studio.error}</p>{/if}<button
		class="button primary export-main"
		disabled={busy || !studio.allHaveImages}
		onclick={() => runExport('all')}
		><Icon name="download" />{busy
			? `Rendering your set… ${progress}%`
			: 'Download complete set'}<span>ZIP</span></button
	>
	<div class="export-options">
		<button disabled={busy || !studio.displayedImage} onclick={() => runExport('one')}
			><Icon name="phone" size={16} />Selected PNG</button
		><button disabled={busy || !studio.allHaveImages} onclick={() => runExport('sheet')}
			><Icon name="grid" size={16} />Contact sheet</button
		>
	</div>
	{#if busy}<progress value={progress} max="100"></progress>{/if}
	<p class="export-note">
		<Icon name="check" size={14} />Rendered locally. No account, no watermarks.
	</p>
</dialog>

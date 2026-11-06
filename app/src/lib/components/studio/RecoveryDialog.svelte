<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	const studio = getStudio();
	let dialog = $state.raw<HTMLDialogElement>();
	$effect(() => {
		if (!dialog) return;
		if (studio.recoveryOpen && !dialog.open) dialog.showModal();
		else if (!studio.recoveryOpen && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="recovery-dialog"
	onclose={() => (studio.recoveryOpen = false)}
	oncancel={() => (studio.recoveryOpen = false)}
>
	<header>
		<div>
			<span>YOUR LOCAL WORKSPACE</span>
			<h2>Recent campaigns</h2>
		</div>
		<button
			class="icon-button"
			aria-label="Close recent campaigns"
			onclick={() => (studio.recoveryOpen = false)}><Icon name="close" /></button
		>
	</header>
	<p>Earlier campaigns stay here when you start a new one or open a project file.</p>
	<div class="saved-list">
		{#each studio.recoverable as item (item.id)}
			<article class:unreadable={item.kind === 'unreadable'}>
				<div>
					<strong>{item.title}</strong><small
						>{new Date(item.savedAt).toLocaleString()}{item.latest
							? ' · Last saved campaign'
							: ''}</small
					>
					{#if item.kind === 'campaign'}<span
							>{item.frames} frames · {item.targets} output sizes{item.origin
								? ' · Recovered copy'
								: ''}</span
						>
					{:else}<span class="recovery-reason"
							>Saved data could not be opened. Download it to keep the original bytes.</span
						>{#if item.reason}<small>{item.reason}</small>{/if}{/if}
				</div>
				<div class="saved-actions">
					<button class="button compact" onclick={() => void studio.downloadRecovery(item.id)}
						><Icon name="download" size={13} />Download</button
					>
					{#if item.kind === 'campaign'}<button
							class="button primary compact"
							disabled={studio.processing}
							onclick={() => void studio.openRecovery(item.id)}
							>Open<Icon name="arrow" size={13} /></button
						>{/if}
				</div>
			</article>
		{:else}<div class="no-campaigns">
				<Icon name="folder" size={25} /><strong>Your campaigns will appear here.</strong><span
					>Edit a frame to save this campaign in your browser.</span
				>
			</div>{/each}
	</div>
	<footer>
		Stored in this browser. Save a project file to move your work to another computer.
	</footer>
</dialog>

<style>
	.recovery-dialog {
		box-sizing: border-box;
		width: min(660px, calc(100vw - 40px));
		max-height: 85vh;
		padding: 28px;
		border: 1px solid #dfe5d7;
		border-radius: 17px;
		background: #fdfefa;
		color: #343b2f;
		box-shadow: 0 25px 90px #20321a30;
	}
	.recovery-dialog::backdrop {
		background: #23311b40;
		backdrop-filter: blur(3px);
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}
	header span {
		font-size: 9px;
		letter-spacing: 0.18em;
		color: #859273;
	}
	h2 {
		margin: 8px 0 0;
		font-size: 25px;
		font-weight: 600;
		letter-spacing: -0.04em;
	}
	p {
		margin: 15px 0 23px;
		color: #7b8470;
		font-size: 12px;
		line-height: 1.6;
	}
	.saved-list {
		display: grid;
		gap: 9px;
	}
	article {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
		padding: 14px;
		border: 1px solid #e2e7dc;
		border-radius: 9px;
		background: #fff;
	}
	article > div:first-child {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	article strong {
		overflow-wrap: anywhere;
		font-size: 13px;
		font-weight: 600;
	}
	article small,
	article span {
		color: #88917e;
		font-size: 10px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.saved-actions {
		display: flex;
		flex: none;
		gap: 5px;
	}
	.unreadable {
		border-color: #eadcc7;
		background: #fffaf2;
	}
	article .recovery-reason {
		color: #9e7740;
	}
	.no-campaigns {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 40px 15px;
		border: 1px dashed #dbe2d2;
		border-radius: 10px;
		color: #81916d;
	}
	.no-campaigns strong {
		font-size: 13px;
		font-weight: 500;
	}
	.no-campaigns span {
		font-size: 11px;
	}
	footer {
		margin-top: 23px;
		color: #8a947f;
		font-size: 10px;
		line-height: 1.5;
	}
	@media (max-width: 600px) {
		article {
			flex-direction: column;
			align-items: stretch;
		}
		.saved-actions {
			justify-content: flex-end;
		}
	}
</style>

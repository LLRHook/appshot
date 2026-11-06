<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';

	const studio = getStudio();
</script>

{#if studio.conflict}
	<aside class="conflict-notice" role="alert">
		<Icon name="copy" size={20} />
		<div>
			<strong>This campaign changed in another tab.</strong>
			<p>Your edits are still here. Keep them as a separate campaign to continue saving.</p>
			<div>
				<button
					class="button primary compact"
					disabled={studio.processing}
					onclick={() => void studio.keepConflictCopy()}>Keep my edits as a copy</button
				><button class="button compact" onclick={() => void studio.saveFile()}
					>Save project file</button
				>
			</div>
		</div>
	</aside>
{/if}

{#if studio.error}<div class="error-notice" role="alert">
		<Icon name="info" /><span>{studio.error}</span><button
			class="icon-button"
			onclick={() => (studio.error = '')}
			aria-label="Dismiss error"><Icon name="close" size={16} /></button
		>
	</div>{/if}
{#if studio.toast}<div class="toast" role="status">
		<span><Icon name="check" size={14} /></span>{studio.toast}
	</div>{/if}

<style>
	.conflict-notice {
		position: fixed;
		z-index: 80;
		top: 80px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 13px;
		width: min(550px, calc(100vw - 40px));
		padding: 18px;
		border: 1px solid #e2cfaa;
		border-radius: 12px;
		background: #fffaf0;
		color: #7b633a;
		box-shadow: 0 8px 35px #3d301820;
	}
	.conflict-notice > :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.conflict-notice strong {
		font-size: 13px;
		font-weight: 600;
	}
	.conflict-notice p {
		margin: 7px 0 13px;
		font-size: 11px;
		line-height: 1.6;
	}
	.conflict-notice div div {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
</style>

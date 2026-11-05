<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';

	const studio = getStudio();
</script>

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

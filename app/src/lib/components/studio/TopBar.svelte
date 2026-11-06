<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import type { SaveStatus } from '$lib/editor/store.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';

	const studio = getStudio();
	const SAVE_TEXT: Record<SaveStatus, string> = {
		opening: 'Opening workspace…',
		example: 'Example campaign',
		saved: 'All changes saved',
		saving: 'Saving…',
		unavailable: 'Autosave unavailable',
		failed: 'Save a project backup'
	};
</script>

<header class="topbar">
	<a class="brand" href={resolve('/')} aria-label="Appshot studio"
		><span class="brandmark"><span></span><span></span></span>appshot<span class="beta">STUDIO</span
		></a
	>
	<div class="breadcrumb">
		<Icon name="folder" size={15} /><span>Workspace</span><span class="slash">/</span><strong
			>{studio.store.project.name}</strong
		>
	</div>
	<div class="top-actions">
		<span class="save-status"
			><span class:saving={studio.store.status === 'saving'}></span>{SAVE_TEXT[
				studio.store.status
			]}</span
		><button class="button compact" onclick={() => studio.saveFile()}
			><Icon name="save" size={15} />Save project</button
		><button class="button primary compact" onclick={() => studio.openExport()}
			><Icon name="download" size={16} />Export set<Icon name="arrow" size={15} /></button
		>
	</div>
</header>

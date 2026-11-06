<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import ExportDialog from '$lib/components/studio/ExportDialog.svelte';
	import FileInputs from '$lib/components/studio/FileInputs.svelte';
	import Inspector from '$lib/components/studio/Inspector.svelte';
	import Library from '$lib/components/studio/Library.svelte';
	import Notices from '$lib/components/studio/Notices.svelte';
	import RecoveryDialog from '$lib/components/studio/RecoveryDialog.svelte';
	import Storyboard from '$lib/components/studio/Storyboard.svelte';
	import TopBar from '$lib/components/studio/TopBar.svelte';
	import { StudioController, setStudio } from '$lib/editor/studio.svelte';

	const studio = setStudio(new StudioController());
	onMount(() => studio.start());
	$effect(() => {
		const project = studio.store.project;
		if (studio.store.ready) untrack(() => void studio.updateReadiness(project));
	});
	const inactive = $derived(!studio.store.ready || studio.processing);
</script>

<svelte:head
	><title>Appshot — Screenshot Studio</title><meta
		name="description"
		content="Turn app screenshots into a beautifully connected App Store campaign. Design locally. Export pixel-perfect PNGs."
	/></svelte:head
>
<!-- A committed control value (`change`) ends its live-edit undo step wherever it happens. -->
<svelte:window
	onkeydown={(event) => studio.handleKeydown(event)}
	onchange={() => studio.store.checkpoint()}
	onpagehide={() => void studio.store.flush()}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') void studio.store.flush();
	}}
/>
<FileInputs />
<div class="studio" class:loading={inactive} aria-busy={inactive} inert={inactive}>
	<TopBar />
	<Library />
	<Storyboard />
	<Inspector />
</div>
<Notices />
<ExportDialog />
<RecoveryDialog />

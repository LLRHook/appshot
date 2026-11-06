<script lang="ts">
	import { getStudio } from '$lib/editor/studio.svelte';

	const studio = getStudio();
</script>

<input
	class="hidden-input"
	type="file"
	accept="image/png,image/jpeg,image/webp"
	multiple
	bind:this={studio.uploadInput}
	onchange={(event) => {
		void studio.upload(event.currentTarget.files);
		event.currentTarget.value = '';
	}}
	aria-label="Upload screenshots"
/>
<input
	class="hidden-input"
	type="file"
	accept="image/png,image/jpeg,image/webp"
	bind:this={studio.replaceInput}
	onchange={(event) => {
		void studio.upload(event.currentTarget.files, true);
		event.currentTarget.value = '';
	}}
	aria-label="Replace screenshot"
/>
<input
	class="hidden-input"
	type="file"
	accept=".json,.zip,application/json,application/zip"
	bind:this={studio.projectInput}
	onchange={(event) => {
		void studio.openProject(event.currentTarget.files);
		event.currentTarget.value = '';
	}}
	aria-label="Open Appshot project"
/>

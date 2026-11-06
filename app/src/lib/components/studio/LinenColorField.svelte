<script lang="ts">
	import { getStudio } from '$lib/editor/studio.svelte';
	import type { LinenColorKey } from '$lib/model/linen';

	let { key, label }: { key: LinenColorKey; label: string } = $props();
	const studio = getStudio();
</script>

<label class="color-field"
	>{label}<span
		><input
			type="color"
			aria-label={`${label} color`}
			value={studio.linenColorValue(key)}
			oninput={(event) => studio.linenColor(key, event.currentTarget.value)}
		/><code>{studio.linenColorValue(key)}</code></span
	></label
>

<script lang="ts">
	let { id, label, on, flip }: { id: string; label: string; on: boolean; flip: () => void } =
		$props();
</script>

<div class="toggle-row">
	<span {id}>{label}</span><button
		class="switch"
		class:on
		role="switch"
		aria-checked={on}
		aria-labelledby={id}
		onclick={flip}><span></span></button
	>
</div>

<script lang="ts">
	let {
		id,
		label,
		value,
		bounds,
		step,
		apply
	}: {
		id: string;
		label: string;
		value: number;
		bounds: readonly [number, number];
		step: number;
		apply: (value: number) => void;
	} = $props();
</script>

<label class="num-field" for={id}
	>{label}<input
		{id}
		type="number"
		min={bounds[0]}
		max={bounds[1]}
		{step}
		{value}
		onchange={(event) => apply(Number(event.currentTarget.value))}
	/></label
>

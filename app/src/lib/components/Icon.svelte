<script lang="ts">
	let {
		name,
		size = 18,
		stroke = 1.7
	}: { name: string; size?: number; stroke?: number } = $props();
	const paths: Record<string, string> = {
		plus: 'M12 5v14M5 12h14',
		arrow: 'M5 12h14m-5-5 5 5-5 5',
		chevron: 'm9 5 7 7-7 7',
		down: 'm6 9 6 6 6-6',
		back: 'm14 6-6 6 6 6',
		close: 'm6 6 12 12M6 18 18 6',
		check: 'm5 12 4 4L19 6',
		upload: 'M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4',
		download: 'M12 4v12m-4-4 4 4 4-4M4 17v3h16v-3',
		image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01',
		grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
		layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
		spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
		link: 'm10 14 4-4M9 16l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 6 0m0-1 2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-6 0',
		undo: 'M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5',
		redo: 'M20 10H10a6 6 0 0 0 0 12m10-12-5-5m5 5-5 5',
		trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
		copy: 'M8 8h12v12H8zM4 16V4h12',
		phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 5h4M10 19h4',
		folder: 'M3 5h7l2 3h9v12H3V5Z',
		type: 'M4 5h16M12 5v15M8 20h8',
		sliders: 'M4 7h16M4 17h16M8 4v6m8 4v6',
		zoom: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6M7 10h6m-3-3v6',
		eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
		move: 'M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
		info: 'M12 11v6M12 7h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
		save: 'M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7',
		more: 'M5 12h.01M12 12h.01M19 12h.01'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] ?? paths.spark} /></svg
>

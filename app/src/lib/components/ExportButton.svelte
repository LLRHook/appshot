<script lang="ts">
	import { DEVICE_SIZES, type DeviceSize } from '$lib/templates';
	import type { ParamValues } from '$lib/stores';

	let {
		templateId,
		params,
		selectedDevice,
	}: {
		templateId: string;
		params: ParamValues;
		selectedDevice: DeviceSize;
	} = $props();

	let exporting = $state(false);
	let exportAll = $state(false);
	let error = $state('');

	async function renderOne(device: DeviceSize): Promise<Blob> {
		const renderParams = { ...params, device: device.device };
		const res = await fetch('/api/render', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				templateId,
				params: renderParams,
				width: device.width,
				height: device.height,
			}),
		});

		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.details || err.error || 'Render failed');
		}

		return res.blob();
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleExport() {
		exporting = true;
		error = '';
		try {
			const blob = await renderOne(selectedDevice);
			downloadBlob(blob, `${templateId}_${selectedDevice.width}x${selectedDevice.height}.png`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			exporting = false;
		}
	}

	async function handleExportAll() {
		exportAll = true;
		error = '';
		try {
			for (const device of DEVICE_SIZES) {
				const blob = await renderOne(device);
				downloadBlob(blob, `${templateId}_${device.label.replace(/["\s]/g, '_')}_${device.width}x${device.height}.png`);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			exportAll = false;
		}
	}
</script>

<div class="flex items-center gap-2">
	{#if error}
		<span class="text-xs text-red-500">{error}</span>
	{/if}

	<button
		onclick={handleExportAll}
		disabled={exporting || exportAll}
		class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
	>
		{exportAll ? 'Exporting...' : 'Export All'}
	</button>

	<button
		onclick={handleExport}
		disabled={exporting || exportAll}
		class="rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
	>
		{exporting ? 'Exporting...' : `Export ${selectedDevice.label}`}
	</button>
</div>

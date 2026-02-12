<script lang="ts">
	import { DEVICE_SIZES, type DeviceSize } from '$lib/templates';
	import type { ParamValues } from '$lib/stores';
	import { downloadZip } from 'client-zip';

	let {
		templateId,
		params,
		selectedDevice,
		seriesScreenshots = [],
	}: {
		templateId: string;
		params: ParamValues;
		selectedDevice: DeviceSize;
		seriesScreenshots?: string[];
	} = $props();

	let exporting = $state(false);
	let exportAll = $state(false);
	let exportSeries = $state(false);
	let exportProgress = $state('');
	let error = $state('');

	const hasSeriesSlides = $derived(seriesScreenshots.length > 1);

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

	async function renderWithParams(device: DeviceSize, overrides: Record<string, string | number>): Promise<Blob> {
		const renderParams = { ...params, device: device.device, ...overrides };
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
		exportProgress = '';
		try {
			const files: { name: string; input: Blob }[] = [];
			for (let i = 0; i < DEVICE_SIZES.length; i++) {
				const device = DEVICE_SIZES[i];
				exportProgress = `${i + 1}/${DEVICE_SIZES.length}`;
				const blob = await renderOne(device);
				const name = `${templateId}_${device.label.replace(/["\s]/g, '_')}_${device.width}x${device.height}.png`;
				files.push({ name, input: blob });
			}

			const zipBlob = await downloadZip(files).blob();
			downloadBlob(zipBlob, `${templateId}_all_sizes.zip`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			exportAll = false;
			exportProgress = '';
		}
	}

	async function handleExportSeries() {
		exportSeries = true;
		error = '';
		exportProgress = '';
		try {
			const files: { name: string; input: Blob }[] = [];
			for (let i = 0; i < seriesScreenshots.length; i++) {
				exportProgress = `${i + 1}/${seriesScreenshots.length}`;
				const blob = await renderWithParams(selectedDevice, {
					src: seriesScreenshots[i],
					slide: i + 1,
					total_slides: seriesScreenshots.length,
				});
				const name = `${templateId}_slide_${i + 1}_${selectedDevice.width}x${selectedDevice.height}.png`;
				files.push({ name, input: blob });
			}

			const zipBlob = await downloadZip(files).blob();
			downloadBlob(zipBlob, `${templateId}_all_slides.zip`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			exportSeries = false;
			exportProgress = '';
		}
	}
</script>

<div class="flex items-center gap-2">
	{#if error}
		<span class="text-xs text-red-500">{error}</span>
	{/if}

	{#if hasSeriesSlides}
		<button
			onclick={handleExportSeries}
			disabled={exporting || exportAll || exportSeries}
			class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
		>
			{exportSeries ? `Slides ${exportProgress}...` : `All Slides (ZIP)`}
		</button>
	{:else}
		<button
			onclick={handleExportAll}
			disabled={exporting || exportAll}
			class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
		>
			{exportAll ? `Exporting ${exportProgress}...` : 'Export All (ZIP)'}
		</button>
	{/if}

	<button
		onclick={handleExport}
		disabled={exporting || exportAll || exportSeries}
		class="rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
	>
		{exporting ? 'Exporting...' : `Export ${selectedDevice.label}`}
	</button>
</div>

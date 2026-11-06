<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import type { Issue, ProjectV2 } from '$lib/model/contracts';
	import { download } from '$lib/model/project';
	import { exportContactSheet, exportMatrix, exportSlide } from '$lib/render/export';
	import { hasBlockingIssue, preflight } from '$lib/render/preflight';
	import { SPEC_SOURCE, type DeviceId } from '$lib/model/devices';

	const studio = getStudio();
	let busy = $state(false);
	let checking = $state(false);
	let progress = $state(0);
	let phase = $state('');
	let scope = $state<'store' | 'draft'>('store');
	let selection = $state<'all' | 'current'>('all');
	let issues = $state.raw<Issue[]>([]);
	let checkJob: AbortController | undefined;
	let exportJob = $state.raw<AbortController>();
	const targets = $derived(selection === 'all' ? studio.store.project.targets : [studio.targetId]);
	const blockers = $derived(issues.filter((issue) => issue.severity === 'block'));
	const warnings = $derived(issues.filter((issue) => issue.severity === 'warn'));
	const orderedIssues = $derived(
		issues.toSorted((a, b) => {
			const order = { block: 0, warn: 1, info: 2 };
			return order[a.severity] - order[b.severity];
		})
	);
	const previewAvailable = $derived(Boolean(studio.displayedImage || studio.slide.layers?.length));

	$effect(() => {
		const revision = studio.exportRevision;
		const project = studio.store.project;
		const selectedTargets = targets;
		if (!revision || !studio.exportDialog?.open) return;
		const controller = new AbortController();
		checkJob = controller;
		void check(project, selectedTargets, controller);
		return () => controller.abort();
	});

	async function check(
		project: ProjectV2,
		selectedTargets: readonly DeviceId[],
		controller: AbortController
	) {
		checking = true;
		issues = [];
		try {
			const found = await preflight(project, {
				targets: selectedTargets,
				signal: controller.signal
			});
			if (!controller.signal.aborted) issues = found;
		} catch (error) {
			if (!controller.signal.aborted)
				issues = [
					{
						severity: 'block',
						code: 'preflight-failed',
						message:
							error instanceof Error
								? error.message
								: 'The export checklist could not be completed. Try opening export again.'
					}
				];
		} finally {
			if (!controller.signal.aborted) checking = false;
		}
	}

	function close() {
		checkJob?.abort();
		checking = false;
		studio.exportDialog?.close();
	}

	function fix(issue: Issue) {
		close();
		studio.focusIssue(issue);
	}

	async function runSet() {
		if (busy || checking || (scope === 'store' && hasBlockingIssue(issues))) return;
		busy = true;
		progress = 0;
		phase = 'Preparing your files…';
		studio.error = '';
		const controller = new AbortController();
		exportJob = controller;
		try {
			const persistence = studio.campaigns;
			const result = await exportMatrix(studio.store.project, {
				scope,
				targets,
				signal: controller.signal,
				...(persistence
					? { portableProject: (project: ProjectV2) => persistence.exportPortable(project) }
					: {}),
				onProgress: ({ done, total }) => {
					progress = total ? Math.round((done / total) * 100) : 0;
					phase = `Rendering ${done} of ${total} screenshots…`;
				}
			});
			issues = result.issues;
			if (result.status === 'blocked') {
				studio.error = 'No files were exported. Review the findings below.';
				return;
			}
			download(result.zip, result.fileName);
			studio.notify(result.manifest.summary);
			if (result.status === 'partial') {
				studio.error = `This archive is partial: ${result.manifest.omitted.length} frame(s) were omitted. Its manifest lists every omission.`;
			} else close();
		} catch (error) {
			if (controller.signal.aborted) studio.notify('Export cancelled. Your campaign is kept.');
			else
				studio.error = error instanceof Error ? error.message : 'Export failed. Please try again.';
		} finally {
			exportJob = undefined;
			busy = false;
			phase = '';
		}
	}

	async function preview(kind: 'one' | 'sheet') {
		if (busy || !previewAvailable) return;
		busy = true;
		phase = 'Rendering your preview…';
		studio.error = '';
		try {
			const blob =
				kind === 'one'
					? await exportSlide(studio.composition, studio.selected)
					: await exportContactSheet(studio.composition);
			download(
				blob,
				`DRAFT-${studio.filename}-${studio.device.width}x${studio.device.height}-${kind === 'one' ? `${String(studio.selected + 1).padStart(2, '0')}.png` : 'contact-sheet.png'}`
			);
			studio.notify('Draft preview saved. The App Store checklist remains separate.');
			close();
		} catch (error) {
			studio.error = error instanceof Error ? error.message : 'The preview could not be exported.';
		} finally {
			busy = false;
			phase = '';
		}
	}

	onDestroy(() => {
		checkJob?.abort();
		exportJob?.abort();
	});
</script>

<dialog
	bind:this={studio.exportDialog}
	class="export-dialog"
	aria-labelledby="export-title"
	onclose={() => {
		checkJob?.abort();
		checking = false;
	}}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div class="dialog-header">
		<span class="export-icon"><Icon name="download" size={25} /></span><button
			class="icon-button"
			disabled={busy}
			onclick={close}
			aria-label="Close export dialog"><Icon name="close" /></button
		>
	</div>
	<div class="eyebrow">FROM CANVAS TO CAMPAIGN</div>
	<h2 id="export-title">Your story.<br />Every display.</h2>
	<p class="dialog-subtitle">PNG screenshots, a file manifest and one editable project.</p>
	<div class="export-summary">
		<strong
			>{studio.store.project.name}<span>{studio.composition.slides.length} frames per output</span
			></strong
		><span
			>{targets.length} output size{targets.length === 1 ? '' : 's'}<b
				>{targets.length * studio.composition.slides.length} screenshots</b
			></span
		>
	</div>
	<div class="export-purpose" role="group" aria-label="Export purpose">
		<button
			class:active={scope === 'store'}
			aria-pressed={scope === 'store'}
			disabled={busy}
			onclick={() => (scope = 'store')}>App Store set</button
		>
		<button
			class:active={scope === 'draft'}
			aria-pressed={scope === 'draft'}
			disabled={busy}
			onclick={() => (scope = 'draft')}>Draft set</button
		>
	</div>
	<label class="field-label" for="export-targets">Output sizes</label>
	<select id="export-targets" bind:value={selection} disabled={busy}>
		<option value="all">All {studio.targets.length} output sizes</option>
		<option value="current">Current only · {studio.device.width} × {studio.device.height}</option>
	</select>
	{#if selection === 'current' && studio.targets.length > 1}<p class="export-help">
			A subset of this campaign is labelled partial. The editable project still keeps every output.
		</p>{/if}
	{#if scope === 'draft'}<p class="export-help">
			Draft files are labelled for review. Findings and omitted frames stay in the manifest.
		</p>{/if}
	<section class="export-checklist" aria-label="Export checklist" aria-busy={checking}>
		<strong
			>{checking
				? 'Checking fonts, layouts and sources…'
				: blockers.length
					? `${blockers.length} finding${blockers.length === 1 ? '' : 's'} to fix before store export`
					: warnings.length
						? `${warnings.length} finding${warnings.length === 1 ? '' : 's'} to review`
						: 'Checklist complete'}</strong
		>
		{#if issues.length}<details open={blockers.length > 0}>
				<summary>View all {issues.length} findings</summary>
				<div class="export-findings">
					{#each orderedIssues as issue, index (`${issue.code}-${issue.target}-${issue.slideIndex}-${index}`)}
						<button class:blocker={issue.severity === 'block'} onclick={() => fix(issue)}
							><Icon name="info" size={14} /><span>{issue.message}</span><Icon
								name="arrow"
								size={13}
							/></button
						>
					{/each}
				</div>
			</details>{/if}
		<p>File and layout checks do not establish App Review approval or verify product claims.</p>
		<p>
			Apple screenshot specification checked <a
				href={SPEC_SOURCE.url}
				target="_blank"
				rel="external noreferrer">{SPEC_SOURCE.accessed}</a
			>.
		</p>
	</section>
	{#if studio.error}<p class="export-warning" role="alert">{studio.error}</p>{/if}
	<button
		class="button primary export-main"
		disabled={busy || checking || (scope === 'store' && blockers.length > 0)}
		onclick={() => void runSet()}
		><Icon name="download" />{busy
			? phase
			: scope === 'store'
				? 'Download screenshot set'
				: 'Download draft set'}<span>ZIP</span></button
	>
	<div class="export-options">
		<button disabled={busy || !previewAvailable} onclick={() => void preview('one')}
			><Icon name="phone" size={16} />Draft PNG</button
		><button disabled={busy || !previewAvailable} onclick={() => void preview('sheet')}
			><Icon name="grid" size={16} />Draft contact sheet</button
		>
	</div>
	{#if busy}<progress value={progress} max="100"></progress>{#if exportJob}<button
				class="cancel-export"
				onclick={() => exportJob?.abort()}>Cancel export</button
			>{/if}{/if}
	<p class="export-note">
		<Icon name="check" size={14} />Everything is rendered and saved on this device.
	</p>
</dialog>

<style>
	.export-dialog {
		width: min(590px, calc(100vw - 28px));
		max-height: 90dvh;
		overflow-y: auto;
	}
	.export-purpose {
		display: flex;
		gap: 5px;
		margin: 22px 0 19px;
		padding: 4px;
		border: 1px solid #e1e5d8;
		border-radius: 8px;
		background: #f0f3eb;
	}
	.export-purpose button {
		flex: 1;
		padding: 9px;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: #7c8970;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}
	.export-purpose button.active {
		background: white;
		color: #385731;
		box-shadow: 0 1px 4px #20301812;
	}
	.export-help {
		margin: 9px 0 0;
		color: #8b8c72;
		font-size: 10px;
		line-height: 1.6;
	}
	.export-checklist {
		margin-top: 19px;
		padding: 13px;
		border: 1px solid #e1e5d8;
		border-radius: 8px;
		background: #f8faf4;
	}
	.export-checklist > strong {
		color: #647751;
		font-size: 11px;
		font-weight: 600;
	}
	.export-checklist > p {
		margin: 10px 0 0;
		color: #8e9881;
		font-size: 10px;
		line-height: 1.5;
	}
	.export-checklist summary {
		margin-top: 10px;
		color: #78896a;
		font-size: 10px;
		cursor: pointer;
	}
	.export-findings {
		display: grid;
		gap: 6px;
		max-height: 210px;
		overflow-y: auto;
		margin-top: 10px;
	}
	.export-findings button {
		display: flex;
		gap: 7px;
		align-items: flex-start;
		padding: 8px;
		border: 1px solid #e6e4d4;
		border-radius: 5px;
		background: #fffdf5;
		color: #8b7a46;
		font: inherit;
		font-size: 10px;
		line-height: 1.5;
		text-align: left;
		cursor: pointer;
	}
	.export-findings button.blocker {
		border-color: #e8d9ca;
		background: #fff8f0;
		color: #956d48;
	}
	.export-findings button span {
		flex: 1;
	}
	.export-findings button :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.cancel-export {
		display: block;
		margin: 10px auto 0;
		padding: 6px;
		border: 0;
		background: transparent;
		color: #7e8b71;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}
</style>

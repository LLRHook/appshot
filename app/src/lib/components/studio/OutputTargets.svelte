<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { Issue, OutputTarget, TargetStatus } from '$lib/model/contracts';
	import { RECOMMENDED_TARGETS, TARGET_CLASS_GROUPS, type DeviceId } from '$lib/model/devices';

	let {
		targets,
		active,
		issues,
		sourceCounts,
		slideCount,
		checking = false,
		onselect,
		onadd,
		onremove,
		onfix
	}: {
		targets: readonly OutputTarget[];
		active: DeviceId;
		issues: readonly Issue[];
		sourceCounts: Partial<Record<DeviceId, number>>;
		slideCount: number;
		checking?: boolean;
		onselect: (id: DeviceId) => void;
		onadd: (id: DeviceId) => void;
		onremove: (id: DeviceId) => void;
		onfix: (issue: Issue) => void;
	} = $props();

	const STATUS: Record<TargetStatus, string> = {
		required: 'Required',
		'required-if-ipad': 'For iPad apps',
		conditional: 'Conditional',
		optional: 'Optional',
		future: 'April 2027'
	};
	let expanded = $state(false);
	let extraTarget = $state('');
	const rows = $derived(
		targets.map((target) => ({
			target,
			blocks: issues.filter((issue) => issue.target === target.id && issue.severity === 'block')
				.length,
			warnings: issues.filter((issue) => issue.target === target.id && issue.severity === 'warn')
				.length
		}))
	);
	const recommended = $derived(
		RECOMMENDED_TARGETS.filter((target) => !targets.some((added) => added.id === target.id))
	);
	const currentIssues = $derived(
		issues
			.filter((issue) => !issue.target || issue.target === active)
			.toSorted((a, b) =>
				a.severity === b.severity ? 0 : a.severity === 'block' ? -1 : b.severity === 'block' ? 1 : 0
			)
	);
</script>

<section class="outputs" aria-label="Campaign output sizes">
	<div class="outputs-heading">
		<div>
			<strong>Output sizes</strong>
			<p>Shared copy. Captures for each display.</p>
		</div>
		<Icon name="layers" size={17} />
	</div>
	<div class="target-list">
		{#each rows as { target, blocks, warnings } (target.id)}
			<div class="target-row" class:active={target.id === active}>
				<button
					class="target-select"
					onclick={() => onselect(target.id)}
					aria-pressed={target.id === active}
					aria-label={`Edit ${target.label}, ${target.width} by ${target.height}`}
				>
					<span class="target-title">{target.label}</span>
					<span class="target-size"
						>{target.width} × {target.height}<i></i>{STATUS[target.status]}</span
					>
					<span class="target-state" class:blocked={blocks > 0}>
						{sourceCounts[target.id] ?? 0}/{slideCount} captures
						{#if checking}<span>Checking…</span>
						{:else if blocks}<span>{blocks} to fix</span>
						{:else if warnings}<span>{warnings} to review</span>
						{:else}<Icon name="check" size={12} />{/if}
					</span>
				</button>
				<button
					class="remove-target"
					disabled={targets.length === 1}
					onclick={() => onremove(target.id)}
					aria-label={`Remove ${target.label}, ${target.width} by ${target.height}`}
					title="Remove output"><Icon name="close" size={13} /></button
				>
			</div>
		{/each}
	</div>
	<details class="add-target">
		<summary><Icon name="plus" size={14} />Add output size</summary>
		{#if recommended.length}
			<div class="recommended">
				{#each recommended as target (target.id)}
					<button onclick={() => onadd(target.id)}
						><span>{target.label}</span><small>{target.width} × {target.height}</small><Icon
							name="plus"
							size={13}
						/></button
					>
				{/each}
			</div>
		{/if}
		<label for="additional-output">All accepted sizes</label>
		<div class="extra-target">
			<select id="additional-output" bind:value={extraTarget}>
				<option value="">Choose a display size…</option>
				{#each TARGET_CLASS_GROUPS as group (group.id)}
					<optgroup label={group.label}>
						{#each group.targets as target (target.id)}
							<option value={target.id} disabled={targets.some((added) => added.id === target.id)}
								>{target.width} × {target.height}{target.posture ? ` · ${target.posture}` : ''} · {target.orientation}</option
							>
						{/each}
					</optgroup>
				{/each}
			</select>
			<button
				disabled={!extraTarget || targets.some((target) => target.id === extraTarget)}
				onclick={() => {
					if (extraTarget) onadd(extraTarget as DeviceId);
					extraTarget = '';
				}}>Add</button
			>
		</div>
	</details>
	{#if currentIssues.length}
		<div class="source-findings" aria-live="polite">
			<strong>Before export</strong>
			{#each expanded ? currentIssues : currentIssues.slice(0, 3) as issue, index (`${issue.code}-${issue.slideIndex}-${index}`)}
				<button
					class:blocker={issue.severity === 'block'}
					title={issue.message}
					onclick={() => onfix(issue)}
				>
					<Icon name="info" size={13} /><span>{issue.message}</span><Icon name="arrow" size={12} />
				</button>
			{/each}
			{#if currentIssues.length > 3}
				<button class="show-findings" onclick={() => (expanded = !expanded)}
					>{expanded ? 'Show fewer' : `Show all ${currentIssues.length} findings`}</button
				>
			{/if}
		</div>
	{/if}
</section>

<style>
	.outputs {
		padding: 22px 20px;
		border-top: 1px solid #e7e9e1;
	}
	.outputs-heading {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		color: #54624b;
	}
	.outputs-heading strong {
		color: #303a2d;
		font-size: 13px;
		font-weight: 600;
	}
	.outputs-heading p {
		margin: 5px 0 15px;
		color: #7e8577;
		font-size: 11px;
		line-height: 1.5;
	}
	.target-list {
		display: grid;
		gap: 7px;
	}
	.target-row {
		display: flex;
		align-items: flex-start;
		border: 1px solid #e2e5dc;
		border-radius: 8px;
		background: #fff;
	}
	.target-row.active {
		border-color: #789566;
		background: #f4f7ef;
	}
	.target-select {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 5px;
		padding: 10px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.target-title {
		font-size: 11px;
		font-weight: 600;
		line-height: 1.4;
	}
	.target-size {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		font-size: 9px;
		color: #7a8171;
	}
	.target-size i {
		width: 2px;
		height: 2px;
		border-radius: 50%;
		background: currentColor;
	}
	.target-state {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		color: #5c7850;
		font-size: 10px;
	}
	.target-state.blocked {
		color: #9b6338;
	}
	.remove-target {
		flex: none;
		padding: 9px 7px;
		border: 0;
		background: transparent;
		color: #909887;
		cursor: pointer;
	}
	.remove-target:hover:not(:disabled) {
		color: #9c4c35;
	}
	.remove-target:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.add-target {
		margin-top: 10px;
	}
	.add-target summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		color: #557346;
		font-size: 11px;
		cursor: pointer;
		list-style: none;
	}
	.add-target summary::-webkit-details-marker {
		display: none;
	}
	.recommended {
		display: grid;
		gap: 4px;
		margin: 5px 0 12px;
	}
	.recommended button {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 3px 8px;
		padding: 8px;
		border: 1px solid #e3e7db;
		border-radius: 6px;
		background: #f8f9f5;
		color: #57634c;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.recommended button span {
		font-size: 10px;
	}
	.recommended small {
		grid-row: 2;
		font-size: 9px;
		color: #8b9381;
	}
	.recommended button :global(svg) {
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: center;
	}
	.add-target label {
		display: block;
		margin: 8px 0 5px;
		color: #818974;
		font-size: 10px;
	}
	.extra-target {
		display: flex;
		gap: 5px;
	}
	.extra-target select {
		width: 100%;
		min-width: 0;
		padding: 8px;
		border: 1px solid #dde3d2;
		border-radius: 5px;
		background: #fff;
		font: inherit;
		font-size: 10px;
	}
	.extra-target button {
		padding: 0 9px;
		border: 1px solid #d9e2ce;
		border-radius: 5px;
		background: #eef3e7;
		color: #54713f;
		font: inherit;
		font-size: 10px;
		cursor: pointer;
	}
	.extra-target button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.source-findings {
		display: grid;
		gap: 7px;
		margin-top: 17px;
	}
	.source-findings > strong {
		color: #6c755f;
		font-size: 10px;
		font-weight: 600;
	}
	.source-findings button {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 8px;
		border: 1px solid #e6e3d6;
		border-radius: 6px;
		background: #fcfaf3;
		color: #89733d;
		font: inherit;
		text-align: left;
		font-size: 10px;
		line-height: 1.5;
		cursor: pointer;
	}
	.source-findings button.blocker {
		border-color: #eadbca;
		background: #fff9f2;
		color: #8e613f;
	}
	.source-findings button :global(svg) {
		flex: none;
		margin-top: 1px;
	}
	.source-findings button span {
		flex: 1;
	}
	.source-findings button.show-findings {
		justify-content: center;
		padding: 4px;
		border: 0;
		background: transparent;
		color: #62794e;
	}
</style>

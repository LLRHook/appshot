<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import SlidePreview from '$lib/components/SlidePreview.svelte';
	import { getStudio } from '$lib/editor/studio.svelte';
	import { STYLES } from '$lib/model/studio';

	const studio = getStudio();
</script>

<aside class="library">
	<div class="library-heading">
		<span>Your creative toolkit</span><Icon name="spark" size={15} />
	</div>
	<div class="tab-switch">
		<button
			class:active={studio.activeTab === 'styles'}
			onclick={() => (studio.activeTab = 'styles')}><Icon name="grid" size={15} />Styles</button
		><button
			class:active={studio.activeTab === 'assets'}
			onclick={() => (studio.activeTab = 'assets')}
			><Icon name="image" size={15} />Screenshots</button
		>
	</div>
	<div class="library-scroll">
		{#if studio.activeTab === 'styles'}
			<div class="section-intro">
				<h2>Find your feeling.</h2>
				<p>One click. A whole new direction.</p>
			</div>
			<div class="style-list">
				{#each STYLES as style (style.id)}
					<button
						class="style-card"
						class:chosen={studio.composition.style === style.id}
						onclick={() => studio.chooseStyle(style.id)}
						aria-label={`Apply ${style.name} style`}
						aria-pressed={studio.composition.style === style.id}
					>
						<div
							class="style-art"
							style:background={style.background}
							style:color={style.foreground}
						>
							<div
								class="style-type"
								class:serif={style.id === 'paper' || style.id === 'table-linen'}
								class:mono={style.id === 'terminal'}
							>
								<span
									>{style.id === 'paper'
										? 'A story'
										: style.id === 'table-linen'
											? 'Dinner for four.'
											: style.id === 'midnight'
												? 'Less, but'
												: style.id === 'sorbet'
													? 'Oh,'
													: 'Make it'}</span
								><span
									>{style.id === 'paper'
										? 'worth telling.'
										: style.id === 'table-linen'
											? 'One shared bill.'
											: style.id === 'midnight'
												? 'better.'
												: style.id === 'sorbet'
													? 'hello.'
													: 'memorable.'}</span
								>
							</div>
							<div class="style-orbit" style:border-color={style.accent}></div>
							<div class="style-mini">
								<SlidePreview
									composition={studio.stylePreview(style.id)}
									index={Math.min(2, studio.composition.slides.length - 1)}
									width={160}
								/>
							</div>
							{#if studio.composition.style === style.id}<span class="style-check"
									><Icon name="check" size={12} /></span
								>{/if}
						</div>
						<div class="style-caption">
							<span>{style.name}</span><span class="swatches"
								>{#each style.swatches as color (color)}<i style:background={color}
									></i>{/each}</span
							>
						</div>
					</button>
				{/each}
			</div>
			<div class="tip">
				<Icon name="link" size={18} />
				<div>
					<strong>Think outside the frame.</strong>
					<p>Connect two screenshots for one seamless, scroll-stopping story.</p>
				</div>
			</div>
		{:else}
			<div class="section-intro">
				<h2>Your app, in the picture.</h2>
				<p>Select a screenshot to use in this frame.</p>
			</div>
			<button class="upload-zone" onclick={() => studio.pick('upload')}
				><span><Icon name="upload" size={23} /></span><strong>Add screenshots</strong><small
					>PNG, JPG or WebP · up to 12 MB</small
				></button
			>
			<div class="asset-grid">
				{#each studio.assets as asset, i (asset.id)}<button
						class:selected-asset={studio.slide.primaryImage?.id === asset.id}
						onclick={() => studio.useAsset(asset)}
						aria-label={`Use screenshot ${i + 1}`}
						><img src={asset.blobUrl} alt={`Source screenshot ${i + 1}`} /><span
							>{String(i + 1).padStart(2, '0')}<small
								>{asset.naturalWidth} × {asset.naturalHeight}</small
							></span
						></button
					>{/each}
			</div>
			<p class="local-note"><Icon name="check" size={13} />Your images stay on this device.</p>
		{/if}
	</div>
	<button
		class="recent-campaigns"
		onclick={() => {
			studio.recoveryOpen = true;
			void studio.refreshRecovery();
		}}
		><Icon name="folder" size={15} />Recent campaigns<span>{studio.recoverable.length || ''}</span
		></button
	>
	<div class="library-footer">
		<button onclick={() => studio.pick('project')}
			><Icon name="folder" size={16} />Open project</button
		><button onclick={() => studio.newCampaign()}><Icon name="plus" size={16} />New campaign</button
		>
	</div>
</aside>

<style>
	.recent-campaigns {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 20px;
		border: 0;
		border-top: 1px solid #e7e9e1;
		background: transparent;
		color: #62734e;
		font: inherit;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}
	.recent-campaigns span {
		margin-left: auto;
		color: #8a927f;
	}
</style>

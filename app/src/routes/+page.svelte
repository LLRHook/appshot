<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import SlidePreview from '$lib/components/SlidePreview.svelte';
	import { DEVICES, type DeviceId } from '$lib/model/devices';
	import {
		STYLES,
		getStyle,
		createDemo,
		createBlank,
		createSlide,
		type StyleId
	} from '$lib/model/studio';
	import type { Composition, Slide, ImageRef } from '$lib/model/types';
	import {
		LINEN_LAYOUT_BOUNDS,
		LINEN_PALETTES,
		LINEN_PHONE_BOUNDS,
		LINEN_REFERENCE,
		LINEN_SHARED_PHONE,
		defaultLinenSettings,
		defaultLinenTheme,
		linenDefaultsForSlide,
		linenThemeOf,
		resolveLinenSettings,
		resolveSharedLinenPhone,
		type LinenColorKey,
		type LinenLayout,
		type LinenPhone,
		type LinenSettings,
		type LinenTheme
	} from '$lib/model/linen';
	import {
		loadProject,
		saveProject,
		parseProject,
		clearBrokenPanorama,
		readImage,
		download
	} from '$lib/model/project';
	import {
		exportCampaign,
		exportSlide,
		exportContactSheet,
		portableComposition
	} from '$lib/render';

	let project = $state<Composition>(createDemo());
	let selected = $state(0);
	let activeTab = $state<'styles' | 'assets'>('styles');
	let inspectorTab = $state<'content' | 'device'>('content');
	let saved = $state('Opening workspace…');
	let ready = $state(false);
	let toast = $state('');
	let error = $state('');
	let busy = $state(false);
	let processing = $state(false);
	let progress = $state(0);
	let joined = $state(true);
	let zoom = $state(100);
	let uploadInput: HTMLInputElement;
	let replaceInput: HTMLInputElement;
	let projectInput: HTMLInputElement;
	let exportDialog: HTMLDialogElement;
	let history = $state.raw<Composition[]>([]);
	let future = $state.raw<Composition[]>([]);
	let saveTimer: ReturnType<typeof setTimeout>;
	let toastTimer: ReturnType<typeof setTimeout>;
	let saveQueue = Promise.resolve();
	let saveRevision = 0;
	const slide = $derived(project.slides[selected] ?? project.slides[0]);
	const direction = $derived(getStyle(project.style));
	const device = $derived(DEVICES[project.device]);
	const isLinked = $derived(
		project.continuityMode === 'paired' &&
			(project.panorama?.leftId === slide.id || project.panorama?.rightId === slide.id)
	);
	const assets = $derived([
		...new Map(
			project.slides.flatMap((s) =>
				s.primaryImage ? [[s.primaryImage.id, s.primaryImage] as const] : []
			)
		).values()
	]);
	const displayedImage = $derived(isLinked ? project.panorama?.image : slide.primaryImage);
	const isLinen = $derived(project.style === 'table-linen');
	const linen = $derived(resolveLinenSettings(project, selected));
	const linenPhone = $derived(isLinked ? resolveSharedLinenPhone(project) : linen.phone);
	const linenTheme = $derived(linenThemeOf(linen.colors));
	/** The renderer paints a connected pair's phone with the LEFT frame's hardware palette. */
	const HARDWARE_COLOR_KEYS: readonly LinenColorKey[] = ['shell', 'shellEdge', 'shadow'];
	const hardwareIndex = $derived(
		isLinked && project.panorama
			? Math.max(
					0,
					project.slides.findIndex((s) => s.id === project.panorama!.leftId)
				)
			: selected
	);
	const hardwareColors = $derived(resolveLinenSettings(project, hardwareIndex).colors);
	const linenColorValue = (key: LinenColorKey) =>
		HARDWARE_COLOR_KEYS.includes(key) ? hardwareColors[key] : linen.colors[key];
	const LINEN_LAYOUT_FIELDS: { key: keyof LinenLayout; label: string; step: number }[] = [
		{ key: 'margin', label: 'Left margin', step: 1 },
		{ key: 'wordmarkTop', label: 'Wordmark top', step: 1 },
		{ key: 'headlineTop', label: 'Headline top', step: 1 },
		{ key: 'headlineWidth', label: 'Headline width', step: 1 },
		{ key: 'headlineSize', label: 'Headline size', step: 1 },
		{ key: 'headlineLeading', label: 'Headline leading', step: 1 },
		{ key: 'headlineTracking', label: 'Headline tracking', step: 0.01 },
		{ key: 'subtitleTop', label: 'Supporting top', step: 1 },
		{ key: 'subtitleWidth', label: 'Supporting width', step: 1 },
		{ key: 'subtitleSize', label: 'Supporting size', step: 1 },
		{ key: 'subtitleLeading', label: 'Supporting leading', step: 1 },
		{ key: 'bandTop', label: 'Band top', step: 1 }
	];
	const LINEN_PALETTE_FIELDS: { key: LinenColorKey; label: string }[] = [
		{ key: 'canvas', label: 'Canvas' },
		{ key: 'band', label: 'Band' },
		{ key: 'headline', label: 'Headline' },
		{ key: 'accent', label: 'Italic accent' },
		{ key: 'subtitle', label: 'Supporting' }
	];
	const LINEN_ADVANCED_PALETTE: { key: LinenColorKey; label: string }[] = [
		{ key: 'wordmark', label: 'Wordmark' },
		{ key: 'dot', label: 'Gold dot' },
		{ key: 'shell', label: 'Phone shell' },
		{ key: 'shellEdge', label: 'Shell edge' },
		{ key: 'shadow', label: 'Shadow' }
	];
	const allHaveImages = $derived(
		project.slides.every(
			(s) =>
				s.primaryImage ||
				(project.continuityMode === 'paired' &&
					project.panorama?.image &&
					(s.id === project.panorama.leftId || s.id === project.panorama.rightId))
		)
	);
	const filename = $derived(
		project.name
			.trim()
			.replace(/[^a-z0-9-]+/gi, '-')
			.toLowerCase() || 'appshot'
	);

	onMount(() => {
		let active = true;
		void loadProject()
			.then((value) => {
				if (active) {
					if (value) project = value;
					saved = value ? 'All changes saved' : 'Example campaign';
					ready = true;
				}
			})
			.catch(() => {
				if (active) {
					saved = 'Autosave unavailable';
					ready = true;
					notify(
						'Your browser could not restore a saved project. You can still export and save a project file.'
					);
				}
			});
		return () => {
			active = false;
			clearTimeout(saveTimer);
			clearTimeout(toastTimer);
		};
	});
	function notify(message: string) {
		toast = message;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 5000);
	}
	function persist() {
		const revision = ++saveRevision;
		saved = 'Saving…';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const snapshot = $state.snapshot(project);
			saveQueue = saveQueue
				.catch(() => {})
				.then(() => saveProject(snapshot))
				.then(() => {
					if (revision === saveRevision) saved = 'All changes saved';
				})
				.catch(() => {
					if (revision !== saveRevision) return;
					saved = 'Save a project backup';
					notify('Browser storage is full or unavailable. Save your project to keep your changes.');
				});
		}, 350);
	}
	function commit(next: Composition) {
		if (new TextEncoder().encode(JSON.stringify(next)).length > 60 * 1024 * 1024) {
			error =
				'This campaign is too large to save. Use smaller screenshots or fewer frames (60 MB project limit).';
			return false;
		}
		history = [...history.slice(-24), $state.snapshot(project)];
		future = [];
		project = clearBrokenPanorama(next);
		selected = Math.min(selected, project.slides.length - 1);
		persist();
		return true;
	}
	function patchSlide(patch: Partial<Slide>) {
		commit({
			...project,
			slides: project.slides.map((s, i) =>
				i === selected ||
				((patch.frame || patch.effects || patch.background || patch.layout) &&
					isLinked &&
					(s.id === project.panorama?.leftId || s.id === project.panorama?.rightId))
					? { ...s, ...patch }
					: s
			)
		});
	}
	function typography(key: 'headline' | 'subtitle' | 'fontColor', value: string) {
		patchSlide({ typography: { ...slide.typography, [key]: value } });
	}
	const bounded = (value: number, [min, max]: readonly [number, number]) =>
		Math.max(min, Math.min(max, value));
	/** Table Linen text and colors stay per frame; only the phone is shared across a pair. */
	function patchLinen(patch: Partial<LinenSettings>) {
		patchSlide({ linen: { ...linen, ...patch } });
	}
	function patchLinenAt(index: number, patch: Partial<LinenSettings>) {
		const current = resolveLinenSettings(project, index);
		commit({
			...project,
			slides: project.slides.map((s, i) =>
				i === index ? { ...s, linen: { ...current, ...patch } } : s
			)
		});
	}
	/** Shell, shell edge and shadow edit the pair's shared (left) palette from either half. */
	function linenColor(key: LinenColorKey, value: string) {
		if (!/^#[0-9a-f]{6}$/i.test(value)) return;
		if (HARDWARE_COLOR_KEYS.includes(key)) {
			patchLinenAt(hardwareIndex, { colors: { ...hardwareColors, [key]: value } });
			return;
		}
		const colors = { ...linen.colors };
		colors[key] = value;
		patchLinen({ colors });
	}
	function linenShadowOpacity(value: number) {
		if (!Number.isFinite(value)) return;
		patchLinenAt(hardwareIndex, {
			colors: { ...hardwareColors, shadowOpacity: bounded(value, [0, 1]) }
		});
	}
	function applyLinenTheme(theme: LinenTheme) {
		patchLinen({ colors: { ...LINEN_PALETTES[theme] } });
	}
	function linenLayout(key: keyof LinenLayout, value: number) {
		if (!Number.isFinite(value)) return;
		const layout = { ...linen.layout };
		layout[key] = bounded(value, LINEN_LAYOUT_BOUNDS[key]);
		patchLinen({ layout });
	}
	/** On a connected pair every phone edit updates the shared panorama phone. */
	function patchLinenPhone(patch: Partial<LinenPhone>) {
		// An explicit undefined removes an optional key (hardware fields) instead of storing it.
		const merged: Record<string, unknown> = { ...linenPhone, ...patch };
		for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
		const next = merged as unknown as LinenPhone;
		if (next.top >= next.bottom) {
			error = 'The phone top must stay above the phone bottom.';
			return;
		}
		if (next.mode === 'bottom-crop' && !next.cropReason?.trim())
			next.cropReason = 'Intentional bottom crop';
		if (isLinked && project.panorama)
			commit({ ...project, panorama: { ...project.panorama, linenPhone: next } });
		else patchLinen({ phone: next });
	}
	/** Frame preset: the V1 generic shell, or the calibrated iPhone 17 Pro Max illustration. */
	function linenHardware(value: string) {
		if (value === 'iphone-17-pro-max')
			patchLinenPhone({
				hardware: 'iphone-17-pro-max',
				dynamicIsland: linenPhone.dynamicIsland ?? 'source',
				hardwareButtons: linenPhone.hardwareButtons ?? true
			});
		else
			patchLinenPhone({
				hardware: undefined,
				dynamicIsland: undefined,
				hardwareButtons: undefined
			});
	}
	function linenPhoneNumber(key: keyof typeof LINEN_PHONE_BOUNDS, value: number) {
		if (!Number.isFinite(value)) return;
		const next = { ...linenPhone };
		next[key] = bounded(value, LINEN_PHONE_BOUNDS[key]);
		patchLinenPhone(next);
	}
	function freshSlide(index: number, image?: ImageRef): Slide {
		const next = {
			...createSlide(index, image),
			device: project.device,
			typography: { ...createSlide(0).typography, fontColor: direction.foreground }
		};
		return isLinen ? { ...next, linen: defaultLinenSettings('cream') } : next;
	}
	function undo() {
		if (!history.length) return;
		future = [...future, $state.snapshot(project)];
		project = history.at(-1)!;
		history = history.slice(0, -1);
		selected = Math.min(selected, project.slides.length - 1);
		persist();
	}
	function redo() {
		if (!future.length) return;
		history = [...history, $state.snapshot(project)];
		project = future.at(-1)!;
		future = future.slice(0, -1);
		selected = Math.min(selected, project.slides.length - 1);
		persist();
	}
	function keyboard(event: KeyboardEvent) {
		if (processing || !ready) return;
		const element = event.target as HTMLElement;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName) || exportDialog?.open) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
		}
	}
	function chooseStyle(id: StyleId) {
		const style = getStyle(id);
		if (id === 'table-linen') {
			// Keep every raw screenshot and all copy. Slides that never had Table Linen
			// settings get teal/cream defaults; earlier Table Linen edits are preserved.
			const leftIndex =
				project.continuityMode === 'paired' && project.panorama
					? project.slides.findIndex((s) => s.id === project.panorama!.leftId)
					: -1;
			const pair = leftIndex >= 0 ? [leftIndex, leftIndex + 1] : [];
			commit({
				...project,
				style: id,
				accent: style.accent,
				slides: project.slides.map((s, i) => {
					const settings =
						s.linen ?? linenDefaultsForSlide(s, defaultLinenTheme(i, project.slides.length, pair));
					return {
						...s,
						linen: settings,
						background: { kind: 'solid', colors: [settings.colors.canvas] },
						typography: { ...s.typography, fontColor: settings.colors.headline }
					};
				}),
				...(project.panorama
					? {
							panorama: {
								...project.panorama,
								offset: 0,
								scale: 1,
								tilt: 0,
								linenPhone: project.panorama.linenPhone ?? { ...LINEN_SHARED_PHONE }
							}
						}
					: {})
			});
			return;
		}
		commit({
			...project,
			style: id,
			accent: style.accent,
			slides: project.slides.map((s) => ({
				...s,
				typography: { ...s.typography, fontColor: style.foreground },
				background: { kind: 'solid', colors: [style.background] }
			}))
		});
	}
	function chooseDevice(id: DeviceId) {
		commit({ ...project, device: id, slides: project.slides.map((s) => ({ ...s, device: id })) });
	}
	function moveSlide(delta: number) {
		const target = selected + delta;
		if (target < 0 || target >= project.slides.length) return;
		const slides = [...project.slides];
		[slides[selected], slides[target]] = [slides[target], slides[selected]];
		if (commit({ ...project, slides })) selected = target;
	}
	function duplicate() {
		if (project.slides.length >= 10) return;
		const slides = [...project.slides];
		slides.splice(selected + 1, 0, {
			...JSON.parse(JSON.stringify(slide)),
			id: crypto.randomUUID(),
			label: `${slide.label ?? 'Screenshot'} copy`
		});
		if (commit({ ...project, slides })) selected++;
	}
	function remove() {
		if (project.slides.length === 1) return;
		commit({ ...project, slides: project.slides.filter((_, i) => i !== selected) });
	}
	function addSlide() {
		if (project.slides.length >= 10) return;
		const next = freshSlide(project.slides.length);
		commit({ ...project, slides: [...project.slides, next] });
		selected = project.slides.length - 1;
		activeTab = 'assets';
	}
	function toggleLink() {
		if (isLinked) {
			commit({ ...project, panorama: undefined, continuityMode: 'none' });
			return;
		}
		const next = project.slides[selected + 1];
		const image = slide.primaryImage ?? next?.primaryImage;
		if (!next || !image) {
			notify('Choose a screenshot with an image and a frame to its right.');
			return;
		}
		commit({
			...project,
			slides: project.slides.map((s) =>
				s.id === next.id
					? {
							...s,
							frame: slide.frame,
							layout: slide.layout,
							background: slide.background,
							effects: slide.effects
						}
					: s
			),
			continuityMode: 'paired',
			panorama: {
				leftId: slide.id,
				rightId: next.id,
				image,
				offset: 0,
				scale: 1,
				tilt: isLinen ? 0 : -14,
				...(isLinen ? { linenPhone: { ...linen.phone, centerX: LINEN_REFERENCE.width } } : {})
			}
		});
	}
	function panorama(key: 'offset' | 'scale' | 'tilt', value: number) {
		if (project.panorama) commit({ ...project, panorama: { ...project.panorama, [key]: value } });
	}
	function useAsset(image: ImageRef) {
		commit({
			...project,
			slides: project.slides.map((s, i) => (i === selected ? { ...s, primaryImage: image } : s)),
			panorama: isLinked && project.panorama ? { ...project.panorama, image } : project.panorama
		});
	}
	async function upload(files: FileList | null, replace = false) {
		if (!files?.length || processing) return;
		processing = true;
		error = '';
		try {
			const images: ImageRef[] = [];
			for (const file of Array.from(files)) images.push(await readImage(file));
			if (replace) {
				const img = images[0];
				const slides = project.slides.map((s, i) =>
					i === selected ? { ...s, primaryImage: img } : s
				);
				commit({
					...project,
					slides,
					panorama:
						isLinked && project.panorama ? { ...project.panorama, image: img } : project.panorama
				});
			} else {
				const available = 10 - project.slides.length;
				const empty = !slide.primaryImage;
				const count = Math.min(images.length, available + (empty ? 1 : 0));
				if (!count)
					throw new Error(
						'A campaign can have up to 10 screenshots. Replace an existing image or remove a frame.'
					);
				const slides = [...project.slides];
				images.slice(0, count).forEach((image, i) => {
					if (empty && i === 0) slides[selected] = { ...slide, primaryImage: image };
					else slides.push(freshSlide(slides.length, image));
				});
				commit({ ...project, slides });
				notify(
					`${count} screenshot${count === 1 ? '' : 's'} added${count < images.length ? ' (10-frame limit)' : ''}`
				);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not read this image.';
		} finally {
			processing = false;
		}
	}
	async function openProject(files: FileList | null) {
		if (!files?.[0] || processing) return;
		processing = true;
		try {
			if (files[0].size > 60 * 1024 * 1024) throw new Error('Choose a project file under 60 MB.');
			const next = parseProject(await files[0].text());
			commit(next);
			selected = 0;
			notify('Project opened');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not open project.';
		} finally {
			processing = false;
		}
	}
	async function saveFile() {
		try {
			const portable = await portableComposition($state.snapshot(project));
			download(
				new Blob([JSON.stringify(portable)], { type: 'application/json' }),
				`${filename}.appshot.json`
			);
			notify('Project file saved, with your original images');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save the project.';
		}
	}
	async function runExport(kind: 'all' | 'one' | 'sheet') {
		busy = true;
		progress = 0;
		error = '';
		const snapshot = $state.snapshot(project);
		try {
			const blob =
				kind === 'all'
					? await exportCampaign(
							snapshot,
							(done, total) => (progress = Math.round((done / total) * 100))
						)
					: kind === 'one'
						? await exportSlide(snapshot, selected)
						: await exportContactSheet(snapshot);
			download(
				blob,
				`${filename}-${kind === 'all' ? 'app-store-set.zip' : kind === 'one' ? `${String(selected + 1).padStart(2, '0')}.png` : 'contact-sheet.png'}`
			);
			progress = 100;
			notify(kind === 'all' ? 'Your complete screenshot set is ready.' : 'Your image is ready.');
			exportDialog.close();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed. Please try again.';
		} finally {
			busy = false;
		}
	}
	function stylePreview(id: StyleId): Composition {
		const theme = getStyle(id);
		return {
			...project,
			style: id,
			accent: theme.accent,
			continuityMode: 'none',
			panorama: undefined,
			slides: project.slides.map((s) => ({
				...s,
				background: { kind: 'solid', colors: [theme.background] },
				typography: { ...s.typography, fontColor: theme.foreground }
			}))
		};
	}
</script>

{#snippet numberField(
	id: string,
	label: string,
	value: number,
	bounds: readonly [number, number],
	step: number,
	apply: (value: number) => void
)}
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
{/snippet}
{#snippet colorField(key: LinenColorKey, label: string)}
	<label class="color-field"
		>{label}<span
			><input
				type="color"
				aria-label={`${label} color`}
				value={linenColorValue(key)}
				oninput={(event) => linenColor(key, event.currentTarget.value)}
			/><code>{linenColorValue(key)}</code></span
		></label
	>
{/snippet}
{#snippet toggleRow(id: string, label: string, on: boolean, flip: () => void)}
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
{/snippet}

<svelte:head
	><title>Appshot — Screenshot Studio</title><meta
		name="description"
		content="Turn app screenshots into a beautifully connected App Store campaign. Design locally. Export pixel-perfect PNGs."
	/></svelte:head
>
<svelte:window onkeydown={keyboard} />
<input
	class="hidden-input"
	type="file"
	accept="image/png,image/jpeg,image/webp"
	multiple
	bind:this={uploadInput}
	onchange={() => {
		void upload(uploadInput.files);
		uploadInput.value = '';
	}}
	aria-label="Upload screenshots"
/>
<input
	class="hidden-input"
	type="file"
	accept="image/png,image/jpeg,image/webp"
	bind:this={replaceInput}
	onchange={() => {
		void upload(replaceInput.files, true);
		replaceInput.value = '';
	}}
	aria-label="Replace screenshot"
/>
<input
	class="hidden-input"
	type="file"
	accept=".json"
	bind:this={projectInput}
	onchange={() => {
		void openProject(projectInput.files);
		projectInput.value = '';
	}}
	aria-label="Open Appshot project"
/>

<div
	class="studio"
	class:loading={!ready || processing}
	aria-busy={!ready || processing}
	inert={!ready || processing}
>
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="Appshot studio"
			><span class="brandmark"><span></span><span></span></span>appshot<span class="beta"
				>STUDIO</span
			></a
		>
		<div class="breadcrumb">
			<Icon name="folder" size={15} /><span>Workspace</span><span class="slash">/</span><strong
				>{project.name}</strong
			>
		</div>
		<div class="top-actions">
			<span class="save-status"><span class:saving={saved === 'Saving…'}></span>{saved}</span
			><button class="button compact" onclick={saveFile}
				><Icon name="save" size={15} />Save project</button
			><button
				class="button primary compact"
				onclick={() => {
					error = '';
					exportDialog.showModal();
				}}><Icon name="download" size={16} />Export set<Icon name="arrow" size={15} /></button
			>
		</div>
	</header>
	<aside class="library">
		<div class="library-heading">
			<span>Your creative toolkit</span><Icon name="spark" size={15} />
		</div>
		<div class="tab-switch">
			<button class:active={activeTab === 'styles'} onclick={() => (activeTab = 'styles')}
				><Icon name="grid" size={15} />Styles</button
			><button class:active={activeTab === 'assets'} onclick={() => (activeTab = 'assets')}
				><Icon name="image" size={15} />Screenshots</button
			>
		</div>
		<div class="library-scroll">
			{#if activeTab === 'styles'}
				<div class="section-intro">
					<h2>Find your feeling.</h2>
					<p>One click. A whole new direction.</p>
				</div>
				<div class="style-list">
					{#each STYLES as style (style.id)}
						<button
							class="style-card"
							class:chosen={project.style === style.id}
							onclick={() => chooseStyle(style.id)}
							aria-label={`Apply ${style.name} style`}
							aria-pressed={project.style === style.id}
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
										composition={stylePreview(style.id)}
										index={Math.min(2, project.slides.length - 1)}
										width={160}
									/>
								</div>
								{#if project.style === style.id}<span class="style-check"
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
				<button class="upload-zone" onclick={() => uploadInput.click()}
					><span><Icon name="upload" size={23} /></span><strong>Add screenshots</strong><small
						>PNG, JPG or WebP · up to 12 MB</small
					></button
				>
				<div class="asset-grid">
					{#each assets as asset, i (asset.id)}<button
							class:selected-asset={slide.primaryImage?.id === asset.id}
							onclick={() => useAsset(asset)}
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
		<div class="library-footer">
			<button onclick={() => projectInput.click()}
				><Icon name="folder" size={16} />Open project</button
			><button
				onclick={() => {
					commit(createBlank());
					selected = 0;
					activeTab = 'assets';
				}}><Icon name="plus" size={16} />New campaign</button
			>
		</div>
	</aside>
	<main class="workspace">
		<section class="campaign-heading">
			<div>
				<div class="eyebrow">THE SCREENSHOT STUDIO</div>
				<input
					class="campaign-name"
					aria-label="Campaign name"
					maxlength="50"
					value={project.name}
					onchange={(event) =>
						commit({ ...project, name: event.currentTarget.value || 'Untitled campaign' })}
				/>
				<p>A great first impression starts here.</p>
			</div>
			<button class="button" onclick={() => uploadInput.click()}
				><Icon name="plus" size={16} />Add screenshots</button
			>
		</section>
		<div class="canvas-toolbar">
			<div class="storyboard-label">
				<Icon name="layers" size={16} /><strong>Storyboard</strong><span class="count"
					>{project.slides.length}</span
				>
			</div>
			<div class="canvas-tools">
				<button class:enabled={joined} onclick={() => (joined = !joined)} aria-pressed={joined}
					><Icon name="link" size={14} />Seam preview</button
				><span class="toolbar-divider"></span><button
					class="icon-button"
					onclick={undo}
					disabled={!history.length}
					aria-label="Undo"
					title="Undo (⌘Z)"><Icon name="undo" size={15} /></button
				><button
					class="icon-button"
					onclick={redo}
					disabled={!future.length}
					aria-label="Redo"
					title="Redo (⇧⌘Z)"><Icon name="redo" size={15} /></button
				><select
					aria-label="Preview zoom"
					value={zoom}
					onchange={(event) => (zoom = Number(event.currentTarget.value))}
					><option value={80}>80%</option><option value={100}>100%</option><option value={125}
						>125%</option
					><option value={150}>150%</option></select
				>
			</div>
		</div>
		<div
			class="stage"
			ondragover={(event) => event.preventDefault()}
			ondrop={(event) => {
				event.preventDefault();
				void upload(event.dataTransfer?.files ?? null);
			}}
			role="region"
			aria-label="Campaign canvas"
		>
			<div class="canvas-strip" style:--frame-width={`${(204 * zoom) / 100}px`}>
				{#each project.slides as item, index (item.id)}
					{@const connectedBefore =
						joined && project.continuityMode === 'paired' && project.panorama?.rightId === item.id}
					{@const connectedAfter =
						joined && project.continuityMode === 'paired' && project.panorama?.leftId === item.id}
					<div
						class="frame-column"
						class:connected-before={connectedBefore}
						class:connected-after={connectedAfter}
					>
						<div class="frame-label">
							<span>{String(index + 1).padStart(2, '0')}</span><span
								>{item.label ?? 'Screenshot'}</span
							>{#if project.panorama?.leftId === item.id && project.continuityMode === 'paired'}<Icon
									name="link"
									size={13}
								/>{/if}
						</div>
						<button
							class="frame"
							class:selected={index === selected}
							style:aspect-ratio={`${device.width}/${device.height}`}
							onclick={() => (selected = index)}
							aria-label={`Select screenshot ${index + 1}`}
							aria-pressed={index === selected}
							><SlidePreview
								composition={project}
								{index}
								width={Math.round((528 * zoom) / 100)}
							/></button
						>
						<div class="frame-meta">
							<span
								>{index === selected
									? 'Editing this frame'
									: `${device.width} × ${device.height}`}</span
							>{#if index === selected}<span class="selected-dot"></span>{/if}
						</div>
					</div>
				{/each}
				{#if project.slides.length < 10}<button
						class="add-frame"
						onclick={addSlide}
						aria-label="Add blank screenshot"
						><Icon name="plus" size={25} /><span>New frame</span></button
					>{/if}
			</div>
		</div>
		<div class="workspace-bottom">
			<div>
				<span class="small-spark"><Icon name="spark" size={16} /></span>
				<div>
					<strong>One story. Every frame.</strong>
					<p>
						{project.panorama && project.continuityMode === 'paired'
							? 'Your connected device is perfectly aligned across both exports.'
							: 'Keep a consistent style, then give each screenshot its own moment.'}
					</p>
				</div>
			</div>
			<span class="format-label"
				>PNG<span>·</span>{device.label}<span>·</span>{project.slides.length} frames</span
			>
		</div>
	</main>
	<aside class="inspector">
		<div class="inspector-heading">
			<div>
				<span class="eyebrow">SCREENSHOT {String(selected + 1).padStart(2, '0')}</span>
				<h2>Make it yours.</h2>
			</div>
			<button
				class="icon-button"
				onclick={duplicate}
				disabled={project.slides.length >= 10}
				aria-label="Duplicate screenshot"
				title="Duplicate screenshot"><Icon name="copy" size={17} /></button
			>
		</div>
		<div class="inspector-tabs">
			<button class:active={inspectorTab === 'content'} onclick={() => (inspectorTab = 'content')}
				><Icon name="type" size={15} />Content</button
			><button class:active={inspectorTab === 'device'} onclick={() => (inspectorTab = 'device')}
				><Icon name="sliders" size={15} />Composition</button
			>
		</div>
		<div class="inspector-scroll">
			{#if inspectorTab === 'content'}
				{#if isLinen}
					<section class="control-section">
						<label class="field-label" for="headline"
							>Headline<span>{slide.typography.headline.length}/180</span></label
						><textarea
							id="headline"
							class="headline-input linen-headline"
							maxlength="180"
							rows="3"
							value={slide.typography.headline}
							oninput={(event) => typography('headline', event.currentTarget.value)}
						></textarea>
						<p class="field-help">
							<Icon name="info" size={12} />Each row is one line. Wrap accent words in asterisks,
							like *fair shares*, to set them in serif italic in the accent color.
						</p>
						<label class="field-label" for="subtitle"
							>Supporting text<span>{(slide.typography.subtitle ?? '').length}/300</span></label
						><textarea
							id="subtitle"
							rows="3"
							maxlength="300"
							value={slide.typography.subtitle ?? ''}
							oninput={(event) => typography('subtitle', event.currentTarget.value)}
						></textarea>
						<p class="field-help">Each row is drawn as its own line under the headline.</p>
						<div class="field-label">Theme<span>THIS FRAME</span></div>
						<div class="theme-switch" role="group" aria-label="Table Linen theme">
							<button
								class:active={linenTheme === 'teal'}
								aria-pressed={linenTheme === 'teal'}
								onclick={() => applyLinenTheme('teal')}
								><i style:background={LINEN_PALETTES.teal.canvas}></i>Teal</button
							><button
								class:active={linenTheme === 'cream'}
								aria-pressed={linenTheme === 'cream'}
								onclick={() => applyLinenTheme('cream')}
								><i style:background={LINEN_PALETTES.cream.canvas}></i>Cream</button
							>
						</div>
						{@render toggleRow('band-label', 'Linen band', linen.band, () =>
							patchLinen({ band: !linen.band })
						)}
						<div class="palette-grid">
							{#each LINEN_PALETTE_FIELDS as field (field.key)}
								{@render colorField(field.key, field.label)}
							{/each}
						</div>
						<details class="advanced">
							<summary>Advanced palette</summary>
							<div class="palette-grid">
								{#each LINEN_ADVANCED_PALETTE as field (field.key)}
									{#if !linenPhone.hardware || (field.key !== 'shell' && field.key !== 'shellEdge')}
										{@render colorField(field.key, field.label)}
									{/if}
								{/each}
							</div>
							{#if isLinked}
								<p class="field-help">
									{linenPhone.hardware
										? 'The shadow belongs'
										: 'Phone shell, shell edge and shadow belong'} to the one shared phone; editing
									{linenPhone.hardware ? 'it' : 'them'} here changes both frames. Wordmark and dot stay
									per frame.
								</p>
							{/if}
							<label class="field-label" for="shadow-opacity"
								>Shadow opacity<span>{Math.round(hardwareColors.shadowOpacity * 100)}%</span></label
							><input
								id="shadow-opacity"
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={hardwareColors.shadowOpacity}
								oninput={(event) => linenShadowOpacity(Number(event.currentTarget.value))}
							/>
						</details>
					</section>
				{:else}
					<section class="control-section">
						<label class="field-label" for="headline"
							>Headline<span>{slide.typography.headline.length}/100</span></label
						><textarea
							id="headline"
							class="headline-input"
							maxlength="100"
							rows="3"
							value={slide.typography.headline}
							oninput={(event) => typography('headline', event.currentTarget.value)}
						></textarea><label class="field-label" for="subtitle">Supporting text</label><textarea
							id="subtitle"
							rows="3"
							maxlength="220"
							value={slide.typography.subtitle ?? ''}
							oninput={(event) => typography('subtitle', event.currentTarget.value)}
						></textarea><label class="field-label" for="badge">Eyebrow / caption</label><input
							id="badge"
							value={slide.badge ?? ''}
							maxlength="60"
							oninput={(event) => patchSlide({ badge: event.currentTarget.value })}
						/>
						<div class="color-row">
							<label class="color-field"
								>Text color<span
									><input
										type="color"
										aria-label="Text color"
										value={slide.typography.fontColor}
										oninput={(event) => typography('fontColor', event.currentTarget.value)}
									/><code>{slide.typography.fontColor}</code></span
								></label
							><label class="color-field"
								>Set accent<span
									><input
										type="color"
										aria-label="Campaign accent"
										value={project.accent}
										oninput={(event) => commit({ ...project, accent: event.currentTarget.value })}
									/><code>{project.accent}</code></span
								></label
							>
						</div>
						<label class="field-label" for="text-size"
							>Type size<span>{Math.round((slide.fontScale ?? 1) * 100)}%</span></label
						><input
							id="text-size"
							type="range"
							min="0.7"
							max="1.3"
							step="0.05"
							value={slide.fontScale ?? 1}
							oninput={(event) => patchSlide({ fontScale: Number(event.currentTarget.value) })}
						/>
					</section>
				{/if}
				<section class="control-section">
					<div class="field-label">
						Screenshot<button class="text-link" onclick={() => replaceInput.click()}
							>{displayedImage ? 'Replace' : 'Upload'}<Icon name="arrow" size={12} /></button
						>
					</div>
					<button class="current-asset" onclick={() => replaceInput.click()}
						>{#if displayedImage}<img src={displayedImage.blobUrl} alt="Current raw screenshot" />
							<div>
								<strong>{isLinked ? 'Connected screenshot' : 'Original screenshot'}</strong><span
									>{displayedImage.naturalWidth} × {displayedImage.naturalHeight}</span
								><small>Click to replace image</small>
							</div>{:else}<Icon name="upload" size={24} /><span>Upload an app screenshot</span
							>{/if}</button
					>
				</section>
			{:else if isLinen}
				<section class="control-section">
					<div class="field-label">
						Phone{#if isLinked}<span>SHARED ACROSS BOTH FRAMES</span>{/if}
					</div>
					<p class="field-help">
						{isLinked
							? 'One phone crosses the seam. Center X counts across the 2640-pixel two-frame world; 1320 is the seam.'
							: 'Positions are 1320 × 2868 reference pixels and scale with the export size.'}
					</p>
					<label class="field-label" for="phone-hardware">Frame preset</label><select
						id="phone-hardware"
						value={linenPhone.hardware ?? 'simple'}
						onchange={(event) => linenHardware(event.currentTarget.value)}
						><option value="simple">Simple frame</option><option value="iphone-17-pro-max"
							>iPhone 17 Pro Max</option
						></select
					>
					{#if linenPhone.hardware}
						<label class="field-label" for="phone-island">Dynamic Island</label><select
							id="phone-island"
							value={linenPhone.dynamicIsland ?? 'source'}
							onchange={(event) =>
								patchLinenPhone({
									dynamicIsland: event.currentTarget.value as LinenPhone['dynamicIsland']
								})}
							><option value="source">Already in the screenshot</option><option value="draw"
								>Add hardware cutout</option
							></select
						>
						{@render toggleRow(
							'phone-buttons-label',
							'Side buttons',
							linenPhone.hardwareButtons === true,
							() => patchLinenPhone({ hardwareButtons: !linenPhone.hardwareButtons })
						)}
						<p class="field-help">
							Silver rim, black bezel and 150-pixel display corners calibrated to the iPhone 17 Pro
							Max simulator. The cutout is only added over a light island area; a screenshot that
							already shows its island is never doubled.
						</p>
					{/if}
					<div class="num-grid">
						{@render numberField(
							'phone-top',
							'Top',
							linenPhone.top,
							LINEN_PHONE_BOUNDS.top,
							1,
							(v) => linenPhoneNumber('top', v)
						)}
						{@render numberField(
							'phone-bottom',
							'Bottom',
							linenPhone.bottom,
							LINEN_PHONE_BOUNDS.bottom,
							1,
							(v) => linenPhoneNumber('bottom', v)
						)}
						{@render numberField(
							'phone-width',
							'Max width',
							linenPhone.maxWidth,
							LINEN_PHONE_BOUNDS.maxWidth,
							1,
							(v) => linenPhoneNumber('maxWidth', v)
						)}
						{@render numberField(
							'phone-center',
							'Center X',
							linenPhone.centerX,
							LINEN_PHONE_BOUNDS.centerX,
							1,
							(v) => linenPhoneNumber('centerX', v)
						)}
						{@render numberField(
							'phone-shell',
							'Shell',
							linenPhone.shell,
							LINEN_PHONE_BOUNDS.shell,
							1,
							(v) => linenPhoneNumber('shell', v)
						)}
						{#if !linenPhone.hardware}
							{@render numberField(
								'phone-radius',
								'Corner radius',
								linenPhone.radius,
								LINEN_PHONE_BOUNDS.radius,
								1,
								(v) => linenPhoneNumber('radius', v)
							)}
						{/if}
					</div>
					<label class="field-label" for="phone-rotation"
						>Rotation<span>{linenPhone.rotation}°</span></label
					><input
						id="phone-rotation"
						type="range"
						min="-8"
						max="8"
						step="0.1"
						value={linenPhone.rotation}
						oninput={(event) => linenPhoneNumber('rotation', Number(event.currentTarget.value))}
					/>
					{@render toggleRow('frameless-label', 'Frameless screen', linenPhone.frameless, () =>
						patchLinenPhone({ frameless: !linenPhone.frameless })
					)}
					{@render toggleRow('phone-shadow-label', 'Soft shadow', linenPhone.shadow, () =>
						patchLinenPhone({ shadow: !linenPhone.shadow })
					)}
					<label class="field-label" for="phone-mode">Fit</label><select
						id="phone-mode"
						value={linenPhone.mode}
						onchange={(event) =>
							patchLinenPhone({ mode: event.currentTarget.value as LinenPhone['mode'] })}
						><option value="full">Whole screenshot between top and bottom</option><option
							value="bottom-crop">Max width, cropped at the bottom edge</option
						></select
					>
					{#if linenPhone.mode === 'bottom-crop'}
						<label class="field-label" for="crop-reason">Crop reason</label><input
							id="crop-reason"
							maxlength="200"
							value={linenPhone.cropReason ?? ''}
							onchange={(event) => patchLinenPhone({ cropReason: event.currentTarget.value })}
						/>
						<p class="field-help">An intentional bottom crop is saved with its reason.</p>
					{/if}
				</section>
				<section class="control-section">
					<details class="advanced">
						<summary>Type layout<span>REFERENCE PX</span></summary>
						<div class="num-grid">
							{#each LINEN_LAYOUT_FIELDS as field (field.key)}
								{@render numberField(
									`layout-${field.key}`,
									field.label,
									linen.layout[field.key],
									LINEN_LAYOUT_BOUNDS[field.key],
									field.step,
									(v) => linenLayout(field.key, v)
								)}
							{/each}
						</div>
					</details>
				</section>
			{:else}
				<section class="control-section">
					<label class="field-label" for="layout">Text placement</label><select
						id="layout"
						value={slide.layout}
						onchange={(event) =>
							patchSlide({ layout: event.currentTarget.value as Slide['layout'] })}
						><option value="text-above">Above the device</option><option value="text-below"
							>Below the device</option
						><option value="centered">Centered statement</option></select
					><label class="field-label" for="frame-style">Device frame</label><select
						id="frame-style"
						value={slide.frame}
						onchange={(event) => patchSlide({ frame: event.currentTarget.value as Slide['frame'] })}
						><option value="bezel">Graphite / realistic</option><option value="clay"
							>Porcelain / clay</option
						><option value="wireframe">Fine outline</option><option value="none"
							>Screenshot only</option
						></select
					><label class="field-label" for="device-scale"
						>Device scale<span>{Math.round((slide.scale ?? 1) * 100)}%</span></label
					><input
						disabled={isLinked}
						id="device-scale"
						type="range"
						min="0.6"
						max="1.4"
						step="0.05"
						value={slide.scale ?? 1}
						oninput={(event) => patchSlide({ scale: Number(event.currentTarget.value) })}
					/><label class="field-label" for="rotation">Rotation<span>{slide.tilt ?? 0}°</span></label
					><input
						disabled={isLinked}
						id="rotation"
						type="range"
						min="-30"
						max="30"
						step="1"
						value={slide.tilt ?? 0}
						oninput={(event) => patchSlide({ tilt: Number(event.currentTarget.value) })}
					/>{#if isLinked}<p class="field-help">
							Use the connected-device controls below for this pair.
						</p>{/if}<label class="field-label" for="background-kind">Background fill</label><select
						id="background-kind"
						value={slide.background.kind}
						onchange={(event) =>
							patchSlide({
								background: {
									...slide.background,
									kind: event.currentTarget.value as Slide['background']['kind'],
									colors:
										slide.background.colors.length > 1
											? slide.background.colors
											: [slide.background.colors[0], direction.accent]
								}
							})}
						><option value="solid">Solid color</option><option value="linear"
							>Linear gradient</option
						><option value="radial">Radial glow</option></select
					>
					<div class="color-row">
						<label class="color-field"
							>Background<span
								><input
									type="color"
									aria-label="Background color"
									value={slide.background.colors[0]}
									oninput={(event) =>
										patchSlide({
											background: {
												...slide.background,
												colors: [
													event.currentTarget.value,
													slide.background.colors[1] ?? direction.accent
												]
											}
										})}
								/><code>{slide.background.colors[0]}</code></span
							></label
						>{#if slide.background.kind !== 'solid'}<label class="color-field"
								>Gradient end<span
									><input
										type="color"
										aria-label="Gradient end color"
										value={slide.background.colors[1] ?? direction.accent}
										oninput={(event) =>
											patchSlide({
												background: {
													...slide.background,
													colors: [slide.background.colors[0], event.currentTarget.value]
												}
											})}
									/><code>{slide.background.colors[1] ?? direction.accent}</code></span
								></label
							>{/if}
					</div>
					<label class="field-label" for="shadow">Shadow</label><select
						id="shadow"
						value={slide.effects.shadow}
						onchange={(event) =>
							patchSlide({
								effects: {
									...slide.effects,
									shadow: event.currentTarget.value as Slide['effects']['shadow']
								}
							})}
						><option value="dramatic">Studio depth</option><option value="soft">Soft shadow</option
						><option value="none">No shadow</option></select
					><label class="field-label" for="glow"
						>Device glow<span>{Math.round(slide.effects.glow * 100)}%</span></label
					><input
						id="glow"
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={slide.effects.glow}
						oninput={(event) =>
							patchSlide({
								effects: { ...slide.effects, glow: Number(event.currentTarget.value) }
							})}
					/>
				</section>
			{/if}
			<section class="connection-card" class:linked={isLinked}>
				<div class="connection-heading">
					<span><Icon name="link" size={17} />Across the seam</span><button
						class="switch"
						class:on={isLinked}
						onclick={toggleLink}
						role="switch"
						aria-checked={isLinked}
						aria-label="Connect adjacent screenshots"
						disabled={!isLinked && (selected === project.slides.length - 1 || !slide.primaryImage)}
						><span></span></button
					>
				</div>
				<p>
					{isLinked
						? 'One device. Two frames. A continuous composition.'
						: 'Let your device flow into the next screenshot.'}
				</p>
				{#if isLinked && project.panorama && isLinen}
					<p class="field-help">
						The shared phone crosses the seam at 1320 of the two-frame world. Phone edits in the
						Composition tab apply to both frames.
					</p>
					<div class="pair-controls">
						<label
							>Center X<input
								type="number"
								aria-label="Shared phone center"
								min={LINEN_PHONE_BOUNDS.centerX[0]}
								max={LINEN_PHONE_BOUNDS.centerX[1]}
								value={linenPhone.centerX}
								onchange={(event) => linenPhoneNumber('centerX', Number(event.currentTarget.value))}
							/></label
						><label
							>Rotation<input
								type="number"
								aria-label="Shared phone rotation"
								min="-8"
								max="8"
								step="0.1"
								value={linenPhone.rotation}
								onchange={(event) =>
									linenPhoneNumber('rotation', Number(event.currentTarget.value))}
							/></label
						>
					</div>
				{:else if isLinked && project.panorama}<label class="field-label" for="seam-position"
						>Horizontal position<span>{project.panorama.offset}px</span></label
					><input
						id="seam-position"
						type="range"
						min="-400"
						max="400"
						step="10"
						value={project.panorama.offset}
						oninput={(event) => panorama('offset', Number(event.currentTarget.value))}
					/>
					<div class="pair-controls">
						<label
							>Scale<input
								type="number"
								aria-label="Connected device scale"
								min="0.6"
								max="1.4"
								step="0.05"
								value={project.panorama.scale}
								onchange={(event) =>
									panorama(
										'scale',
										Math.max(0.6, Math.min(1.4, Number(event.currentTarget.value) || 1))
									)}
							/></label
						><label
							>Rotation<input
								type="number"
								aria-label="Connected device rotation"
								min="-30"
								max="30"
								value={project.panorama.tilt}
								onchange={(event) =>
									panorama(
										'tilt',
										Math.max(-30, Math.min(30, Number(event.currentTarget.value) || 0))
									)}
							/></label
						>
					</div>{/if}
			</section>
			<section class="control-section output-control">
				<label class="field-label" for="output-size">Export size <span>ENTIRE SET</span></label
				><select
					id="output-size"
					value={project.device}
					onchange={(event) => chooseDevice(event.currentTarget.value as DeviceId)}
					>{#each Object.values(DEVICES) as size (size.id)}<option value={size.id}
							>{size.label} · {size.width} × {size.height}</option
						>{/each}</select
				>
				<p class="field-help">
					<Icon name="check" size={12} />Exact dimensions. Full-resolution PNGs.
				</p>
			</section>
		</div>
		<div class="inspector-footer">
			<div>
				<button
					class="icon-button"
					aria-label="Move screenshot left"
					onclick={() => moveSlide(-1)}
					disabled={selected === 0}><Icon name="back" size={16} /></button
				><span>{selected + 1} of {project.slides.length}</span><button
					class="icon-button"
					aria-label="Move screenshot right"
					onclick={() => moveSlide(1)}
					disabled={selected === project.slides.length - 1}
					><Icon name="chevron" size={16} /></button
				>
			</div>
			<button
				class="icon-button danger"
				aria-label="Delete screenshot"
				onclick={remove}
				disabled={project.slides.length === 1}><Icon name="trash" size={16} /></button
			>
		</div>
	</aside>
</div>
{#if error}<div class="error-notice" role="alert">
		<Icon name="info" /><span>{error}</span><button
			class="icon-button"
			onclick={() => (error = '')}
			aria-label="Dismiss error"><Icon name="close" size={16} /></button
		>
	</div>{/if}
{#if toast}<div class="toast" role="status">
		<span><Icon name="check" size={14} /></span>{toast}
	</div>{/if}
<dialog
	bind:this={exportDialog}
	class="export-dialog"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div class="dialog-header">
		<span class="export-icon"><Icon name="download" size={25} /></span><button
			class="icon-button"
			onclick={() => exportDialog.close()}
			disabled={busy}
			aria-label="Close export dialog"><Icon name="close" /></button
		>
	</div>
	<div class="eyebrow">READY FOR YOUR CLOSE-UP</div>
	<h2>From studio<br />to the App Store.</h2>
	<p class="dialog-subtitle">Your whole story, at exactly the right size.</p>
	<div class="export-summary">
		<strong>{project.name}<span>{project.slides.length} screenshots</span></strong><span
			>{device.label}<b>{device.width} × {device.height} px</b></span
		>
	</div>
	{#if !allHaveImages}<p class="export-warning">
			Some frames have no app screenshot. Add an image to every frame before exporting.
		</p>{/if}{#if error}<p class="export-warning" role="alert">{error}</p>{/if}<button
		class="button primary export-main"
		disabled={busy || !allHaveImages}
		onclick={() => runExport('all')}
		><Icon name="download" />{busy
			? `Rendering your set… ${progress}%`
			: 'Download complete set'}<span>ZIP</span></button
	>
	<div class="export-options">
		<button disabled={busy || !displayedImage} onclick={() => runExport('one')}
			><Icon name="phone" size={16} />Selected PNG</button
		><button disabled={busy || !allHaveImages} onclick={() => runExport('sheet')}
			><Icon name="grid" size={16} />Contact sheet</button
		>
	</div>
	{#if busy}<progress value={progress} max="100"></progress>{/if}
	<p class="export-note">
		<Icon name="check" size={14} />Rendered locally. No account, no watermarks.
	</p>
</dialog>

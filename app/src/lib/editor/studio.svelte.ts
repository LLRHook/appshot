import { createContext } from 'svelte';
import { DEVICES, type DeviceId } from '$lib/model/devices';
import { imageRefForAsset } from '$lib/model/assets';
import { sourceCompatibility } from '$lib/model/capture';
import {
	applyCheckPatch,
	applyCheckStyle,
	CHECK_PALETTES,
	defaultCheckSettings,
	resolveCheckSettings,
	type CheckSettingsPatch
} from '$lib/model/check';
import type { CaptureProvenance, ImageLayer, Issue, ProjectV2 } from '$lib/model/contracts';
import { RETIRED_SAMPLE_IMAGE, SAMPLE_MARK_URL } from '$lib/model/image';
import { MAX_ART_SCALE, MAX_SLIDE_LAYERS } from '$lib/model/limits';
import {
	addAssets,
	addTarget,
	applyProjectedEdit,
	bindPanoramaSource,
	disconnectPair,
	duplicateSlide,
	removeTarget,
	removeAsset as removeProjectAsset,
	patchPanoramaVariant,
	setSourceOverride,
	setAppName,
	setWorkingTitle
} from '$lib/model/edits';
import { createBlankProjectV2, createDemoProjectV2 } from '$lib/model/migrate';
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
import { download } from '$lib/model/project';
import { createSlide, getStyle, type StyleId } from '$lib/model/studio';
import {
	activeTargets,
	normalizeProjectV2,
	projectForTarget,
	sourceIssues
} from '$lib/model/targets';
import type { Composition, ImageRef, Slide } from '$lib/model/types';
import { createPreflight } from '$lib/render/preflight';
import { projectTextFromFile, safeFilename } from '$lib/render/export';
import {
	CampaignConflictError,
	CampaignValidationError,
	CampaignPersistence,
	CAMPAIGN_HISTORY_LIMIT,
	type ExternalChange,
	type RecoverableItem
} from './campaign-persistence';
import { type ProjectPersistence } from './persistence';
import { EditorStore, type ApplyOptions } from './store.svelte';
import { documentsEqual } from './equal';

export type LibraryTab = 'styles' | 'assets';
export type FilePicker = 'upload' | 'replace' | 'project';

/** The renderer paints a connected pair's phone with the LEFT frame's hardware palette. */
const HARDWARE_COLOR_KEYS: readonly LinenColorKey[] = ['shell', 'shellEdge', 'shadow'];
const MAX_FRAMES = 10;
const quickPreflight = createPreflight();
/** Inputs where ⌘Z stays the browser's own text undo. Every other control uses editor undo. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
	'button',
	'checkbox',
	'color',
	'file',
	'image',
	'radio',
	'range',
	'reset',
	'submit'
]);

const bounded = (value: number, [min, max]: readonly [number, number]) =>
	Math.max(min, Math.min(max, value));

export function isTextEntry(target: EventTarget | null): boolean {
	const element = target as HTMLElement | null;
	if (element?.tagName === 'TEXTAREA' || element?.isContentEditable) return true;
	return (
		element?.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.has((element as HTMLInputElement).type)
	);
}

/**
 * Everything the studio panels share: read state for the campaign being edited and the commands
 * that change it. Panels get it from context instead of a prop bag. Campaign state lives in
 * `store`; this class holds UI state and turns control events into immutable document edits.
 *
 * `composition` is the single-target document panels read and previews render. It is the seam
 * for multiple targets: once `store` holds a Project v2, it becomes
 * `projectForTarget(store.project, activeTarget)` and these commands write through to the project.
 */
export class StudioController {
	readonly store: EditorStore<ProjectV2>;
	readonly campaigns: CampaignPersistence | undefined;
	activeTarget = $state<DeviceId>('iphone-6.9');
	#conflict = $state.raw<ExternalChange | null>(null);
	readonly conflict = $derived.by(() =>
		this.#conflict?.campaignId === this.campaigns?.campaignIdOf(this.store.project)
			? this.#conflict
			: null
	);
	recoverable = $state.raw<RecoverableItem[]>([]);
	recoveryOpen = $state(false);
	inspectorTab = $state<'content' | 'device'>('content');
	checkingReadiness = $state(false);
	#readiness = $state.raw<{ project: ProjectV2; issues: Issue[] } | undefined>();
	#readinessRevision = 0;
	readonly #projections = new WeakMap<ProjectV2, Map<DeviceId, Composition>>();

	activeTab = $state<LibraryTab>('styles');
	toast = $state('');
	error = $state('');
	processing = $state(false);
	uploadInput = $state.raw<HTMLInputElement>();
	replaceInput = $state.raw<HTMLInputElement>();
	projectInput = $state.raw<HTMLInputElement>();
	exportDialog = $state.raw<HTMLDialogElement>();
	exportRevision = $state(0);
	#toastTimer: ReturnType<typeof setTimeout> | undefined;

	readonly targetId = $derived.by(() =>
		this.store.project.targets.includes(this.activeTarget)
			? this.activeTarget
			: this.store.project.targets[0]
	);
	readonly composition = $derived.by((): Composition => {
		const project = this.store.project;
		let targets = this.#projections.get(project);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- A projection cache is not UI state; derived computations cannot write reactive collections.
		if (!targets) this.#projections.set(project, (targets = new Map()));
		let composition = targets.get(this.targetId);
		if (!composition) {
			composition = projectForTarget(project, this.targetId);
			targets.set(this.targetId, composition);
		}
		return composition;
	});
	readonly targets = $derived.by(() => activeTargets(this.store.project));
	readonly issues = $derived.by(() =>
		this.#readiness?.project === this.store.project
			? this.#readiness.issues
			: sourceIssues(this.store.project)
	);
	readonly sourceCounts = $derived.by((): Partial<Record<DeviceId, number>> => {
		const project = this.store.project;
		return Object.fromEntries(
			project.targets.map((target) => [
				target,
				project.slides.filter((slide) => {
					const pair =
						project.continuityMode === 'paired' &&
						project.panorama &&
						(project.panorama.leftId === slide.id || project.panorama.rightId === slide.id);
					return !!(
						(pair && project.panorama?.variants?.[target]?.source) ||
						slide.variants?.[target]?.source
					);
				}).length
			])
		);
	});
	readonly selected = $derived.by((): number => this.store.selectedIndex);
	readonly slide = $derived(this.composition.slides[this.selected] ?? this.composition.slides[0]);
	readonly direction = $derived(getStyle(this.composition.style));
	readonly device = $derived(DEVICES[this.composition.device]);
	readonly isLinked = $derived(
		this.composition.continuityMode === 'paired' &&
			(this.composition.panorama?.leftId === this.slide.id ||
				this.composition.panorama?.rightId === this.slide.id)
	);
	readonly assets = $derived.by(() =>
		Object.values(this.store.project.assets)
			.filter((asset) => asset.url !== SAMPLE_MARK_URL)
			.map(imageRefForAsset)
	);
	readonly displayedImage = $derived(
		this.isLinked ? this.composition.panorama?.image : this.slide.primaryImage
	);
	readonly isLinen = $derived(this.composition.style === 'table-linen');
	readonly isCheck = $derived(this.composition.style === 'the-check');
	readonly check = $derived(resolveCheckSettings(this.composition, this.selected));
	readonly linen = $derived(resolveLinenSettings(this.composition, this.selected));
	readonly linenPhone = $derived(
		this.isLinked ? resolveSharedLinenPhone(this.composition) : this.linen.phone
	);
	readonly linenTheme = $derived(linenThemeOf(this.linen.colors));
	readonly hardwareIndex = $derived.by((): number => {
		const panorama = this.composition.panorama;
		if (!this.isLinked || !panorama) return this.selected;
		return Math.max(
			0,
			this.composition.slides.findIndex((s) => s.id === panorama.leftId)
		);
	});
	readonly hardwareColors = $derived(
		resolveLinenSettings(this.composition, this.hardwareIndex).colors
	);
	readonly allHaveImages = $derived(
		this.composition.slides.every(
			(s) =>
				s.primaryImage ||
				(this.composition.continuityMode === 'paired' &&
					this.composition.panorama?.image &&
					(s.id === this.composition.panorama.leftId || s.id === this.composition.panorama.rightId))
		)
	);
	readonly filename = $derived.by(() => safeFilename(this.store.project.name));

	constructor(persistence: ProjectPersistence<ProjectV2> = new CampaignPersistence()) {
		this.campaigns = persistence instanceof CampaignPersistence ? persistence : undefined;
		this.store = new EditorStore<ProjectV2>({
			initial: createDemoProjectV2(),
			persistence,
			normalize: normalizeProjectV2,
			historyLimit: CAMPAIGN_HISTORY_LIMIT,
			onSaveFailed: (error) => {
				if (error instanceof CampaignConflictError) {
					this.#conflict = {
						campaignId: error.campaignId,
						revision: error.storedRevision,
						title: this.store.project.name
					};
				} else if (error instanceof CampaignValidationError)
					this.notify(
						`This campaign could not be saved: ${error.message} Correct the value and try again.`
					);
				else
					this.notify(
						'Browser storage is full or unavailable. Save your project to keep your changes.'
					);
			}
		});
	}

	/** Restore the saved campaign. Returns the teardown for `onMount`. */
	start(): () => void {
		const unsubscribe = this.campaigns?.onExternalChange((change) => {
			if (change.campaignId === this.campaigns!.campaignIdOf(this.store.project))
				this.#conflict = change;
		});
		void this.store.restore().then((result) => {
			if (result.status === 'failed')
				this.notify(
					String(result.error).includes(RETIRED_SAMPLE_IMAGE)
						? `${RETIRED_SAMPLE_IMAGE} The saved campaign is kept in Recent campaigns.`
						: 'Your browser could not restore a saved project. You can still export and save a project file.'
				);
			const notes = this.campaigns?.takeRestoreNotes();
			if (notes?.length) this.notify(notes.join(' '));
			void this.refreshRecovery();
		});
		return () => {
			clearTimeout(this.#toastTimer);
			unsubscribe?.();
			void this.store.dispose().finally(() => this.campaigns?.close());
		};
	}

	notify(message: string) {
		this.toast = message;
		clearTimeout(this.#toastTimer);
		this.#toastTimer = setTimeout(() => (this.toast = ''), 5000);
	}

	pick(kind: FilePicker) {
		const inputs = {
			upload: this.uploadInput,
			replace: this.replaceInput,
			project: this.projectInput
		};
		inputs[kind]?.click();
	}

	openExport() {
		this.error = '';
		this.exportRevision++;
		this.exportDialog?.showModal();
	}

	handleKeydown(event: KeyboardEvent) {
		if (this.processing || !this.store.ready || this.exportDialog?.open) return;
		if (isTextEntry(event.target)) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) this.store.redo();
			else this.store.undo();
		}
	}

	#commit(next: Composition, options?: ApplyOptions): boolean {
		try {
			return this.#commitProject(
				applyProjectedEdit(this.store.project, this.targetId, next),
				options
			);
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not update the campaign.';
			return false;
		}
	}

	#commitProject(next: ProjectV2, options?: ApplyOptions): boolean {
		const result = this.store.apply(next, options);
		if (result.status === 'rejected') this.error = result.reason;
		return result.status !== 'rejected';
	}

	#replace(next: ProjectV2): boolean {
		const result = this.store.replaceProject(next);
		if (result.status === 'rejected') this.error = result.reason;
		else this.#conflict = null;
		return result.status !== 'rejected';
	}

	/**
	 * `coalesce` names the control behind a live edit (typing, a slider drag, a color drag): its
	 * events join one undo step until the control's `change` event ends it.
	 */
	patchSlide(patch: Partial<Slide>, coalesce?: string) {
		const { composition, selected, isLinked, slide } = this;
		this.#commit(
			{
				...composition,
				slides: composition.slides.map((s, i) =>
					i === selected ||
					((patch.frame || patch.effects || patch.background || patch.layout) &&
						isLinked &&
						(s.id === composition.panorama?.leftId || s.id === composition.panorama?.rightId))
						? { ...s, ...patch }
						: s
				)
			},
			{ coalesce: coalesce && `slide:${slide.id}:${coalesce}` }
		);
	}

	typography(key: 'headline' | 'subtitle' | 'fontColor', value: string) {
		this.patchSlide({ typography: { ...this.slide.typography, [key]: value } }, key);
	}

	setName(name: string) {
		this.#commitProject(setWorkingTitle(this.store.project, name || 'Untitled campaign'));
	}

	setAppName(name: string) {
		this.#commitProject(setAppName(this.store.project, name));
	}

	patchCheck(patch: CheckSettingsPatch, coalesce?: string) {
		const check = applyCheckPatch(this.check, patch);
		if (check) this.patchSlide({ check }, coalesce);
	}

	setAccent(accent: string) {
		this.#commit({ ...this.composition, accent }, { coalesce: 'accent' });
	}

	/** Table Linen text and colors stay per frame; only the phone is shared across a pair. */
	patchLinen(patch: Partial<LinenSettings>, coalesce?: string) {
		this.patchSlide({ linen: { ...this.linen, ...patch } }, coalesce);
	}

	#patchLinenAt(index: number, patch: Partial<LinenSettings>, coalesce: string) {
		const current = resolveLinenSettings(this.composition, index);
		this.#commit(
			{
				...this.composition,
				slides: this.composition.slides.map((s, i) =>
					i === index ? { ...s, linen: { ...current, ...patch } } : s
				)
			},
			{ coalesce: `slide:${this.composition.slides[index].id}:${coalesce}` }
		);
	}

	linenColorValue(key: LinenColorKey) {
		return HARDWARE_COLOR_KEYS.includes(key) ? this.hardwareColors[key] : this.linen.colors[key];
	}

	/** Shell, shell edge and shadow edit the pair's shared (left) palette from either half. */
	linenColor(key: LinenColorKey, value: string) {
		if (!/^#[0-9a-f]{6}$/i.test(value)) return;
		if (HARDWARE_COLOR_KEYS.includes(key)) {
			this.#patchLinenAt(
				this.hardwareIndex,
				{ colors: { ...this.hardwareColors, [key]: value } },
				`linen.colors.${key}`
			);
			return;
		}
		const colors = { ...this.linen.colors };
		colors[key] = value;
		this.patchLinen({ colors }, `linen.colors.${key}`);
	}

	linenShadowOpacity(value: number) {
		if (!Number.isFinite(value)) return;
		this.#patchLinenAt(
			this.hardwareIndex,
			{ colors: { ...this.hardwareColors, shadowOpacity: bounded(value, [0, 1]) } },
			'linen.colors.shadowOpacity'
		);
	}

	applyLinenTheme(theme: LinenTheme) {
		this.patchLinen({ colors: { ...LINEN_PALETTES[theme] } });
	}

	linenLayout(key: keyof LinenLayout, value: number) {
		if (!Number.isFinite(value)) return;
		const layout = { ...this.linen.layout };
		layout[key] = bounded(value, LINEN_LAYOUT_BOUNDS[key]);
		this.patchLinen({ layout });
	}

	/** On a connected pair every phone edit updates the shared panorama phone. */
	patchLinenPhone(patch: Partial<LinenPhone>, coalesce?: string) {
		// An explicit undefined removes an optional key (hardware fields) instead of storing it.
		const merged: Record<string, unknown> = { ...this.linenPhone, ...patch };
		for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
		const next = merged as unknown as LinenPhone;
		if (next.top >= next.bottom) {
			this.error = 'The phone top must stay above the phone bottom.';
			return;
		}
		if (next.mode === 'bottom-crop' && !next.cropReason?.trim())
			next.cropReason = 'Intentional bottom crop';
		const panorama = this.composition.panorama;
		if (this.isLinked && panorama)
			this.#commit(
				{ ...this.composition, panorama: { ...panorama, linenPhone: next } },
				{ coalesce: coalesce && `panorama:${coalesce}` }
			);
		else this.patchLinen({ phone: next }, coalesce);
	}

	/** Frame preset: the V1 generic shell, or the calibrated iPhone 17 Pro Max illustration. */
	linenHardware(value: string) {
		if (value === 'iphone-17-pro-max')
			this.patchLinenPhone({
				hardware: 'iphone-17-pro-max',
				dynamicIsland: this.linenPhone.dynamicIsland ?? 'source',
				hardwareButtons: this.linenPhone.hardwareButtons ?? true
			});
		else
			this.patchLinenPhone({
				hardware: undefined,
				dynamicIsland: undefined,
				hardwareButtons: undefined
			});
	}

	linenPhoneNumber(key: keyof typeof LINEN_PHONE_BOUNDS, value: number) {
		if (!Number.isFinite(value)) return;
		const next = { ...this.linenPhone };
		next[key] = bounded(value, LINEN_PHONE_BOUNDS[key]);
		this.patchLinenPhone(next, `linen.phone.${key}`);
	}

	#freshSlide(index: number, image?: ImageRef): Slide {
		const next = {
			...createSlide(index, image),
			device: this.composition.device,
			background: { kind: 'solid' as const, colors: [this.direction.background] },
			typography: { ...createSlide(0).typography, fontColor: this.direction.foreground }
		};
		if (this.isCheck) {
			const check = defaultCheckSettings(index, index + 1);
			const palette = CHECK_PALETTES[check.canvas];
			return {
				...next,
				check,
				frame: 'none',
				effects: { shadow: 'soft', glow: 0 },
				background: { kind: 'solid', colors: [palette.canvas] },
				typography: { ...next.typography, fontColor: palette.headline, fontWeight: 400 }
			};
		}
		return this.isLinen ? { ...next, linen: defaultLinenSettings('cream') } : next;
	}

	chooseStyle(id: StyleId) {
		const project = this.composition;
		const style = getStyle(id);
		if (id === 'the-check') {
			// A style applies to the set. Reset the shared placement too, so outputs added later
			// cannot inherit a previous style's tilt while the current output happens to be straight.
			const pair = this.store.project.panorama;
			const connectedLeftId =
				this.store.project.continuityMode === 'paired' ? pair?.leftId : undefined;
			const leftIndex = this.store.project.slides.findIndex(
				(slide) => slide.id === connectedLeftId
			);
			const placement = { offset: 0, scale: 1, tilt: 0 };
			let next: ProjectV2 = {
				...this.store.project,
				...(pair
					? {
							panorama: {
								...pair,
								...placement,
								...(pair.variants
									? {
											variants: Object.fromEntries(
												Object.entries(pair.variants).map(([target, variant]) => [
													target,
													{ ...variant, ...placement }
												])
											)
										}
									: {})
							}
						}
					: {}),
				slides: this.store.project.slides.map((slide) => ({ ...slide, tilt: 0, scale: 1 }))
			};
			if (connectedLeftId && leftIndex < 2) next = disconnectPair(next);
			for (const target of next.targets)
				next = applyProjectedEdit(
					next,
					target,
					applyCheckStyle(projectForTarget(next, target), connectedLeftId)
				);
			this.#commitProject(next);
			return;
		}
		if (id === 'table-linen') {
			// Keep every raw screenshot and all copy. Slides that never had Table Linen
			// settings get teal/cream defaults; earlier Table Linen edits are preserved.
			const leftIndex =
				project.continuityMode === 'paired' && project.panorama
					? project.slides.findIndex((s) => s.id === project.panorama!.leftId)
					: -1;
			const pair = leftIndex >= 0 ? [leftIndex, leftIndex + 1] : [];
			this.#commit({
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
		this.#commit({
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

	chooseDevice(id: DeviceId) {
		if (
			!this.store.project.targets.includes(id) &&
			!this.#commitProject(addTarget(this.store.project, id))
		)
			return;
		this.store.checkpoint();
		this.activeTarget = id;
	}

	removeOutput(id: DeviceId) {
		try {
			this.#commitProject(removeTarget(this.store.project, id));
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not remove this output.';
		}
	}

	focusIssue(issue: Issue) {
		if (issue.target && this.store.project.targets.includes(issue.target))
			this.activeTarget = issue.target;
		if (issue.slideIndex !== undefined) this.store.select(issue.slideIndex);
		this.error = issue.message;
		const controlId =
			issue.control ?? (issue.slideIndex !== undefined ? 'frame-source' : undefined);
		if (controlId && !['additional-output', 'output-size', 'frames'].includes(controlId))
			this.inspectorTab = [
				'headline',
				'subtitle',
				'badge',
				'font-color',
				'app-name',
				'frame-source'
			].includes(controlId)
				? 'content'
				: 'device';
		if (controlId && typeof document !== 'undefined') {
			requestAnimationFrame(() => {
				const control = document.getElementById(controlId);
				for (let parent = control?.parentElement; parent; parent = parent.parentElement)
					if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true;
				control?.scrollIntoView({ block: 'center', behavior: 'smooth' });
				control?.focus();
			});
		}
	}

	/** Cheap checklist for the live panel. Export runs the full font, layout and file checks. */
	async updateReadiness(project: ProjectV2) {
		if (this.#readiness?.project === project) return;
		const revision = ++this.#readinessRevision;
		this.checkingReadiness = true;
		try {
			const issues = await quickPreflight(project, { layout: false });
			if (revision === this.#readinessRevision && this.store.project === project)
				this.#readiness = { project, issues };
		} catch (error) {
			if (revision === this.#readinessRevision && this.store.project === project)
				this.#readiness = {
					project,
					issues: [
						...sourceIssues(project),
						{
							severity: 'block',
							code: 'readiness-unavailable',
							message:
								error instanceof Error
									? error.message
									: 'The campaign checklist could not be checked. Open export to try again.'
						}
					]
				};
		} finally {
			if (revision === this.#readinessRevision) this.checkingReadiness = false;
		}
	}

	moveSlide(delta: number) {
		const target = this.selected + delta;
		if (target < 0 || target >= this.composition.slides.length) return;
		const slides = [...this.composition.slides];
		[slides[this.selected], slides[target]] = [slides[target], slides[this.selected]];
		this.#commit({ ...this.composition, slides }, { select: target });
	}

	duplicate() {
		if (this.composition.slides.length >= MAX_FRAMES) return;
		const id = crypto.randomUUID();
		const next = duplicateSlide(this.store.project, this.slide.id, id);
		this.#commitProject(next, { select: next.slides.findIndex((slide) => slide.id === id) });
	}

	remove() {
		if (this.composition.slides.length === 1) return;
		this.#commit({
			...this.composition,
			slides: this.composition.slides.filter((_, i) => i !== this.selected)
		});
	}

	addSlide() {
		const { slides } = this.composition;
		if (slides.length >= MAX_FRAMES) return;
		this.#commit(
			{ ...this.composition, slides: [...slides, this.#freshSlide(slides.length)] },
			{ select: slides.length }
		);
		this.activeTab = 'assets';
	}

	newCampaign() {
		this.#replace(createBlankProjectV2(this.store.project.targets));
		this.activeTab = 'assets';
		void this.refreshRecovery();
	}

	toggleLink() {
		const { composition: project, slide, selected, isLinen, isCheck, linen } = this;
		if (this.isLinked) {
			this.#commitProject(disconnectPair(this.store.project));
			return;
		}
		const next = project.slides[selected + 1];
		const image = slide.primaryImage ?? next?.primaryImage;
		if (!next || !image) {
			this.notify('Choose a screenshot with an image and a frame to its right.');
			return;
		}
		this.#commit({
			...project,
			slides: project.slides.map((s) =>
				s.id === next.id
					? {
							...s,
							frame: slide.frame,
							layout: slide.layout,
							background: slide.background,
							effects: slide.effects,
							...(isCheck
								? {
										check: {
											...resolveCheckSettings(project, selected + 1),
											canvas: this.check.canvas
										}
									}
								: {})
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
				tilt: isLinen || isCheck ? 0 : -14,
				...(isLinen ? { linenPhone: { ...linen.phone, centerX: LINEN_REFERENCE.width } } : {})
			}
		});
	}

	setPanorama(key: 'offset' | 'scale' | 'tilt', value: number) {
		const panorama = this.composition.panorama;
		if (panorama)
			this.#commit(
				{ ...this.composition, panorama: { ...panorama, [key]: value } },
				{ coalesce: `panorama:${key}` }
			);
	}

	#withImage(image: ImageRef): Composition {
		const { composition: project, selected, isLinked } = this;
		return {
			...project,
			slides: project.slides.map((s, i) => (i === selected ? { ...s, primaryImage: image } : s)),
			panorama: isLinked && project.panorama ? { ...project.panorama, image } : project.panorama
		};
	}

	useAsset(image: ImageRef, draftReason?: string) {
		const compatibility = sourceCompatibility(image, this.device);
		if (compatibility.severity === 'block' && !draftReason?.trim()) {
			this.error = compatibility.message;
			return;
		}
		let next = applyProjectedEdit(this.store.project, this.targetId, this.#withImage(image));
		const pair = next.panorama;
		const inPair = Boolean(
			pair &&
			next.continuityMode === 'paired' &&
			(pair.leftId === this.slide.id || pair.rightId === this.slide.id)
		);
		if (inPair) next = bindPanoramaSource(next, this.targetId, image.id);
		if (draftReason?.trim()) {
			const reason = draftReason.trim().slice(0, 200);
			next = inPair
				? patchPanoramaVariant(next, this.targetId, {
						source: { asset: image.id, nonNative: { reason } }
					})
				: setSourceOverride(next, this.slide.id, this.targetId, reason);
		}
		this.#commitProject(next);
	}

	setCaptureProvenance(id: string, patch: Partial<CaptureProvenance>) {
		const asset = this.store.project.assets[id];
		if (!asset || this.processing) return;
		const provenance = { ...asset.provenance, ...patch };
		this.#commitProject({
			...this.store.project,
			assets: { ...this.store.project.assets, [id]: { ...asset, provenance } }
		});
	}

	removeAsset(id: string) {
		if (this.processing) return;
		if (this.#commitProject(removeProjectAsset(this.store.project, id)))
			this.notify('Screenshot removed from the library and all outputs. Undo restores it.');
	}

	async upload(files: FileList | null, replace = false) {
		if (!files?.length || this.processing) return;
		this.processing = true;
		this.error = '';
		try {
			if (!this.campaigns)
				throw new Error('Image storage is unavailable. Try opening the studio again.');
			const ordered = Array.from(files).sort((a, b) =>
				a.name.localeCompare(b.name, undefined, { numeric: true })
			);
			const batch = await this.campaigns.ingestFiles(ordered, { target: this.device });
			const added = addAssets(
				this.store.project,
				batch.accepted.map((item) => item.asset)
			);
			const messages = [
				...batch.rejected.map((item) => item.message),
				...batch.accepted.flatMap((item) =>
					item.capture.notes.map((note) => `${item.capture.name}: ${note}`)
				)
			];
			const images = batch.accepted.flatMap((item, index) => {
				if (item.capture.compatibility?.severity === 'block') {
					messages.push(
						`${item.capture.name} was kept in the library. ${item.capture.compatibility.message}`
					);
					return [];
				}
				return [imageRefForAsset(added.project.assets[added.ids[index]])];
			});
			let next = added.project;
			let used = 0;
			if (replace && images[0]) {
				next = applyProjectedEdit(next, this.targetId, this.#withImage(images[0]));
				used = 1;
			} else if (images.length) {
				const slides = [...this.composition.slides];
				const pair =
					this.composition.continuityMode === 'paired' ? this.composition.panorama : undefined;
				const empty = slides.flatMap((slide, index) =>
					!slide.primaryImage && slide.id !== pair?.leftId && slide.id !== pair?.rightId
						? [index]
						: []
				);
				if (images.length === 1 && empty.includes(this.selected))
					empty.unshift(...empty.splice(empty.indexOf(this.selected), 1));
				for (const image of images) {
					const index = empty.shift();
					if (index !== undefined) slides[index] = { ...slides[index], primaryImage: image };
					else if (slides.length < MAX_FRAMES) slides.push(this.#freshSlide(slides.length, image));
					else break;
					used++;
				}
				next = applyProjectedEdit(next, this.targetId, { ...this.composition, slides });
				if (used < images.length)
					messages.push(
						`${images.length - used} capture(s) stay in the library because this campaign has 10 frames.`
					);
			}
			const pair = next.panorama;
			if (
				replace &&
				images[0] &&
				pair &&
				next.continuityMode === 'paired' &&
				(pair.leftId === this.slide.id || pair.rightId === this.slide.id)
			)
				next = bindPanoramaSource(next, this.targetId, images[0].id);
			const committed = this.#commitProject(next);
			if (committed && batch.accepted.length)
				this.notify(
					`${used} capture${used === 1 ? '' : 's'} placed for ${this.device.label}. ${batch.accepted.length} added to the library.`
				);
			if (messages.length)
				this.error = committed ? messages.join(' ') : `${this.error} The upload was not added.`;
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not read this image.';
		} finally {
			this.processing = false;
		}
	}

	async uploadArtwork(files: FileList | null) {
		if (!files?.length || this.processing) return;
		if ((this.slide.layers?.length ?? 0) >= MAX_SLIDE_LAYERS) {
			this.error = `A frame can hold ${MAX_SLIDE_LAYERS} layers. Remove one before adding artwork.`;
			return;
		}
		this.processing = true;
		this.error = '';
		const target = this.targetId;
		const slideId = this.slide.id;
		try {
			if (!this.campaigns) throw new Error('Image storage is unavailable. Open the studio again.');
			const batch = await this.campaigns.ingestFiles(files);
			const added = addAssets(
				this.store.project,
				batch.accepted.map((item) => item.asset)
			);
			let next = added.project;
			if (next.targets.includes(target)) {
				const composition = projectForTarget(next, target);
				const index = composition.slides.findIndex((slide) => slide.id === slideId);
				if (index >= 0) {
					const { width, height } = DEVICES[target];
					const remaining = MAX_SLIDE_LAYERS - (composition.slides[index].layers?.length ?? 0);
					const layers = batch.accepted.slice(0, remaining).map((_, i): ImageLayer => {
						const image = imageRefForAsset(next.assets[added.ids[i]]);
						const scale = Math.min(
							MAX_ART_SCALE,
							(width * 0.55) / image.naturalWidth,
							(height * 0.22) / image.naturalHeight
						);
						return {
							id: `art-${crypto.randomUUID()}`,
							kind: 'art',
							image,
							crop: { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight },
							x: (width - image.naturalWidth * scale) / 2,
							y: height * 0.68,
							scale,
							shadow: 'none'
						};
					});
					next = applyProjectedEdit(next, target, {
						...composition,
						slides: composition.slides.map((slide, i) =>
							i === index ? { ...slide, layers: [...(slide.layers ?? []), ...layers] } : slide
						)
					});
				}
			}
			if (this.#commitProject(next) && batch.accepted.length)
				this.notify('Artwork added. Its original pixels are kept in your project.');
			if (batch.rejected.length) this.error = batch.rejected.map((item) => item.message).join(' ');
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not open this artwork.';
		} finally {
			this.processing = false;
		}
	}

	async openProject(files: FileList | null) {
		if (!files?.[0] || this.processing) return;
		this.processing = true;
		this.error = '';
		try {
			if (!this.campaigns)
				throw new Error('Project storage is unavailable. Try opening the studio again.');
			const file = files[0];
			if (this.#replace(await this.campaigns.importPortable(await projectTextFromFile(file))))
				this.notify('Project opened. Your previous campaign is kept in Recent campaigns.');
			void this.refreshRecovery();
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not open project.';
		} finally {
			this.processing = false;
		}
	}

	async saveFile() {
		try {
			if (!this.campaigns)
				throw new Error('Project storage is unavailable. Try opening the studio again.');
			const portable = await this.campaigns.exportPortable(this.store.project);
			download(portable, `${this.filename}.appshot.json`);
			this.notify('Project file saved, with your original images');
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not save the project.';
		}
	}

	/** The current campaign recolored for a style card, without touching the document. */
	stylePreview(id: StyleId): Composition {
		const theme = getStyle(id);
		if (id === 'the-check') return applyCheckStyle(this.composition);
		return {
			...this.composition,
			style: id,
			accent: theme.accent,
			continuityMode: 'none',
			panorama: undefined,
			slides: this.composition.slides.map((s) => ({
				...s,
				background: { kind: 'solid', colors: [theme.background] },
				typography: { ...s.typography, fontColor: theme.foreground }
			}))
		};
	}

	async refreshRecovery() {
		if (!this.campaigns) return;
		try {
			this.recoverable = await this.campaigns.listRecoverable();
		} catch {
			/* The save status already reports unavailable storage. */
		}
	}

	async openRecovery(id: string) {
		if (!this.campaigns || this.processing) return;
		this.processing = true;
		try {
			await this.store.flush();
			let preserved = false;
			const project = await this.campaigns.openRecoverable(id, async () => {
				const older = this.store.findDocument(
					(document) => this.campaigns!.campaignIdOf(document) === id
				);
				if (!older) return;
				const redo = this.store.findRedoDocument(
					(document) => this.campaigns!.campaignIdOf(document) === id
				);
				const copy = this.campaigns!.keepAsCopy(older);
				// Opening a document normally clears redo. Save its latest version separately so
				// undoing to the working copy later cannot overwrite those recovered redo edits.
				const redoCopy =
					redo && !documentsEqual(older, redo)
						? this.campaigns!.keepAsCopy(redo, 'redo-copy')
						: undefined;
				this.store.remapDocuments((document) =>
					this.campaigns!.campaignIdOf(document) === id
						? { ...document, campaignId: copy.campaignId }
						: document
				);
				await this.campaigns!.save(copy);
				if (redoCopy) await this.campaigns!.save(redoCopy);
				await this.store.flush();
				preserved = true;
			});
			if (this.#replace(project)) {
				this.recoveryOpen = false;
				this.notify(
					preserved
						? 'Saved campaign opened. Your earlier work is saved in Recent campaigns.'
						: 'Saved campaign opened.'
				);
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not open that campaign.';
		} finally {
			this.processing = false;
		}
	}

	async downloadRecovery(id: string) {
		if (!this.campaigns) return;
		try {
			const item = this.recoverable.find((item) => item.id === id);
			download(
				await this.campaigns.exportRecoverable(id),
				`${safeFilename(item?.title ?? 'recovered-project')}.appshot.json`
			);
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not download that saved data.';
		}
	}

	async discardRecovery(id: string) {
		if (
			!this.campaigns ||
			this.processing ||
			id === this.campaigns.campaignIdOf(this.store.project)
		)
			return;
		this.processing = true;
		try {
			await this.campaigns.discardRecoverable(id);
			await this.refreshRecovery();
			this.notify('Saved campaign deleted from this browser.');
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not delete that saved campaign.';
		} finally {
			this.processing = false;
		}
	}

	async keepConflictCopy() {
		if (!this.campaigns || this.processing || !this.conflict) return;
		this.processing = true;
		try {
			await this.store.flush();
			const previous = this.campaigns.campaignIdOf(this.store.project);
			const copy = this.campaigns.keepAsCopy(this.store.project);
			this.store.remapDocuments((document) =>
				this.campaigns!.campaignIdOf(document) === previous
					? { ...document, campaignId: copy.campaignId }
					: document
			);
			await this.store.flush();
			if (this.store.status === 'saved') {
				this.#conflict = null;
				this.notify(
					'Your edits are saved as a separate campaign. The other tab’s campaign is kept.'
				);
				await this.refreshRecovery();
			}
		} finally {
			this.processing = false;
		}
	}
}

export const [getStudio, setStudio] = createContext<StudioController>();

import { createContext } from 'svelte';
import { DEVICES, type DeviceId } from '$lib/model/devices';
import { MAX_PROJECT_BYTES } from '$lib/model/limits';
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
import { clearBrokenPanorama, download, parseProject, readImage } from '$lib/model/project';
import { createBlank, createDemo, createSlide, getStyle, type StyleId } from '$lib/model/studio';
import type { Composition, ImageRef, Slide } from '$lib/model/types';
import { portableComposition } from '$lib/render';
import { legacyPersistence, type ProjectPersistence } from './persistence';
import { EditorStore, type ApplyOptions } from './store.svelte';

export type LibraryTab = 'styles' | 'assets';
export type FilePicker = 'upload' | 'replace' | 'project';

/** The renderer paints a connected pair's phone with the LEFT frame's hardware palette. */
const HARDWARE_COLOR_KEYS: readonly LinenColorKey[] = ['shell', 'shellEdge', 'shadow'];
const MAX_FRAMES = 10;
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
	readonly store: EditorStore<Composition>;

	activeTab = $state<LibraryTab>('styles');
	toast = $state('');
	error = $state('');
	processing = $state(false);
	uploadInput = $state.raw<HTMLInputElement>();
	replaceInput = $state.raw<HTMLInputElement>();
	projectInput = $state.raw<HTMLInputElement>();
	exportDialog = $state.raw<HTMLDialogElement>();
	#toastTimer: ReturnType<typeof setTimeout> | undefined;

	readonly composition = $derived.by((): Composition => this.store.project);
	readonly selected = $derived.by((): number => this.store.selectedIndex);
	readonly slide = $derived(this.composition.slides[this.selected] ?? this.composition.slides[0]);
	readonly direction = $derived(getStyle(this.composition.style));
	readonly device = $derived(DEVICES[this.composition.device]);
	readonly isLinked = $derived(
		this.composition.continuityMode === 'paired' &&
			(this.composition.panorama?.leftId === this.slide.id ||
				this.composition.panorama?.rightId === this.slide.id)
	);
	readonly assets = $derived(
		this.composition.slides
			.flatMap((s) => (s.primaryImage ? [s.primaryImage] : []))
			.filter((image, index, images) => images.findIndex((i) => i.id === image.id) === index)
	);
	readonly displayedImage = $derived(
		this.isLinked ? this.composition.panorama?.image : this.slide.primaryImage
	);
	readonly isLinen = $derived(this.composition.style === 'table-linen');
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
	readonly filename = $derived(
		this.composition.name
			.trim()
			.replace(/[^a-z0-9-]+/gi, '-')
			.toLowerCase() || 'appshot'
	);

	constructor(persistence: ProjectPersistence<Composition> = legacyPersistence) {
		this.store = new EditorStore<Composition>({
			initial: createDemo(),
			persistence,
			normalize: clearBrokenPanorama,
			onSaveFailed: () =>
				this.notify(
					'Browser storage is full or unavailable. Save your project to keep your changes.'
				)
		});
	}

	/** Restore the saved campaign. Returns the teardown for `onMount`. */
	start(): () => void {
		void this.store.restore().then((result) => {
			if (result.status === 'failed')
				this.notify(
					'Your browser could not restore a saved project. You can still export and save a project file.'
				);
		});
		return () => {
			clearTimeout(this.#toastTimer);
			void this.store.dispose();
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
		const result = this.store.apply(next, options);
		if (result.status === 'rejected') this.error = result.reason;
		return result.status !== 'rejected';
	}

	#replace(next: Composition): boolean {
		const result = this.store.replaceProject(next);
		if (result.status === 'rejected') this.error = result.reason;
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
		this.#commit({ ...this.composition, name: name || 'Untitled campaign' });
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
			typography: { ...createSlide(0).typography, fontColor: this.direction.foreground }
		};
		return this.isLinen ? { ...next, linen: defaultLinenSettings('cream') } : next;
	}

	chooseStyle(id: StyleId) {
		const project = this.composition;
		const style = getStyle(id);
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
		this.#commit({
			...this.composition,
			device: id,
			slides: this.composition.slides.map((s) => ({ ...s, device: id }))
		});
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
		const slides = [...this.composition.slides];
		slides.splice(this.selected + 1, 0, {
			...JSON.parse(JSON.stringify(this.slide)),
			id: crypto.randomUUID(),
			label: `${this.slide.label ?? 'Screenshot'} copy`
		});
		this.#commit({ ...this.composition, slides }, { select: this.selected + 1 });
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
		this.#replace(createBlank());
		this.activeTab = 'assets';
	}

	toggleLink() {
		const { composition: project, slide, selected, isLinen, linen } = this;
		if (this.isLinked) {
			this.#commit({ ...project, panorama: undefined, continuityMode: 'none' });
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

	useAsset(image: ImageRef) {
		this.#commit(this.#withImage(image));
	}

	async upload(files: FileList | null, replace = false) {
		if (!files?.length || this.processing) return;
		this.processing = true;
		this.error = '';
		try {
			const images: ImageRef[] = [];
			for (const file of Array.from(files)) images.push(await readImage(file));
			if (replace) {
				this.#commit(this.#withImage(images[0]));
			} else {
				const { slide, selected } = this;
				const available = MAX_FRAMES - this.composition.slides.length;
				const empty = !slide.primaryImage;
				const count = Math.min(images.length, available + (empty ? 1 : 0));
				if (!count)
					throw new Error(
						'A campaign can have up to 10 screenshots. Replace an existing image or remove a frame.'
					);
				const slides = [...this.composition.slides];
				images.slice(0, count).forEach((image, i) => {
					if (empty && i === 0) slides[selected] = { ...slide, primaryImage: image };
					else slides.push(this.#freshSlide(slides.length, image));
				});
				if (this.#commit({ ...this.composition, slides }))
					this.notify(
						`${count} screenshot${count === 1 ? '' : 's'} added${count < images.length ? ' (10-frame limit)' : ''}`
					);
			}
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not read this image.';
		} finally {
			this.processing = false;
		}
	}

	async openProject(files: FileList | null) {
		if (!files?.[0] || this.processing) return;
		this.processing = true;
		try {
			if (files[0].size > MAX_PROJECT_BYTES) throw new Error('Choose a project file under 60 MB.');
			if (this.#replace(parseProject(await files[0].text()))) this.notify('Project opened');
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not open project.';
		} finally {
			this.processing = false;
		}
	}

	async saveFile() {
		try {
			const portable = await portableComposition(this.composition);
			download(
				new Blob([JSON.stringify(portable)], { type: 'application/json' }),
				`${this.filename}.appshot.json`
			);
			this.notify('Project file saved, with your original images');
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not save the project.';
		}
	}

	/** The current campaign recolored for a style card, without touching the document. */
	stylePreview(id: StyleId): Composition {
		const theme = getStyle(id);
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
}

export const [getStudio, setStudio] = createContext<StudioController>();

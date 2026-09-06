import { DEVICES } from '../model/devices';
import { getStyle, type StyleId } from '../model/studio';
import type { Composition, ImageRef, Slide } from '../model/types';
import { computePanoramaGeometry, type PhoneGeometry } from '../stitch/panorama';

type Context = CanvasRenderingContext2D;
interface RenderOptions {
	width?: number;
}
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const renderTokens = new WeakMap<HTMLCanvasElement, number>();
let fontsReady: Promise<unknown> | undefined;
const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function loadImage(ref?: ImageRef): Promise<HTMLImageElement | undefined> {
	if (!ref?.blobUrl) return Promise.resolve(undefined);
	const cached = imageCache.get(ref.blobUrl);
	if (cached) {
		imageCache.delete(ref.blobUrl);
		imageCache.set(ref.blobUrl, cached);
		return cached;
	}
	const pending = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.decoding = 'async';
		if (/^https?:/.test(ref.blobUrl)) image.crossOrigin = 'anonymous';
		image.onload = () => resolve(image);
		image.onerror = () => {
			imageCache.delete(ref.blobUrl);
			reject(new Error('A screenshot could not be loaded. Add it again before exporting.'));
		};
		image.src = ref.blobUrl;
	});
	imageCache.set(ref.blobUrl, pending);
	while (imageCache.size > 16) {
		const oldest = imageCache.keys().next().value;
		if (oldest === undefined) break;
		imageCache.delete(oldest);
	}
	return pending;
}

async function loadFonts() {
	fontsReady ??= Promise.all([
		document.fonts.load('400 100px "DM Sans"'),
		document.fonts.load('600 100px "DM Sans"'),
		document.fonts.load('700 100px "DM Sans"'),
		document.fonts.load('800 100px "DM Sans"'),
		document.fonts.load('400 100px "Instrument Serif"')
	]);
	await fontsReady;
}

function rounded(
	ctx: Context,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
}
function circle(ctx: Context, x: number, y: number, radius: number, fill: string) {
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fillStyle = fill;
	ctx.fill();
}
function withAlpha(color: string, alpha: number): string {
	if (/^#[0-9a-f]{6}$/i.test(color))
		return `${color}${Math.round(clamp(alpha, 0, 1) * 255)
			.toString(16)
			.padStart(2, '0')}`;
	return color;
}

function background(
	ctx: Context,
	composition: Composition,
	slide: Slide,
	width: number,
	height: number,
	paired: boolean,
	index: number
) {
	const direction = getStyle(composition.style);
	const panelWidth = paired ? width / 2 : width;
	const base = slide.background.colors[0] || direction.background;
	const accent = composition.accent || direction.accent;
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, width, height);
	if (slide.background.kind !== 'solid' && slide.background.colors.length > 1) {
		const angle = ((slide.background.angle ?? 45) * Math.PI) / 180;
		const gradient =
			slide.background.kind === 'radial'
				? ctx.createRadialGradient(
						width * 0.5,
						height * 0.45,
						0,
						width * 0.5,
						height * 0.5,
						height * 0.7
					)
				: ctx.createLinearGradient(0, 0, Math.cos(angle) * width, Math.sin(angle) * height);
		slide.background.colors.forEach((color, i, colors) =>
			gradient.addColorStop(i / (colors.length - 1), color)
		);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}
	ctx.save();
	switch (composition.style) {
		case 'cobalt': {
			const cx = paired ? panelWidth * 1.1 : panelWidth * (index % 2 ? 0.25 : 0.8);
			const cy = height * 0.79;
			circle(ctx, cx, cy, panelWidth * (paired ? 1.02 : 0.92), '#ffffff0c');
			ctx.strokeStyle = '#ffffff24';
			ctx.lineWidth = panelWidth * 0.002;
			ctx.beginPath();
			ctx.arc(cx, cy, panelWidth * (paired ? 1.12 : 1.04), 0, Math.PI * 2);
			ctx.stroke();
			ctx.translate(paired ? panelWidth * 1.02 : panelWidth * 0.51, height * 0.735);
			ctx.rotate(-0.21);
			ctx.fillStyle = accent;
			rounded(
				ctx,
				-width * 0.72,
				-panelWidth * 0.13,
				width * 1.44,
				panelWidth * 0.34,
				panelWidth * 0.17
			);
			ctx.fill();
			break;
		}
		case 'paper': {
			ctx.fillStyle = '#dfd5c4';
			ctx.fillRect(0, height * 0.425, width, height * 0.575);
			ctx.strokeStyle = '#29251f32';
			ctx.lineWidth = panelWidth * 0.001;
			ctx.beginPath();
			ctx.moveTo(0, height * 0.425);
			ctx.lineTo(width, height * 0.425);
			ctx.stroke();
			ctx.strokeStyle = withAlpha(accent, 0.45);
			ctx.lineWidth = panelWidth * 0.022;
			ctx.beginPath();
			ctx.ellipse(
				paired ? panelWidth : panelWidth * 0.5,
				height * 0.77,
				panelWidth * 0.83,
				height * 0.24,
				-0.25,
				0,
				Math.PI * 2
			);
			ctx.stroke();
			// Fine deterministic paper flecks, identical in both clipped viewports.
			ctx.fillStyle = '#564c3110';
			for (let i = 0; i < 1800; i++) {
				const x = (((i * 7919) % 65521) / 65521) * width;
				const y = (((i * 1543) % 32749) / 32749) * height;
				ctx.fillRect(x, y, 1.5, 1.5);
			}
			break;
		}
		case 'midnight': {
			const cx = paired ? panelWidth : panelWidth * 0.55;
			const halo = ctx.createRadialGradient(
				cx,
				height * 0.7,
				0,
				cx,
				height * 0.7,
				panelWidth * 1.22
			);
			halo.addColorStop(0, withAlpha(accent, 0.38));
			halo.addColorStop(0.45, withAlpha(accent, 0.12));
			halo.addColorStop(1, withAlpha(accent, 0));
			ctx.fillStyle = halo;
			ctx.fillRect(0, 0, width, height);
			ctx.strokeStyle = withAlpha(accent, 0.3);
			ctx.lineWidth = panelWidth * 0.0015;
			for (const multiplier of [0.75, 0.95, 1.2]) {
				ctx.beginPath();
				ctx.ellipse(
					cx,
					height * 0.77,
					panelWidth * multiplier,
					panelWidth * multiplier * 0.74,
					-0.27,
					0,
					Math.PI * 2
				);
				ctx.stroke();
			}
			break;
		}
		case 'sorbet': {
			ctx.translate(paired ? panelWidth : panelWidth * 0.5, height * 0.78);
			ctx.rotate(-0.25);
			ctx.fillStyle = '#bdaff1';
			rounded(
				ctx,
				-panelWidth * 0.95,
				-height * 0.21,
				panelWidth * 1.9,
				height * 0.65,
				panelWidth * 0.55
			);
			ctx.fill();
			circle(ctx, panelWidth * 0.7, -height * 0.13, panelWidth * 0.32, accent);
			circle(ctx, -panelWidth * 0.65, height * 0.15, panelWidth * 0.36, '#ed977e');
			ctx.strokeStyle = '#512c4524';
			ctx.lineWidth = panelWidth * 0.012;
			ctx.beginPath();
			ctx.arc(panelWidth * 0.56, -height * 0.18, panelWidth * 0.37, -0.8, 1.8);
			ctx.stroke();
			break;
		}
		case 'terminal': {
			ctx.strokeStyle = '#193e2b10';
			ctx.lineWidth = 1;
			const step = panelWidth / 15;
			for (let x = 0; x <= width; x += step) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
			}
			for (let y = 0; y <= height; y += step) {
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
				ctx.stroke();
			}
			ctx.fillStyle = accent;
			ctx.fillRect(0, height * 0.56, width, height * 0.16);
			ctx.strokeStyle = '#193e2b55';
			ctx.lineWidth = panelWidth * 0.0015;
			ctx.strokeRect(panelWidth * 0.05, height * 0.4, width - panelWidth * 0.1, height * 0.54);
			const cy = height * 0.64;
			for (const cx of [panelWidth * 0.095, width - panelWidth * 0.095]) {
				ctx.beginPath();
				ctx.moveTo(cx - 16, cy);
				ctx.lineTo(cx + 16, cy);
				ctx.moveTo(cx, cy - 16);
				ctx.lineTo(cx, cy + 16);
				ctx.stroke();
			}
			break;
		}
	}
	ctx.restore();
}

function family(style: StyleId): string {
	return style === 'paper'
		? '"Instrument Serif", Georgia, serif'
		: style === 'terminal'
			? '"SFMono-Regular", Menlo, monospace'
			: '"DM Sans", Arial, sans-serif';
}
function wrappedLines(ctx: Context, text: string, maxWidth: number): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) {
				lines.push(line);
				line = '';
			}
			if (ctx.measureText(word).width > maxWidth) {
				for (const char of word) {
					if (line && ctx.measureText(line + char).width > maxWidth) {
						lines.push(line);
						line = '';
					}
					line += char;
				}
			} else line = line ? `${line} ${word}` : word;
		}
		lines.push(line);
	}
	return lines;
}

interface FittedText {
	size: number;
	lines: string[];
	lineHeight: number;
}

/** Fit every word; reflow excessive manual breaks before resorting to tiny type. */
function fitText(
	ctx: Context,
	copy: string,
	maxWidth: number,
	maxHeight: number,
	desiredSize: number,
	readableSize: number,
	lineSpacing: number,
	font: (size: number) => string
): FittedText {
	let size = desiredSize;
	let content = copy;
	let reflowed = false;
	for (let attempt = 0; attempt < 200; attempt++) {
		ctx.font = font(size);
		const lines = wrappedLines(ctx, content, maxWidth);
		const lineHeight = size * lineSpacing;
		if (lines.length * lineHeight <= maxHeight) return { size, lines, lineHeight };
		if (size * 0.94 < readableSize && !reflowed) {
			// Preserve all entered words when many explicit newlines would otherwise
			// make the headline/caption taller than its allocated text region.
			content = copy.replace(/\s+/g, ' ').trim();
			reflowed = true;
			size = desiredSize;
		} else size *= 0.94;
	}
	throw new Error(
		'This text cannot fit the selected layout. Shorten it or remove extra line breaks.'
	);
}

function text(
	ctx: Context,
	composition: Composition,
	slide: Slide,
	index: number,
	width: number,
	height: number
) {
	const style = composition.style;
	const palette = getStyle(style);
	const color = slide.typography.fontColor || palette.foreground;
	const accent = composition.accent || palette.accent;
	const margin = width * 0.092;
	const contentWidth = width - margin * 2;
	const centered = slide.layout === 'centered' || style === 'sorbet';
	const below = slide.layout === 'text-below';
	ctx.save();
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';
	ctx.fillStyle = color;
	ctx.font = `600 ${width * 0.028}px "DM Sans", Arial, sans-serif`;
	const brand = composition.name || 'Your app';
	if (style === 'terminal') {
		ctx.font = `500 ${width * 0.022}px ${family(style)}`;
		ctx.fillText(`[ ${brand.toUpperCase()} ]`, margin, width * 0.102, contentWidth * 0.76);
	} else {
		circle(
			ctx,
			margin + width * 0.01,
			width * 0.116,
			width * 0.01,
			style === 'paper' ? accent : color
		);
		ctx.fillText(brand, margin + width * 0.035, width * 0.094, contentWidth * 0.7);
	}
	ctx.font = `500 ${width * 0.019}px "DM Sans", Arial, sans-serif`;
	ctx.textAlign = 'right';
	ctx.globalAlpha = 0.65;
	ctx.fillText(
		`${String(index + 1).padStart(2, '0')} / ${String(composition.slides.length).padStart(2, '0')}`,
		width - margin,
		width * 0.105
	);
	ctx.globalAlpha = 1;

	const badgeY = below ? height * 0.666 : height * 0.099;
	const badge = slide.badge?.trim();
	if (badge) {
		const label = style === 'terminal' ? `↗ ${badge.toUpperCase()}` : badge;
		ctx.font = `600 ${width * 0.022}px "DM Sans", Arial, sans-serif`;
		const badgeWidth = Math.min(contentWidth, ctx.measureText(label).width + width * 0.043);
		const badgeHeight = width * 0.047;
		const badgeX = centered ? (width - badgeWidth) / 2 : margin;
		ctx.fillStyle = style === 'cobalt' ? accent : style === 'sorbet' ? '#ffffff80' : 'transparent';
		if (style === 'cobalt' || style === 'sorbet') {
			rounded(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
			ctx.fill();
		} else {
			ctx.strokeStyle = withAlpha(color, 0.32);
			ctx.lineWidth = 1.5;
			rounded(
				ctx,
				badgeX,
				badgeY,
				badgeWidth,
				badgeHeight,
				style === 'terminal' ? 0 : badgeHeight / 2
			);
			ctx.stroke();
		}
		ctx.fillStyle = style === 'cobalt' ? '#1a2814' : color;
		ctx.textAlign = 'center';
		ctx.fillText(
			label,
			badgeX + badgeWidth / 2,
			badgeY + width * 0.0095,
			badgeWidth - width * 0.024
		);
	}

	const baselineSize =
		width *
		(style === 'paper'
			? 0.13
			: style === 'terminal'
				? 0.087
				: style === 'midnight'
					? 0.099
					: 0.103);

	const desiredTitleSize = baselineSize * clamp(slide.fontScale ?? 1, 0.6, 1.6);
	const weight = style === 'paper' ? 400 : slide.typography.fontWeight;
	const titleY = badgeY + (badge ? width * 0.075 : 0);
	const textX = centered ? width / 2 : margin;
	const subtitleWidth = contentWidth * (centered ? 0.9 : 0.96);
	const desiredSubtitleSize = width * (style === 'terminal' ? 0.028 : 0.033);
	const subtitleFont = (size: number) => `400 ${size}px "DM Sans", Arial, sans-serif`;
	const gap = width * 0.025;
	const geometry =
		computePanoramaGeometry(composition, index)?.phone ?? singlePhoneGeometry(slide, width, height);
	const phoneTop =
		geometry.centerY -
		(Math.abs(Math.cos(geometry.rotation)) * geometry.height) / 2 -
		(Math.abs(Math.sin(geometry.rotation)) * geometry.width) / 2;
	const textBottom = below
		? height - width * 0.16
		: Math.max(titleY + height * 0.14, Math.min(height * 0.39, phoneTop - width * 0.035));
	const availableHeight = textBottom - titleY;
	ctx.font = subtitleFont(desiredSubtitleSize);
	const subtitleReserve = slide.typography.subtitle
		? Math.min(
				wrappedLines(ctx, slide.typography.subtitle, subtitleWidth).length *
					desiredSubtitleSize *
					1.35,
				availableHeight * 0.38
			) + gap
		: 0;
	const title = fitText(
		ctx,
		slide.typography.headline,
		contentWidth,
		availableHeight - subtitleReserve,
		desiredTitleSize,
		width * 0.035,
		style === 'paper' ? 0.96 : 1.035,
		(size) => `${weight} ${size}px ${family(style)}`
	);
	ctx.fillStyle = color;
	ctx.textAlign = centered ? 'center' : 'left';
	title.lines.forEach((line, lineIndex) =>
		ctx.fillText(line, textX, titleY + lineIndex * title.lineHeight)
	);
	if (slide.typography.subtitle) {
		const subtitleY = titleY + title.lines.length * title.lineHeight + gap;
		const subtitle = fitText(
			ctx,
			slide.typography.subtitle,
			subtitleWidth,
			textBottom - subtitleY,
			desiredSubtitleSize,
			width * 0.02,
			1.35,
			subtitleFont
		);
		ctx.globalAlpha = style === 'cobalt' ? 0.85 : 0.72;
		subtitle.lines.forEach((line, lineIndex) =>
			ctx.fillText(line, textX, subtitleY + lineIndex * subtitle.lineHeight)
		);
		ctx.globalAlpha = 1;
	}

	ctx.textAlign = 'left';
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.6;
	ctx.font = `500 ${width * 0.018}px ${style === 'terminal' ? family(style) : '"DM Sans", Arial, sans-serif'}`;
	ctx.fillText(brand.toUpperCase(), margin, height - width * 0.095, contentWidth * 0.45);
	ctx.textAlign = 'right';
	ctx.fillText(`${String(index + 1).padStart(2, '0')}`, width - margin, height - width * 0.095);
	ctx.restore();
}

function phone(
	ctx: Context,
	composition: Composition,
	slide: Slide,
	geometry: PhoneGeometry,
	image?: HTMLImageElement
) {
	const { width, height } = geometry;
	const palette = getStyle(composition.style);
	ctx.save();
	ctx.translate(geometry.centerX, geometry.centerY);
	ctx.rotate(geometry.rotation);
	const pad = slide.frame === 'none' ? 0 : width * (slide.frame === 'clay' ? 0.035 : 0.022);
	const radius = slide.frame === 'none' ? 0 : width * 0.135;
	const x = -width / 2;
	const y = -height / 2;
	if (slide.effects.glow > 0) {
		const glow = ctx.createRadialGradient(0, 0, width * 0.3, 0, 0, height * 0.67);
		glow.addColorStop(
			0,
			withAlpha(composition.accent || palette.accent, clamp(slide.effects.glow, 0, 1) * 0.45)
		);
		glow.addColorStop(1, withAlpha(composition.accent || palette.accent, 0));
		ctx.fillStyle = glow;
		ctx.fillRect(-height, -height, height * 2, height * 2);
	}
	if (slide.effects.shadow !== 'none') {
		ctx.shadowColor = composition.style === 'midnight' ? '#00000088' : '#08122955';
		ctx.shadowBlur = width * (slide.effects.shadow === 'dramatic' ? 0.1 : 0.05);
		ctx.shadowOffsetX = width * 0.005;
		ctx.shadowOffsetY = width * (slide.effects.shadow === 'dramatic' ? 0.058 : 0.026);
	}
	const shell = ctx.createLinearGradient(x, y, -x, -y);
	if (slide.frame === 'clay') {
		shell.addColorStop(0, composition.style === 'sorbet' ? '#f9edff' : '#f8f6ef');
		shell.addColorStop(1, composition.style === 'sorbet' ? '#b5a5d1' : '#c8c6c0');
	} else {
		shell.addColorStop(0, '#bebfc2');
		shell.addColorStop(0.08, '#494b50');
		shell.addColorStop(0.45, '#b7b8bc');
		shell.addColorStop(0.7, '#35363b');
		shell.addColorStop(1, '#95979c');
	}
	ctx.fillStyle = slide.frame === 'none' || slide.frame === 'wireframe' ? '#ffffff' : shell;
	rounded(ctx, x, y, width, height, radius);
	ctx.fill();
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
	if (slide.frame === 'bezel') {
		ctx.fillStyle = '#111216';
		rounded(
			ctx,
			x + width * 0.004,
			y + width * 0.004,
			width * 0.992,
			height - width * 0.008,
			radius - width * 0.004
		);
		ctx.fill();
	}
	if (slide.frame !== 'none') {
		ctx.strokeStyle = slide.frame === 'wireframe' ? palette.foreground : '#ffffff66';
		ctx.lineWidth = slide.frame === 'wireframe' ? width * 0.0025 : width * 0.001;
		rounded(ctx, x, y, width, height, radius);
		ctx.stroke();
	}
	ctx.save();
	rounded(ctx, x + pad, y + pad, width - pad * 2, height - pad * 2, Math.max(0, radius - pad));
	ctx.clip();
	if (image) {
		// The source screenshot already contains its status bar / Dynamic Island.
		ctx.drawImage(image, x + pad, y + pad, width - pad * 2, height - pad * 2);
	} else {
		ctx.fillStyle = '#f5f5f1';
		ctx.fillRect(x, y, width, height);
		ctx.fillStyle = '#a1a19a';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `400 ${width * 0.05}px "DM Sans", Arial, sans-serif`;
		ctx.fillText('Your screenshot here', 0, -height * 0.1);
		ctx.font = `400 ${width * 0.028}px "DM Sans", Arial, sans-serif`;
		ctx.fillText('Add an image to begin', 0, -height * 0.055);
	}
	ctx.restore();
	if (slide.frame === 'bezel' || slide.frame === 'clay') {
		ctx.fillStyle = slide.frame === 'clay' ? '#c8c7c1' : '#77797e';
		rounded(
			ctx,
			x - width * 0.003,
			y + height * 0.19,
			width * 0.006,
			height * 0.051,
			width * 0.003
		);
		ctx.fill();
		rounded(
			ctx,
			x - width * 0.003,
			y + height * 0.265,
			width * 0.006,
			height * 0.051,
			width * 0.003
		);
		ctx.fill();
		rounded(
			ctx,
			-x - width * 0.003,
			y + height * 0.24,
			width * 0.006,
			height * 0.082,
			width * 0.003
		);
		ctx.fill();
	}
	ctx.restore();
}

function singlePhoneGeometry(slide: Slide, width: number, height: number): PhoneGeometry {
	const scale = clamp(slide.scale ?? 1, 0.45, 1.8);
	const isBelow = slide.layout === 'text-below';
	const phoneWidth = width * (isBelow ? 0.68 : slide.layout === 'centered' ? 0.73 : 0.78) * scale;
	const pad = slide.frame === 'none' ? 0 : phoneWidth * (slide.frame === 'clay' ? 0.035 : 0.022);
	const ratio =
		slide.primaryImage && slide.primaryImage.naturalWidth > 0
			? slide.primaryImage.naturalHeight / slide.primaryImage.naturalWidth
			: 2868 / 1320;
	return {
		centerX: width * 0.5,
		centerY: height * (isBelow ? 0.295 : 0.733),
		width: phoneWidth,
		height: (phoneWidth - pad * 2) * ratio + pad * 2,
		rotation: (clamp(slide.tilt ?? 0, -45, 45) * Math.PI) / 180
	};
}

async function drawScene(
	ctx: Context,
	composition: Composition,
	slideIndex: number,
	wholePair: boolean
) {
	const slide = composition.slides[slideIndex];
	if (!slide) throw new Error('This screenshot no longer exists.');
	const { width, height } = DEVICES[composition.device];
	const panorama = computePanoramaGeometry(composition, slideIndex);
	if (wholePair && !panorama) throw new Error('Select a connected pair to render its panorama.');
	await loadFonts();
	const source = await loadImage(panorama ? composition.panorama!.image : slide.primaryImage);
	if (panorama) {
		const leftSlide = composition.slides[panorama.leftIndex];
		ctx.save();
		ctx.translate(wholePair ? 0 : -panorama.viewportX, 0);
		background(ctx, composition, leftSlide, panorama.worldWidth, height, true, panorama.leftIndex);
		phone(ctx, composition, leftSlide, panorama.phone, source);
		for (const index of [panorama.leftIndex, panorama.rightIndex]) {
			ctx.save();
			ctx.translate(index === panorama.leftIndex ? 0 : width, 0);
			text(ctx, composition, composition.slides[index], index, width, height);
			ctx.restore();
		}
		ctx.restore();
	} else {
		background(ctx, composition, slide, width, height, false, slideIndex);
		phone(ctx, composition, slide, singlePhoneGeometry(slide, width, height), source);
		text(ctx, composition, slide, slideIndex, width, height);
	}
}

async function render(
	canvas: HTMLCanvasElement,
	composition: Composition,
	slideIndex: number,
	options: RenderOptions,
	wholePair: boolean
) {
	const token = (renderTokens.get(canvas) ?? 0) + 1;
	renderTokens.set(canvas, token);
	const device = DEVICES[composition.device];
	const panelWidth = Math.round(clamp(options.width ?? device.width, 32, 8192));
	const panorama = computePanoramaGeometry(composition, slideIndex);
	const buffer = document.createElement('canvas');
	// Rasterize the whole shared world before cropping. Directly translating a
	// phone into separately sized canvases can change browser edge antialiasing.
	buffer.width = panelWidth * (panorama ? 2 : 1);
	buffer.height = Math.round((panelWidth * device.height) / device.width);
	const ctx = buffer.getContext('2d', { alpha: false });
	if (!ctx) throw new Error('Your browser could not create a drawing canvas.');
	ctx.scale(panelWidth / device.width, panelWidth / device.width);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	try {
		await drawScene(ctx, composition, slideIndex, wholePair || !!panorama);
		if (renderTokens.get(canvas) !== token) return;
		canvas.width = panelWidth * (wholePair ? 2 : 1);
		canvas.height = buffer.height;
		const destination = canvas.getContext('2d', { alpha: false });
		if (!destination) throw new Error('Your browser could not create a drawing canvas.');
		const sourceX = !wholePair && panorama?.viewportX ? panelWidth : 0;
		destination.drawImage(
			buffer,
			sourceX,
			0,
			canvas.width,
			canvas.height,
			0,
			0,
			canvas.width,
			canvas.height
		);
	} catch (error) {
		if (renderTokens.get(canvas) === token) throw error;
	} finally {
		buffer.width = 0;
		buffer.height = 0;
	}
}

/** Latest-call-wins atomic render. Exact device pixels by default; width enables lightweight previews. */
export async function renderSlide(
	canvas: HTMLCanvasElement,
	composition: Composition,
	slideIndex: number,
	options: RenderOptions = {}
): Promise<void> {
	await render(canvas, composition, slideIndex, options, false);
}

/** Same renderer, uncropped two-panel world. `width` is the width of ONE panel. */
export async function renderPanoramaPair(
	canvas: HTMLCanvasElement,
	composition: Composition,
	leftIndex: number,
	options: RenderOptions = {}
): Promise<void> {
	await render(canvas, composition, leftIndex, options, true);
}

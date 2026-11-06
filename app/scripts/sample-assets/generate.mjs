#!/usr/bin/env node
// Writes the fictional Sample Garden images under static/sample/: five 1320 x 2868 opaque screens
// and one transparent mark. Run `npm run generate:samples` after changing a template; it needs
// Playwright's Chromium (`npm run test:setup`). The same browser build writes the same pixels, and
// with the same Node version the same bytes. `--out <dir>` compares with the committed files safely.
//
// Each PNG is re-encoded here, so the files carry only IHDR, IDAT and IEND: no text or EXIF chunk
// can come along, and the screens are real RGB with no alpha channel.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { sampleMark } from './art.mjs';
import { SCREENS, stylesheet } from './screens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '../..');
const outAt = process.argv.indexOf('--out');
const OUTPUT = outAt > 0 ? path.resolve(process.argv[outAt + 1]) : path.join(APP, 'static/sample');
const SCALE = 3;
const POINTS = { width: 440, height: 956 };

/** Below this the mark's antialiased fringe is invisible, so it does not count as ink. */
const INK_ALPHA = 16;
const MARK_SIZE = 640;
/** `sample-assets.spec.ts` and art-layer tests rely on this box, so a change must be deliberate. */
const MARK_INK = { x: 85, y: 89, width: 430, height: 511 };

/* ---------------------------------------------------------------------------------- PNG helpers */

function chunksOf(bytes) {
	const chunks = [];
	for (let at = 8; at < bytes.length; ) {
		const length = bytes.readUInt32BE(at);
		chunks.push({
			type: bytes.toString('latin1', at + 4, at + 8),
			data: bytes.subarray(at + 8, at + 8 + length)
		});
		at += 12 + length;
	}
	return chunks;
}

/** Chromium's screenshot as raw RGBA. Handles exactly what it writes: 8-bit, not interlaced. */
function decodeScreenshot(bytes) {
	const chunks = chunksOf(bytes);
	const header = chunks[0].data;
	const width = header.readUInt32BE(0);
	const height = header.readUInt32BE(4);
	const channels = { 2: 3, 6: 4 }[header[9]];
	if (header[8] !== 8 || !channels || header[12] !== 0)
		throw new Error('Unexpected screenshot PNG format.');
	const raw = inflateSync(
		Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
	);
	const stride = width * channels;
	const pixels = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const row = y * stride;
		for (let i = 0; i < stride; i++) {
			const value = raw[y * (stride + 1) + 1 + i];
			const a = i >= channels ? pixels[row + i - channels] : 0;
			const b = y > 0 ? pixels[row - stride + i] : 0;
			const c = y > 0 && i >= channels ? pixels[row - stride + i - channels] : 0;
			const predicted = [
				0,
				a,
				b,
				(a + b) >> 1,
				Math.abs(b - c) <= Math.abs(a - c) && Math.abs(b - c) <= Math.abs(a + b - 2 * c)
					? a
					: Math.abs(a - c) <= Math.abs(a + b - 2 * c)
						? b
						: c
			][filter];
			pixels[row + i] = (value + predicted) & 0xff;
		}
	}
	if (channels === 4) return { width, height, rgba: pixels };
	const rgba = Buffer.alloc(width * height * 4, 0xff);
	for (let i = 0; i < width * height; i++) pixels.copy(rgba, i * 4, i * 3, i * 3 + 3);
	return { width, height, rgba };
}

function chunk(type, data) {
	const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc32(body), body.length + 4);
	return out;
}

/** The smallest of the Sub, Up and Paeth rows, which is all these flat illustrations need. */
function filteredRows(pixels, stride, height, channels) {
	const out = Buffer.alloc((stride + 1) * height);
	const candidate = Buffer.alloc(stride);
	const best = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const row = y * stride;
		let bestScore = Infinity;
		let bestFilter = 0;
		for (const filter of [1, 2, 4]) {
			let score = 0;
			for (let i = 0; i < stride; i++) {
				const a = i >= channels ? pixels[row + i - channels] : 0;
				const b = y > 0 ? pixels[row - stride + i] : 0;
				const c = y > 0 && i >= channels ? pixels[row - stride + i - channels] : 0;
				let predicted = a;
				if (filter === 2) predicted = b;
				else if (filter === 4) {
					const p = a + b - c;
					const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
					predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
				}
				const value = (pixels[row + i] - predicted) & 0xff;
				candidate[i] = value;
				score += value < 128 ? value : 256 - value;
			}
			if (score < bestScore) {
				bestScore = score;
				bestFilter = filter;
				candidate.copy(best);
			}
		}
		out[y * (stride + 1)] = bestFilter;
		best.copy(out, y * (stride + 1) + 1);
	}
	return out;
}

function encodePng({ width, height, pixels, channels }) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = channels === 3 ? 2 : 6;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk(
			'IDAT',
			deflateSync(filteredRows(pixels, width * channels, height, channels), { level: 9 })
		),
		chunk('IEND', Buffer.alloc(0))
	]);
}

function opaqueRgb({ width, height, rgba }) {
	const pixels = Buffer.alloc(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		if (rgba[i * 4 + 3] !== 255) throw new Error('A sample screen came out transparent.');
		rgba.copy(pixels, i * 3, i * 4, i * 4 + 3);
	}
	return { width, height, pixels, channels: 3 };
}

/** Clears the invisible fringe and reports the box of what remains. */
function inkOf({ width, height, rgba }) {
	let [left, top, right, bottom] = [width, height, -1, -1];
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const at = (y * width + x) * 4;
			if (rgba[at + 3] < INK_ALPHA) {
				rgba.fill(0, at, at + 4);
				continue;
			}
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
		}
	return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/* ------------------------------------------------------------------------------------ rendering */

async function fontRules() {
	const face = async (family, file, descriptors) => {
		const bytes = await readFile(path.join(APP, 'static/fonts', file));
		return `@font-face { font-family: '${family}'; src: url(data:font/ttf;base64,${bytes.toString('base64')}); ${descriptors} }`;
	};
	return (
		await Promise.all([
			face('DM Sans', 'DM-Sans.ttf', 'font-weight: 100 1000;'),
			face('Instrument Serif', 'Instrument-Serif.ttf', 'font-weight: 400;'),
			face(
				'Instrument Serif',
				'Instrument-Serif-Italic.ttf',
				'font-weight: 400; font-style: italic;'
			)
		])
	).join('\n');
}

async function renderScreen(page, styles, name, build) {
	await page.setContent(`<!doctype html><meta charset="utf-8"><style>${styles}</style>${build()}`);
	await page.evaluate(async () => {
		await Promise.all(
			[
				'500 16px "DM Sans"',
				'400 16px "Instrument Serif"',
				'italic 400 16px "Instrument Serif"'
			].map((font) => document.fonts.load(font))
		);
		await document.fonts.ready;
	});
	// Lists scroll under a tab bar on purpose, but nothing may hide behind the plant page's button.
	const overflow = await page.evaluate(() => {
		const button = document.querySelector('.primary')?.getBoundingClientRect();
		const blocks = [...document.querySelectorAll('.group, .stats')];
		const lowest = Math.max(0, ...blocks.map((block) => block.getBoundingClientRect().bottom));
		return button ? lowest - button.top : 0;
	});
	if (overflow > 0)
		throw new Error(`The ${name} screen runs ${Math.ceil(overflow)} pt under its button.`);
	return settledShot(page, name, { type: 'png', animations: 'disabled' });
}

/** Two identical shots in a row, so nothing is still being painted when one is kept. */
async function settledShot(page, name, options) {
	let shot = await page.screenshot(options);
	for (let attempt = 0; attempt < 8; attempt++) {
		const next = await page.screenshot(options);
		if (next.equals(shot)) return next;
		shot = next;
	}
	throw new Error(`The ${name} image would not settle between paints.`);
}

async function main() {
	const browser = await chromium.launch({
		args: ['--force-color-profile=srgb', '--font-render-hinting=none']
	});
	try {
		await mkdir(OUTPUT, { recursive: true });
		const context = await browser.newContext({
			viewport: POINTS,
			deviceScaleFactor: SCALE,
			colorScheme: 'light'
		});
		const page = await context.newPage();
		const styles = stylesheet(await fontRules());
		const written = {};
		const write = async (name, bytes) => {
			await writeFile(path.join(OUTPUT, name), bytes);
			written[name] = createHash('sha256').update(bytes).digest('hex');
		};
		// One unused pass warms the rasterizer's caches, because its first paint of a shape can differ
		// from its later ones by a few antialiased pixels.
		for (const [name, build] of Object.entries(SCREENS))
			await renderScreen(page, styles, name, build);
		for (const [name, build] of Object.entries(SCREENS)) {
			const shot = decodeScreenshot(await renderScreen(page, styles, name, build));
			if (shot.width !== POINTS.width * SCALE || shot.height !== POINTS.height * SCALE)
				throw new Error(`The ${name} screen is ${shot.width} x ${shot.height}.`);
			await write(`${name}.png`, encodePng(opaqueRgb(shot)));
		}
		const markContext = await browser.newContext({
			viewport: { width: MARK_SIZE, height: MARK_SIZE },
			deviceScaleFactor: 1
		});
		const markPage = await markContext.newPage();
		await markPage.setContent(
			`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sampleMark(MARK_SIZE)}`
		);
		const mark = decodeScreenshot(await markPage.screenshot({ type: 'png', omitBackground: true }));
		const ink = inkOf(mark);
		if (JSON.stringify(ink) !== JSON.stringify(MARK_INK))
			throw new Error(
				`The mark's ink box is now ${JSON.stringify(ink)}. Update MARK_INK and its tests.`
			);
		await write(
			'mark.png',
			encodePng({ width: mark.width, height: mark.height, pixels: mark.rgba, channels: 4 })
		);
		await writeFile(
			path.join(OUTPUT, 'README.md'),
			`# Sample Garden images

Generated by \`scripts/sample-assets/generate.mjs\`, so edit the templates there rather than these files.

Sample Garden is a fictional plant-care app that exists only as Appshot's first-run example. Its plants, names, notes and numbers are made up, and each screen carries a visible "Sample data" marker. These images are **not store-ready**: Appshot blocks them from an App Store export when they come from this folder, including after a project is saved and reopened.

- \`today.png\`, \`plant.png\`, \`schedule.png\`, \`journal.png\`, \`insights.png\`: 1320 x 2868 opaque screens.
- \`mark.png\`: ${MARK_SIZE} x ${MARK_SIZE} art with transparency. Its ink fills x ${MARK_INK.x}, y ${MARK_INK.y}, ${MARK_INK.width} x ${MARK_INK.height}.

The screens and art were drawn for this project and use the bundled DM Sans and Instrument Serif fonts (SIL Open Font License).
`
		);
		for (const [name, hash] of Object.entries(written)) console.log(`${hash}  ${name}`);
		console.log(`${(await readdir(OUTPUT)).length} files in ${OUTPUT}`);
	} finally {
		await browser.close();
	}
}

await main();

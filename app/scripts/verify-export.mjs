#!/usr/bin/env node
// Two independent checks of the export path. Neither imports the code it checks.
//
//   node scripts/verify-export.mjs check <export.zip> [--expect complete|partial|draft]
//     Reads an exported ZIP with Node's own zlib and crypto: every entry's CRC, every PNG decoded
//     row by row, exact sizes, RGB with no alpha, manifest hashes, the labels, and project.json.
//     Prints one JSON report. Exits 1 and names the file on any failure.
//
//   node scripts/verify-export.mjs run --out <dir> [--project <file>] [--captures <root>] [--port 41850]
//     Drives the real renderer and encoder in a real headless browser through e2e/export-harness.ts,
//     without touching .svelte-kit, then checks each archive as above and writes report.json.
//     --project exports an editable project file, the real deliverable path. --captures (a folder
//     holding raw/ and alt/) binds native captures through the campaign builder. Synthetic probes
//     always run.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync, inflateSync } from 'node:zlib';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------------------------------------------------------------- reading ZIP */

function readArchive(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = -1;
	for (let at = bytes.length - 22; at >= 0 && at >= bytes.length - 65557; at--)
		if (view.getUint32(at, true) === 0x06054b50) {
			end = at;
			break;
		}
	if (end < 0) throw new Error('No end-of-central-directory record: not a complete ZIP.');
	const count = view.getUint16(end + 10, true);
	const centralSize = view.getUint32(end + 12, true);
	const centralStart = view.getUint32(end + 16, true);
	if (centralStart + centralSize !== end)
		throw new Error('The central directory does not end where the end record says.');
	const entries = new Map();
	let at = centralStart;
	for (let index = 0; index < count; index++) {
		if (view.getUint32(at, true) !== 0x02014b50)
			throw new Error(`Central directory entry ${index + 1} is damaged.`);
		const method = view.getUint16(at + 10, true);
		const crc = view.getUint32(at + 16, true);
		const compressed = view.getUint32(at + 20, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extra = view.getUint16(at + 30, true);
		const comment = view.getUint16(at + 32, true);
		const offset = view.getUint32(at + 42, true);
		const name = Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString('utf8');
		if (view.getUint32(offset, true) !== 0x04034b50)
			throw new Error(`${name}: its local header is missing.`);
		const dataStart =
			offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
		const raw = bytes.subarray(dataStart, dataStart + compressed);
		const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
		if (!data) throw new Error(`${name}: unknown compression ${method}.`);
		if (data.length !== size) throw new Error(`${name}: its size does not match the directory.`);
		if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch.`);
		if (entries.has(name)) throw new Error(`${name} appears twice.`);
		entries.set(name, data);
		at += 46 + nameLength + extra + comment;
	}
	return entries;
}

function assertPortablePath(name) {
	if (
		!name ||
		// eslint-disable-next-line no-control-regex -- control characters are what this rejects
		/[\\:*?"<>|\u0000-\u001f]/.test(name) ||
		name.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))
	)
		throw new Error(`"${name}" is not a portable path.`);
}

/* ----------------------------------------------------------------------------------- reading PNG */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode every row. Only 8-bit RGB is a store file; anything else is a failure, not a variant. */
function decodeStorePng(bytes) {
	if (!Buffer.from(bytes.subarray(0, 8)).equals(PNG_SIGNATURE)) throw new Error('not a PNG.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks = [];
	let at = 8;
	while (at < bytes.length) {
		if (at + 12 > bytes.length) throw new Error('PNG is cut off.');
		const length = view.getUint32(at);
		if (at + 12 + length > bytes.length) throw new Error('PNG is cut off.');
		const type = Buffer.from(bytes.subarray(at + 4, at + 8)).toString('latin1');
		if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length))
			throw new Error(`PNG chunk ${type} has a bad CRC.`);
		chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
		at += 12 + length;
	}
	if (chunks[0]?.type !== 'IHDR' || chunks.at(-1)?.type !== 'IEND')
		throw new Error('PNG chunks are out of order.');
	const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
	const width = header.getUint32(0);
	const height = header.getUint32(4);
	const bitDepth = chunks[0].data[8];
	const colorType = chunks[0].data[9];
	const interlace = chunks[0].data[12];
	if (bitDepth !== 8 || colorType !== 2)
		throw new Error(
			`PNG is bit depth ${bitDepth}, color type ${colorType}; store files are 8 and 2.`
		);
	if (interlace !== 0) throw new Error('PNG is interlaced.');
	if (chunks.some((chunk) => chunk.type === 'tRNS')) throw new Error('PNG declares transparency.');
	const inflated = inflateSync(
		Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
	);
	const stride = width * 3;
	if (inflated.length !== (stride + 1) * height)
		throw new Error(`PNG holds ${inflated.length} bytes of pixels, not ${(stride + 1) * height}.`);
	const pixels = new Uint8Array(stride * height);
	let uniform = true;
	for (let y = 0; y < height; y++) {
		const filter = inflated[y * (stride + 1)];
		if (filter > 4) throw new Error(`PNG row ${y + 1} has unknown filter ${filter}.`);
		const row = y * stride;
		for (let i = 0; i < stride; i++) {
			const value = inflated[y * (stride + 1) + 1 + i];
			const a = i >= 3 ? pixels[row + i - 3] : 0;
			const b = y > 0 ? pixels[row - stride + i] : 0;
			const c = y > 0 && i >= 3 ? pixels[row - stride + i - 3] : 0;
			let predicted = 0;
			if (filter === 1) predicted = a;
			else if (filter === 2) predicted = b;
			else if (filter === 3) predicted = (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
				predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			const pixel = (value + predicted) & 0xff;
			pixels[row + i] = pixel;
			if (uniform && pixel !== pixels[i % 3]) uniform = false;
		}
	}
	if (uniform) throw new Error('PNG is one flat color.');
	return { width, height, bitDepth, colorType };
}

/* ------------------------------------------------------------------------------- checking a ZIP */

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LABELS = {
	draftFolder: 'DRAFT-NOT-FOR-APP-STORE',
	partial: 'PARTIAL-NOT-A-COMPLETE-SET.txt'
};

function checkManifest(entries, manifest, expect) {
	const problems = [];
	const fail = (message) => problems.push(message);
	const pngs = [...entries.keys()].filter((name) => name.endsWith('.png'));
	const listed = new Set(manifest.files.map((file) => file.path));
	for (const name of pngs) if (!listed.has(name)) fail(`${name} is not in the manifest.`);

	const report = [];
	for (const file of manifest.files) {
		const data = entries.get(file.path);
		if (!data) {
			fail(`${file.path} is in the manifest but not the ZIP.`);
			continue;
		}
		try {
			if (sha256(data) !== file.sha256) throw new Error('its sha256 differs from the manifest.');
			if (data.length !== file.byteLength) throw new Error('its size differs from the manifest.');
			const decoded = decodeStorePng(data);
			if (decoded.width !== file.width || decoded.height !== file.height)
				throw new Error(
					`it decodes as ${decoded.width}x${decoded.height}, not ${file.width}x${file.height}.`
				);
			if (!file.path.includes(`${decoded.width}x${decoded.height}`))
				throw new Error('its name does not carry its real size.');
			if (!file.path.includes(`${file.classId}/`))
				throw new Error('it is not in its class folder.');
			report.push({ path: file.path, ...decoded, bytes: data.length, sha256: file.sha256 });
		} catch (error) {
			fail(`${file.path}: ${error.message}`);
		}
	}

	// Every declared frame is accounted for, and the label matches what is really there.
	for (const target of manifest.targets) {
		const written = manifest.files.filter((file) => file.target === target.target).length;
		if (written !== target.written)
			fail(`${target.target}: written says ${target.written}, found ${written}.`);
		const left = manifest.omitted.filter((item) => item.target === target.target).length;
		if (written + left !== target.expected)
			fail(
				`${target.target}: ${written} written + ${left} omitted is not ${target.expected} expected.`
			);
	}
	const incomplete = manifest.omitted.length > 0 || !manifest.projectFile;
	if (manifest.partial !== incomplete)
		fail(`partial is ${manifest.partial}, but ${manifest.omitted.length} left out.`);
	if (incomplete && !entries.has(LABELS.partial))
		fail('A partial export has no partial marker file.');
	if (!incomplete && entries.has(LABELS.partial))
		fail('A complete export has a partial marker file.');
	if (manifest.scope === 'draft') {
		if (manifest.readiness !== 'draft-not-store-ready')
			fail(`A draft reads ${manifest.readiness}.`);
		for (const name of pngs)
			if (!name.startsWith(`${LABELS.draftFolder}/`) || !path.basename(name).startsWith('DRAFT-'))
				fail(`${name} is in a draft export without its label.`);
	} else {
		for (const name of pngs)
			if (name.includes('DRAFT')) fail(`${name} is labelled draft in a store export.`);
		if (manifest.readiness === 'meets-file-spec-and-store-checklist' && incomplete)
			fail('An incomplete export reads as meeting the checklist.');
		if (manifest.readiness === 'meets-file-spec-and-store-checklist')
			for (const issue of manifest.issues)
				if (issue.severity === 'block')
					fail(`Reads store-ready with a blocking issue: ${issue.code}.`);
	}
	for (const file of manifest.files)
		if (
			manifest.readiness === 'meets-file-spec-and-store-checklist' &&
			file.source?.provenance?.synthetic
		)
			fail(`${file.path} is synthetic but reads store-ready.`);
	if (expect === 'complete' && (incomplete || manifest.scope !== 'store'))
		fail('Expected a complete store export.');
	if (expect === 'partial' && !incomplete) fail('Expected a partial export.');
	if (expect === 'draft' && manifest.scope !== 'draft') fail('Expected a draft export.');

	const readme = entries.get('README.txt');
	if (!readme) fail('README.txt is missing.');
	else {
		const text = Buffer.from(readme).toString('utf8');
		if (/\b(compliant|approved)\b/i.test(text)) fail('README.txt words the result as approval.');
		if (!text.includes(manifest.summary)) fail('README.txt does not open with the summary.');
		if (!text.includes('project.json')) fail('README.txt does not say how to reopen the project.');
	}
	return { problems, report };
}

function checkProject(entries, manifest) {
	const problems = [];
	const data = entries.get('project.json');
	if (!manifest.projectFile) {
		if (data) problems.push('The manifest says project.json is absent, but it is present.');
		return { problems, project: null };
	}
	if (!data) return { problems: ['project.json is missing.'], project: null };
	if (sha256(data) !== manifest.projectFile.sha256)
		problems.push('project.json differs from its hash.');
	const project = JSON.parse(Buffer.from(data).toString('utf8'));
	if (project.version !== 2) problems.push(`project.json is version ${project.version}, not 2.`);
	if ('campaignId' in project) problems.push('project.json carries a session id.');
	for (const [id, asset] of Object.entries(project.assets)) {
		if (/^\/(demo|brand)\//.test(asset.url)) continue;
		const match = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(asset.url);
		if (!match) {
			problems.push(`Asset ${id} is not embedded.`);
			continue;
		}
		const bytes = Buffer.from(match[2], 'base64');
		if (asset.sha256 && sha256(bytes) !== asset.sha256)
			problems.push(`Asset ${id} differs from its hash.`);
		if (bytes.length !== asset.byteLength) problems.push(`Asset ${id} differs from its size.`);
	}
	const usable = (id) => Object.hasOwn(project.assets, id);
	for (const slide of project.slides)
		for (const [target, variant] of Object.entries(slide.variants ?? {})) {
			if (variant.source && !usable(variant.source.asset))
				problems.push(`${slide.id} on ${target} is bound to a missing asset.`);
			for (const layer of variant.layers ?? [])
				if (!usable(layer.image)) problems.push(`Layer ${layer.id} on ${slide.id} has no asset.`);
		}
	return { problems, project };
}

/** Everything checkable about one archive. Never throws for a bad archive: it reports. */
export async function verifyArchive(file, expect) {
	const report = { file, problems: [] };
	try {
		report.bytes = (await stat(file)).size;
		const entries = readArchive(new Uint8Array(await readFile(file)));
		report.entries = entries.size;
		for (const name of entries.keys()) assertPortablePath(name);
		if (!entries.has('manifest.json')) throw new Error('manifest.json is missing.');
		const manifest = JSON.parse(Buffer.from(entries.get('manifest.json')).toString('utf8'));
		if (manifest.schema !== 1 || manifest.tool !== 'appshot')
			throw new Error('Not an Appshot manifest.');
		const files = checkManifest(entries, manifest, expect);
		const project = checkProject(entries, manifest);
		report.problems.push(...files.problems, ...project.problems);
		Object.assign(report, {
			scope: manifest.scope,
			readiness: manifest.readiness,
			partial: manifest.partial,
			pngs: files.report.length,
			omitted: manifest.omitted,
			sizes: [...new Set(files.report.map((item) => `${item.width}x${item.height}`))],
			colorTypes: [...new Set(files.report.map((item) => item.colorType))],
			bitDepths: [...new Set(files.report.map((item) => item.bitDepth))],
			projectVersion: project.project?.version ?? null,
			projectAssets: project.project ? Object.keys(project.project.assets).length : null
		});
	} catch (error) {
		report.problems.push(error.message);
	}
	report.ok = report.problems.length === 0;
	return report;
}

/* ---------------------------------------------------------------------------------- browser run */

/** Where each campaign scene's capture lives under the capture root; `$` is the display's folder. */
const SCENE_FILES = {
	result: 'raw/$/01-result.png',
	entry: 'raw/$/02-entry.png',
	summary: 'alt/$/02b-entry-items-summary.png',
	assign: 'raw/$/03-assign.png',
	split: 'raw/$/04-custom-split.png',
	breakdown: 'raw/$/05-person-breakdown.png'
};
const NATIVE_FOLDERS = {
	'iphone-di-medium-1206x2622': 'iphone-di-medium-1206x2622',
	'iphone-6.9': 'iphone-di-large-1320x2868',
	'ipad-13': 'ipad-13-2064x2752',
	'iphone-duo-outer-1398x2034': 'iphone-duo-outer-1398x2034',
	'iphone-duo-inner-2007x2853': 'iphone-duo-inner-2007x2853'
};
const REQUIRED = ['iphone-di-medium-1206x2622', 'iphone-6.9', 'ipad-13'];
const DUO = ['iphone-duo-outer-1398x2034', 'iphone-duo-inner-2007x2853'];
/** One size from each aspect family, in both Duo postures. */
const FAMILY_PROBES = [
	'iphone-di-medium-1179x2556',
	'iphone-duo-outer-1398x2034',
	'iphone-duo-inner-2007x2853',
	'ipad-13-2048x2732',
	'iphone-duo-outer-2034x1398',
	'ipad-13-2752x2064',
	'iphone-di-medium-2622x1206'
];

async function nativeBindings(captures, targets) {
	const byTarget = {};
	for (const target of targets) {
		const scenes = {};
		for (const [scene, pattern] of Object.entries(SCENE_FILES)) {
			const file = pattern.replace('$', NATIVE_FOLDERS[target]);
			const present = await stat(path.join(captures, file)).catch(() => null);
			if (present) scenes[scene] = `/captures/${file}`;
		}
		byTarget[target] = scenes;
	}
	return byTarget;
}

async function serve(port, captures, projectFile) {
	const types = { '.png': 'image/png', '.ttf': 'font/ttf' };
	const server = createServer(async (request, response) => {
		const url = decodeURIComponent(new URL(request.url, 'http://local').pathname);
		try {
			if (url === '/input/project.json' && projectFile) {
				response.setHeader('content-type', 'application/json');
				response.end(await readFile(projectFile));
				return;
			}
			if (url === '/') {
				response.setHeader('content-type', 'text/html');
				response.end(
					'<!doctype html><meta charset="utf-8"><title>Export check</title><body></body>'
				);
				return;
			}
			const file =
				url.startsWith('/captures/') && captures
					? path.join(captures, url.slice('/captures/'.length))
					: /^\/(fonts|brand|demo)\//.test(url)
						? path.join(APP, 'static', url)
						: null;
			if (!file || file.includes('..')) throw new Error('Not served.');
			response.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
			response.end(await readFile(file));
		} catch {
			response.statusCode = 404;
			response.end('Not found');
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	return server;
}

async function bundleHarness() {
	const require = createRequire(path.join(APP, 'package.json'));
	const { build } = await import(path.join(APP, 'node_modules/vite/dist/node/index.js'));
	const bundle = await build({
		configFile: false,
		root: APP,
		logLevel: 'silent',
		resolve: { alias: { $lib: path.join(APP, 'src/lib') } },
		build: {
			write: false,
			minify: false,
			lib: {
				entry: path.join(APP, 'e2e/export-harness.ts'),
				name: 'ExportHarness',
				formats: ['iife']
			}
		}
	});
	const result = Array.isArray(bundle) ? bundle[0] : bundle;
	return { code: result.output.find((entry) => entry.type === 'chunk').code, require };
}

/** Text antialiasing noise between two paints of the same frame, never a lost layer or capture. */
const withinNoise = ({ maxDelta, maxChannels, differing }) =>
	maxDelta <= 3 && (maxChannels ?? differing) <= 2000;

const summarize = (issues) => {
	const counts = {};
	for (const issue of issues) {
		const key = `${issue.severity}:${issue.code}`;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
};

async function runBrowser(options) {
	const out = path.resolve(options.out);
	await mkdir(out, { recursive: true });
	const { code, require } = await bundleHarness();
	const { chromium } = require('@playwright/test');
	const server = await serve(options.port, options.captures, options.project);
	const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';
	const browser = await chromium.launch(channel === 'bundled' ? {} : { channel });
	const report = {
		observedAt: new Date().toISOString(),
		browser: browser.version(),
		channel,
		node: process.version,
		scenarios: {}
	};
	const failures = [];
	const expectThat = (condition, what) => {
		if (!condition) failures.push(what);
	};
	try {
		const page = await browser.newPage();
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		await page.goto(`http://127.0.0.1:${options.port}/`);
		await page.addScriptTag({ content: code });
		const call = (name, ...args) =>
			page.evaluate(([fn, values]) => window.ExportHarness[fn](...values), [name, args]);
		/**
		 * Whether a project reopened from its archive paints what it painted before. Compared with a
		 * second export of the original, not the first: Chrome rasterizes artwork slightly differently
		 * the first time it draws it at full size, and repainting moves text by a level or so.
		 */
		async function paintsTheSame(key) {
			const warm = await call('runExport', key, { saveAs: `${key}-warm` });
			const firstPaintNoise = await call('comparePixels', key, `${key}-warm`);
			const reopened = await call('reopenArchive', key, `${key}-reopened`);
			const again = await call('runExport', `${key}-reopened`, { saveAs: `${key}-again` });
			const difference = {
				firstPaintNoise,
				warmExport: warm.status,
				reopenedExport: again.status,
				reopened:
					again.status === 'blocked'
						? null
						: await call('comparePixels', `${key}-warm`, `${key}-again`)
			};
			return {
				reopened,
				difference,
				same: Boolean(difference.reopened && withinNoise(difference.reopened))
			};
		}

		async function save(key, expectLabel) {
			const pending = page.waitForEvent('download');
			await call('downloadResult', key);
			const download = await pending;
			const file = path.join(out, `${key}--${download.suggestedFilename()}`);
			await download.saveAs(file);
			const checked = await verifyArchive(file, expectLabel);
			expectThat(checked.ok, `${key}: ${checked.problems.join(' | ')}`);
			return checked;
		}

		if (options.project) {
			report.scenarios.finalPrepared = await call(
				'prepareProjectFile',
				'final',
				'/input/project.json'
			);
			const preflight = await call('runPreflight', 'final');
			const blocks = preflight.issues.filter((issue) => issue.severity === 'block');
			report.scenarios.finalPreflight = {
				ms: preflight.ms,
				counts: summarize(preflight.issues),
				blocks,
				issues: preflight.issues
			};
			const store = await call('runExport', 'final');
			report.scenarios.finalStore = {
				status: store.status,
				ms: store.ms,
				peakHeapMb: store.peakHeapMb,
				bytes: store.bytes,
				fileName: store.fileName,
				readiness: store.manifest?.readiness,
				targets: store.manifest?.targets,
				omitted: store.manifest?.omitted,
				counts: summarize(store.issues)
			};
			if (store.status === 'blocked') {
				failures.push(
					`The final project is blocked: ${blocks.map((issue) => issue.message).join(' | ')}`
				);
			} else {
				report.scenarios.finalArchive = await save('final', 'complete');
				const reopenCheck = await paintsTheSame('final');
				report.scenarios.finalReopen = reopenCheck.reopened;
				report.scenarios.finalReopenDifference = reopenCheck.difference;
				expectThat(
					reopenCheck.same,
					'The final project paints differently after reopening its ZIP.'
				);
			}
		}

		if (options.captures) {
			const native = await nativeBindings(options.captures, REQUIRED);
			report.scenarios.nativePrepared = await call('prepareNative', 'native', native);
			const preflight = await call('runPreflight', 'native');
			report.scenarios.nativePreflight = {
				ms: preflight.ms,
				counts: summarize(preflight.issues),
				blocks: preflight.issues.filter((issue) => issue.severity === 'block')
			};
			let store = await call('runExport', 'native');
			const authoredBlocks = store.issues.filter((issue) => issue.severity === 'block');
			report.scenarios.nativeStoreAsAuthored = { status: store.status, blocks: authoredBlocks };
			let storeKey = 'native';
			// A painter refusing the campaign's geometry is a finding about the campaign. Preflight did
			// its job, so it is recorded apart, and the files are proven on the rest of the set.
			if (
				store.status === 'blocked' &&
				authoredBlocks.every((issue) => issue.code === 'layout-error')
			) {
				report.campaignFindings = authoredBlocks.map((issue) => issue.message);
				storeKey = 'native-unmarked';
				await call('withoutRefusedMarks', 'native', storeKey, authoredBlocks);
				store = await call('runExport', storeKey);
			}
			report.scenarios.nativeStore = {
				project: storeKey,
				status: store.status,
				ms: store.ms,
				peakHeapMb: store.peakHeapMb,
				bytes: store.bytes,
				fileName: store.fileName,
				readiness: store.manifest?.readiness,
				sources: store.manifest?.files.slice(0, 2).map((file) => file.source),
				counts: summarize(store.issues),
				blocks: store.issues.filter((issue) => issue.severity === 'block')
			};
			expectThat(store.status === 'complete', `The native store export is ${store.status}.`);
			if (store.status !== 'blocked') {
				report.scenarios.nativeStoreArchive = await save(storeKey, 'complete');
				const reopenCheck = await paintsTheSame(storeKey);
				report.scenarios.nativeReopen = reopenCheck.reopened;
				report.scenarios.nativeReopenAgain = reopenCheck.difference;
				report.scenarios.nativeReopenSamePicture = reopenCheck.same;
				expectThat(reopenCheck.same, 'A reopened project renders differently.');
			}

			const withDuo = await nativeBindings(options.captures, [...REQUIRED, ...DUO]);
			report.scenarios.nativeDuoPrepared = await call('prepareNative', 'duo', withDuo);
			const duoStore = await call('runExport', 'duo');
			report.scenarios.nativeDuoStore = {
				status: duoStore.status,
				counts: summarize(duoStore.issues),
				blocks: duoStore.issues
					.filter((issue) => issue.severity === 'block')
					.map((issue) => ({
						code: issue.code,
						target: issue.target,
						frame: issue.slideIndex,
						message: issue.message
					}))
			};
			const duoDraft = await call('runExport', 'duo', { scope: 'draft', saveAs: 'duo-draft' });
			report.scenarios.nativeDuoDraft = {
				status: duoDraft.status,
				ms: duoDraft.ms,
				peakHeapMb: duoDraft.peakHeapMb,
				bytes: duoDraft.bytes,
				fileName: duoDraft.fileName,
				readiness: duoDraft.manifest?.readiness,
				omitted: duoDraft.manifest?.omitted,
				targets: duoDraft.manifest?.targets
			};
			if (duoDraft.status !== 'blocked')
				report.scenarios.nativeDuoDraftArchive = await save('duo-draft', 'draft');
		}

		const probes = {};
		for (const style of ['the-check', 'cobalt', 'table-linen']) {
			const key = `probe-${style}`;
			await call('prepareSynthetic', key, { targets: FAMILY_PROBES, style, frames: 1 });
			const store = await call('runExport', key);
			expectThat(store.status === 'blocked', `${style}: a synthetic store export was not refused.`);
			expectThat(
				store.issues.some((issue) => issue.code === 'synthetic-source'),
				`${style}: no synthetic-source finding.`
			);
			const draft = await call('runExport', key, { scope: 'draft' });
			const entry = {
				store: store.status,
				draft: draft.status,
				ms: draft.ms,
				omitted: draft.manifest?.omitted ?? [],
				failed: (draft.issues ?? [])
					.filter((issue) => issue.code === 'frame-failed' || issue.code === 'layout-error')
					.map((issue) => issue.message)
			};
			if (draft.status !== 'blocked') entry.archive = await save(key, 'draft');
			probes[style] = entry;
		}
		report.scenarios.syntheticFamilies = probes;

		await call('prepareSynthetic', 'legacy', {
			targets: ['iphone-6.9'],
			style: 'the-check',
			frames: 2,
			withLayers: true
		});
		const legacy = await call('legacyRoundTrip', 'legacy', 'iphone-6.9');
		report.scenarios.legacyV1 = legacy;
		expectThat(legacy.layersBefore === 4, 'The v1 fixture lost its layers before saving.');
		expectThat(legacy.layersPortable === legacy.layersBefore, 'portableComposition lost layers.');
		expectThat(legacy.layersReopened === legacy.layersBefore, 'A reopened v1 project lost layers.');
		expectThat(legacy.allEmbedded, 'A v1 layer image is not embedded.');
		expectThat(
			withinNoise({ ...legacy.reopenedDifference, differingFrames: 0 }),
			'A reopened v1 project paints differently.'
		);
		expectThat(
			legacy.colorTypes.length === 2 && legacy.colorTypes.every((type) => type === 2),
			'A v1 PNG is not RGB.'
		);

		await call('prepareSynthetic', 'rgba', {
			targets: ['iphone-di-medium-1206x2622', 'iphone-duo-inner-2007x2853'],
			style: 'the-check',
			frames: 1,
			withLayers: true
		});
		report.scenarios.rgbaEncoder = await call('rgbaEncoderRoundTrip', 'rgba');
		expectThat(
			report.scenarios.rgbaEncoder.browserColorTypes.every((type) => type === 6),
			'The alpha canvas did not produce RGBA, so conversion was not exercised.'
		);
		for (const item of report.scenarios.rgbaEncoder.comparisons)
			expectThat(
				item.colorType === 2 && item.samePixels,
				`${item.path}: RGBA conversion changed pixels.`
			);
		report.scenarios.rgbaEncoderArchive = await save('rgba-rgba', 'draft');

		await call('prepareSynthetic', 'damaged', {
			targets: REQUIRED,
			style: 'the-check',
			frames: 2,
			synthetic: false,
			withLayers: true
		});
		const damaged = await call('damagedFrames', 'damaged', 'damaged');
		report.scenarios.damaged = {
			status: damaged.status,
			omitted: damaged.manifest?.omitted,
			readiness: damaged.manifest?.readiness,
			counts: summarize(damaged.issues)
		};
		expectThat(damaged.status === 'partial', `Damaged frames gave status ${damaged.status}.`);
		expectThat(
			damaged.manifest?.omitted.length === 3,
			'Damaged frames were not all left out by name.'
		);
		if (damaged.status === 'partial') {
			report.scenarios.damagedArchive = await save('damaged', 'partial');
			report.scenarios.damagedReopen = await call('reopenArchive', 'damaged', 'damaged-reopened');
			expectThat(report.scenarios.damagedReopen.frames === 2, 'A partial archive did not reopen.');
			expectThat(
				report.scenarios.damagedReopen.layers.length === 6,
				'A reopened archive lost layers.'
			);
		}

		report.scenarios.cancelled = await call('cancelledExport', 'damaged', 2);
		expectThat(report.scenarios.cancelled.outcome === 'AbortError', 'Cancelling did not abort.');
		expectThat(report.scenarios.cancelled.rendered === 2, 'Cancelling did not stop rendering.');
		const afterCancel = await call('runExport', 'damaged', { saveAs: 'after-cancel' });
		report.scenarios.afterCancel = { status: afterCancel.status };
		expectThat(afterCancel.status === 'complete', 'An export after a cancel did not complete.');

		report.scenarios.pageErrors = pageErrors;
		expectThat(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
	} finally {
		await browser.close();
		server.close();
	}
	report.failures = failures;
	report.ok = failures.length === 0;
	await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	return report;
}

/* -------------------------------------------------------------------------------------------- CLI */

function option(args, name, fallback) {
	const at = args.indexOf(`--${name}`);
	return at >= 0 ? args[at + 1] : fallback;
}

async function main() {
	const [command, ...args] = process.argv.slice(2);
	if (command === 'check' && args[0]) {
		const report = await verifyArchive(path.resolve(args[0]), option(args, 'expect'));
		console.log(JSON.stringify(report, null, 2));
		return report.ok ? 0 : 1;
	}
	if (command === 'run' && option(args, 'out')) {
		const report = await runBrowser({
			out: option(args, 'out'),
			captures: option(args, 'captures'),
			project: option(args, 'project'),
			port: Number(option(args, 'port', 41850))
		});
		console.log(
			JSON.stringify(
				{
					ok: report.ok,
					failures: report.failures,
					campaignFindings: report.campaignFindings ?? [],
					browser: report.browser
				},
				null,
				2
			)
		);
		console.log(`Report: ${path.join(path.resolve(option(args, 'out')), 'report.json')}`);
		return report.ok ? 0 : 1;
	}
	console.error(
		'Usage:\n  verify-export.mjs check <export.zip> [--expect complete|partial|draft]\n  verify-export.mjs run --out <dir> [--project <file>] [--captures <root>] [--port 41850]'
	);
	return 2;
}

// `verifyArchive` is also imported by the end-to-end suite, which must not start the CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
	process.exit(await main());

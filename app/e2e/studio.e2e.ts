import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Composition } from '../src/lib/model/types';

const fixture = (name: string) => path.resolve('static/demo', `${name}.png`);
const frames = (page: Page) => page.getByRole('button', { name: /^Select screenshot \d+$/ });

async function openStudio(page: Page) {
	await page.goto('/');
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.getByLabel('Campaign name')).toHaveValue('Billington');
	await expect(frames(page)).toHaveCount(5);
}

async function artifactPath(testInfo: TestInfo, name: string) {
	const directory = process.env.PLAYWRIGHT_ARTIFACT_DIR
		? path.join(process.env.PLAYWRIGHT_ARTIFACT_DIR, testInfo.title.replace(/[^a-z0-9]+/gi, '-'))
		: testInfo.outputDir;
	await mkdir(directory, { recursive: true });
	return path.join(directory, name);
}

async function saveProjectFile(page: Page, testInfo: TestInfo, name = 'project.appshot.json') {
	const pending = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	const download = await pending;
	expect(download.suggestedFilename()).toMatch(/\.appshot\.json$/);
	const destination = await artifactPath(testInfo, name);
	await download.saveAs(destination);
	return {
		file: destination,
		project: JSON.parse(await readFile(destination, 'utf8')) as Composition
	};
}

async function exportFile(page: Page, testInfo: TestInfo, action: string, name: string) {
	await page.getByRole('button', { name: 'Export set' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const pending = page.waitForEvent('download');
	await dialog.getByRole('button', { name: action }).click();
	const download = await pending;
	const destination = await artifactPath(testInfo, name);
	await download.saveAs(destination);
	await expect(dialog).not.toBeVisible();
	return { bytes: await readFile(destination), filename: download.suggestedFilename() };
}

type CanvasTextCall = { text: string; bottom: number };
type TextCaptureWindow = Window & { appshotTextCalls: CanvasTextCall[] };

async function observeExportedText(page: Page) {
	await page.addInitScript(() => {
		const records: CanvasTextCall[] = [];
		(window as TextCaptureWindow).appshotTextCalls = records;
		const original = CanvasRenderingContext2D.prototype.fillText;
		CanvasRenderingContext2D.prototype.fillText = function (
			this: CanvasRenderingContext2D,
			text: string,
			x: number,
			y: number,
			maxWidth?: number
		) {
			if (this.canvas.width >= 1320)
				records.push({ text, bottom: y + this.measureText(text).actualBoundingBoxDescent });
			if (maxWidth === undefined) original.call(this, text, x, y);
			else original.call(this, text, x, y, maxWidth);
		};
	});
}

test('renders every word of the accepted 220-character supporting copy in the export', async ({
	page
}, testInfo) => {
	await observeExportedText(page);
	await openStudio(page);
	const copy =
		'Gather the people you love for dinner, scan the receipt, assign every item, and keep the whole bill clear. Share one simple view so everyone can see their portion, enjoy the evening, and remember the good times together.';
	expect(copy).toHaveLength(220);
	await page.getByLabel('Supporting text').fill(copy);
	await page.evaluate(() => {
		(window as TextCaptureWindow).appshotTextCalls.length = 0;
	});
	const exported = await exportFile(page, testInfo, 'Selected PNG', 'complete-supporting-copy.png');
	expect(pngDimensions(exported.bytes)).toEqual({ width: 1320, height: 2868 });
	const drawn = await page.evaluate(() =>
		(window as TextCaptureWindow).appshotTextCalls
			.map((call) => call.text)
			.join(' ')
			.replace(/\s+/g, ' ')
	);
	expect(drawn).toContain(copy);
});

for (const limits of [
	{ name: 'editor', title: 100, subtitle: 220 },
	{ name: 'imported project', title: 180, subtitle: 300 }
]) {
	test(`fits maximum ${limits.name} text and excessive headline newlines without losing words`, async ({
		page
	}, testInfo) => {
		await observeExportedText(page);
		await openStudio(page);
		const headline = 'Good\n'.repeat(limits.title / 5);
		const subtitle = 'Share every item and keep the group together. '
			.repeat(8)
			.slice(0, limits.subtitle);
		if (limits.name === 'editor') {
			await page.getByLabel('Headline', { exact: false }).fill(headline);
			await page.getByLabel('Supporting text').fill(subtitle);
		} else {
			const saved = await saveProjectFile(page, testInfo);
			saved.project.slides[0].typography.headline = headline;
			saved.project.slides[0].typography.subtitle = subtitle;
			await page.getByLabel('Open Appshot project').setInputFiles({
				name: 'maximum-text.appshot.json',
				mimeType: 'application/json',
				buffer: Buffer.from(JSON.stringify(saved.project))
			});
			await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		}
		await page.evaluate(() => {
			(window as TextCaptureWindow).appshotTextCalls.length = 0;
		});
		await exportFile(page, testInfo, 'Selected PNG', 'maximum-text.png');
		const calls = await page.evaluate(() => (window as TextCaptureWindow).appshotTextCalls);
		const start = calls.findIndex((call) => call.text === 'Made for the table') + 1;
		const end = calls.findIndex((call, index) => index >= start && call.text === 'BILLINGTON');
		expect(start).toBeGreaterThan(0);
		expect(end).toBeGreaterThan(start);
		const content = calls.slice(start, end);
		const drawn = content
			.map((call) => call.text)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		expect(drawn).toBe(`${headline} ${subtitle}`.replace(/\s+/g, ' ').trim());
		for (const call of content) expect(call.bottom).toBeLessThan(2868 * 0.4);
	});
}

// Inspect the downloaded file independently of Appshot's ZIP writer.
function zipEntries(bytes: Buffer) {
	const end = bytes.length - 22;
	expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
	const count = bytes.readUInt16LE(end + 10);
	let offset = bytes.readUInt32LE(end + 16);
	const entries = new Map<string, Buffer>();
	for (let index = 0; index < count; index++) {
		expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
		const method = bytes.readUInt16LE(offset + 10);
		const length = bytes.readUInt32LE(offset + 24);
		const nameLength = bytes.readUInt16LE(offset + 28);
		const extraLength = bytes.readUInt16LE(offset + 30);
		const commentLength = bytes.readUInt16LE(offset + 32);
		const local = bytes.readUInt32LE(offset + 42);
		const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
		expect(method).toBe(0);
		expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
		const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
		expect(entries.has(name)).toBe(false);
		entries.set(name, bytes.subarray(start, start + length));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

function pngDimensions(bytes: Buffer) {
	expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(bytes.subarray(12, 16).toString()).toBe('IHDR');
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('edits a campaign, restores local changes, and opens a saved project in a fresh browser', async ({
	page,
	browser
}, testInfo) => {
	await openStudio(page);
	await page.getByLabel('Campaign name').fill('Friends at the table');
	await page.getByLabel('Campaign name').press('Tab');
	await page.getByLabel('Headline', { exact: false }).fill('Dinner together.\nThe bill, sorted.');
	await page.getByLabel('Supporting text').fill('Every shared dinner deserves a clear bill.');
	await page.getByLabel('Eyebrow / caption').fill('Good company');
	await page.getByRole('button', { name: 'Apply Sunday paper style' }).click();
	await expect(page.getByRole('button', { name: 'Apply Sunday paper style' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.getByLabel('Text placement').selectOption('text-below');
	await page.getByLabel('Device frame', { exact: true }).selectOption('clay');
	await page.getByLabel('Rotation', { exact: false }).press('End');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.getByLabel('Campaign name')).toHaveValue('Friends at the table');
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
		'Dinner together.\nThe bill, sorted.'
	);
	await expect(page.getByLabel('Supporting text')).toHaveValue(
		'Every shared dinner deserves a clear bill.'
	);
	await expect(page.getByRole('button', { name: 'Apply Sunday paper style' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const saved = await saveProjectFile(page, testInfo);
	expect(saved.project.slides[2]).toMatchObject({ layout: 'text-below', frame: 'clay', tilt: 30 });
	expect(saved.project.slides[0].badge).toBe('Good company');
	const clean = await browser.newContext();
	try {
		const imported = await clean.newPage();
		await imported.goto(page.url());
		await expect(imported.locator('.studio')).not.toHaveClass(/loading/);
		await expect(imported.getByLabel('Campaign name')).toHaveValue('Billington');
		await imported.getByLabel('Open Appshot project').setInputFiles(saved.file);
		await expect(imported.getByLabel('Campaign name')).toHaveValue('Friends at the table');
		await expect(imported.getByLabel('Headline', { exact: false })).toHaveValue(
			'Dinner together.\nThe bill, sorted.'
		);
		await expect(frames(imported)).toHaveCount(5);
		await expect(
			imported.getByRole('switch', { name: 'Connect adjacent screenshots' })
		).toBeChecked();
	} finally {
		await clean.close();
	}
});

test('uploads real screenshots, connects frames, reorders, duplicates, deletes, and undoes changes', async ({
	page
}, testInfo) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await expect(frames(page)).toHaveCount(1);
	await page
		.getByLabel('Upload screenshots', { exact: true })
		.setInputFiles([fixture('home'), fixture('receipt')]);
	await expect(frames(page)).toHaveCount(2);
	await page.getByLabel('Headline', { exact: false }).fill('Dinner with friends');
	await page.getByRole('button', { name: 'Select screenshot 2', exact: true }).click();
	await page.getByLabel('Headline', { exact: false }).fill('Scan the receipt');
	await page.getByRole('button', { name: 'Select screenshot 1', exact: true }).click();
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await expect(page.getByRole('switch', { name: 'Connect adjacent screenshots' })).toBeChecked();
	await page.getByRole('button', { name: 'Duplicate screenshot', exact: true }).click();
	await expect(frames(page)).toHaveCount(3);
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Dinner with friends');
	await page.getByRole('button', { name: 'Move screenshot right', exact: true }).click();
	const reordered = await saveProjectFile(page, testInfo, 'reordered.appshot.json');
	expect(reordered.project.slides.map((slide) => slide.typography.headline)).toEqual([
		'Dinner with friends',
		'Scan the receipt',
		'Dinner with friends'
	]);
	expect(new Set(reordered.project.slides.map((slide) => slide.id)).size).toBe(3);
	expect(reordered.project.continuityMode).toBe('none');
	expect(
		reordered.project.slides.every((slide) =>
			slide.primaryImage?.blobUrl.startsWith('data:image/png;base64,')
		)
	).toBe(true);
	await page.getByRole('button', { name: 'Delete screenshot', exact: true }).click();
	await expect(frames(page)).toHaveCount(2);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(frames(page)).toHaveCount(3);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(frames(page)).toHaveCount(2);
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Scan the receipt');
	await page.getByLabel('Replace screenshot', { exact: true }).setInputFiles(fixture('share'));
	await expect(page.getByRole('img', { name: 'Current raw screenshot' })).toHaveAttribute(
		'src',
		/^data:image\/png;base64,/
	);
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(frames(page)).toHaveCount(2);
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Dinner with friends');
});

test('downloads a complete ZIP of exact-size PNGs and a portable editable project', async ({
	page,
	browser
}, testInfo) => {
	await openStudio(page);
	const exported = await exportFile(
		page,
		testInfo,
		'Download complete set',
		'billington-app-store-set.zip'
	);
	expect(exported.filename).toBe('billington-app-store-set.zip');
	const entries = zipEntries(exported.bytes);
	const pngs = [...entries.entries()].filter(([name]) => name.endsWith('.png'));
	expect(pngs).toHaveLength(5);
	expect(entries.size).toBe(6);
	for (const [[name, bytes], index] of pngs.map((entry, index) => [entry, index] as const)) {
		expect(name).toMatch(new RegExp(`^0${index + 1}-.+-1320x2868\\.png$`));
		expect(pngDimensions(bytes)).toEqual({ width: 1320, height: 2868 });
		expect(bytes.length).toBeGreaterThan(50_000);
	}
	const embedded = entries.get('project.json');
	expect(embedded).toBeDefined();
	const project = JSON.parse(embedded!.toString()) as Composition;
	expect(
		project.slides.every((slide) =>
			slide.primaryImage?.blobUrl.startsWith('data:image/png;base64,')
		)
	).toBe(true);
	expect(project.panorama?.image.blobUrl).toMatch(/^data:image\/png;base64,/);
	const isolated = await browser.newContext();
	try {
		const imported = await isolated.newPage();
		await imported.goto(page.url());
		await expect(imported.locator('.studio')).not.toHaveClass(/loading/);
		await imported.route('**/demo/*.png', (route) => route.abort());
		await imported
			.getByLabel('Open Appshot project')
			.setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: embedded! });
		await expect(imported.getByRole('status')).toContainText('Project opened');
		const roundTrip = await exportFile(imported, testInfo, 'Selected PNG', 'reopened-first.png');
		expect(pngDimensions(roundTrip.bytes)).toEqual({ width: 1320, height: 2868 });
		expect(roundTrip.bytes.equals(pngs[0][1])).toBe(true);
	} finally {
		await isolated.close();
	}
	await page.screenshot({
		path: await artifactPath(testInfo, 'studio-desktop.png'),
		fullPage: true
	});
});

test('exports the selected frame at an alternate size and a contact sheet', async ({
	page
}, testInfo) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByLabel('Export size', { exact: false }).selectOption('ipad-13');
	const single = await exportFile(page, testInfo, 'Selected PNG', 'ipad-selected.png');
	expect(single.filename).toBe('billington-03.png');
	expect(pngDimensions(single.bytes)).toEqual({ width: 2064, height: 2752 });
	const sheet = await exportFile(page, testInfo, 'Contact sheet', 'contact-sheet.png');
	expect(sheet.filename).toBe('billington-contact-sheet.png');
	const dimensions = pngDimensions(sheet.bytes);
	expect(dimensions.width).toBeGreaterThan(dimensions.height);
	expect(dimensions.width).toBeGreaterThan(2000);
	expect(sheet.bytes.length).toBeGreaterThan(50_000);
});

test('guards missing screenshots and reports invalid uploads without losing work', async ({
	page
}) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await page.getByRole('button', { name: 'Export set' }).click();
	const dialog = page.getByRole('dialog');
	await expect(
		dialog.getByText('Some frames have no app screenshot.', { exact: false })
	).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Download complete set' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Selected PNG' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Contact sheet' })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Close export dialog' }).click();
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles({
		name: 'notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Not an image')
	});
	await expect(page.getByRole('alert')).toContainText('Choose a PNG, JPG, or WebP screenshot.');
	await page.getByRole('button', { name: 'Dismiss error' }).click();
	await page.getByLabel('Open Appshot project').setInputFiles({
		name: 'invalid.appshot.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"version":99}')
	});
	await expect(page.getByRole('alert')).toContainText('Choose a valid Appshot project');
	await expect(page.getByLabel('Campaign name')).toHaveValue('Untitled campaign');
	await expect(frames(page)).toHaveCount(1);
	await page.getByRole('button', { name: 'Dismiss error' }).click();
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles(fixture('home'));
	await page.getByRole('button', { name: 'Export set' }).click();
	await expect(dialog.getByRole('button', { name: 'Download complete set' })).toBeEnabled();
	await expect(dialog.getByRole('button', { name: 'Selected PNG' })).toBeEnabled();
});

test('exports one image across a connected pair with a blank neighboring frame', async ({
	page
}, testInfo) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles(fixture('home'));
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByRole('button', { name: 'Add blank screenshot' }).click();
	await expect(frames(page)).toHaveCount(2);
	await page.getByRole('button', { name: 'Select screenshot 1', exact: true }).click();
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await page.getByRole('button', { name: 'Select screenshot 2', exact: true }).click();
	await expect(page.getByRole('switch', { name: 'Connect adjacent screenshots' })).toBeChecked();
	const exported = await exportFile(page, testInfo, 'Download complete set', 'connected-pair.zip');
	const entries = zipEntries(exported.bytes);
	const pngs = [...entries.entries()].filter(([name]) => name.endsWith('.png'));
	expect(pngs).toHaveLength(2);
	for (const [, bytes] of pngs) expect(pngDimensions(bytes)).toEqual({ width: 1320, height: 2868 });
	const project = JSON.parse(entries.get('project.json')!.toString()) as Composition;
	expect(project.slides[1].primaryImage).toBeUndefined();
	expect(project.panorama?.image.blobUrl).toMatch(/^data:image\/png;base64,/);
});

test('normalizes differing frame treatments when linking and keeps paired edits consistent', async ({
	page
}, testInfo) => {
	await openStudio(page);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.getByLabel('Device frame', { exact: true }).selectOption('clay');
	await page.getByLabel('Background fill').selectOption('radial');
	await page.getByLabel('Shadow', { exact: true }).selectOption('none');
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await page.getByRole('button', { name: 'Select screenshot 4', exact: true }).click();
	await expect(page.getByLabel('Device frame', { exact: true })).toHaveValue('clay');
	await expect(page.getByLabel('Background fill')).toHaveValue('radial');
	await expect(page.getByLabel('Shadow', { exact: true })).toHaveValue('none');
	await page.getByLabel('Device frame', { exact: true }).selectOption('wireframe');
	await page.getByLabel('Background fill').selectOption('linear');
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await expect(page.getByLabel('Device frame', { exact: true })).toHaveValue('wireframe');
	await expect(page.getByLabel('Background fill')).toHaveValue('linear');
	const saved = await saveProjectFile(page, testInfo, 'paired-treatments.appshot.json');
	expect(saved.project.slides[2].frame).toBe(saved.project.slides[3].frame);
	expect(saved.project.slides[2].background).toEqual(saved.project.slides[3].background);
	expect(saved.project.slides[2].effects).toEqual(saved.project.slides[3].effects);
});

test('keeps editing and export controls usable at a 390px viewport', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStudio(page);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.getByLabel('Campaign name').fill('Mobile campaign');
	await page.getByLabel('Campaign name').press('Tab');
	await page.getByLabel('Headline', { exact: false }).fill('A story for small screens.');
	await page.getByRole('button', { name: 'Apply Soft serve style' }).click();
	await expect(page.getByRole('button', { name: 'Apply Soft serve style' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Export set' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const box = await page.getByRole('dialog').boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(390);
	await expect(
		page.getByRole('dialog').getByRole('button', { name: 'Download complete set' })
	).toBeEnabled();
	await page.screenshot({
		path: await artifactPath(testInfo, 'studio-mobile-export.png'),
		fullPage: true
	});
	await page.getByRole('button', { name: 'Close export dialog' }).click();
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
		'A story for small screens.'
	);
});

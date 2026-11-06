import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tableLinenFromManifest } from '../src/lib/model/linen';
import { parseProjectV2 } from '../src/lib/model/migrate';
import { projectForTarget } from '../src/lib/model/targets';

async function fixture() {
	const raw = await readFile(path.resolve('static/sample/today.png'));
	const image = {
		id: 'original-capture',
		blobUrl: `data:image/png;base64,${raw.toString('base64')}`,
		naturalWidth: raw.readUInt32BE(16),
		naturalHeight: raw.readUInt32BE(20)
	};
	const project = tableLinenFromManifest(
		{
			version: 1,
			name: 'Linen workflow',
			style: 'table-linen',
			slides: ['first', 'second', 'third'].map((id) => ({
				id,
				image: 'capture.png',
				theme: 'teal',
				headline: ['Low tide.', '*Bright stars.*'],
				subtitle: ['The harbor lights come on at dusk.']
			})),
			panorama: {
				enabled: true,
				leftId: 'first',
				rightId: 'second',
				image: 'capture.png',
				phone: { top: 700, bottom: 2760, maxWidth: 900, centerX: 1200, rotation: -3.5 }
			}
		},
		{ 'capture.png': image }
	);
	return { project, image };
}

async function waitForStudio(page: Page) {
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
}

async function selectedPng(page: Page) {
	await page.getByRole('button', { name: 'Export set' }).click();
	const pending = page.waitForEvent('download');
	await page.getByRole('dialog').getByRole('button', { name: 'Draft PNG' }).click();
	const download = await pending;
	const file = await download.path();
	expect(file).toBeTruthy();
	const bytes = await readFile(file!);
	expect(bytes.subarray(12, 16).toString()).toBe('IHDR');
	expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[25]]).toEqual([1320, 2868, 2]);
	return bytes;
}

test('native Linen import edits colors and shared geometry, then survives undo, autosave and portable reopening', async ({
	page,
	browser
}) => {
	const { project, image } = await fixture();
	await page.goto('/');
	await waitForStudio(page);
	await page.getByLabel('Open Appshot project').setInputFiles({
		name: 'linen.appshot.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(project))
	});
	await expect(page.getByLabel('Campaign name')).toHaveValue('Linen workflow');
	await expect(page.getByRole('button', { name: 'Apply Table Linen style' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('switch', { name: 'Connect adjacent screenshots' })).toBeChecked();
	await expect(page.getByLabel('Shared phone rotation')).toHaveValue('-3.5');
	const originalPng = await selectedPng(page);
	await page.locator('#headline').fill('Harbor at dusk.\n*Lamps along the pier.*');
	await page.getByRole('button', { name: 'Select screenshot 2', exact: true }).click();
	await page.getByRole('button', { name: 'Cream', exact: true }).click();
	await expect(page.getByLabel('Canvas color')).toHaveValue('#fbf6ef');
	await page.getByLabel('Shared phone center').fill('1160');
	await page.getByLabel('Shared phone center').press('Tab');
	await page.getByRole('button', { name: 'Select screenshot 1', exact: true }).click();
	await expect(page.getByLabel('Canvas color')).toHaveValue('#256b70');
	await expect(page.getByLabel('Shared phone center')).toHaveValue('1160');
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.locator('#phone-top').fill('710');
	await page.locator('#phone-top').press('Tab');
	await expect(page.locator('#phone-top')).toHaveValue('710');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('#phone-top')).toHaveValue('700');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.reload();
	await waitForStudio(page);
	await expect(page.locator('#headline')).toHaveValue('Harbor at dusk.\n*Lamps along the pier.*');
	await expect(page.getByLabel('Shared phone center')).toHaveValue('1160');
	const changedPng = await selectedPng(page);
	expect(changedPng.equals(originalPng)).toBe(false);
	const pending = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	const download = await pending;
	const file = await download.path();
	const savedBytes = await readFile(file!);
	const portable = parseProjectV2(savedBytes.toString());
	const saved = projectForTarget(portable, portable.targets[0]);
	expect(saved.panorama?.linenPhone).toMatchObject({ centerX: 1160, top: 700, rotation: -3.5 });
	expect(saved.slides[0].linen?.colors.canvas).toBe('#256B70');
	expect(saved.slides[1].linen?.colors.canvas).toBe('#FBF6EF');
	expect(saved.panorama?.image).toEqual({ ...image, sample: true });
	expect(saved.slides.every((slide) => slide.primaryImage?.blobUrl === image.blobUrl)).toBe(true);
	const clean = await browser.newContext();
	try {
		await clean.route('**/sample/**', (route) => route.abort());
		const imported = await clean.newPage();
		await imported.goto(page.url());
		await waitForStudio(imported);
		await imported.getByLabel('Open Appshot project').setInputFiles({
			name: 'reopened.appshot.json',
			mimeType: 'application/json',
			buffer: savedBytes
		});
		await expect(imported.locator('#headline')).toHaveValue(
			'Harbor at dusk.\n*Lamps along the pier.*'
		);
		await expect(imported.getByLabel('Shared phone center')).toHaveValue('1160');
		const reopenedPng = await selectedPng(imported);
		expect(reopenedPng.equals(changedPng)).toBe(true);
	} finally {
		await clean.close();
	}
});

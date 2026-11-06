import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ProjectV2 } from '../src/lib/model/contracts';

test.use({ actionTimeout: 15_000 });

async function ready(page: Page) {
	await page.goto('/');
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.locator('#frame-layers').click();
}

async function save(page: Page) {
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 20_000 }),
		page.getByRole('button', { name: 'Save project', exact: true }).click()
	]).catch(async (error) => {
		throw new Error(
			`${error.message}\nEditor findings: ${(await page.getByRole('alert').allTextContents()).join('; ')}`
		);
	});
	const bytes = await readFile((await download.path())!);
	return { bytes, project: JSON.parse(bytes.toString()) as ProjectV2 };
}

test('a real UI callout keeps its crop, pointer undo and output ownership through reload', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Lift a detail', exact: true }).click();
	await expect(page.locator('#selected-layer option')).toHaveCount(1);
	for (const [label, value] of [
		['Crop width', '700'],
		['Crop height', '300'],
		['Crop left', '200'],
		['Crop top', '1500'],
		['Scale %', '120']
	]) {
		await page.getByLabel(label, { exact: true }).fill(value);
		await page.getByLabel(label, { exact: true }).press('Tab');
	}
	const move = page.getByRole('button', { name: 'Move crop with a drag or arrow keys' });
	await move.press('Shift+ArrowRight');
	await expect(page.getByLabel('Crop left', { exact: true })).toHaveValue('210');
	const box = (await move.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 6, { steps: 4 });
	await page.mouse.up();
	expect(Number(await page.getByLabel('Crop left', { exact: true }).inputValue())).toBeGreaterThan(
		210
	);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByLabel('Crop left', { exact: true })).toHaveValue('210');
	await expect(page.getByLabel('Crop top', { exact: true })).toHaveValue('1500');
	const previewImage = await move.locator('img').boundingBox();
	expect(previewImage!.width / previewImage!.height).toBeCloseTo(1320 / 2868, 2);
	await page.getByLabel('Active output').selectOption('iphone-di-medium-1206x2622');
	await expect(page.locator('#selected-layer')).toHaveCount(0);
	await page.getByLabel('Active output').selectOption('iphone-6.9');
	await expect(page.locator('#selected-layer option')).toHaveCount(1);
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await expect(page.getByLabel('Crop left', { exact: true })).toHaveValue('210');
	const { project } = await save(page);
	const layer = project.slides[2].variants?.['iphone-6.9']?.layers?.[0];
	expect(layer).toMatchObject({
		kind: 'source-crop',
		crop: { x: 210, y: 1500, width: 700, height: 300 },
		scale: 1.2
	});
	expect(project.assets[layer!.image].url).toMatch(/^data:image\/png;base64,/);
	expect(project.slides[2].variants?.['iphone-di-medium-1206x2622']?.layers).toBeUndefined();
});

test('removing a marked torn callout is one reversible edit with no dangling marks', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Apply The Check style' }).click();
	await page.getByRole('button', { name: 'Lift a detail', exact: true }).click();
	const id = await page.getByLabel('Selected layer', { exact: true }).inputValue();
	const mark = page.getByRole('switch', { name: 'Pen mark', exact: true });
	await mark.click();
	await page.getByLabel('Marks', { exact: true }).selectOption(id);
	await page.getByLabel('Torn edge', { exact: true }).selectOption(id);
	await page.getByRole('button', { name: 'Remove layer', exact: true }).click();
	await expect(page.locator('#selected-layer')).toHaveCount(0);
	await expect(mark).not.toBeChecked();
	await expect(page.getByLabel('Torn edge', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('#selected-layer option')).toHaveCount(1);
	await expect(mark).toBeChecked();
	await expect(page.getByLabel('Torn edge', { exact: true })).toHaveValue(id);
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await expect(mark).toBeChecked();
	await expect(page.getByLabel('Marks', { exact: true })).toHaveValue(id);
	await expect(page.getByLabel('Torn edge', { exact: true })).toHaveValue(id);
});

test('artwork uploads deduplicate original pixels and reopen in a fresh browser', async ({
	page,
	browser
}) => {
	await ready(page);
	const encoded = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 64;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#285d53';
		ctx.fillRect(8, 8, 48, 48);
		ctx.fillStyle = '#d5ad53';
		ctx.fillRect(24, 24, 16, 16);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	const file = {
		name: 'test-brand-mark.png',
		mimeType: 'image/png',
		buffer: Buffer.from(encoded, 'base64')
	};
	for (let index = 0; index < 2; index++) {
		await page.getByLabel('Upload artwork', { exact: true }).setInputFiles(file);
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.locator('#selected-layer option')).toHaveCount(index + 1);
	}
	await page.getByLabel('Artwork detail', { exact: true }).selectOption('pixelated');
	const { project, bytes } = await save(page);
	const layers = project.slides[2].variants?.['iphone-6.9']?.layers;
	expect(layers).toHaveLength(2);
	expect(layers!.map((layer) => layer.kind)).toEqual(['art', 'art']);
	expect(layers![0].image).toBe(layers![1].image);
	expect(layers![1].sampling).toBe('pixelated');
	const asset = project.assets[layers![0].image];
	expect(asset).toMatchObject({ naturalWidth: 64, naturalHeight: 64, name: 'test-brand-mark.png' });
	expect(asset.url).toBe(`data:image/png;base64,${encoded}`);
	const clean = await browser.newContext();
	try {
		const imported = await clean.newPage();
		await imported.goto(page.url());
		await expect(imported.locator('.studio')).not.toHaveClass(/loading/);
		await imported
			.getByLabel('Open Appshot project')
			.setInputFiles({ name: 'artwork.appshot.json', mimeType: 'application/json', buffer: bytes });
		await expect(imported.getByRole('status')).toContainText('Project opened');
		await imported.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
		await imported.getByRole('button', { name: 'Composition', exact: true }).click();
		await expect(imported.locator('#selected-layer option')).toHaveCount(2);
		await expect(imported.getByLabel('Artwork detail', { exact: true })).toHaveValue('pixelated');
		await expect(imported.locator('.crop-source img')).toHaveAttribute('src', /^blob:/);
	} finally {
		await clean.close();
	}
});

test('the layer limit preserves a portable campaign instead of accepting an unsaveable thirteenth layer', async ({
	page
}) => {
	await ready(page);
	const add = page.getByRole('button', { name: 'Lift a detail', exact: true });
	for (let count = 1; count <= 12; count++) {
		await add.click();
		await expect(page.locator('#selected-layer option')).toHaveCount(count);
	}
	await expect(add).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Add artwork', exact: true })).toBeDisabled();
	const { project } = await save(page);
	expect(project.slides[2].variants?.['iphone-6.9']?.layers).toHaveLength(12);
	await page.getByRole('button', { name: 'Remove layer', exact: true }).click();
	await expect(add).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Add artwork', exact: true })).toBeEnabled();
});

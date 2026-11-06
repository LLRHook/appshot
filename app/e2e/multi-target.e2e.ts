import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
	await page.goto('/');
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
}

async function syntheticCapture(page: Page, width: number, height: number) {
	const base64 = await page.evaluate(
		({ width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d', { alpha: false })!;
			context.fillStyle = '#fbf6ef';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#1e5b57';
			context.fillRect(40, 100, width - 80, 400);
			context.font = '45px sans-serif';
			context.fillText('SYNTHETIC TEST CAPTURE', 40, 650);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ width, height }
	);
	return Buffer.from(base64, 'base64');
}

test('The Check controls preserve per-frame layout and remove a pen mark through undo and reload', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await page.getByRole('button', { name: 'Apply The Check style' }).click();
	await page.getByLabel('Headline', { exact: false }).fill('Dinner.\n*Fair shares.*');
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.getByRole('button', { name: 'Gold', exact: true }).click();
	await page.locator('#check-preset').selectOption('detail');
	const mark = page.getByRole('switch', { name: 'Pen mark', exact: true });
	await mark.click();
	await page.getByLabel('Stroke', { exact: true }).selectOption('underline');
	await mark.click();
	await expect(mark).not.toBeChecked();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(mark).toBeChecked();
	await expect(page.getByLabel('Stroke', { exact: true })).toHaveValue('underline');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(mark).not.toBeChecked();
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Gold', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('#check-preset')).toHaveValue('detail');
	await expect(mark).not.toBeChecked();
	await expect(page.locator('.frame canvas').first()).not.toHaveAttribute('aria-label', /\*/);
});

test('the store preview and complete export checklist fit a 390px viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page);
	await page.getByRole('button', { name: 'Store preview', exact: true }).click();
	const preview = page.getByRole('region', { name: 'First three screenshots at store size' });
	await expect(preview.getByRole('button', { name: /^Edit store preview screenshot/ })).toHaveCount(
		3
	);
	await preview.getByRole('button', { name: 'Dark', exact: true }).click();
	await expect(preview.locator('.store-surface')).toHaveClass(/dark/);
	await preview.getByRole('button', { name: 'Edit store preview screenshot 2' }).click();
	await expect(page.locator('.inspector-heading')).toContainText('02');
	await page.getByRole('button', { name: 'Export set' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('region', { name: 'Export checklist' })).toHaveAttribute(
		'aria-busy',
		'false'
	);
	await expect(dialog.locator('.export-findings')).toContainText(/hides about \d+%/);
	await expect(dialog.locator('.export-findings')).not.toContainText('has not measured');
	await expect(dialog.getByRole('button', { name: 'Download screenshot set' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Draft PNG', exact: true })).toBeEnabled();
	const box = await dialog.boundingBox();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(390);
	expect(box!.height).toBeLessThanOrEqual(844 * 0.9 + 1);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('required output findings reveal the control that adds the missing display', async ({
	page
}) => {
	await ready(page);
	const finding = page.locator('.source-findings button').filter({ hasText: 'medium is required' });
	await expect(finding).toHaveCount(1);
	await finding.click();
	await expect(page.getByLabel('All accepted sizes')).toBeVisible();
	await page.getByLabel('All accepted sizes').selectOption('iphone-di-medium-1206x2622');
	await page.locator('.extra-target').getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByLabel('Active output')).toHaveValue('iphone-di-medium-1206x2622');
	await expect(page.locator('.target-row.active')).toContainText('0/5 captures');
	await expect(finding).toHaveCount(0);
});

test('outputs keep separate captures and share copy', async ({ page }) => {
	await ready(page);
	const original = await page.locator('.current-asset img').getAttribute('src');
	await page.getByLabel('Active output').selectOption('iphone-di-medium-1206x2622');
	await expect(page.locator('.current-asset img')).toHaveCount(0);
	await expect(page.locator('.target-row.active')).toContainText('0/5 captures');
	await page.getByLabel('Headline', { exact: false }).fill('Copy shared by both displays');
	await page.getByLabel('Active output').selectOption('iphone-6.9');
	await expect(page.locator('.current-asset img')).toHaveAttribute('src', original!);
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
		'Copy shared by both displays'
	);
});

test('a batch keeps its valid capture and names a corrupt file', async ({ page }) => {
	await ready(page);
	const png = await syntheticCapture(page, 1206, 2622);
	await page.getByLabel('Active output').selectOption('iphone-di-medium-1206x2622');
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles([
		{ name: '01-medium.png', mimeType: 'image/png', buffer: png },
		{ name: '02-broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }
	]);
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.locator('.current-asset img')).toHaveCount(1);
	await expect(page.locator('.current-asset')).toContainText('1206 × 2622');
	await expect(page.locator('.error-notice')).toContainText('02-broken.png');
	await expect(page.locator('.target-row.active')).toContainText('1/5 captures');
	await page.getByRole('button', { name: 'Dismiss error' }).click();
	await page.getByLabel('Active output').selectOption('iphone-6.9');
	await expect(page.locator('.current-asset')).toContainText('1320 × 2868');
});

test('an immediate reload keeps the last copy edit', async ({ page }) => {
	await ready(page);
	await page.getByLabel('Headline', { exact: false }).fill('Kept through an immediate reload');
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
		'Kept through an immediate reload'
	);
});

test('new campaign preserves the previous campaign in Recent campaigns', async ({ page }) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Saved original campaign');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await page.getByRole('button', { name: /^Recent campaigns/ }).click();
	const previous = page
		.locator('.saved-list article')
		.filter({ hasText: 'Saved original campaign' });
	await expect(previous).toHaveCount(1);
	await previous.getByRole('button', { name: 'Open', exact: true }).click();
	await expect(page.getByLabel('Campaign name')).toHaveValue('Saved original campaign');
	await expect(page.getByRole('button', { name: /^Select screenshot \d+$/ })).toHaveCount(5);
});

test('two tabs preserve both edits through the conflict-copy action', async ({ page, context }) => {
	await ready(page);
	await page.getByLabel('Headline', { exact: false }).fill('First saved version');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const other = await context.newPage();
	try {
		await ready(other);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('First saved version');
		await page.getByLabel('Headline', { exact: false }).fill('Kept in the original campaign');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toBeVisible();
		await other.getByLabel('Headline', { exact: false }).fill('Kept as a separate copy');
		await other.getByRole('button', { name: 'Keep my edits as a copy' }).click();
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toHaveCount(0);
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
			'Kept in the original campaign'
		);
		await other.reload();
		await expect(other.locator('.studio')).not.toHaveClass(/loading/);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Kept as a separate copy'
		);
	} finally {
		await other.close();
	}
});

test('editing one independent frame does not repaint the other storyboard canvases', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
	await expect
		.poll(() =>
			page
				.locator('.frame canvas')
				.evaluateAll((canvases) =>
					canvases.every((canvas) => (canvas as HTMLCanvasElement).width > 0)
				)
		)
		.toBe(true);
	await page.evaluate(() => {
		const counts: Record<string, number> = {};
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				const id = (mutation.target as HTMLElement).dataset.slide!;
				counts[id] = (counts[id] ?? 0) + 1;
			}
		});
		for (const canvas of document.querySelectorAll('.frame canvas'))
			observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
		(window as unknown as { paintCounts: typeof counts }).paintCounts = counts;
	});
	await page.getByLabel('Headline', { exact: false }).fill('Only this frame changes');
	const counts = () =>
		page.evaluate(() => (window as unknown as { paintCounts: Record<string, number> }).paintCounts);
	await expect.poll(async () => (await counts())['2'] ?? 0).toBeGreaterThan(0);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	expect(Object.keys(await counts())).toEqual(['2']);
});

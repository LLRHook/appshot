import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
	await page.goto('/');
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
}

async function openSavedCampaign(page: Page, title: string) {
	await page.getByRole('button', { name: /^Recent campaigns/ }).click();
	await page
		.locator('.saved-list article')
		.filter({ hasText: title })
		.getByRole('button', { name: 'Open', exact: true })
		.click();
	await expect(page.locator('.recovery-dialog')).not.toBeVisible();
	await expect(page.getByLabel('Campaign name')).toHaveValue(title);
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
}

async function readSavedCampaigns(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('appshot-campaigns', 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			const rows = await new Promise<
				{ id: string; title: string; revision: number; document: string }[]
			>((resolve, reject) => {
				const request = db.transaction('campaigns').objectStore('campaigns').getAll();
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			return rows;
		} finally {
			db.close();
		}
	});
}

async function readSavedCampaign(page: Page, title: string) {
	const record = (await readSavedCampaigns(page)).find((row) => row.title === title);
	if (!record) throw new Error(`Saved campaign not found: ${title}`);
	return record;
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
	await page.getByLabel('Headline', { exact: false }).fill('Low tide.\n*Bright stars.*');
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
	await expect(dialog.getByRole('link', { name: '2026-11-05', exact: true })).toHaveAttribute(
		'href',
		/developer\.apple\.com/
	);
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

test('library removal unbinds a screenshot and undo restores it', async ({ page }) => {
	await ready(page);
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	const original = await page.locator('.current-asset img').getAttribute('src');
	await page.getByRole('button', { name: 'Screenshots', exact: true }).click();
	await page
		.getByRole('button', { name: 'Remove screenshot 1 from all outputs', exact: true })
		.click();
	await expect(page.locator('.current-asset img')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.current-asset img')).toHaveAttribute('src', original!);
});

test('removing an image clears its anchored pen mark and undo restores a paintable frame', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await page.getByRole('button', { name: 'Apply The Check style' }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	await page.locator('.layer-controls summary').click();
	await page.getByRole('button', { name: 'Lift a detail', exact: true }).click();
	const layer = await page.getByLabel('Selected layer', { exact: true }).inputValue();
	const mark = page.getByRole('switch', { name: 'Pen mark', exact: true });
	await mark.click();
	await page.getByLabel('Marks', { exact: true }).selectOption(layer);
	await expect(page.locator('.render-error')).toHaveCount(0);
	await page.getByRole('button', { name: 'Screenshots', exact: true }).click();
	await page
		.getByRole('button', { name: 'Remove screenshot 1 from all outputs', exact: true })
		.click();
	await expect(mark).not.toBeChecked();
	await expect(page.getByLabel('Selected layer', { exact: true })).toHaveCount(0);
	await expect(page.locator('.render-error')).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(mark).toBeChecked();
	await expect(page.getByLabel('Marks', { exact: true })).toHaveValue(layer);
	await expect(page.locator('.render-error')).toHaveCount(0);
});

test('reopening another tab’s newer campaign preserves stale undo entries as a separate copy', async ({
	page,
	context
}) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Reopened campaign');
	await page.getByLabel('Headline', { exact: false }).fill('Shared version');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const other = await context.newPage();
	try {
		await ready(other);
		await page.getByLabel('Headline', { exact: false }).fill('Other tab’s saved version');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toBeVisible();
		await other.getByLabel('Headline', { exact: false }).fill('My stale edit');
		await expect(other.locator('.save-status')).toHaveText('Save a project backup');
		await openSavedCampaign(other, 'Reopened campaign');
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Other tab’s saved version'
		);
		await other.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('My stale edit');
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
			'Other tab’s saved version'
		);
		await other.reload();
		await expect(other.locator('.studio')).not.toHaveClass(/loading/);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('My stale edit');
	} finally {
		await other.close();
	}
});

test('reopening an advanced campaign preserves undo entries even while another campaign is active', async ({
	page,
	context
}) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Advanced saved campaign');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const other = await context.newPage();
	try {
		await ready(other);
		await other.getByLabel('Headline', { exact: false }).fill('My earlier saved version');
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await other.getByRole('button', { name: 'New campaign', exact: true }).click();
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await page.getByLabel('Headline', { exact: false }).fill('The latest saved original');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await openSavedCampaign(other, 'Advanced saved campaign');
		await other.getByRole('button', { name: 'Undo', exact: true }).click();
		await other.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'My earlier saved version'
		);
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
			'The latest saved original'
		);
		await other.reload();
		await expect(other.locator('.studio')).not.toHaveClass(/loading/);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'My earlier saved version'
		);
	} finally {
		await other.close();
	}
});

for (const redoOnly of [false, true]) {
	test(`reopening keeps the latest redo-only edits in a saved copy (other campaign active: ${redoOnly})`, async ({
		page,
		context
	}) => {
		await ready(page);
		await page.getByLabel('Campaign name').fill('Redo recovery original');
		await page.getByLabel('Headline', { exact: false }).fill('Shared base');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		const original = await readSavedCampaign(page, 'Redo recovery original');
		const other = await context.newPage();
		try {
			await ready(other);
			if (redoOnly) {
				await other.getByRole('button', { name: 'New campaign', exact: true }).click();
				await other.getByLabel('Campaign name').fill('Unrelated base');
				await other.getByLabel('Campaign name').press('Tab');
				await expect(other.locator('.save-status')).toHaveText('All changes saved');
				await other.reload();
				await expect(other.locator('.studio')).not.toHaveClass(/loading/);
				await openSavedCampaign(other, 'Redo recovery original');
			}
			await page.getByLabel('Headline', { exact: false }).fill('Newer original from the other tab');
			await expect(page.locator('.save-status')).toHaveText('All changes saved');
			await expect(other.locator('.conflict-notice')).toBeVisible();
			for (const text of ['First redo edit', 'Latest redo edit']) {
				await other.getByLabel('Headline', { exact: false }).fill(text);
				await other.getByLabel('Headline', { exact: false }).press('Tab');
				await expect(other.locator('.save-status')).toHaveText('Save a project backup');
			}
			for (let step = 0; step < (redoOnly ? 3 : 2); step++)
				await other.getByRole('button', { name: 'Undo', exact: true }).click();
			if (redoOnly) await expect(other.getByLabel('Campaign name')).toHaveValue('Unrelated base');
			else await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('Shared base');
			await openSavedCampaign(other, 'Redo recovery original');
			const recovered = (await readSavedCampaigns(other)).find(
				(row) => JSON.parse(row.document).slides[0].typography.headline === 'Latest redo edit'
			);
			expect(
				recovered,
				'Latest redo content must remain in a durable saved campaign'
			).toBeDefined();
			expect(recovered!.id).not.toBe(original.id);
			await other.getByRole('button', { name: /^Recent campaigns/ }).click();
			await other
				.locator('.saved-list article')
				.filter({ hasText: 'Recovered redo version' })
				.getByRole('button', { name: 'Open', exact: true })
				.click();
			await expect(other.locator('.recovery-dialog')).not.toBeVisible();
			await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('Latest redo edit');
			await expect(other.locator('.save-status')).toHaveText('All changes saved');
			await other.reload();
			await expect(other.locator('.studio')).not.toHaveClass(/loading/);
			await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('Latest redo edit');
			await page.reload();
			await expect(page.locator('.studio')).not.toHaveClass(/loading/);
			await expect(page.getByLabel('Headline', { exact: false })).toHaveValue(
				'Newer original from the other tab'
			);
		} finally {
			await other.close();
		}
	});
}

test('opening a saved campaign without edits does not conflict with its editing tab', async ({
	page,
	context
}, testInfo) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Read-only reopen');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const before = await readSavedCampaign(page, 'Read-only reopen');
	const other = await context.newPage();
	try {
		await ready(other);
		await other.getByRole('button', { name: 'New campaign', exact: true }).click();
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await openSavedCampaign(other, 'Read-only reopen');
		const reopened = await readSavedCampaign(other, 'Read-only reopen');
		await testInfo.attach('read-only-reopen-records', {
			body: JSON.stringify({ before, reopened }),
			contentType: 'application/json'
		});
		expect(reopened.revision).toBe(before.revision);
		expect(reopened.document).toBe(before.document);
		await page.getByLabel('Headline', { exact: false }).fill('Editing continues without a fork');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(page.locator('.conflict-notice')).toHaveCount(0);
	} finally {
		await other.close();
	}
});

test('a conflict notice belongs to its campaign and disappears when starting another', async ({
	page,
	context
}) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Conflicting campaign');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const other = await context.newPage();
	try {
		await ready(other);
		await page.getByLabel('Headline', { exact: false }).fill('Changed elsewhere');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toBeVisible();
		await other.getByRole('button', { name: 'New campaign', exact: true }).click();
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toHaveCount(0);
	} finally {
		await other.close();
	}
});

test('downloading a saved non-Latin campaign uses a usable project filename', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await page.getByLabel('Campaign name').fill('日本語');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.getByRole('button', { name: /^Recent campaigns/ }).click();
	const downloading = page.waitForEvent('download');
	await page
		.locator('.saved-list article')
		.filter({ hasText: '日本語' })
		.getByRole('button', { name: 'Download', exact: true })
		.click();
	const file = await downloading;
	expect(file.suggestedFilename()).toBe('campaign.appshot.json');
	expect(await file.failure()).toBeNull();
});

test('a batch places a capture on a visible frame instead of a pair’s hidden right source', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles({
		name: 'first.png',
		mimeType: 'image/png',
		buffer: await syntheticCapture(page, 1320, 2868)
	});
	await page.getByRole('button', { name: 'Add blank screenshot', exact: true }).click();
	await page.getByRole('button', { name: 'Select screenshot 1', exact: true }).click();
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles({
		name: 'second.png',
		mimeType: 'image/png',
		buffer: await syntheticCapture(page, 1290, 2796)
	});
	await expect(page.getByRole('button', { name: /^Select screenshot \d+$/ })).toHaveCount(3);
	await page.getByRole('button', { name: 'Select screenshot 3', exact: true }).click();
	await expect(page.locator('.current-asset img')).toBeVisible();
	await expect(page.locator('.current-asset')).toContainText('1290 × 2796');
});

test('a first capture on a pair’s new output keeps its draft reason after disconnect and reload', async ({
	page
}) => {
	await ready(page);
	await page.getByLabel('Active output').selectOption('ipad-13');
	await page.getByRole('button', { name: 'Screenshots', exact: true }).click();
	const record = page.locator('.source-record').first();
	await record.locator('summary').click();
	await page
		.getByLabel('Draft override reason for screenshot 1', { exact: true })
		.fill('Testing the pair layout only');
	await record.getByRole('button', { name: 'Use for draft', exact: true }).click();
	await expect(page.locator('.target-row.active')).toContainText('2/5 captures');
	await expect(page.locator('.source-findings')).toContainText('accepted for drafts only');
	await expect(page.locator('.source-findings')).toContainText('Testing the pair layout only');
	await page.getByRole('switch', { name: 'Connect adjacent screenshots' }).click();
	const reasons = page.locator('.source-findings button').filter({
		hasText: 'Testing the pair layout only'
	});
	await expect(reasons).toHaveCount(2);
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const title = await page.getByLabel('Campaign name').inputValue();
	const saved = JSON.parse((await readSavedCampaign(page, title)).document);
	for (const slide of saved.slides.slice(0, 2))
		expect(slide.variants['ipad-13'].source.nonNative).toEqual({
			reason: 'Testing the pair layout only'
		});
	await page.reload();
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await page.getByLabel('Active output').selectOption('ipad-13');
	await expect(reasons).toHaveCount(2);
	await page.getByRole('button', { name: 'Export set', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Download screenshot set' })).toBeDisabled();
});

test('capture records and draft reasons survive Save and Open', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	const png = await syntheticCapture(page, 2064, 2752);
	await page
		.getByLabel('Upload screenshots', { exact: true })
		.setInputFiles({ name: 'tablet.png', mimeType: 'image/png', buffer: png });
	const record = page.locator('.source-record').first();
	await record.locator('summary').click();
	await page.getByLabel('Device for screenshot 1', { exact: true }).fill('iPad Pro 13');
	await page.getByLabel('Device for screenshot 1', { exact: true }).press('Tab');
	await page.getByLabel('OS version for screenshot 1', { exact: true }).fill('27.2');
	await page.getByLabel('OS version for screenshot 1', { exact: true }).press('Tab');
	await page.getByLabel('Fictional account data confirmed for screenshot 1').check();
	await page
		.getByLabel('Draft override reason for screenshot 1')
		.fill('Exploring the composition before recapturing on iPhone');
	await record.getByRole('button', { name: 'Use for draft' }).click();
	await expect(page.locator('.current-asset img')).toBeVisible();
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save project', exact: true }).click();
	const file = await download;
	await page.getByLabel('Open Appshot project').setInputFiles((await file.path())!);
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await expect(page.locator('.current-asset img')).toBeVisible();
	const reopenedRecord = page.locator('.source-record').first();
	await reopenedRecord.locator('summary').click();
	await expect(page.getByLabel('Device for screenshot 1', { exact: true })).toHaveValue(
		'iPad Pro 13'
	);
	await expect(page.getByLabel('OS version for screenshot 1', { exact: true })).toHaveValue('27.2');
	await expect(page.getByLabel('Fictional account data confirmed for screenshot 1')).toBeChecked();
	await page.getByRole('button', { name: 'Export set', exact: true }).click();
	await expect(page.locator('.export-findings')).toContainText('accepted for drafts only');
	await expect(page.getByRole('button', { name: 'Download screenshot set' })).toBeDisabled();
});

test('deleting a saved campaign requires a second click and leaves the active one', async ({
	page
}) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Discard this saved campaign');
	await page.getByLabel('Campaign name').press('Tab');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.getByRole('button', { name: 'New campaign', exact: true }).click();
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	await page.getByRole('button', { name: /^Recent campaigns/ }).click();
	const row = page
		.locator('.saved-list article')
		.filter({ hasText: 'Discard this saved campaign' });
	await row
		.getByRole('button', { name: 'Delete saved campaign Discard this saved campaign' })
		.click();
	await expect(row).toHaveCount(1);
	await row.getByRole('button', { name: 'Delete permanently', exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect(page.locator('.saved-list article')).toHaveCount(1);
});

test('rejected phone bounds restore the value shown by the editor', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Apply Table Linen style' }).click();
	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	const top = page.locator('#phone-top');
	const before = await top.inputValue();
	await top.fill('2860');
	await top.press('Tab');
	await expect(top).toHaveValue(before);
	await expect(page.getByRole('alert')).toContainText(/top|bottom|height/i);
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

test('a batch keeps its valid capture and names a corrupt or mislabelled file', async ({
	page
}) => {
	await ready(page);
	const png = await syntheticCapture(page, 1206, 2622);
	await page.getByLabel('Active output').selectOption('iphone-di-medium-1206x2622');
	await page.getByLabel('Upload screenshots', { exact: true }).setInputFiles([
		{ name: '01-medium.jpg', mimeType: 'image/jpeg', buffer: png },
		{ name: '02-broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }
	]);
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.locator('.current-asset img')).toHaveCount(1);
	await expect(page.locator('.current-asset')).toContainText('1206 × 2622');
	await expect(page.locator('.error-notice')).toContainText('02-broken.png');
	await expect(page.locator('.error-notice')).toContainText('01-medium.jpg is really a PNG');
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
		await other.evaluate(() => {
			const channel = new BroadcastChannel('appshot-campaigns');
			channel.onmessage = () => {
				document.body.dataset.laterCampaignSave = 'received';
				channel.close();
			};
		});
		await page.getByLabel('Headline', { exact: false }).fill('Original saved again');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('body')).toHaveAttribute('data-later-campaign-save', 'received');
		await expect(other.locator('.conflict-notice')).toHaveCount(0);
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Original saved again');
		await other.reload();
		await expect(other.locator('.studio')).not.toHaveClass(/loading/);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Kept as a separate copy'
		);
	} finally {
		await other.close();
	}
});

test('opening the original after keeping a conflict copy preserves both campaigns through undo', async ({
	page,
	context
}) => {
	await ready(page);
	await page.getByLabel('Campaign name').fill('Original conflict campaign');
	await page.getByLabel('Headline', { exact: false }).fill('Shared starting point');
	await expect(page.locator('.save-status')).toHaveText('All changes saved');
	const other = await context.newPage();
	try {
		await ready(other);
		await page.getByLabel('Headline', { exact: false }).fill('Original version');
		await expect(page.locator('.save-status')).toHaveText('All changes saved');
		await expect(other.locator('.conflict-notice')).toBeVisible();
		await other.getByLabel('Headline', { exact: false }).fill('Preserved copy version');
		await other.getByRole('button', { name: 'Keep my edits as a copy' }).click();
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await other.getByLabel('Campaign name').fill('Preserved conflict copy');
		await other.getByLabel('Campaign name').press('Tab');
		await expect(other.locator('.save-status')).toHaveText('All changes saved');

		const openCampaign = async (title: string) => {
			await other.getByRole('button', { name: /^Recent campaigns/ }).click();
			const row = other.locator('.saved-list article').filter({ hasText: title });
			await expect(row).toHaveCount(1);
			await row.getByRole('button', { name: 'Open', exact: true }).click();
			await expect(other.locator('.save-status')).toHaveText('All changes saved');
		};
		await openCampaign('Original conflict campaign');
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('Original version');
		await openCampaign('Preserved conflict copy');
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Preserved copy version'
		);
		await other.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue('Original version');
		await other.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Preserved copy version'
		);
		await expect(other.locator('.save-status')).toHaveText('All changes saved');
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Original version');
		await other.reload();
		await expect(other.locator('.studio')).not.toHaveClass(/loading/);
		await expect(other.getByLabel('Headline', { exact: false })).toHaveValue(
			'Preserved copy version'
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

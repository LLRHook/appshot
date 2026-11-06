import { expect, test, type Page } from '@playwright/test';

const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const redoButton = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true });
const frame = (page: Page, number: number) =>
	page.getByRole('button', { name: `Select screenshot ${number}`, exact: true });
const UNDO = 'ControlOrMeta+z';
const REDO = 'ControlOrMeta+Shift+z';

async function openStudio(page: Page) {
	await page.goto('/');
	await expect(page.locator('.studio')).not.toHaveClass(/loading/);
	await expect(page.getByLabel('Campaign name')).toHaveValue('Sample Garden');
}

test.beforeEach(async ({ page }) => {
	await openStudio(page);
	await expect(undoButton(page)).toBeDisabled();
});

test('typing a word is one undo step and redo brings it back', async ({ page }) => {
	const headline = page.getByLabel('Headline', { exact: false });
	const original = await headline.inputValue();
	await headline.pressSequentially('Gulls');
	const typed = await headline.inputValue();
	expect(typed).not.toBe(original);
	await undoButton(page).click();
	await expect(headline).toHaveValue(original);
	await expect(undoButton(page)).toBeDisabled();
	await redoButton(page).click();
	await expect(headline).toHaveValue(typed);
});

test('leaving a field ends its undo step', async ({ page }) => {
	const headline = page.getByLabel('Headline', { exact: false });
	const original = await headline.inputValue();
	await headline.pressSequentially('A');
	await headline.press('Tab');
	const first = await headline.inputValue();
	await headline.pressSequentially('B');
	await headline.press('Tab');
	await undoButton(page).click();
	await expect(headline).toHaveValue(first);
	await undoButton(page).click();
	await expect(headline).toHaveValue(original);
	await expect(undoButton(page)).toBeDisabled();
});

test('a pointer drag on a slider is one undo step, and releasing it ends that step', async ({
	page
}) => {
	const slider = page.locator('#text-size');
	const original = await slider.inputValue();
	const box = (await slider.boundingBox())!;
	const y = box.y + box.height / 2;
	async function drag(fromRatio: number, toRatio: number) {
		await page.mouse.move(box.x + box.width * fromRatio, y);
		await page.mouse.down();
		for (let step = 1; step <= 6; step++) {
			await page.mouse.move(
				box.x + box.width * (fromRatio + ((toRatio - fromRatio) * step) / 6),
				y
			);
		}
		await page.mouse.up();
	}
	await drag(0.5, 0.9);
	const afterFirst = await slider.inputValue();
	expect(afterFirst).not.toBe(original);
	await drag(0.9, 0.2);
	expect(await slider.inputValue()).not.toBe(afterFirst);
	await undoButton(page).click();
	await expect(slider).toHaveValue(afterFirst);
	await undoButton(page).click();
	await expect(slider).toHaveValue(original);
	await expect(undoButton(page)).toBeDisabled();
});

test('a color drag is one undo step until the picker commits', async ({ page }) => {
	const color = page.getByLabel('Text color');
	const original = await color.inputValue();
	await color.evaluate((input: HTMLInputElement) => {
		for (const value of ['#111111', '#222222', '#333333']) {
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await expect(color).toHaveValue('#333333');
	await undoButton(page).click();
	await expect(color).toHaveValue(original);
	await expect(undoButton(page)).toBeDisabled();
});

test('a command that changes nothing adds no undo step and no save', async ({ page }) => {
	await expect(page.locator('.save-status')).toHaveText('Example campaign');
	await page.getByRole('button', { name: 'Apply Cobalt studio style' }).click();
	await expect(undoButton(page)).toBeDisabled();
	await expect(page.locator('.save-status')).toHaveText('Example campaign');
});

test('a delete is still recoverable after 100 keystrokes', async ({ page }) => {
	const frames = page.getByRole('button', { name: /^Select screenshot \d+$/ });
	await expect(frames).toHaveCount(5);
	await page.getByRole('button', { name: 'Delete screenshot', exact: true }).click();
	await expect(frames).toHaveCount(4);
	const support = page.getByLabel('Supporting text');
	const before = await support.inputValue();
	await support.pressSequentially('x'.repeat(100));
	await undoButton(page).click();
	await expect(support).toHaveValue(before);
	await expect(frames).toHaveCount(4);
	await undoButton(page).click();
	await expect(frames).toHaveCount(5);
});

test('the keyboard shortcut undoes from range, color and select controls', async ({ page }) => {
	const size = page.locator('#text-size');
	const sizeBefore = await size.inputValue();
	await size.press('End');
	await expect(size).toHaveValue('1.3');
	await size.press(UNDO);
	await expect(size).toHaveValue(sizeBefore);
	await size.press(REDO);
	await expect(size).toHaveValue('1.3');

	const color = page.getByLabel('Text color');
	const colorBefore = await color.inputValue();
	await color.fill('#112233');
	await color.focus();
	await color.press(UNDO);
	await expect(color).toHaveValue(colorBefore);

	await page.getByRole('button', { name: 'Composition', exact: true }).click();
	const placement = page.getByLabel('Text placement');
	const placementBefore = await placement.inputValue();
	await placement.selectOption('text-below');
	await placement.focus();
	await placement.press(UNDO);
	await expect(placement).toHaveValue(placementBefore);
});

test('the keyboard shortcut stays with the browser inside a text field', async ({ page }) => {
	const name = page.getByLabel('Campaign name');
	await name.fill('Gulls');
	await name.press('Tab');
	await expect(undoButton(page)).toBeEnabled();
	await page.getByLabel('Supporting text').press(UNDO);
	// Read the document, not a field: the browser's own undo stack can span text fields.
	await expect(page.locator('.breadcrumb strong')).toHaveText('Gulls');
	await expect(undoButton(page)).toBeEnabled();
	await expect(redoButton(page)).toBeDisabled();
});

test('undo returns to the frame the edit was made on', async ({ page }) => {
	await frame(page, 3).click();
	const headline = page.getByLabel('Headline', { exact: false });
	const original = await headline.inputValue();
	await headline.fill('Edited on frame three');
	await frame(page, 1).click();
	await expect(headline).not.toHaveValue('Edited on frame three');
	await undoButton(page).click();
	await expect(frame(page, 3)).toHaveAttribute('aria-pressed', 'true');
	await expect(headline).toHaveValue(original);
	await redoButton(page).click();
	await expect(frame(page, 1)).toHaveAttribute('aria-pressed', 'true');
});

for (const [name, leave] of [
	[
		'hiding the tab',
		() => {
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		}
	],
	['the pagehide event', () => window.dispatchEvent(new Event('pagehide'))]
] as const) {
	test(`${name} writes a pending edit without waiting for the autosave timer`, async ({ page }) => {
		// The page's timers are frozen, so only the flush can complete this save. This proves the
		// wiring, not durability: a real reload inside the debounce can still lose the edit.
		await page.clock.install();
		await openStudio(page);
		await page.clock.pauseAt(Date.now() + 60_000);
		const headline = page.getByLabel('Headline', { exact: false });
		await headline.fill('Saved on the way out');
		await headline.press('Tab');
		const status = page.locator('.save-status');
		await expect(status).toHaveText('Saving…');
		await page.waitForTimeout(800);
		await expect(status).toHaveText('Saving…');
		await page.evaluate(leave);
		await expect(status).toHaveText('All changes saved');
		await page.clock.resume();
		await page.reload();
		await expect(page.locator('.studio')).not.toHaveClass(/loading/);
		await expect(page.getByLabel('Headline', { exact: false })).toHaveValue('Saved on the way out');
	});
}

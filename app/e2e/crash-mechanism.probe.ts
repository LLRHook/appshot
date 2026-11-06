import { test as base, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Playwright's own crash tests use a dedicated worker. Keep this diagnostic isolated too.
const test = base.extend<Record<never, never>, { crashProbeIsolation: string }>({
	crashProbeIsolation: ['renderer-crash-probe', { scope: 'worker', auto: true }]
});

const cases = [
	{ name: 'HTML', mime: 'text/html', enablePage: false },
	{ name: 'plain text', mime: 'text/plain', enablePage: false },
	{
		name: 'plain text with enabled Page domain',
		mime: 'text/plain',
		enablePage: true
	}
] as const;

for (const variant of cases) {
	test.describe(variant.name, () => {
		test('observes an actual renderer crash', async ({ page, context, browser }, testInfo) => {
			const events: { event: string; ms: number; detail?: string }[] = [];
			const began = performance.now();
			const note = (event: string, detail?: string) =>
				events.push({
					event,
					ms: Math.round(performance.now() - began),
					...(detail ? { detail } : {})
				});
			await page.route('http://crash-probe.test/**', (route) =>
				route.fulfill({ contentType: variant.mime, body: '<p>Renderer crash probe</p>' })
			);
			await page.goto('http://crash-probe.test/');
			const client = await context.newCDPSession(page);
			client.on('Inspector.targetCrashed', () => note('Inspector.targetCrashed'));
			page.on('crash', () => note('page.crash'));
			page.on('close', () => note('page.close'));
			if (variant.enablePage) await client.send('Page.enable');
			const target = await client.send('Target.getTargetInfo');
			const documentType = await page.evaluate(() => {
				localStorage.setItem('crash-probe', 'written before crash');
				return document.contentType;
			});
			let requestState = 'pending';
			try {
				const crashed = page.waitForEvent('crash', { timeout: 8_000 });
				note('Page.crash sent');
				void client.send('Page.crash').then(
					() => {
						requestState = 'resolved';
						note('Page.crash resolved');
					},
					(error) => {
						requestState = String(error);
						note('Page.crash rejected', requestState);
					}
				);
				await crashed;
				expect(events.some((item) => item.event === 'page.crash')).toBe(true);
			} finally {
				const report = {
					variant,
					trace: testInfo.project.use.trace,
					platform: process.platform,
					browser: browser.version(),
					documentType,
					target: target.targetInfo,
					browserConnected: browser.isConnected(),
					requestState,
					events
				};
				const body = JSON.stringify(report, null, 2);
				await writeFile(testInfo.outputPath('events.json'), body);
				await testInfo.attach('crash-mechanism-events', { body, contentType: 'application/json' });
				console.log(body);
			}
		});
	});
}

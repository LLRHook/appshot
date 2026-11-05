import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_BASE_URL targets a server you already started. Otherwise Playwright builds and
// serves the app on PLAYWRIGHT_PORT, failing fast if another run holds that port.
const externalServer = process.env.PLAYWRIGHT_BASE_URL;
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error(`PLAYWRIGHT_PORT must be a TCP port, got "${process.env.PLAYWRIGHT_PORT}".`);
}
const localServer = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.e2e.{ts,js}',
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	reporter: 'list',
	timeout: 90_000,
	expect: { timeout: 10_000 },
	outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
	use: {
		channel: process.env.PLAYWRIGHT_CHANNEL,
		baseURL: externalServer || localServer,
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: externalServer
		? undefined
		: {
				command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
				url: localServer,
				timeout: 120_000
			}
});

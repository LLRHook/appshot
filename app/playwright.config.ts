import { defineConfig } from '@playwright/test';

const externalServer = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.e2e.{ts,js}',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 10_000 },
	outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
	use: {
		channel: process.env.PLAYWRIGHT_CHANNEL,
		baseURL: externalServer || 'http://127.0.0.1:4173',
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: externalServer
		? undefined
		: {
				command: 'npm run build && npm run preview -- --host 127.0.0.1',
				url: 'http://127.0.0.1:4173',
				timeout: 120_000
			}
});

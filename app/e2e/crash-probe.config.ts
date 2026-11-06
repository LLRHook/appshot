import { defineConfig } from '@playwright/test';

// Diagnostic only, after a failed CI browser gate. This file is outside the normal *.e2e.ts
// match. Compare the real persistence case with minimal intercepted pages, with and without
// tracing. CI reuses its built application; local diagnosis can use the existing preview.
const externalServer = process.env.PLAYWRIGHT_BASE_URL;
const server = 'http://127.0.0.1:41859';
export default defineConfig({
	testDir: '.',
	testMatch: ['crash-mechanism.probe.ts', 'campaign-persistence.e2e.ts'],
	grep: /observes an actual renderer crash|survives a renderer crash after the edit/,
	workers: 1,
	retries: 0,
	timeout: 20_000,
	globalTimeout: 210_000,
	reporter: 'list',
	outputDir: '../test-results/crash-mechanism-probe',
	use: { baseURL: externalServer || server },
	projects: [
		{ name: 'untraced', use: { trace: 'off' } },
		{ name: 'traced', use: { trace: 'on' } }
	],
	webServer: externalServer
		? undefined
		: {
				command: 'npm run preview -- --host 127.0.0.1 --port 41859 --strictPort',
				url: server,
				timeout: 30_000
			}
});

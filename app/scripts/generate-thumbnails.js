#!/usr/bin/env node

/**
 * Generate template thumbnails via Chrome DevTools Protocol.
 *
 * Prerequisites:
 *   1. Start Chrome with remote debugging:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *   2. Start the dev server:
 *      cd app && npm run dev
 *
 * Usage (from app/):
 *   node scripts/generate-thumbnails.js
 *   node scripts/generate-thumbnails.js --base-url http://localhost:5173
 */

import CDP from 'chrome-remote-interface';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static', 'templates');

const TEMPLATES = [
	{
		id: 'gradient-bezel',
		params: {
			headline: 'Your App Name',
			layout: 'text-above',
			device: 'iphone',
			gradient_from: 'D4A574',
			gradient_to: '328983',
			gradient_angle: '135',
			crop_x: '50',
			crop_y: '35',
		},
	},
	{
		id: 'clean-flat',
		params: {
			headline: 'Your App Name',
			bg_color: '#F5F5F5',
			text_color: '#328983',
		},
	},
	{
		id: 'dark-minimal',
		params: {
			headline: 'Your App Name',
			layout: 'text-above',
			accent_color: '#328983',
		},
	},
];

const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 600;

const baseUrl = process.argv.includes('--base-url')
	? process.argv[process.argv.indexOf('--base-url') + 1]
	: 'http://localhost:5173';

async function generateThumbnail(template) {
	const searchParams = new URLSearchParams(template.params);
	const url = `${baseUrl}/templates/${template.id}/index.html?${searchParams.toString()}`;
	const outPath = join(STATIC_DIR, template.id, 'thumb.png');

	let client;
	try {
		client = await CDP({ port: 9222 });
		const { Page, Emulation } = client;

		await Page.enable();
		await Emulation.setDeviceMetricsOverride({
			width: THUMB_WIDTH,
			height: THUMB_HEIGHT,
			deviceScaleFactor: 2,
			mobile: false,
		});

		await Page.navigate({ url });
		await Page.loadEventFired();

		// Brief pause for CSS rendering
		await new Promise((r) => setTimeout(r, 500));

		const { data } = await Page.captureScreenshot({ format: 'png' });
		writeFileSync(outPath, Buffer.from(data, 'base64'));
		console.log(`  ✓ ${template.id} → ${outPath}`);
	} finally {
		if (client) await client.close();
	}
}

async function main() {
	console.log(`Generating thumbnails (${THUMB_WIDTH}x${THUMB_HEIGHT} @2x)...`);
	console.log(`Base URL: ${baseUrl}\n`);

	for (const template of TEMPLATES) {
		try {
			await generateThumbnail(template);
		} catch (err) {
			console.error(`  ✗ ${template.id}: ${err.message}`);
		}
	}

	console.log('\nDone.');
}

main();

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import CDP from 'chrome-remote-interface';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.json();
	const { templateId, params, width, height } = body as {
		templateId: string;
		params: Record<string, string | number>;
		width: number;
		height: number;
	};

	if (!templateId || !width || !height) {
		return json({ error: 'Missing templateId, width, or height' }, { status: 400 });
	}

	// If src is a data URL, write it to a temp file and use file:// URL
	let tempFile: string | null = null;
	const renderParams = { ...params };

	if (typeof renderParams.src === 'string' && renderParams.src.startsWith('data:')) {
		const tempDir = mkdtempSync(join(tmpdir(), 'appshot-'));
		tempFile = join(tempDir, 'screenshot.png');
		const base64Data = renderParams.src.split(',')[1];
		writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
		renderParams.src = `file://${tempFile}`;
	}

	// Build template URL — use the dev server's own origin for template files
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(renderParams)) {
		if (value !== undefined && value !== '') {
			const strVal = String(value);
			if (strVal.match(/^#[0-9a-fA-F]{3,8}$/)) {
				searchParams.set(key, strVal.slice(1));
			} else {
				searchParams.set(key, strVal);
			}
		}
	}

	const templateUrl = `${url.origin}/templates/${templateId}/index.html?${searchParams.toString()}`;

	let client;
	try {
		client = await CDP({ port: 9222 });
		const { Page, Emulation, Runtime } = client;

		await Page.enable();
		await Emulation.setDeviceMetricsOverride({
			width,
			height,
			deviceScaleFactor: 1,
			mobile: false,
		});

		await Page.navigate({ url: templateUrl });
		await Page.loadEventFired();

		// Wait for screenshot image to load
		await Runtime.evaluate({
			expression: `new Promise((resolve) => {
				const check = () => {
					const img = document.getElementById('screenshot');
					if (!img || !img.src || img.src === window.location.href) { resolve(true); return; }
					if (img.complete && img.naturalWidth > 0) {
						const cropImg = document.getElementById('crop-screenshot');
						if (cropImg && cropImg.src && cropImg.src !== window.location.href) {
							if (cropImg.complete && cropImg.naturalWidth > 0) { resolve(true); return; }
						} else { resolve(true); return; }
					}
					setTimeout(check, 100);
				};
				check();
			})`,
			awaitPromise: true,
		});

		const { data } = await Page.captureScreenshot({ format: 'png' });
		const pngBuffer = Buffer.from(data, 'base64');

		return new Response(pngBuffer, {
			headers: {
				'Content-Type': 'image/png',
				'Content-Disposition': `attachment; filename="${templateId}_${width}x${height}.png"`,
			},
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{
				error: 'Render failed',
				details: message,
				hint: 'Make sure Chrome is running with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222',
			},
			{ status: 500 }
		);
	} finally {
		if (client) await client.close();
		if (tempFile) {
			try { unlinkSync(tempFile); } catch {}
		}
	}
};

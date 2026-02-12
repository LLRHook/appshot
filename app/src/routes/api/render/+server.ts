import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import CDP from 'chrome-remote-interface';

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

	// Separate data URL images from regular params
	const imageParams: Record<string, string> = {};
	const searchParams = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === '') continue;
		const strVal = String(value);

		if (strVal.startsWith('data:')) {
			imageParams[key] = strVal;
		} else if (strVal.match(/^#[0-9a-fA-F]{3,8}$/)) {
			searchParams.set(key, strVal.slice(1));
		} else {
			searchParams.set(key, strVal);
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

		// Inject images directly via DOM manipulation (avoids file:// security restrictions)
		if (Object.keys(imageParams).length > 0) {
			const imageEntries = JSON.stringify(
				Object.entries(imageParams).map(([key, dataUrl]) => {
					// Map param key to img element ID: src -> screenshot, src_1 -> screenshot-1
					const imgId = key === 'src' ? 'screenshot' : 'screenshot-' + key.split('_')[1];
					return [imgId, dataUrl];
				})
			);

			await Runtime.evaluate({
				expression: `(() => {
					const entries = ${imageEntries};
					for (const [imgId, dataUrl] of entries) {
						const img = document.getElementById(imgId);
						if (img) img.src = dataUrl;
					}
				})()`,
			});
		}

		// Wait for all images to load (with 15s timeout safety net)
		await Runtime.evaluate({
			expression: `new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Image loading timed out after 15s')), 15000);
				const check = () => {
					const images = document.querySelectorAll('img[id]');
					if (images.length === 0) { clearTimeout(timeout); resolve(true); return; }
					const allLoaded = Array.from(images).every(img => {
						if (!img.src || img.src === window.location.href) return true;
						return img.complete && img.naturalWidth > 0;
					});
					if (allLoaded) { clearTimeout(timeout); resolve(true); return; }
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
	}
};

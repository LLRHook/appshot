import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const MOCK_STYLE = {
	gradient_from: '#2C3E50',
	gradient_to: '#3498DB',
	gradient_angle: 145,
	layout: 'text-left',
};

export const POST: RequestHandler = async ({ request }) => {
	const { image } = await request.json();

	// If API key is set, use Claude Vision
	if (env.ANTHROPIC_API_KEY && image) {
		try {
			const base64Data = image.split(',')[1] || image;
			const mediaType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

			const res = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': env.ANTHROPIC_API_KEY,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: 'claude-sonnet-4-5-20250929',
					max_tokens: 256,
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'image',
									source: { type: 'base64', media_type: mediaType, data: base64Data },
								},
								{
									type: 'text',
									text: 'Analyze this App Store marketing screenshot. Extract:\n- gradient_from: hex color (warm/light end)\n- gradient_to: hex color (cool/dark end)\n- gradient_angle: degrees (number)\n- layout: "text-above", "text-left", "text-right", or "split"\n\nReturn ONLY a JSON object with these keys, no other text.',
								},
							],
						},
					],
				}),
			});

			if (res.ok) {
				const data = await res.json();
				const text = data.content?.[0]?.text || '{}';
				const style = JSON.parse(text);
				return json({ style, source: 'ai' });
			}
		} catch {
			// Fall through to mock
		}
	}

	return json({ style: MOCK_STYLE, source: 'mock' });
};

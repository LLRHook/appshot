import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'llava';

const MOCK_STYLE = {
	gradient_from: '#2C3E50',
	gradient_to: '#3498DB',
	gradient_angle: 145,
	layout: 'text-left',
};

const VISION_PROMPT = 'Analyze this App Store marketing screenshot. Extract:\n- gradient_from: hex color (warm/light end)\n- gradient_to: hex color (cool/dark end)\n- gradient_angle: degrees (number)\n- layout: "text-above", "text-left", "text-right", or "split"\n\nReturn ONLY a JSON object with these keys, no other text.';

function parseStyle(text: string): Record<string, string | number> | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	const style = JSON.parse(match[0]);
	if (style.gradient_from && style.gradient_to) return style;
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const { image } = await request.json();

	if (!image) return json({ style: MOCK_STYLE, source: 'mock' });

	const base64Data = image.split(',')[1] || image;

	// Try Ollama first (local, no API key needed)
	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				prompt: VISION_PROMPT,
				images: [base64Data],
				stream: false,
			}),
		});
		if (res.ok) {
			const data = await res.json();
			const style = parseStyle(data.response || '');
			if (style) return json({ style, source: 'ollama' });
		}
	} catch {
		// Ollama not running, try next
	}

	// Try Claude API if key is set
	if (env.ANTHROPIC_API_KEY) {
		try {
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
								{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
								{ type: 'text', text: VISION_PROMPT },
							],
						},
					],
				}),
			});
			if (res.ok) {
				const data = await res.json();
				const style = parseStyle(data.content?.[0]?.text || '');
				if (style) return json({ style, source: 'claude' });
			}
		} catch {
			// Fall through to mock
		}
	}

	return json({ style: MOCK_STYLE, source: 'mock' });
};

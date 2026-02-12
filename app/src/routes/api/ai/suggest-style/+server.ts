import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'llava';

const MOCK_RESPONSE = {
	background: {
		type: 'linear-gradient' as const,
		color1: '#667EEA',
		color2: '#764BA2',
		color3: '#F093FB',
		angle: 135,
	},
	fontColor: '#FFFFFF',
	accentColor: '#667EEA',
};

const VISION_PROMPT = `Analyze this app screenshot and suggest a professional App Store marketing screenshot style.

Extract the dominant colors from the screenshot UI, then suggest:
- bg_type: "linear-gradient", "radial-gradient", "mesh", or "solid"
- bg_color1: hex color (primary/warm tone that complements the app's UI)
- bg_color2: hex color (secondary/cool tone)
- bg_color3: hex color (accent, for mesh backgrounds)
- bg_angle: gradient angle in degrees (number, 0-360)
- font_color: hex color for headline text (good contrast against the background)
- accent_color: hex color extracted from the app's primary UI color

Return ONLY a JSON object with these keys, no other text.`;

interface SuggestResult {
	bg_type?: string;
	bg_color1?: string;
	bg_color2?: string;
	bg_color3?: string;
	bg_angle?: number;
	font_color?: string;
	accent_color?: string;
}

function parseResult(text: string): SuggestResult | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	const result = JSON.parse(match[0]);
	if (result.bg_color1 && result.bg_color2) return result;
	return null;
}

function formatResponse(result: SuggestResult) {
	return {
		background: {
			type: result.bg_type || 'linear-gradient',
			color1: result.bg_color1 || MOCK_RESPONSE.background.color1,
			color2: result.bg_color2 || MOCK_RESPONSE.background.color2,
			color3: result.bg_color3 || MOCK_RESPONSE.background.color3,
			angle: result.bg_angle || MOCK_RESPONSE.background.angle,
		},
		fontColor: result.font_color || MOCK_RESPONSE.fontColor,
		accentColor: result.accent_color || MOCK_RESPONSE.accentColor,
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const { image } = await request.json();

	if (!image) return json({ ...MOCK_RESPONSE, source: 'mock' });

	const base64Data = image.split(',')[1] || image;

	// Try Ollama first
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
			const result = parseResult(data.response || '');
			if (result) return json({ ...formatResponse(result), source: 'ollama' });
		}
	} catch {
		// Ollama not running
	}

	// Try Claude API
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
				const result = parseResult(data.content?.[0]?.text || '');
				if (result) return json({ ...formatResponse(result), source: 'claude' });
			}
		} catch {
			// Fall through to mock
		}
	}

	return json({ ...MOCK_RESPONSE, source: 'mock' });
};

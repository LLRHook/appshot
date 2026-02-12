import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'llava';

const MOCK_HEADLINES = [
	'Split Bills Instantly',
	'Fair Shares, No Math',
	'Dinner Made Simple',
	'Who Owes What?',
	'Bill Splitting, Solved',
	'Share Costs Easily',
	'No More IOUs',
	'Split It Right',
];

const PROMPT = (description: string, screenContext?: string) =>
	`Generate 8 short marketing headlines (max 6 words each) for an App Store screenshot.\n\nApp description: ${description}\n${screenContext ? `This screen shows: ${screenContext}` : ''}\n\nReturn ONLY a JSON array of strings, no other text.`;

function parseHeadlines(text: string): string[] {
	const match = text.match(/\[[\s\S]*\]/);
	return match ? JSON.parse(match[0]) : [];
}

export const POST: RequestHandler = async ({ request }) => {
	const { description, screenContext } = await request.json();
	const prompt = PROMPT(description, screenContext);

	// Try Ollama first (local, no API key needed)
	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
		});
		if (res.ok) {
			const data = await res.json();
			const headlines = parseHeadlines(data.response || '');
			if (headlines.length > 0) return json({ headlines, source: 'ollama' });
		}
	} catch {
		// Ollama not running, try next
	}

	// Try Claude API if key is set
	if (env.ANTHROPIC_API_KEY) {
		try {
			const res = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': env.ANTHROPIC_API_KEY,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 256,
					messages: [{ role: 'user', content: prompt }],
				}),
			});
			if (res.ok) {
				const data = await res.json();
				const headlines = parseHeadlines(data.content?.[0]?.text || '');
				if (headlines.length > 0) return json({ headlines, source: 'claude' });
			}
		} catch {
			// Fall through to mock
		}
	}

	return json({ headlines: MOCK_HEADLINES, source: 'mock' });
};

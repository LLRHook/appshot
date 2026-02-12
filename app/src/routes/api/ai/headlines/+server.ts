import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

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

export const POST: RequestHandler = async ({ request }) => {
	const { description, screenContext } = await request.json();

	// If API key is set, use Claude API
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
					messages: [
						{
							role: 'user',
							content: `Generate 8 short marketing headlines (max 6 words each) for an App Store screenshot.\n\nApp description: ${description}\n${screenContext ? `This screen shows: ${screenContext}` : ''}\n\nReturn ONLY a JSON array of strings, no other text.`,
						},
					],
				}),
			});

			if (res.ok) {
				const data = await res.json();
				const text = data.content?.[0]?.text || '[]';
				const headlines = JSON.parse(text);
				return json({ headlines, source: 'ai' });
			}
		} catch {
			// Fall through to mock
		}
	}

	// Mock response
	return json({ headlines: MOCK_HEADLINES, source: 'mock' });
};

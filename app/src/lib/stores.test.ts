import { describe, it, expect } from 'vitest';
import { buildTemplateUrl, createParamStore } from './stores';
import { getTemplate } from './templates';
import { get } from 'svelte/store';

describe('buildTemplateUrl', () => {
	it('builds correct URL with params as query string', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			headline: 'Test App',
			layout: 'text-above',
		});

		expect(url).toBe(
			'/templates/gradient-bezel/index.html?headline=Test+App&layout=text-above'
		);
	});

	it('strips # from gradient_from and gradient_to color values', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			gradient_from: '#D4A574',
			gradient_to: '#328983',
		});

		expect(url).toContain('gradient_from=D4A574');
		expect(url).toContain('gradient_to=328983');
		expect(url).not.toContain('%23');
	});

	it('does NOT strip # from gradient_angle', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			gradient_angle: 135,
		});

		expect(url).toContain('gradient_angle=135');
	});

	it('omits empty and undefined values', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			headline: 'Hello',
			src: '',
		});

		expect(url).toContain('headline=Hello');
		expect(url).not.toContain('src=');
	});

	it('handles edge case: no params', () => {
		const url = buildTemplateUrl('gradient-bezel', {});
		expect(url).toBe('/templates/gradient-bezel/index.html?');
	});
});

describe('createParamStore', () => {
	it('initializes with schema defaults', () => {
		const schema = getTemplate('gradient-bezel')!;
		const store = createParamStore(schema);
		const values = get(store);

		expect(values.headline).toBe('Your App Name');
		expect(values.layout).toBe('text-above');
		expect(values.gradient_from).toBe('#D4A574');
		expect(values.gradient_angle).toBe(135);
	});

	it('reset() restores defaults', () => {
		const schema = getTemplate('gradient-bezel')!;
		const store = createParamStore(schema);

		store.set({ headline: 'Changed', layout: 'split' });
		expect(get(store).headline).toBe('Changed');

		store.reset();
		expect(get(store).headline).toBe('Your App Name');
		expect(get(store).layout).toBe('text-above');
	});

	it('mergeParams() merges without losing existing keys', () => {
		const schema = getTemplate('gradient-bezel')!;
		const store = createParamStore(schema);

		store.mergeParams({ headline: 'New Title' });
		const values = get(store);

		expect(values.headline).toBe('New Title');
		expect(values.layout).toBe('text-above');
		expect(values.gradient_from).toBe('#D4A574');
	});
});

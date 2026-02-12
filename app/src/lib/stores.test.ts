import { describe, it, expect } from 'vitest';
import { buildTemplateUrl } from './stores';
import { configToParams, paramsToConfig, DEFAULT_CONFIG } from './layers';

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

	it('strips # from hex color values', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			gradient_from: '#D4A574',
			gradient_to: '#328983',
			bg_color: '#6C5CE7',
			text_color: '#FFFFFF',
		});

		expect(url).toContain('gradient_from=D4A574');
		expect(url).toContain('gradient_to=328983');
		expect(url).toContain('bg_color=6C5CE7');
		expect(url).toContain('text_color=FFFFFF');
		expect(url).not.toContain('%23');
	});

	it('does not strip # from non-hex values', () => {
		const url = buildTemplateUrl('gradient-bezel', {
			gradient_angle: 135,
			headline: '#hashtag',
		});

		expect(url).toContain('gradient_angle=135');
		expect(url).toContain('headline=%23hashtag');
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

describe('configToParams', () => {
	it('flattens default config to params', () => {
		const params = configToParams(DEFAULT_CONFIG);
		expect(params.bg_type).toBe('linear-gradient');
		expect(params.bg_color1).toBe('#D4A574');
		expect(params.bg_angle).toBe(135);
		expect(params.frame_style).toBe('bezel');
		expect(params.device).toBe('iphone');
		expect(params.layout).toBe('text-above');
		expect(params.headline).toBe('Your App Name');
		expect(params.font_color).toBe('#FFFFFF');
		expect(params.shadow).toBe('medium');
		expect(params.noise).toBe('0');
	});
});

describe('paramsToConfig', () => {
	it('round-trips through configToParams', () => {
		const params = configToParams(DEFAULT_CONFIG);
		const config = paramsToConfig(params);
		expect(config.background.type).toBe(DEFAULT_CONFIG.background.type);
		expect(config.background.color1).toBe(DEFAULT_CONFIG.background.color1);
		expect(config.device.style).toBe(DEFAULT_CONFIG.device.style);
		expect(config.layout.type).toBe(DEFAULT_CONFIG.layout.type);
		expect(config.typography.headline).toBe(DEFAULT_CONFIG.typography.headline);
		expect(config.effects.shadow).toBe(DEFAULT_CONFIG.effects.shadow);
	});

	it('round-trips perspective fields', () => {
		const config = {
			...DEFAULT_CONFIG,
			perspective: { preset: 'hero-shot' as const, rotateX: 12, rotateY: -20, rotateZ: 5, perspective: 800 },
		};
		const params = configToParams(config);
		const result = paramsToConfig(params);
		expect(result.perspective.preset).toBe('hero-shot');
		expect(result.perspective.rotateX).toBe(12);
		expect(result.perspective.rotateY).toBe(-20);
		expect(result.perspective.rotateZ).toBe(5);
		expect(result.perspective.perspective).toBe(800);
	});

	it('round-trips panoramic fields', () => {
		const config = {
			...DEFAULT_CONFIG,
			layout: { type: 'text-above' as const, panoramic: true, totalSlides: 5 },
		};
		const params = configToParams(config);
		const result = paramsToConfig(params);
		expect(result.layout.panoramic).toBe(true);
		expect(result.layout.totalSlides).toBe(5);
	});

	it('defaults panoramic to false when not set', () => {
		const params = configToParams(DEFAULT_CONFIG);
		const result = paramsToConfig(params);
		expect(result.layout.panoramic).toBe(false);
		expect(result.layout.totalSlides).toBe(3);
	});

	it('defaults perspective to flat when not set', () => {
		const result = paramsToConfig({});
		expect(result.perspective.preset).toBe('flat');
		expect(result.perspective.rotateX).toBe(0);
		expect(result.perspective.rotateY).toBe(0);
		expect(result.perspective.rotateZ).toBe(0);
		expect(result.perspective.perspective).toBe(1000);
	});
});

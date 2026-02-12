import { describe, it, expect } from 'vitest';
import { TEMPLATES, DEVICE_SIZES, getTemplate, getTemplateDefaults } from './templates';

describe('getTemplate', () => {
	it('returns correct template by id', () => {
		const template = getTemplate('gradient-bezel');
		expect(template).toBeDefined();
		expect(template!.id).toBe('gradient-bezel');
		expect(template!.name).toBe('Gradient + Device Bezel');
	});

	it('returns undefined for unknown id', () => {
		expect(getTemplate('nonexistent')).toBeUndefined();
	});
});

describe('getTemplateDefaults', () => {
	it('extracts defaults from template schema', () => {
		const template = getTemplate('gradient-bezel')!;
		const defaults = getTemplateDefaults(template);

		expect(defaults.headline).toBe('Your App Name');
		expect(defaults.layout).toBe('text-above');
		expect(defaults.gradient_from).toBe('#D4A574');
		expect(defaults.gradient_to).toBe('#328983');
		expect(defaults.gradient_angle).toBe(135);
	});

	it('omits params without defaults', () => {
		const template = getTemplate('gradient-bezel')!;
		const defaults = getTemplateDefaults(template);

		expect(defaults).not.toHaveProperty('src');
	});

	it('works for each template', () => {
		for (const template of TEMPLATES) {
			const defaults = getTemplateDefaults(template);
			expect(typeof defaults).toBe('object');

			for (const [key, value] of Object.entries(defaults)) {
				expect(template.params[key].default).toBe(value);
			}
		}
	});
});

describe('TEMPLATES', () => {
	const validParamTypes = ['text', 'enum', 'color', 'number', 'image'];

	it('each template has required fields', () => {
		for (const template of TEMPLATES) {
			expect(template.id).toBeTruthy();
			expect(template.name).toBeTruthy();
			expect(template.description).toBeTruthy();
			expect(Object.keys(template.params).length).toBeGreaterThan(0);
		}
	});

	it('all param types are valid', () => {
		for (const template of TEMPLATES) {
			for (const [key, param] of Object.entries(template.params)) {
				expect(validParamTypes, `${template.id}.${key} has invalid type "${param.type}"`).toContain(
					param.type
				);
			}
		}
	});

	it('enum params have options', () => {
		for (const template of TEMPLATES) {
			for (const [key, param] of Object.entries(template.params)) {
				if (param.type === 'enum') {
					expect(param.options, `${template.id}.${key} enum missing options`).toBeDefined();
					expect(param.options!.length, `${template.id}.${key} enum has no options`).toBeGreaterThan(
						0
					);
				}
			}
		}
	});
});

describe('DEVICE_SIZES', () => {
	it('all entries have positive width and height', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.width).toBeGreaterThan(0);
			expect(size.height).toBeGreaterThan(0);
		}
	});

	it('all entries have a valid device string', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.device).toBeTruthy();
			expect(typeof size.device).toBe('string');
		}
	});

	it('all entries have a label', () => {
		for (const size of DEVICE_SIZES) {
			expect(size.label).toBeTruthy();
		}
	});
});

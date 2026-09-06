import { describe, expect, it } from 'vitest';
import { clearBrokenPanorama, parseProject } from './project';
import { createBlank, createDemo, STYLES } from './studio';
import { DEVICES } from './devices';
import type { Composition, ImageRef } from './types';

const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const WEBP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=';
const JPEG =
	'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
const image = (blobUrl = PNG): ImageRef => ({
	id: 'uploaded-image',
	blobUrl,
	naturalWidth: 1,
	naturalHeight: 1
});
const roundTrip = (project: Composition) => parseProject(JSON.stringify(project));

function corrupt(path: string, value: unknown): string {
	const input = JSON.parse(JSON.stringify(createDemo()));
	const parts = path.split('.');
	let target = input;
	for (const part of parts.slice(0, -1)) target = target[part];
	target[parts.at(-1)!] = value;
	return JSON.stringify(input);
}

describe('project import and persistence boundary', () => {
	it('round-trips a blank campaign and the full connected Billington demo', () => {
		for (const project of [createBlank(), createDemo()]) {
			expect(roundTrip(project)).toEqual(project);
			expect(roundTrip(roundTrip(project))).toEqual(project);
		}
	});

	it('round-trips every supported style and device without rewriting content', () => {
		for (const style of STYLES) {
			for (const device of Object.values(DEVICES)) {
				const project = createDemo();
				project.style = style.id;
				project.device = device.id;
				project.slides = project.slides.map((slide) => ({ ...slide, device: device.id }));
				expect(roundTrip(project)).toEqual(project);
			}
		}
	});

	it.each([PNG, WEBP, JPEG])('retains uploaded raster data in every image slot', (url) => {
		const project = createDemo();
		const uploaded = image(url);
		project.slides[0].primaryImage = uploaded;
		project.slides[0].continuity.outgoing = uploaded;
		project.slides[1].continuity.incoming = uploaded;
		project.panorama!.image = uploaded;
		const imported = roundTrip(project);
		expect(imported).toEqual(project);
		expect(JSON.stringify(imported)).toContain(url);
	});

	it('preserves optional model controls used in older compatible projects', () => {
		const project = createBlank();
		project.slides[0].background = {
			kind: 'mesh',
			colors: ['#012345', '#abcdef'],
			angle: -45,
			noise: 0.25
		};
		project.slides[0].effects = { shadow: 'soft', glow: 0.5 };
		project.slides[0].continuity = { inset: -50, incoming: image() };
		project.slides[0].typography.subtitle = undefined;
		expect(roundTrip(project)).toEqual(project);
		expect(roundTrip(roundTrip(project))).toEqual(project);
	});

	it('returns only known fields, including inside image and typography objects', () => {
		const expected = roundTrip(createDemo());
		const input = JSON.parse(JSON.stringify(expected));
		input.externalAsset = 'https://example.com/private-image';
		Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true });
		input.slides[0].background.url = 'https://example.com/background';
		input.slides[0].typography.html = '<script>example</script>';
		input.slides[0].primaryImage.externalUrl = 'https://example.com/image';
		const parsed = parseProject(JSON.stringify(input));
		expect(parsed).toEqual(expected);
		expect(JSON.stringify(parsed)).not.toMatch(
			/externalAsset|externalUrl|polluted|example\.com|<script>/
		);
		expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
	});

	it.each(['', '{', 'null', '[]', '42', '"project"', '{"version":2}'])(
		'rejects malformed or unsupported input %s with a project error',
		(input) => {
			expect(() => parseProject(input)).toThrow('Choose a valid Appshot project');
		}
	);

	it.each([
		['slides', []],
		['slides', Array(11).fill(null)],
		['slides.0', null],
		['slides.0', []],
		['device', 'toString'],
		['device', {}],
		['style', 'unknown'],
		['name', 42],
		['name', 'x'.repeat(201)],
		['accent', 'red'],
		['continuityMode', 'anything'],
		['slides.0.id', ''],
		['slides.0.id', '   '],
		['slides.0.device', 'ipad-13'],
		['slides.0.label', {}],
		['slides.0.background', null],
		['slides.0.background.colors', []],
		['slides.0.background.colors', ['url(https://example.com)']],
		['slides.0.background.colors', Array(9).fill('#123456')],
		['slides.0.background.kind', 'image'],
		['slides.0.background.angle', 361],
		['slides.0.background.noise', -0.1],
		['slides.0.effects', null],
		['slides.0.effects.shadow', 'giant'],
		['slides.0.effects.glow', 2],
		['slides.0.continuity', null],
		['slides.0.continuity.inset', 9000],
		['slides.0.typography', null],
		['slides.0.typography.headline', 'x'.repeat(181)],
		['slides.0.typography.subtitle', 'x'.repeat(301)],
		['slides.0.typography.fontWeight', 999],
		['slides.0.typography.fontColor', '#123'],
		['slides.0.frame', 'unknown'],
		['slides.0.layout', {}],
		['slides.0.tilt', null],
		['slides.0.tilt', 31],
		['slides.0.scale', 0],
		['slides.0.fontScale', '1'],
		['slides.0.fontScale', 1.31],
		['slides.0.badge', 'x'.repeat(81)],
		['slides.0.primaryImage', null],
		['panorama', null],
		['panorama.offset', 401],
		['panorama.scale', 1.41],
		['panorama.tilt', -31]
	])('rejects corrupt field %s', (path, value) => {
		expect(() => parseProject(corrupt(path as string, value))).toThrow(Error);
	});

	it.each([
		'https://example.com/image.png',
		'//example.com/image.png',
		'javascript:alert(1)',
		'file:///tmp/image.png',
		'blob:https://appshot.test/temporary',
		'/api/image',
		'/demo/../../image.png',
		'/demo/unknown.png',
		'/demo/home.png?url=https://example.com',
		'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
		'data:text/html;base64,PHNjcmlwdD4=',
		'data:image/png;base64,',
		'data:image/png;base64,not an image',
		'data:image/png;base64,AAAAAAAAAAAAAAAA',
		PNG.replace('image/png', 'image/jpeg'),
		PNG + '!',
		PNG.replace('iVBOR', 'iV=OR')
	])('rejects unsafe or invalid image URL %s', (url) => {
		for (const path of [
			'slides.0.primaryImage',
			'slides.0.continuity.incoming',
			'slides.0.continuity.outgoing',
			'panorama.image'
		]) {
			expect(() => parseProject(corrupt(path, image(url)))).toThrow(Error);
		}
	});

	it.each([
		[0, 100],
		[1.5, 100],
		[8001, 100],
		[8000, 8000],
		[100, null]
	])('rejects unsafe image dimensions %s × %s', (width, height) => {
		const input = { ...image(), naturalWidth: width, naturalHeight: height };
		expect(() => parseProject(corrupt('slides.0.primaryImage', input))).toThrow(Error);
	});

	it('rejects duplicate screenshot identifiers and invalid panorama adjacency', () => {
		const duplicate = createDemo();
		duplicate.slides[1].id = duplicate.slides[0].id;
		expect(() => roundTrip(duplicate)).toThrow(Error);
		for (const relation of ['same', 'reversed', 'missing', 'nonadjacent']) {
			const project = createDemo();
			if (relation === 'same') project.panorama!.rightId = project.panorama!.leftId;
			if (relation === 'reversed')
				[project.panorama!.leftId, project.panorama!.rightId] = [
					project.panorama!.rightId,
					project.panorama!.leftId
				];
			if (relation === 'missing') project.panorama!.leftId = 'missing';
			if (relation === 'nonadjacent') project.panorama!.rightId = project.slides[2].id;
			expect(() => roundTrip(project)).toThrow('adjacent');
		}
	});

	it('counts the project limit in UTF-8 bytes, including ignored fields', () => {
		const oversized = JSON.stringify({ notes: '界'.repeat(21 * 1024 * 1024) });
		expect(oversized.length).toBeLessThan(60 * 1024 * 1024);
		expect(() => parseProject(oversized)).toThrow('60 MB');
	});

	it('rejects image data over the upload size limit', () => {
		const oversized = PNG.slice(0, PNG.indexOf(',') + 1) + 'A'.repeat(16 * 1024 * 1024 + 4);
		expect(() => parseProject(corrupt('slides.0.primaryImage', image(oversized)))).toThrow('12 MB');
	});
});

describe('repair after editing a connected pair', () => {
	it('preserves an intact pair and campaigns with no pair', () => {
		for (const project of [createDemo(), createBlank()])
			expect(clearBrokenPanorama(project)).toBe(project);
	});

	it('disconnects a removed or reordered neighbor without mutating the input', () => {
		for (const reorder of [false, true]) {
			const project = createDemo();
			if (reorder) [project.slides[1], project.slides[2]] = [project.slides[2], project.slides[1]];
			else project.slides.shift();
			const previous = structuredClone(project);
			const repaired = clearBrokenPanorama(project);
			expect(repaired.panorama).toBeUndefined();
			expect(repaired.continuityMode).toBe('none');
			expect(project).toEqual(previous);
			expect(() => roundTrip(repaired)).not.toThrow();
		}
	});
});

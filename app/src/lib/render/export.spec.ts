import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetOf, campaign, patternPixels, pngFile } from './__fixtures__/export';
import type { Composition, ImageRef } from '../model/types';
import { parseProject } from '../model/project';
import { migrateCompositionToV2, parseProjectV2 } from '../model/migrate';
import { DEVICES } from '../model/devices';
import { createSlide } from '../model/studio';
import { portableComposition, projectTextFromFile } from './export';
import { createZip } from './zip';
import { dataUrlFromBytes } from '../model/assets';

const PNG = pngFile(2, 2, patternPixels(2, 2));

function ref(id: string, blobUrl: string, naturalWidth = 1320, naturalHeight = 2868): ImageRef {
	return { id, blobUrl, naturalWidth, naturalHeight };
}

function composition(): Composition {
	const slide = createSlide(0, ref('capture', 'blob:capture'));
	return {
		version: 1,
		name: 'Sample App',
		device: 'iphone-6.9',
		style: 'the-check',
		accent: '#F2CE6B',
		continuityMode: 'none',
		slides: [
			{
				...slide,
				check: { canvas: 'teal', preset: 'detail', panel: false, wordmark: false },
				layers: [
					{
						id: 'real-ui',
						kind: 'source-crop',
						image: ref('capture', 'blob:capture'),
						crop: { x: 0, y: 0, width: 40, height: 40 },
						x: 10,
						y: 900,
						scale: 1.2,
						radius: 8,
						shadow: 'soft'
					},
					{
						id: 'leaf-mark',
						kind: 'art',
						image: ref('sample-mark', '/sample/mark.png', 640, 640),
						crop: { x: 2, y: 2, width: 40, height: 40 },
						x: 10,
						y: 100,
						scale: 1,
						sampling: 'pixelated'
					}
				]
			}
		]
	};
}

describe('portableComposition keeps everything a v1 project can hold', () => {
	afterEach(() => vi.unstubAllGlobals());

	const stubFetch = (body: Uint8Array = PNG) => {
		const fetchMock = vi.fn(async () => new Response(body.slice()));
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	};

	it('embeds layers and sample art, so they survive saving and reopening', async () => {
		stubFetch();
		const portable = await portableComposition(composition());
		const [slide] = portable.slides;
		expect(slide.primaryImage?.blobUrl).toMatch(/^data:image\/png;base64,/);
		expect(slide.layers?.map((layer) => layer.id)).toEqual(['real-ui', 'leaf-mark']);
		for (const layer of slide.layers ?? []) expect(layer.image.blobUrl).toMatch(/^data:image\/png/);
		expect(slide.layers?.[0]).toMatchObject({ radius: 8, shadow: 'soft', scale: 1.2 });
		expect(slide.layers?.[1]).toMatchObject({ sampling: 'pixelated', crop: { x: 2, y: 2 } });
		expect(slide.check?.panel).toBe(false);
		const reopened = parseProject(JSON.stringify(portable));
		expect(reopened).toEqual(portable);
	});

	it('fetches an image once, however many places use it', async () => {
		const fetchMock = stubFetch();
		await portableComposition(composition());
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('leaves the document it was given untouched', async () => {
		stubFetch();
		const original = composition();
		const before = structuredClone(original);
		await portableComposition(original);
		expect(original).toEqual(before);
	});

	it('keeps sample origin when embedded legacy images are reopened as a campaign', async () => {
		stubFetch();
		const original = composition();
		original.slides[0].primaryImage = ref('sample-screen', '/sample/today.png');
		const portable = await portableComposition(original);
		const reopened = migrateCompositionToV2(parseProject(JSON.stringify(portable)));
		expect(portable.slides[0].primaryImage).toMatchObject({ sample: true });
		expect(portable.slides[0].layers?.[1].image).toMatchObject({ sample: true });
		// The mock returns identical bytes for each fetch; migration correctly deduplicates them.
		const assets = Object.values(reopened.assets);
		expect(assets).toHaveLength(1);
		expect(assets[0].provenance?.tool).toBe('appshot-sample');
	});

	it('retains sample origin when a later legacy reference shares an earlier image’s bytes', () => {
		const url = dataUrlFromBytes(PNG, 'image/png');
		const original = {
			...composition(),
			slides: [
				createSlide(0, ref('plain', url, 2, 2)),
				createSlide(1, { ...ref('later-sample', url, 2, 2), sample: true as const })
			]
		};
		const migrated = migrateCompositionToV2(original);
		const assets = Object.values(migrated.assets);
		expect(assets).toHaveLength(1);
		expect(assets[0].provenance?.tool).toBe('appshot-sample');
	});

	it('says which image is missing rather than saving a broken project', async () => {
		vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }));
		await expect(portableComposition(composition())).rejects.toThrow(
			/original screenshot is missing/
		);
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch');
		});
		await expect(portableComposition(composition())).rejects.toThrow(
			/original screenshot is missing/
		);
	});

	it('refuses bytes that are not an image', async () => {
		stubFetch(new TextEncoder().encode('<html>404</html>'));
		await expect(portableComposition(composition())).rejects.toThrow(/could not be saved/);
	});
});

describe('Open project can read an exported ZIP', () => {
	const encoder = new TextEncoder();

	it('finds project.json inside an exported archive', async () => {
		const body = JSON.stringify({ version: 2, assets: { x: assetOf('x', 10, 10) } });
		const zip = new Blob([
			createZip([
				{ name: 'a/01.png', data: PNG },
				{ name: 'project.json', data: encoder.encode(body) }
			])
		]);
		expect(await projectTextFromFile(zip)).toBe(body);
	});

	it('passes a plain project file straight through', async () => {
		const legacy = JSON.stringify({ version: 1, device: DEVICES['iphone-6.9'].id });
		expect(await projectTextFromFile(new Blob([legacy]))).toBe(legacy);
	});

	it('explains a ZIP with no project in it', async () => {
		const zip = new Blob([createZip([{ name: 'a/01.png', data: PNG }])]);
		await expect(projectTextFromFile(zip)).rejects.toThrow(/has no project\.json/);
	});

	it('feeds a campaign that opens through parseProjectV2', async () => {
		const project = campaign(['iphone-6.9'], 1);
		const zip = new Blob([
			createZip([{ name: 'project.json', data: encoder.encode(JSON.stringify(project)) }])
		]);
		const reopened = parseProjectV2(await projectTextFromFile(zip));
		expect(reopened.slides.map((slide) => slide.id)).toEqual(['s1']);
		expect(Object.keys(reopened.assets)).toEqual(Object.keys(project.assets));
	});
});

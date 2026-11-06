import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	createZip,
	crc32,
	isZipFile,
	readZipDirectory,
	readZipEntry,
	ZipLimitError,
	zipPathError,
	ZipWriter
} from './zip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
describe('portable ZIP archive', () => {
	it('matches the independent published CRC-32 check vector', () => {
		expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});
	it('writes readable local entries and a central directory with correct offsets', () => {
		const entries = [
			{ name: '01.png', data: new Uint8Array([137, 80, 78, 71, 0, 255]) },
			{ name: 'project.json', data: encoder.encode('{"name":"Café"}') }
		];
		const bytes = createZip(entries);
		const view = new DataView(bytes.buffer);
		let offset = 0;
		const offsets: number[] = [];
		for (const entry of entries) {
			offsets.push(offset);
			expect(view.getUint32(offset, true)).toBe(0x04034b50);
			expect(view.getUint16(offset + 8, true)).toBe(0); // STORE
			const size = view.getUint32(offset + 18, true);
			const nameLength = view.getUint16(offset + 26, true);
			expect(decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength))).toBe(entry.name);
			expect(bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + size)).toEqual(
				entry.data
			);
			offset += 30 + nameLength + size;
		}
		const centralStart = offset;
		entries.forEach((entry, index) => {
			expect(view.getUint32(offset, true)).toBe(0x02014b50);
			expect(view.getUint32(offset + 42, true)).toBe(offsets[index]);
			expect(view.getUint32(offset + 16, true)).toBe(crc32(entry.data));
			offset += 46 + encoder.encode(entry.name).length;
		});
		expect(view.getUint32(offset, true)).toBe(0x06054b50);
		expect(view.getUint32(offset + 16, true)).toBe(centralStart);
		expect(view.getUint16(offset + 10, true)).toBe(2);
		expect(offset + 22).toBe(bytes.length);
	});
	it('sets UTF-8 names and is byte-deterministic', () => {
		const entries = [{ name: 'café.png', data: encoder.encode('test') }];
		const first = createZip(entries);
		expect(new DataView(first.buffer).getUint16(6, true)).toBe(0x0800);
		expect(createZip(entries)).toEqual(first);
	});
});

describe('ZipWriter', () => {
	const entries = [
		{ name: 'folder/01.png', data: new Uint8Array([137, 80, 78, 71, 0, 255]) },
		{ name: 'project.json', data: encoder.encode('{"name":"Café"}') }
	];

	it('writes the same bytes as createZip, entry by entry', async () => {
		const writer = new ZipWriter();
		for (const entry of entries) writer.add(entry.name, entry.data);
		const blob = writer.finish();
		expect(blob.type).toBe('application/zip');
		expect(new Uint8Array(await blob.arrayBuffer())).toEqual(createZip(entries));
		expect(writer.fileCount).toBe(2);
	});

	it('checksums a Blob entry across its pieces the same way', async () => {
		// Larger than one checksum piece, so the Blob path really continues its checksum.
		const data = new Uint8Array(5 * 1024 * 1024).map((_, index) => index * 31);
		const writer = new ZipWriter();
		await writer.addBlob('big.bin', new Blob([data]));
		const read = await readZipEntry(writer.finish(), 'big.bin');
		expect(Buffer.compare(read!, data)).toBe(0);
		expect(crc32(data.subarray(5), crc32(data.subarray(0, 5)))).toBe(crc32(data));
	});

	it('refuses a file past its limit and can still finish without it', async () => {
		const writer = new ZipWriter({ maxBytes: 200 });
		writer.add('kept.txt', encoder.encode('kept'));
		expect(() => writer.add('big.bin', new Uint8Array(500))).toThrow(ZipLimitError);
		expect(() => writer.add('big.bin', new Uint8Array(500))).toThrow(/big\.bin/);
		const blob = writer.finish();
		expect((await readZipDirectory(blob)).map((entry) => entry.name)).toEqual(['kept.txt']);
	});

	it('keeps room for what must still fit', () => {
		const writer = new ZipWriter({ maxBytes: 200 });
		expect(() => writer.add('a.bin', new Uint8Array(10), 150)).toThrow(ZipLimitError);
		writer.add('a.bin', new Uint8Array(10));
	});
});

describe('portable ZIP paths', () => {
	it.each([
		['../escape.png'],
		['folder/../escape.png'],
		['/absolute.png'],
		['folder//double.png'],
		['back\\slash.png'],
		['C:/drive.png'],
		['trailing.dot./01.png'],
		['aux/01.png'],
		['CON.txt'],
		['control\u0001.png'],
		['question?.png'],
		[''],
		[`${'long-name/'.repeat(30)}01.png`]
	])('refuses %s', (path) => {
		expect(zipPathError(path)).toEqual(expect.any(String));
		expect(() => createZip([{ name: path, data: new Uint8Array() }])).toThrow();
		expect(() => new ZipWriter().add(path, new Uint8Array())).toThrow();
	});

	it.each([
		['01.png'],
		['iphone-duo/outer-1398x2034-portrait/01-the-bill-1398x2034.png'],
		['ipad-12.9/2048x2732-portrait/DRAFT-01-café-2048x2732.png']
	])('accepts %s', (path) => {
		expect(zipPathError(path)).toBeNull();
	});

	it('refuses the same path twice, even in another case', () => {
		const writer = new ZipWriter();
		writer.add('Folder/01.png', new Uint8Array());
		expect(() => writer.add('folder/01.PNG', new Uint8Array())).toThrow(/twice/);
		expect(() =>
			createZip([
				{ name: 'a.png', data: new Uint8Array() },
				{ name: 'A.PNG', data: new Uint8Array() }
			])
		).toThrow(/twice/);
	});
});

describe('reading a ZIP back', () => {
	const archive = () =>
		new Blob([
			createZip([
				{ name: 'a/01.png', data: new Uint8Array([1, 2, 3]) },
				{ name: 'project.json', data: encoder.encode('{"version":2}') }
			])
		]);

	it('lists the directory and returns checked bytes', async () => {
		const zip = archive();
		expect(await isZipFile(zip)).toBe(true);
		expect((await readZipDirectory(zip)).map((entry) => entry.name)).toEqual([
			'a/01.png',
			'project.json'
		]);
		expect(await readZipEntry(zip, 'a/01.png')).toEqual(new Uint8Array([1, 2, 3]));
		expect(await readZipEntry(zip, 'missing.json')).toBeNull();
	});

	it('reads a file someone re-zipped with compression', async () => {
		const name = encoder.encode('project.json');
		const data = encoder.encode('{"version":2,"name":"reopened"}');
		const packed = deflateRawSync(data);
		const local = new Uint8Array(30 + name.length + packed.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(8, 8, true);
		localView.setUint32(18, packed.length, true);
		localView.setUint32(22, data.length, true);
		localView.setUint16(26, name.length, true);
		local.set(name, 30);
		local.set(packed, 30 + name.length);
		const central = new Uint8Array(46 + name.length + 22);
		const view = new DataView(central.buffer);
		view.setUint32(0, 0x02014b50, true);
		view.setUint16(10, 8, true);
		view.setUint32(16, crc32(data), true);
		view.setUint32(20, packed.length, true);
		view.setUint32(24, data.length, true);
		view.setUint16(28, name.length, true);
		central.set(name, 46);
		view.setUint32(46 + name.length, 0x06054b50, true);
		view.setUint16(46 + name.length + 8, 1, true);
		view.setUint16(46 + name.length + 10, 1, true);
		view.setUint32(46 + name.length + 12, 46 + name.length, true);
		view.setUint32(46 + name.length + 16, local.length, true);
		const zip = new Blob([local, central]);
		expect(new TextDecoder().decode((await readZipEntry(zip, 'project.json'))!)).toContain(
			'reopened'
		);
	});

	it('notices damaged bytes through the checksum', async () => {
		const bytes = createZip([{ name: 'a.txt', data: encoder.encode('hello') }]);
		bytes[30 + 'a.txt'.length] ^= 0xff;
		await expect(readZipEntry(new Blob([bytes]), 'a.txt')).rejects.toThrow(/damaged/);
	});

	it('explains a file that is not a ZIP', async () => {
		const notZip = new Blob([encoder.encode('{"version":2}')]);
		expect(await isZipFile(notZip)).toBe(false);
		await expect(readZipDirectory(notZip)).rejects.toThrow(/not a ZIP/);
	});
});

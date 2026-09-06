import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from './zip';

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

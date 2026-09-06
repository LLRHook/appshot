/** Dependency-free ZIP writer. Uses STORE entries (PNG is already compressed). */
export interface ZipEntry {
	name: string;
	data: Uint8Array;
}
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
	return value >>> 0;
});
export function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
	if (entries.length > 65535) throw new Error('Too many ZIP entries.');
	const names = entries.map((entry) => encoder.encode(entry.name));
	let localSize = 0;
	let centralSize = 0;
	entries.forEach((entry, index) => {
		if (names[index].length > 65535 || entry.data.length > 0xffffffff)
			throw new Error('ZIP entry is too large.');
		localSize += 30 + names[index].length + entry.data.length;
		centralSize += 46 + names[index].length;
	});
	if (localSize + centralSize > 0xffffffff) throw new Error('Campaign exceeds the ZIP size limit.');
	const output = new Uint8Array(localSize + centralSize + 22);
	const view = new DataView(output.buffer);
	const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
	const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
	let localOffset = 0;
	let centralOffset = localSize;
	entries.forEach((entry, index) => {
		const name = names[index];
		const checksum = crc32(entry.data);
		u32(localOffset, 0x04034b50);
		u16(localOffset + 4, 20);
		u16(localOffset + 6, 0x0800); // UTF-8 names
		u16(localOffset + 12, 0x21); // 1980-01-01, deterministic
		u32(localOffset + 14, checksum);
		u32(localOffset + 18, entry.data.length);
		u32(localOffset + 22, entry.data.length);
		u16(localOffset + 26, name.length);
		output.set(name, localOffset + 30);
		output.set(entry.data, localOffset + 30 + name.length);
		u32(centralOffset, 0x02014b50);
		u16(centralOffset + 4, 20);
		u16(centralOffset + 6, 20);
		u16(centralOffset + 8, 0x0800);
		u16(centralOffset + 14, 0x21);
		u32(centralOffset + 16, checksum);
		u32(centralOffset + 20, entry.data.length);
		u32(centralOffset + 24, entry.data.length);
		u16(centralOffset + 28, name.length);
		u32(centralOffset + 42, localOffset);
		output.set(name, centralOffset + 46);
		localOffset += 30 + name.length + entry.data.length;
		centralOffset += 46 + name.length;
	});
	u32(centralOffset, 0x06054b50);
	u16(centralOffset + 8, entries.length);
	u16(centralOffset + 10, entries.length);
	u32(centralOffset + 12, centralSize);
	u32(centralOffset + 16, localSize);
	return output;
}

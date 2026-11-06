/**
 * Dependency-free ZIP writer and reader. Writes STORE entries, because PNG is already compressed,
 * with a fixed date, so the same files make the same archive.
 */
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

/** CRC-32. Pass the previous result as `seed` when the data arrives in pieces. */
export function crc32(data: Uint8Array, seed = 0): number {
	let crc = (seed ^ 0xffffffff) >>> 0;
	for (let index = 0; index < data.length; index++)
		crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------------------- portable paths */

const MAX_PATH_BYTES = 200;
const MAX_ENTRIES = 65535;
const MAX_ARCHIVE_BYTES = 0xffffffff;
// eslint-disable-next-line no-control-regex -- control characters are what this rejects
const UNSAFE_CHARACTERS = /[\\:*?"<>|\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why a path cannot unpack safely on every common system, or null when it can. */
export function zipPathError(path: string): string | null {
	if (encoder.encode(path).length > MAX_PATH_BYTES) return `"${path}" is too long for a ZIP path.`;
	if (UNSAFE_CHARACTERS.test(path)) return `"${path}" has characters a ZIP path cannot use.`;
	for (const segment of path.split('/')) {
		if (!segment || segment === '.' || segment === '..')
			return `"${path}" is not a relative ZIP path.`;
		if (segment.endsWith('.') || segment.endsWith(' ') || WINDOWS_RESERVED.test(segment))
			return `"${path}" has a folder or file name Windows cannot create.`;
	}
	return null;
}

function assertNewPath(path: string, seen: Set<string>): void {
	const problem = zipPathError(path);
	if (problem) throw new Error(problem);
	// Case-insensitive file systems would otherwise lose one of the two.
	const key = path.toLowerCase();
	if (seen.has(key)) throw new Error(`"${path}" appears twice in the ZIP.`);
	seen.add(key);
}

/* -------------------------------------------------------------------------------------- records */

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_NAMES = 0x0800;
const FIXED_DATE = 0x21; // 1980-01-01, deterministic
const ZIP_VERSION = 20;

function writeLocalHeader(
	view: DataView,
	at: number,
	name: Uint8Array,
	crc: number,
	size: number
): void {
	view.setUint32(at, LOCAL_SIGNATURE, true);
	view.setUint16(at + 4, ZIP_VERSION, true);
	view.setUint16(at + 6, UTF8_NAMES, true);
	view.setUint16(at + 12, FIXED_DATE, true);
	view.setUint32(at + 14, crc, true);
	view.setUint32(at + 18, size, true);
	view.setUint32(at + 22, size, true);
	view.setUint16(at + 26, name.length, true);
	new Uint8Array(view.buffer).set(name, at + LOCAL_HEADER_BYTES);
}

function writeCentralHeader(
	view: DataView,
	at: number,
	name: Uint8Array,
	crc: number,
	size: number,
	offset: number
): void {
	view.setUint32(at, CENTRAL_SIGNATURE, true);
	view.setUint16(at + 4, ZIP_VERSION, true);
	view.setUint16(at + 6, ZIP_VERSION, true);
	view.setUint16(at + 8, UTF8_NAMES, true);
	view.setUint16(at + 14, FIXED_DATE, true);
	view.setUint32(at + 16, crc, true);
	view.setUint32(at + 20, size, true);
	view.setUint32(at + 24, size, true);
	view.setUint16(at + 28, name.length, true);
	view.setUint32(at + 42, offset, true);
	new Uint8Array(view.buffer).set(name, at + CENTRAL_HEADER_BYTES);
}

function writeEndRecord(
	view: DataView,
	at: number,
	count: number,
	centralSize: number,
	centralOffset: number
): void {
	view.setUint32(at, END_SIGNATURE, true);
	view.setUint16(at + 8, count, true);
	view.setUint16(at + 10, count, true);
	view.setUint32(at + 12, centralSize, true);
	view.setUint32(at + 16, centralOffset, true);
}

/** An archive in one array. For a whole campaign use `ZipWriter`, which holds far less memory. */
export function createZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
	if (entries.length > MAX_ENTRIES) throw new Error('Too many ZIP entries.');
	const seen = new Set<string>();
	entries.forEach((entry) => assertNewPath(entry.name, seen));
	const names = entries.map((entry) => encoder.encode(entry.name));
	let localSize = 0;
	let centralSize = 0;
	entries.forEach((entry, index) => {
		if (entry.data.length > MAX_ARCHIVE_BYTES) throw new Error('ZIP entry is too large.');
		localSize += LOCAL_HEADER_BYTES + names[index].length + entry.data.length;
		centralSize += CENTRAL_HEADER_BYTES + names[index].length;
	});
	if (localSize + centralSize > MAX_ARCHIVE_BYTES)
		throw new Error('Campaign exceeds the ZIP size limit.');
	const output = new Uint8Array(localSize + centralSize + END_RECORD_BYTES);
	const view = new DataView(output.buffer);
	let localOffset = 0;
	let centralOffset = localSize;
	entries.forEach((entry, index) => {
		const name = names[index];
		const checksum = crc32(entry.data);
		writeLocalHeader(view, localOffset, name, checksum, entry.data.length);
		output.set(entry.data, localOffset + LOCAL_HEADER_BYTES + name.length);
		writeCentralHeader(view, centralOffset, name, checksum, entry.data.length, localOffset);
		localOffset += LOCAL_HEADER_BYTES + name.length + entry.data.length;
		centralOffset += CENTRAL_HEADER_BYTES + name.length;
	});
	writeEndRecord(view, centralOffset, entries.length, centralSize, localSize);
	return output;
}

/** The archive cannot take this file. Earlier files are unaffected, so it can still be finished. */
export class ZipLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipLimitError';
	}
}

interface WrittenEntry {
	name: Uint8Array;
	crc: number;
	size: number;
	offset: number;
}

const BLOB_CHECKSUM_CHUNK = 4 * 1024 * 1024;

/**
 * Builds an archive one file at a time out of Blob parts. A file's bytes leave the JavaScript heap
 * as soon as it is added, so a long export does not hold every PNG, and `finish` does not copy them.
 */
export class ZipWriter {
	readonly #parts: BlobPart[] = [];
	readonly #entries: WrittenEntry[] = [];
	readonly #seen = new Set<string>();
	readonly #maxBytes: number;
	#offset = 0;
	#centralSize = 0;

	constructor(options: { maxBytes?: number } = {}) {
		this.#maxBytes = options.maxBytes ?? MAX_ARCHIVE_BYTES;
	}

	get fileCount(): number {
		return this.#entries.length;
	}

	#reserve(path: string, size: number, spare: number): Uint8Array<ArrayBuffer> {
		const name = encoder.encode(path);
		const after =
			this.#offset +
			LOCAL_HEADER_BYTES +
			name.length +
			size +
			this.#centralSize +
			CENTRAL_HEADER_BYTES +
			name.length +
			END_RECORD_BYTES +
			spare;
		if (after > this.#maxBytes)
			throw new ZipLimitError(`${path} would make the ZIP larger than it can be.`);
		if (this.#entries.length >= MAX_ENTRIES)
			throw new ZipLimitError(`${path} would make too many ZIP entries.`);
		assertNewPath(path, this.#seen);
		return name;
	}

	#append(name: Uint8Array<ArrayBuffer>, crc: number, size: number, data: BlobPart): void {
		const header = new Uint8Array(LOCAL_HEADER_BYTES + name.length);
		writeLocalHeader(new DataView(header.buffer), 0, name, crc, size);
		this.#parts.push(header, data);
		this.#entries.push({ name, crc, size, offset: this.#offset });
		this.#offset += header.length + size;
		this.#centralSize += CENTRAL_HEADER_BYTES + name.length;
	}

	/** `spare` keeps room for files that must still fit afterwards, such as the manifest. */
	add(path: string, data: Uint8Array<ArrayBuffer>, spare = 0): void {
		const name = this.#reserve(path, data.length, spare);
		this.#append(name, crc32(data), data.length, new Blob([data]));
	}

	/** Add a file already held as a Blob, reading it in pieces only to checksum it. */
	async addBlob(path: string, blob: Blob, spare = 0): Promise<void> {
		const name = this.#reserve(path, blob.size, spare);
		let crc = 0;
		for (let at = 0; at < blob.size; at += BLOB_CHECKSUM_CHUNK) {
			const chunk = await blob.slice(at, at + BLOB_CHECKSUM_CHUNK).arrayBuffer();
			crc = crc32(new Uint8Array(chunk), crc);
		}
		this.#append(name, crc, blob.size, blob);
	}

	finish(): Blob {
		const central = new Uint8Array(this.#centralSize + END_RECORD_BYTES);
		const view = new DataView(central.buffer);
		let at = 0;
		for (const { name, crc, size, offset } of this.#entries) {
			writeCentralHeader(view, at, name, crc, size, offset);
			at += CENTRAL_HEADER_BYTES + name.length;
		}
		writeEndRecord(view, at, this.#entries.length, this.#centralSize, this.#offset);
		return new Blob([...this.#parts, central], { type: 'application/zip' });
	}
}

/* --------------------------------------------------------------------------------------- reading */

export interface ZipDirectoryEntry {
	name: string;
	/** 0 is stored, 8 is deflated. */
	method: number;
	crc: number;
	compressedSize: number;
	size: number;
	offset: number;
	encrypted: boolean;
}

const NOT_A_ZIP = 'This ZIP is damaged or is not a ZIP.';
const MAX_READ_BYTES = 1024 * 1024 * 1024;

/** Whether a file starts like a ZIP, whatever it is named. */
export async function isZipFile(file: Blob): Promise<boolean> {
	const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
	return head.length === 4 && new DataView(head.buffer).getUint32(0, true) === LOCAL_SIGNATURE;
}

/** Read the central directory of any ordinary (non-ZIP64) archive. Throws when it is malformed. */
export async function readZipDirectory(file: Blob): Promise<ZipDirectoryEntry[]> {
	const tailStart = Math.max(0, file.size - END_RECORD_BYTES - 65535);
	const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
	const tailView = new DataView(tail.buffer);
	let end = -1;
	for (let at = tail.length - END_RECORD_BYTES; at >= 0 && end < 0; at--)
		if (
			tailView.getUint32(at, true) === END_SIGNATURE &&
			at + END_RECORD_BYTES + tailView.getUint16(at + 20, true) === tail.length
		)
			end = at;
	if (end < 0) throw new Error(NOT_A_ZIP);
	const count = tailView.getUint16(end + 10, true);
	const size = tailView.getUint32(end + 12, true);
	const start = tailView.getUint32(end + 16, true);
	if (count === 0xffff || size === 0xffffffff || start === 0xffffffff)
		throw new Error('This ZIP is too large for Appshot to read.');
	if (start + size > file.size) throw new Error(NOT_A_ZIP);
	const bytes = new Uint8Array(await file.slice(start, start + size).arrayBuffer());
	const view = new DataView(bytes.buffer);
	const decoder = new TextDecoder();
	const entries: ZipDirectoryEntry[] = [];
	let at = 0;
	for (let index = 0; index < count; index++) {
		if (at + CENTRAL_HEADER_BYTES > bytes.length || view.getUint32(at, true) !== CENTRAL_SIGNATURE)
			throw new Error(NOT_A_ZIP);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const next = at + CENTRAL_HEADER_BYTES + nameLength + extraLength + commentLength;
		if (next > bytes.length) throw new Error(NOT_A_ZIP);
		entries.push({
			name: decoder.decode(
				bytes.subarray(at + CENTRAL_HEADER_BYTES, at + CENTRAL_HEADER_BYTES + nameLength)
			),
			method: view.getUint16(at + 10, true),
			crc: view.getUint32(at + 16, true),
			compressedSize: view.getUint32(at + 20, true),
			size: view.getUint32(at + 24, true),
			offset: view.getUint32(at + 42, true),
			encrypted: (view.getUint16(at + 8, true) & 1) === 1
		});
		at = next;
	}
	return entries;
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One file's bytes, checked against the archive's checksum. Null when it has no such file. */
export async function readZipEntry(
	file: Blob,
	path: string
): Promise<Uint8Array<ArrayBuffer> | null> {
	const entry = (await readZipDirectory(file)).find((candidate) => candidate.name === path);
	if (!entry) return null;
	if (entry.encrypted) throw new Error(`${path} is encrypted in this ZIP, so it cannot be read.`);
	if (entry.size > MAX_READ_BYTES || entry.compressedSize > MAX_READ_BYTES)
		throw new Error(`${path} is too large to read from this ZIP.`);
	const headerEnd = entry.offset + LOCAL_HEADER_BYTES;
	if (headerEnd > file.size) throw new Error(NOT_A_ZIP);
	const header = new Uint8Array(await file.slice(entry.offset, headerEnd).arrayBuffer());
	const view = new DataView(header.buffer);
	if (view.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error(NOT_A_ZIP);
	const dataStart = headerEnd + view.getUint16(26, true) + view.getUint16(28, true);
	const dataEnd = dataStart + entry.compressedSize;
	if (dataEnd > file.size) throw new Error(NOT_A_ZIP);
	const stored = new Uint8Array(await file.slice(dataStart, dataEnd).arrayBuffer());
	let data: Uint8Array<ArrayBuffer>;
	if (entry.method === 0) data = stored;
	else if (entry.method === 8) {
		try {
			data = await inflateRaw(stored);
		} catch {
			throw new Error(`${path} is damaged in this ZIP.`);
		}
	} else throw new Error(`${path} uses a ZIP compression Appshot cannot read.`);
	if (data.length !== entry.size || crc32(data) !== entry.crc)
		throw new Error(`${path} is damaged in this ZIP.`);
	return data;
}

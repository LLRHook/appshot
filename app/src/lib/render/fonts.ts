/**
 * The bundled faces every canvas style draws with. Canvas text needs them loaded before drawing;
 * unlike the DOM it never re-paints when a font arrives late.
 *
 * A face that failed stays in its `error` state for the life of the page, so simply retrying
 * cannot recover from a dropped connection. A failed load is therefore never cached, and the next
 * render tries the same bundled file through a new `FontFace`.
 */
const FACES = [
	{ family: 'DM Sans', url: '/fonts/DM-Sans.ttf', style: 'normal', weight: '100 1000' },
	{
		family: 'Instrument Serif',
		url: '/fonts/Instrument-Serif.ttf',
		style: 'normal',
		weight: '400'
	},
	{
		family: 'Instrument Serif',
		url: '/fonts/Instrument-Serif-Italic.ttf',
		style: 'italic',
		weight: '400'
	}
] as const;

const REQUESTS = [
	'400 100px "DM Sans"',
	'600 100px "DM Sans"',
	'700 100px "DM Sans"',
	'800 100px "DM Sans"',
	'400 100px "Instrument Serif"',
	'italic 400 100px "Instrument Serif"'
];

let ready: Promise<void> | undefined;

/** Whether a real bundled face is loaded, as opposed to a fallback the browser would substitute. */
export function faceLoaded(family: string, style: string): boolean {
	let found = false;
	document.fonts.forEach((face) => {
		if (
			face.family.replace(/^["']|["']$/g, '') === family &&
			face.style === style &&
			face.status === 'loaded'
		)
			found = true;
	});
	return found;
}

async function loadAll(): Promise<void> {
	// A rejection here is not final: the check below retries whatever did not load.
	await Promise.allSettled(REQUESTS.map((request) => document.fonts.load(request)));
	await Promise.all(
		FACES.filter((face) => !faceLoaded(face.family, face.style)).map(async (face) => {
			const fresh = new FontFace(face.family, `url(${face.url}) format("truetype")`, {
				style: face.style,
				weight: face.weight
			});
			await fresh.load();
			document.fonts.add(fresh);
		})
	);
}

/** Resolves once every bundled face is really loaded. Rejects, uncached, when one cannot load. */
export function loadBundledFonts(): Promise<void> {
	ready ??= loadAll().catch(() => {
		ready = undefined;
		throw new Error(
			'The app fonts could not be loaded. Check your connection, then make any edit to try again.'
		);
	});
	return ready;
}

import { MAX_PROJECT_BYTES } from '$lib/model/limits';
import { loadProject, saveProject } from '$lib/model/project';
import type { Composition } from '$lib/model/types';

/**
 * Where an editor document lives between sessions. The store owns when to write; an
 * implementation owns how. Swapping this adapter is the seam for Project v2 and asset storage.
 */
export interface ProjectPersistence<D> {
	/** The saved document, or null when there is none. Rejects when it cannot be read. */
	load(): Promise<D | null>;
	/** Durably write a complete document. The store never runs two saves at once. */
	save(document: D): Promise<void>;
	/**
	 * Why this document cannot be kept, or null when it can. Runs synchronously on every real
	 * edit, so an implementation must stay cheap for typing.
	 */
	rejectReason?(document: D): string | null;
}

/** The current single-slot, inline-image autosave: one v1 Composition in IndexedDB. */
export const legacyPersistence: ProjectPersistence<Composition> = {
	load: loadProject,
	save: saveProject,
	rejectReason(document) {
		// Serializes image bytes on each edit (G-19). A referenced asset model removes this.
		return new TextEncoder().encode(JSON.stringify(document)).length > MAX_PROJECT_BYTES
			? 'This campaign is too large to save. Use smaller screenshots or fewer frames (60 MB project limit).'
			: null;
	}
};

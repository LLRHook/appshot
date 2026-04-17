# render/

Single composition renderer shared by preview and export. Populated in the next executor phase. See ../../CLAUDE.md for the contract: the preview in the editor and the PNG produced by `/api/render` must be byte-identical given the same `(Composition, images, slideIndex)`.

export type ParamValues = Record<string, string | number>;

export function buildTemplateUrl(templateId: string, params: ParamValues): string {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') {
			const strVal = String(value);
			// Skip data URLs — they're sent via postMessage instead
			if (strVal.startsWith('data:')) continue;
			// Strip # from hex color values — templates prepend # internally
			if (strVal.match(/^#[0-9a-fA-F]{3,8}$/)) {
				searchParams.set(key, strVal.slice(1));
			} else {
				searchParams.set(key, strVal);
			}
		}
	}
	return `/templates/${templateId}/index.html?${searchParams.toString()}`;
}

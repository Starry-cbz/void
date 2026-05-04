export type EnhancedContextSettings = {
	enableEnhancedContext: boolean;
	enhancedContextIncludeScmChangedFiles: boolean;
	enhancedContextIncludeCodeSnippet: boolean;
	enhancedContextIncludeTerminalSummary: boolean;
};

export type EnhancedContextSections = {
	diagnostics?: string | null;
	scm?: string | null;
	editor?: string | null;
	terminal?: string | null;
};

export const buildEnhancedContext = (settings: EnhancedContextSettings, sections: EnhancedContextSections): string | undefined => {
	if (!settings.enableEnhancedContext) return undefined;

	const out: string[] = [];

	if (sections.diagnostics) out.push(`<Diagnostics>\n${sections.diagnostics}\n</Diagnostics>`);
	if (settings.enhancedContextIncludeScmChangedFiles && sections.scm) out.push(`<SCM>\n${sections.scm}\n</SCM>`);
	if (settings.enhancedContextIncludeCodeSnippet && sections.editor) out.push(`<Editor>\n${sections.editor}\n</Editor>`);
	if (settings.enhancedContextIncludeTerminalSummary && sections.terminal) out.push(`<Terminal>\n${sections.terminal}\n</Terminal>`);

	return out.length ? out.join('\n') : undefined;
};


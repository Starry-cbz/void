import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';

export const DEFAULT_MAX_RECENT_FILES = 15;
export const DEFAULT_DIFF_CACHE_TTL_MS = 7000;

export type DiffSummary = {
	stat: string;
	sampledDiffs: string;
};

export type RecentFileEntry = {
	uri: URI;
	timestamp: number;
	range: IRange | null;
};

export type EnhancedContextSettings = {
	enableEnhancedContext: boolean;
	enhancedContextIncludeScmChangedFiles: boolean;
	enhancedContextIncludeCodeSnippet: boolean;
	enhancedContextIncludeTerminalSummary: boolean;
	enhancedContextIncludeDiffSummary: boolean;
	enhancedContextIncludeRecentFiles: boolean;
	maxRecentFiles?: number;
};

export type EnhancedContextSections = {
	diagnostics?: string | null;
	scm?: string | null;
	editor?: string | null;
	terminal?: string | null;
	diff?: DiffSummary | null;
	recentFiles?: readonly RecentFileEntry[];
};

export class DiffSummaryCache {
	private lastUpdated = 0;
	private lastValue: DiffSummary | null = null;

	constructor(private readonly ttlMs: number) { }

	getEntry(now = Date.now()): { hit: boolean; value: DiffSummary | null } {
		if (this.lastUpdated === 0 || now - this.lastUpdated > this.ttlMs) {
			return { hit: false, value: null };
		}
		return { hit: true, value: this.lastValue };
	}

	set(value: DiffSummary | null, now = Date.now()): void {
		this.lastValue = value;
		this.lastUpdated = now;
	}
}

export class RecentFilesTracker {
	private entries = new Map<string, RecentFileEntry>();

	constructor(private readonly maxEntries: number) { }

	record(entry: RecentFileEntry): void {
		this.entries.set(entry.uri.toString(), entry);
		if (this.entries.size <= this.maxEntries) return;

		let oldestKey: string | null = null;
		let oldestTimestamp = Infinity;
		for (const [key, candidate] of this.entries) {
			if (candidate.timestamp < oldestTimestamp) {
				oldestTimestamp = candidate.timestamp;
				oldestKey = key;
			}
		}
		if (oldestKey) this.entries.delete(oldestKey);
	}

	getRecentFiles(): RecentFileEntry[] {
		return Array.from(this.entries.values()).sort((a, b) => b.timestamp - a.timestamp);
	}
}

const _normalize = (value: string): string => value.replace(/\r\n/g, '\n').trim();
const _formatRange = (range: IRange): string => `L${range.startLineNumber}:C${range.startColumn}-L${range.endLineNumber}:C${range.endColumn}`;

export const buildEnhancedContext = (settings: EnhancedContextSettings, sections: EnhancedContextSections): string | undefined => {
	if (!settings.enableEnhancedContext) return undefined;

	const out: string[] = [];

	if (sections.diagnostics) out.push(`<Diagnostics>\n${_normalize(sections.diagnostics)}\n</Diagnostics>`);
	if (settings.enhancedContextIncludeScmChangedFiles && sections.scm) out.push(`<SCM>\n${_normalize(sections.scm)}\n</SCM>`);
	if (settings.enhancedContextIncludeCodeSnippet && sections.editor) out.push(`<Editor>\n${_normalize(sections.editor)}\n</Editor>`);
	if (settings.enhancedContextIncludeTerminalSummary && sections.terminal) out.push(`<Terminal>\n${_normalize(sections.terminal)}\n</Terminal>`);

	if (settings.enhancedContextIncludeDiffSummary && sections.diff) {
		const stat = _normalize(sections.diff.stat ?? '');
		const sampledDiffs = _normalize(sections.diff.sampledDiffs ?? '');
		const parts = [stat, sampledDiffs].filter(Boolean);
		if (parts.length) out.push(`<Diff>\n${parts.join('\n\n')}\n</Diff>`);
	}

	if (settings.enhancedContextIncludeRecentFiles) {
		const max = settings.maxRecentFiles ?? DEFAULT_MAX_RECENT_FILES;
		const items = [...(sections.recentFiles ?? [])]
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, Math.max(0, max));
		if (items.length) {
			const lines = items.map(e => {
				const when = new Date(e.timestamp).toISOString();
				const range = e.range ? _formatRange(e.range) : '';
				return `- ${e.uri.fsPath} | ${when}${range ? ` | ${range}` : ''}`;
			});
			out.push(`<RecentFiles>\n${lines.join('\n')}\n</RecentFiles>`);
		}
	}

	return out.length ? out.join('\n') : undefined;
};

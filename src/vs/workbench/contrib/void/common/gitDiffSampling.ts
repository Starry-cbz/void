export interface GitNumStatEntry {
	file: string;
	added: number;
	removed: number;
	isBinary: boolean;
}

export type RunGit = (args: readonly string[], cwd: string, options?: { trim?: boolean }) => Promise<string>;

const numStatHeaderTokenRegex = /^(-|\\d+)\\t(-|\\d+)\\t$/;

const parseNumStatNumber = (value: string): number => {
	if (value === '-') {
		return 0;
	}
	const parsed = parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const parseGitDiffNumStatZ = (output: string): GitNumStatEntry[] => {
	if (!output) {
		return [];
	}

	const tokens = output.split('\0');
	const entries: GitNumStatEntry[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const header = tokens[i];
		if (!header) {
			continue;
		}

		const [addedRaw = '0', removedRaw = '0'] = header.split('\t');
		const isBinary = addedRaw === '-' || removedRaw === '-';
		const added = parseNumStatNumber(addedRaw);
		const removed = parseNumStatNumber(removedRaw);

		const firstPath = tokens[++i];
		if (!firstPath) {
			continue;
		}

		let file = firstPath;
		const maybeSecondPath = tokens[i + 1];
		if (maybeSecondPath && !numStatHeaderTokenRegex.test(maybeSecondPath)) {
			file = maybeSecondPath;
			i++;
		}

		entries.push({ file, added, removed, isBinary });
	}

	return entries;
};

export const buildGitDiffNumStatArgs = (useStagedChanges: boolean): string[] => {
	const args = ['diff', '--numstat', '-z', '-M'];
	if (useStagedChanges) {
		args.push('--staged');
	}
	return args;
};

export const buildGitDiffFileArgs = (file: string, useStagedChanges: boolean): string[] => {
	const args = ['diff', '--unified=0', '--no-color', '-M'];
	if (useStagedChanges) {
		args.push('--staged');
	}
	args.push('--', file);
	return args;
};

export const getGitSampledDiffs = async (params: {
	cwd: string;
	useStagedChanges: boolean;
	maxFiles: number;
	maxDiffLength: number;
	runGit: RunGit;
}): Promise<string> => {
	const { cwd, useStagedChanges, maxFiles, maxDiffLength, runGit } = params;

	const numStatOutput = await runGit(buildGitDiffNumStatArgs(useStagedChanges), cwd, { trim: false });
	const numStatList = parseGitDiffNumStatZ(numStatOutput);
	if (numStatList.length === 0) {
		return '';
	}

	const topFiles = numStatList
		.sort((a, b) => (b.added + b.removed) - (a.added + a.removed))
		.slice(0, maxFiles);

	const diffs: Array<{ file: string; diff: string }> = [];

	for (const { file } of topFiles) {
		if (!file) {
			continue;
		}

		try {
			const diff = await runGit(buildGitDiffFileArgs(file, useStagedChanges), cwd, { trim: false });
			const sampled = diff.slice(0, maxDiffLength);
			if (sampled.trim().length === 0) {
				continue;
			}
			diffs.push({ file, diff: sampled });
		} catch {
			continue;
		}
	}

	return diffs.map(({ file, diff }) => `==== ${file} ====\n${diff}`).join('\n\n');
};


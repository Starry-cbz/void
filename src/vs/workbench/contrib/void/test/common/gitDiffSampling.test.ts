import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildGitDiffFileArgs, getGitSampledDiffs, parseGitDiffNumStatZ } from '../../common/gitDiffSampling.js';
import type { RunGit } from '../../common/gitDiffSampling.js';

suite('Void Git Diff Sampling', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty changes returns empty output and does not request per-file diff', async () => {
		const calls: string[][] = [];
		const runGit: RunGit = async (args) => {
			calls.push([...args]);
			if (args.includes('--numstat')) {
				return '';
			}
			throw new Error('should not be called');
		};

		const result = await getGitSampledDiffs({
			cwd: '/repo',
			useStagedChanges: false,
			maxFiles: 10,
			maxDiffLength: 8000,
			runGit,
		});

		assert.strictEqual(result, '');
		assert.strictEqual(calls.length, 1);
		assert.ok(calls[0]?.includes('--numstat'));
	});

	test('rename uses new path and builds safe diff args', async () => {
		const numstatZ = `1\t0\t\0old name.txt\0new name.txt\0`;
		const entries = parseGitDiffNumStatZ(numstatZ);
		assert.deepStrictEqual(entries.map(({ file }) => file), ['new name.txt']);

		const calls: string[][] = [];
		const runGit: RunGit = async (args) => {
			calls.push([...args]);
			if (args.includes('--numstat')) {
				return numstatZ;
			}
			if (args[0] === 'diff' && args.includes('--') && args.at(-1) === 'new name.txt') {
				return 'diff --git a/old name.txt b/new name.txt\nrename from old name.txt\nrename to new name.txt\n';
			}
			throw new Error('unexpected args');
		};

		const result = await getGitSampledDiffs({
			cwd: '/repo',
			useStagedChanges: true,
			maxFiles: 10,
			maxDiffLength: 8000,
			runGit,
		});

		assert.ok(result.includes('==== new name.txt ===='));
		assert.ok(calls.some(a => a.includes('--numstat') && a.includes('-z')));
		assert.ok(calls.some(a => a.includes('--') && a.at(-1) === 'new name.txt'));
	});

	test('binary diff failure is skipped without failing the whole call', async () => {
		const numstatZ = `-\t-\t\0bin.dat\0`;
		const calls: string[][] = [];
		const runGit: RunGit = async (args) => {
			calls.push([...args]);
			if (args.includes('--numstat')) {
				return numstatZ;
			}
			throw new Error('fatal: binary diff unsupported');
		};

		const result = await getGitSampledDiffs({
			cwd: '/repo',
			useStagedChanges: false,
			maxFiles: 10,
			maxDiffLength: 8000,
			runGit,
		});

		assert.strictEqual(result, '');
		assert.ok(calls.length >= 2);
	});

	test('special filename remains a raw argv element (no quoting needed)', async () => {
		const file = 'a; $(touch /tmp/pwn) && echo 1';
		const args = buildGitDiffFileArgs(file, false);
		assert.strictEqual(args.at(-1), file);
		assert.ok(args.includes('--'));
	});
});

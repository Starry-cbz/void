import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const importEnhancedContext = async () => {
	return await import('../../common/enhancedContext.js');
};

suite('Void Enhanced Context', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes Diff section when enabled and diffs exist', async () => {
		const { buildEnhancedContext } = await importEnhancedContext();

		const ctx = buildEnhancedContext(
			{
				enableEnhancedContext: true,
				enhancedContextIncludeScmChangedFiles: false,
				enhancedContextIncludeCodeSnippet: false,
				enhancedContextIncludeTerminalSummary: false,
				enhancedContextIncludeDiffSummary: true,
				enhancedContextIncludeRecentFiles: false,
			},
			{
				diff: { stat: '1 file changed, 2 insertions(+)', sampledDiffs: '==== a.ts ====\n@@ -1,0 +1,2 @@\n+hello\n+world\n' },
			}
		);

		assert.ok(ctx);
		assert.ok(ctx.includes('<Diff>'));
		assert.ok(ctx.includes('1 file changed'));
		assert.ok(ctx.includes('==== a.ts ===='));
	});

	test('omits Diff section when disabled', async () => {
		const { buildEnhancedContext } = await importEnhancedContext();

		const ctx = buildEnhancedContext(
			{
				enableEnhancedContext: true,
				enhancedContextIncludeScmChangedFiles: false,
				enhancedContextIncludeCodeSnippet: false,
				enhancedContextIncludeTerminalSummary: false,
				enhancedContextIncludeDiffSummary: false,
				enhancedContextIncludeRecentFiles: false,
			},
			{
				diff: { stat: '1 file changed', sampledDiffs: '==== a.ts ====\n...' },
			}
		);

		assert.strictEqual(ctx, undefined);
	});

	test('includes RecentFiles section with stable ordering and formatting', async () => {
		const { buildEnhancedContext } = await importEnhancedContext();

		const f1 = URI.file('/repo/src/a.ts');
		const f2 = URI.file('/repo/src/b.ts');

		const ctx = buildEnhancedContext(
			{
				enableEnhancedContext: true,
				enhancedContextIncludeScmChangedFiles: false,
				enhancedContextIncludeCodeSnippet: false,
				enhancedContextIncludeTerminalSummary: false,
				enhancedContextIncludeDiffSummary: false,
				enhancedContextIncludeRecentFiles: true,
				maxRecentFiles: 15,
			},
			{
				recentFiles: [
					{ uri: f1, timestamp: 1000, range: new Range(10, 5, 10, 6) },
					{ uri: f2, timestamp: 2000, range: new Range(1, 1, 3, 1) },
				],
			}
		);

		assert.ok(ctx.includes('<RecentFiles>'));
		const recentIdx = ctx.indexOf('/repo/src/b.ts');
		const olderIdx = ctx.indexOf('/repo/src/a.ts');
		assert.ok(recentIdx !== -1 && olderIdx !== -1);
		assert.ok(recentIdx < olderIdx);
		assert.ok(ctx.includes('L1:C1-L3:C1'));
	});

	test('omits RecentFiles section when disabled', async () => {
		const { buildEnhancedContext } = await importEnhancedContext();

		const ctx = buildEnhancedContext(
			{
				enableEnhancedContext: true,
				enhancedContextIncludeScmChangedFiles: false,
				enhancedContextIncludeCodeSnippet: false,
				enhancedContextIncludeTerminalSummary: false,
				enhancedContextIncludeDiffSummary: false,
				enhancedContextIncludeRecentFiles: false,
			},
			{
				recentFiles: [{ uri: URI.file('/repo/src/a.ts'), timestamp: 1000, range: null }],
			}
		);

		assert.strictEqual(ctx, undefined);
	});
});

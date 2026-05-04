import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chat_systemMessage, ctrlKStream_systemMessage } from '../../common/prompt/prompts.js';
import { buildEnhancedContext } from '../../common/enhancedContext.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';

suite('Void Cursor Prompts - Static Verification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('cursor chat system message includes cursor sections and excludes unwanted clauses', () => {
		const msg = chat_systemMessage({
			workspaceFolders: [],
			openedURIs: [],
			activeURI: undefined,
			persistentTerminalIDs: [],
			directoryStr: '',
			chatMode: 'agent',
			mcpTools: undefined,
			includeXMLToolDefinitions: false,
			promptStyle: 'cursor',
			enhancedContext: 'Diagnostics:\n- Errors: 0\n- Warnings: 0',
		});

		assert.ok(msg.includes('<communication>'));
		assert.ok(msg.includes('<tool_calling>'));
		assert.ok(msg.includes('<system_info>'));
		assert.ok(!msg.includes('Always respond in Spanish'));
	});

	test('cursor chat system message includes enhanced context partitions when enabled', () => {
		const enhancedContext = buildEnhancedContext(
			{
				enableEnhancedContext: true,
				enhancedContextIncludeScmChangedFiles: true,
				enhancedContextIncludeCodeSnippet: true,
				enhancedContextIncludeTerminalSummary: true,
				enhancedContextIncludeDiffSummary: true,
				enhancedContextIncludeRecentFiles: true,
			},
			{
				diagnostics: '- Errors: 1\n- Warnings: 2',
				scm: 'Changed files (1/1):\n- /workspace/foo.ts',
				editor: 'File: /workspace/foo.ts\nPosition: L1:1',
				terminal: 'Recent commands (active terminal):\n- npm test (exitCode: 0)',
				diff: { stat: '1 file changed', sampledDiffs: '==== foo.ts ====\n@@\n+hi\n' },
				recentFiles: [{ uri: URI.file('/workspace/foo.ts'), timestamp: 1000, range: new Range(1, 1, 1, 2) }],
			}
		);

		const msg = chat_systemMessage({
			workspaceFolders: [],
			openedURIs: [],
			activeURI: undefined,
			persistentTerminalIDs: [],
			directoryStr: '',
			chatMode: 'agent',
			mcpTools: undefined,
			includeXMLToolDefinitions: false,
			promptStyle: 'cursor',
			enhancedContext,
		});

		assert.ok(msg.includes('<enhanced_context>'));
		assert.ok(msg.includes('<Diagnostics>'));
		assert.ok(msg.includes('<SCM>'));
		assert.ok(msg.includes('<Editor>'));
		assert.ok(msg.includes('<Terminal>'));
	});

	test('cursor chat system message removes partitions when corresponding toggle is disabled', () => {
		const cases: Array<{
			name: 'SCM' | 'Editor' | 'Terminal' | 'Diff' | 'RecentFiles';
			settings: { enhancedContextIncludeScmChangedFiles: boolean; enhancedContextIncludeCodeSnippet: boolean; enhancedContextIncludeTerminalSummary: boolean; enhancedContextIncludeDiffSummary: boolean; enhancedContextIncludeRecentFiles: boolean };
			absentTag: string;
		}> = [
			{
				name: 'SCM',
				settings: { enhancedContextIncludeScmChangedFiles: false, enhancedContextIncludeCodeSnippet: true, enhancedContextIncludeTerminalSummary: true, enhancedContextIncludeDiffSummary: true, enhancedContextIncludeRecentFiles: true },
				absentTag: '<SCM>',
			},
			{
				name: 'Editor',
				settings: { enhancedContextIncludeScmChangedFiles: true, enhancedContextIncludeCodeSnippet: false, enhancedContextIncludeTerminalSummary: true, enhancedContextIncludeDiffSummary: true, enhancedContextIncludeRecentFiles: true },
				absentTag: '<Editor>',
			},
			{
				name: 'Terminal',
				settings: { enhancedContextIncludeScmChangedFiles: true, enhancedContextIncludeCodeSnippet: true, enhancedContextIncludeTerminalSummary: false, enhancedContextIncludeDiffSummary: true, enhancedContextIncludeRecentFiles: true },
				absentTag: '<Terminal>',
			},
			{
				name: 'Diff',
				settings: { enhancedContextIncludeScmChangedFiles: true, enhancedContextIncludeCodeSnippet: true, enhancedContextIncludeTerminalSummary: true, enhancedContextIncludeDiffSummary: false, enhancedContextIncludeRecentFiles: true },
				absentTag: '<Diff>',
			},
			{
				name: 'RecentFiles',
				settings: { enhancedContextIncludeScmChangedFiles: true, enhancedContextIncludeCodeSnippet: true, enhancedContextIncludeTerminalSummary: true, enhancedContextIncludeDiffSummary: true, enhancedContextIncludeRecentFiles: false },
				absentTag: '<RecentFiles>',
			},
		];

		for (const c of cases) {
			const enhancedContext = buildEnhancedContext(
				{
					enableEnhancedContext: true,
					...c.settings,
				},
				{
					diagnostics: '- Errors: 1\n- Warnings: 2',
					scm: 'Changed files (1/1):\n- /workspace/foo.ts',
					editor: 'File: /workspace/foo.ts\nPosition: L1:1',
					terminal: 'Recent commands (active terminal):\n- npm test (exitCode: 0)',
					diff: { stat: '1 file changed', sampledDiffs: '==== foo.ts ====\n@@\n+hi\n' },
					recentFiles: [{ uri: URI.file('/workspace/foo.ts'), timestamp: 1000, range: new Range(1, 1, 1, 2) }],
				}
			);

			const msg = chat_systemMessage({
				workspaceFolders: [],
				openedURIs: [],
				activeURI: undefined,
				persistentTerminalIDs: [],
				directoryStr: '',
				chatMode: 'agent',
				mcpTools: undefined,
				includeXMLToolDefinitions: false,
				promptStyle: 'cursor',
				enhancedContext,
			});

			assert.ok(msg.includes('<enhanced_context>'));
			assert.ok(msg.includes('<Diagnostics>'));
			assert.ok(!msg.includes(c.absentTag), `${c.name} section should be removed when toggle is off`);
		}
	});

	test('cursor chat system message omits enhanced_context block when enhanced context is disabled', () => {
		const enhancedContext = buildEnhancedContext(
			{
				enableEnhancedContext: false,
				enhancedContextIncludeScmChangedFiles: true,
				enhancedContextIncludeCodeSnippet: true,
				enhancedContextIncludeTerminalSummary: true,
				enhancedContextIncludeDiffSummary: true,
				enhancedContextIncludeRecentFiles: true,
			},
			{
				diagnostics: '- Errors: 1\n- Warnings: 2',
				scm: 'Changed files (1/1):\n- /workspace/foo.ts',
				editor: 'File: /workspace/foo.ts\nPosition: L1:1',
				terminal: 'Recent commands (active terminal):\n- npm test (exitCode: 0)',
			}
		);

		const msg = chat_systemMessage({
			workspaceFolders: [],
			openedURIs: [],
			activeURI: undefined,
			persistentTerminalIDs: [],
			directoryStr: '',
			chatMode: 'agent',
			mcpTools: undefined,
			includeXMLToolDefinitions: false,
			promptStyle: 'cursor',
			enhancedContext,
		});

		assert.ok(!msg.includes('<enhanced_context>'));
	});

	test('ctrl+k system message is strict about output format', () => {
		const msg = ctrlKStream_systemMessage({ quickEditFIMTags: { preTag: 'ABOVE', midTag: 'SELECTION', sufTag: 'BELOW' } });
		assert.ok(msg.includes('Do not add markdown code fences'));
		assert.ok(msg.includes('Do NOT output any text or explanations'));
	});
});

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chat_systemMessage, ctrlKStream_systemMessage } from '../../common/prompt/prompts.js';

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

	test('ctrl+k system message is strict about output format', () => {
		const msg = ctrlKStream_systemMessage({ quickEditFIMTags: { preTag: 'ABOVE', midTag: 'SELECTION', sufTag: 'BELOW' } });
		assert.ok(msg.includes('Do not add markdown code fences'));
		assert.ok(msg.includes('Do NOT output any text or explanations'));
	});
});

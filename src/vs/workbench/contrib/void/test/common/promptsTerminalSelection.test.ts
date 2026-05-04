import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chat_userMessageContent, messageOfSelection, tripleTick } from '../../common/prompt/prompts.js';
import type { StagingSelectionItem } from '../../common/chatThreadServiceTypes.js';

suite('Void Prompts - Terminal Selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('messageOfSelection formats terminal selection as a fenced block', async () => {
		const selection: StagingSelectionItem = {
			type: 'Terminal',
			terminalId: '1',
			content: 'echo hi\nhi',
		};

		const result = await messageOfSelection(selection, {
			directoryStrService: {} as any,
			fileService: {} as any,
			folderOpts: { maxChildren: 1, maxCharsPerFile: 1 },
		});

		assert.ok(result.includes('Terminal 1:'));
		assert.ok(result.includes(`${tripleTick[0]}\necho hi\nhi\n${tripleTick[1]}`));
	});

	test('chat_userMessageContent injects terminal selections into SELECTIONS section', async () => {
		const selection: StagingSelectionItem = {
			type: 'Terminal',
			terminalId: '2',
			content: 'npm test',
		};

		const result = await chat_userMessageContent(
			'run tests',
			[selection],
			{ directoryStrService: {} as any, fileService: {} as any },
		);

		assert.ok(result.startsWith('run tests'));
		assert.ok(result.includes('\n---\nSELECTIONS\n'));
		assert.ok(result.includes('Terminal 2:'));
		assert.ok(result.includes(`${tripleTick[0]}\nnpm test\n${tripleTick[1]}`));
	});
});


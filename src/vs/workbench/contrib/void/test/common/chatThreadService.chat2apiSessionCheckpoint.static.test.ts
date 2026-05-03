import assert from 'assert';
import { dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Void Chat2API Session/Checkpoint - Static Verification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ChatThreadService contains session + checkpoint header wiring and checkpoint persistence', async () => {
		const fileRootUrl = (globalThis as any)._VSCODE_FILE_ROOT as string | undefined;
		const repoRoot = fileRootUrl ? dirname(URI.parse(fileRootUrl).fsPath) : process.cwd();
		const chatThreadServicePath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/chatThreadService.ts');
		const readFile = (globalThis as any).__readFileInTests as ((path: string) => Promise<string>) | undefined;
		assert.ok(readFile);
		const source = await readFile(chatThreadServicePath);

		assert.ok(source.includes(`'X-Chat2API-Session': threadId`));
		assert.ok(source.includes(`'X-Chat2API-Checkpoint': chat2apiCheckpointIdToSend`));

		assert.ok(source.includes(`return checkpoint.chat2apiCheckpointId`));
		assert.ok(source.includes(`chat2apiCheckpointId: latestChat2apiCheckpointId`));
		assert.ok(source.includes(`chat2apiCheckpointId,`));
	});
});

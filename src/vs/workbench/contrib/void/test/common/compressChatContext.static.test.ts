import assert from 'assert';
import { dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Void Chat Context Compression - Static Verification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('supports compressedContext storage and injection', async () => {
		const fileRootUrl = (globalThis as any)._VSCODE_FILE_ROOT as string | undefined;
		const repoRoot = fileRootUrl ? dirname(URI.parse(fileRootUrl).fsPath) : process.cwd();
		const readFile = (globalThis as any).__readFileInTests as ((path: string) => Promise<string>) | undefined;
		assert.ok(readFile);

		const promptsPath = join(repoRoot, 'src/vs/workbench/contrib/void/common/prompt/prompts.ts');
		const chatThreadServicePath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/chatThreadService.ts');
		const convertPath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts');

		const promptsSource = await readFile(promptsPath);
		assert.ok(promptsSource.includes('export const compressChatContext_systemMessage'));
		assert.ok(promptsSource.includes('export const compressChatContext_userMessage'));

		const chatThreadSource = await readFile(chatThreadServicePath);
		assert.ok(chatThreadSource.includes('compressedContext?: {'));
		assert.ok(chatThreadSource.includes('async compressCurrentThreadContext()'));
		assert.ok(chatThreadSource.includes('Compress Context'));
		assert.ok(chatThreadSource.includes('compressedContext,'));

		const convertSource = await readFile(convertPath);
		assert.ok(convertSource.includes('compressedContext?: string'));
		assert.ok(convertSource.includes('[COMPRESSED CONTEXT]'));
	});
});


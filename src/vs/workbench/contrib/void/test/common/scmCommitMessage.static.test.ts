import assert from 'assert';
import { dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Void SCM Commit Message - Static Verification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('SCM generation ignores .voidrules and provides commit message fallback', async () => {
		const fileRootUrl = (globalThis as any)._VSCODE_FILE_ROOT as string | undefined;
		const repoRoot = fileRootUrl ? dirname(URI.parse(fileRootUrl).fsPath) : process.cwd();
		const readFile = (globalThis as any).__readFileInTests as ((path: string) => Promise<string>) | undefined;
		assert.ok(readFile);

		const convertPath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts');
		const promptsPath = join(repoRoot, 'src/vs/workbench/contrib/void/common/prompt/prompts.ts');
		const scmServicePath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/voidSCMService.ts');

		const convertSource = await readFile(convertPath);
		assert.ok(convertSource.includes(`featureName === 'SCM' ? '' : this._getCombinedAIInstructions()`));

		const promptsSource = await readFile(promptsPath);
		assert.ok(promptsSource.includes('If there are any other guidelines, rules, or instructions'));

		const scmSource = await readFile(scmServicePath);
		assert.ok(scmSource.includes(`params.fullText.match(/<output>([\\s\\S]*?)<\\/output>/i)`));
		assert.ok(scmSource.includes(`replace(/<reasoning>[\\s\\S]*?<\\/reasoning>/gi, '')`));
		assert.ok(scmSource.includes(`reject(new Error('LLM response did not contain a commit message.'))`));
	});
});


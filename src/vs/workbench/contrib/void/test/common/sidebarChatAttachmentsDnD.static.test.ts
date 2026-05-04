import assert from 'assert';
import { dirname, join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Void SidebarChat Attachments DnD - Static Verification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('SidebarChat 输入区支持拖拽工作区文件/文件夹加入 staging', async () => {
		const fileRootUrl = (globalThis as any)._VSCODE_FILE_ROOT as string | undefined;
		const repoRoot = fileRootUrl ? dirname(URI.parse(fileRootUrl).fsPath) : process.cwd();
		const readFile = (globalThis as any).__readFileInTests as ((path: string) => Promise<string>) | undefined;
		assert.ok(readFile);

		const sidebarChatPath = join(repoRoot, 'src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx');
		const sidebarChatSource = await readFile(sidebarChatPath);

		assert.ok(sidebarChatSource.includes(`text/uri-list`));
		assert.ok(sidebarChatSource.includes(`dataTransfer.files`));
		assert.ok(sidebarChatSource.includes(`workspaceContextService.isInsideWorkspace`));
		assert.ok(sidebarChatSource.includes(`chatThreadsService.addNewStagingSelection`));
	});
});


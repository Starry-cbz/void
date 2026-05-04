import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITerminalService, ITerminalInstance } from '../../terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { MAX_TERMINAL_CHARS } from '../common/prompt/prompts.js';

export const VOID_TERMINAL_LAST_COMMAND_FAILED_CTX = 'voidTerminalLastCommandFailed'

export type FailedTerminalSnippet = { terminalId: string; content: string }

export interface ITerminalSnippetService {
	readonly _serviceBrand: undefined;
	getActiveFailedSnippet(): FailedTerminalSnippet | null
}

export const ITerminalSnippetService = createDecorator<ITerminalSnippetService>('TerminalSnippetService');

class TerminalSnippetService extends Disposable implements ITerminalSnippetService {
	readonly _serviceBrand: undefined;

	private readonly _failedSnippetByInstanceId = new Map<number, string>()
	private readonly _failedCtx: IContextKey<boolean>
	private _activeInstanceId: number | null = null
	private readonly _activeCommandFinishedListener = this._register(new MutableDisposable())

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super()
		this._failedCtx = contextKeyService.createKey(VOID_TERMINAL_LAST_COMMAND_FAILED_CTX, false)

		this._register(this.terminalService.onDidChangeActiveInstance((instance) => {
			this._activeInstanceId = instance?.instanceId ?? null
			this._attachToInstance(instance)
			this._refreshContextKey()
		}))

		this._register(this.terminalService.onDidChangeInstanceCapability((instance) => {
			if (!instance || instance.instanceId !== this._activeInstanceId) return
			this._attachToInstance(instance)
		}))

		this._activeInstanceId = this.terminalService.activeInstance?.instanceId ?? null
		this._attachToInstance(this.terminalService.activeInstance)
		this._refreshContextKey()
	}

	getActiveFailedSnippet(): FailedTerminalSnippet | null {
		const instance = this.terminalService.activeInstance
		if (!instance) return null
		const content = this._failedSnippetByInstanceId.get(instance.instanceId)
		if (!content) return null
		return { terminalId: instance.instanceId + '', content }
	}

	private _refreshContextKey() {
		if (this._activeInstanceId === null) {
			this._failedCtx.set(false)
			return
		}
		this._failedCtx.set(this._failedSnippetByInstanceId.has(this._activeInstanceId))
	}

	private _attachToInstance(instance: ITerminalInstance | undefined) {
		if (!instance) return
		const cmdCap = instance.capabilities.get(TerminalCapability.CommandDetection)
		if (!cmdCap) {
			this._activeCommandFinishedListener.clear()
			return
		}

		this._activeCommandFinishedListener.value = cmdCap.onCommandFinished((cmd) => {
			const exitCode = cmd.exitCode ?? 0
			if (exitCode === 0) {
				this._failedSnippetByInstanceId.delete(instance.instanceId)
				this._refreshContextKey()
				return
			}

			const cmdLine = cmd.command ? `$ ${cmd.command}\n` : ''
			const output = cmd.getOutput?.() ?? ''
			let content = removeAnsiEscapeCodes(cmdLine + output)
			if (content.length > MAX_TERMINAL_CHARS) {
				const half = MAX_TERMINAL_CHARS / 2
				content = content.slice(0, half) + '\n...\n' + content.slice(content.length - half)
			}
			this._failedSnippetByInstanceId.set(instance.instanceId, content)
			this._refreshContextKey()
		})
	}
}

registerSingleton(ITerminalSnippetService, TerminalSnippetService, InstantiationType.Delayed);

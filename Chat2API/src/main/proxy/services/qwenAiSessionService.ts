export interface QwenAiSessionState {
  sessionKey: string
  accountId: string
  chatId: string
  currentParentId: string | null
  checkpoints: Map<string, string>
}

export interface QwenAiSessionServiceOptions {
  checkpointIdGenerator?: () => string
}

export class QwenAiSessionService {
  private readonly sessions = new Map<string, QwenAiSessionState>()
  private readonly queueTails = new Map<string, Promise<void>>()
  private readonly checkpointIdGenerator: () => string

  constructor(options: QwenAiSessionServiceOptions = {}) {
    this.checkpointIdGenerator =
      options.checkpointIdGenerator ??
      (() => `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`)
  }

  ensureSession(
    sessionKey: string,
    initial: Omit<QwenAiSessionState, 'sessionKey' | 'checkpoints'> & { checkpoints?: Map<string, string> }
  ): QwenAiSessionState {
    const existing = this.sessions.get(sessionKey)
    if (existing) return existing

    const created: QwenAiSessionState = {
      sessionKey,
      accountId: initial.accountId,
      chatId: initial.chatId,
      currentParentId: initial.currentParentId,
      checkpoints: initial.checkpoints ?? new Map(),
    }

    this.sessions.set(sessionKey, created)
    return created
  }

  getSession(sessionKey: string): QwenAiSessionState | undefined {
    return this.sessions.get(sessionKey)
  }

  setAccountId(sessionKey: string, accountId: string): void {
    const session = this.sessions.get(sessionKey)
    if (!session) return
    session.accountId = accountId
  }

  setChatId(sessionKey: string, chatId: string): void {
    const session = this.sessions.get(sessionKey)
    if (!session) return
    session.chatId = chatId
  }

  setCurrentParentId(sessionKey: string, parentId: string | null): void {
    const session = this.sessions.get(sessionKey)
    if (!session) return
    session.currentParentId = parentId
  }

  resetSession(
    sessionKey: string,
    state: Omit<QwenAiSessionState, 'sessionKey' | 'checkpoints'> & { checkpoints?: Map<string, string> }
  ): QwenAiSessionState {
    const reset: QwenAiSessionState = {
      sessionKey,
      accountId: state.accountId,
      chatId: state.chatId,
      currentParentId: state.currentParentId,
      checkpoints: state.checkpoints ?? new Map(),
    }
    this.sessions.set(sessionKey, reset)
    return reset
  }

  createCheckpoint(sessionKey: string, parentId: string): string {
    const session = this.sessions.get(sessionKey)
    if (!session) {
      throw new Error(`Session not found: ${sessionKey}`)
    }
    const checkpointId = this.checkpointIdGenerator()
    session.checkpoints.set(checkpointId, parentId)
    return checkpointId
  }

  createPendingCheckpoint(sessionKey: string): string {
    const session = this.sessions.get(sessionKey)
    if (!session) {
      throw new Error(`Session not found: ${sessionKey}`)
    }
    const checkpointId = this.checkpointIdGenerator()
    session.checkpoints.set(checkpointId, '')
    return checkpointId
  }

  finalizeCheckpoint(sessionKey: string, checkpointId: string, parentId: string): void {
    const session = this.sessions.get(sessionKey)
    if (!session) return
    session.checkpoints.set(checkpointId, parentId)
    session.currentParentId = parentId
  }

  resolveCheckpoint(sessionKey: string, checkpointId: string): string | undefined {
    const resolved = this.sessions.get(sessionKey)?.checkpoints.get(checkpointId)
    if (!resolved) return undefined
    return resolved
  }

  async runExclusive<T>(sessionKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queueTails.get(sessionKey) ?? Promise.resolve()
    const safePrevious = previous.catch(() => undefined)

    const runPromise = safePrevious.then(task)
    const newTail = runPromise.then(
      () => undefined,
      () => undefined
    )
    this.queueTails.set(sessionKey, newTail)

    try {
      return await runPromise
    } finally {
      if (this.queueTails.get(sessionKey) === newTail) {
        this.queueTails.delete(sessionKey)
      }
    }
  }
}

export const qwenAiSessionService = new QwenAiSessionService()

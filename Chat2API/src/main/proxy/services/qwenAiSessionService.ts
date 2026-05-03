import crypto from 'crypto'

type SessionBinding = {
  providerId: string
  accountId: string
  chatId: string
}

type CheckpointInfo = {
  parentId: string
  createdAt: number
  requestId?: string
}

export type QwenAiSessionState = {
  binding: SessionBinding
  currentParentId: string | null
  checkpoints: Map<string, CheckpointInfo>
  createdAt: number
  updatedAt: number
}

export class QwenAiSessionService {
  private readonly sessions = new Map<string, QwenAiSessionState>()
  private readonly tails = new Map<string, Promise<void>>()

  runExclusive<T>(sessionKey: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(sessionKey) ?? Promise.resolve()
    let release!: () => void
    const next = new Promise<void>((r) => (release = r))
    this.tails.set(sessionKey, prev.then(() => next))

    return prev
      .then(fn)
      .finally(() => {
        release()
        if (this.tails.get(sessionKey) === next) {
          this.tails.delete(sessionKey)
        }
      })
  }

  hasSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey)
  }

  getSession(sessionKey: string): QwenAiSessionState | undefined {
    return this.sessions.get(sessionKey)
  }

  bindSession(sessionKey: string, binding: SessionBinding): void {
    const now = Date.now()
    const existing = this.sessions.get(sessionKey)
    if (existing) {
      existing.binding = binding
      existing.updatedAt = now
      return
    }
    this.sessions.set(sessionKey, {
      binding,
      currentParentId: null,
      checkpoints: new Map(),
      createdAt: now,
      updatedAt: now,
    })
  }

  updateCurrentParent(sessionKey: string, parentId: string | null): void {
    const s = this.sessions.get(sessionKey)
    if (!s) return
    s.currentParentId = parentId
    s.updatedAt = Date.now()
  }

  createPendingCheckpoint(sessionKey: string, meta?: { requestId?: string }): string {
    const s = this.sessions.get(sessionKey)
    if (!s) {
      throw new Error(`Session not found: ${sessionKey}`)
    }
    const id = crypto.randomUUID()
    s.checkpoints.set(id, {
      parentId: '',
      createdAt: Date.now(),
      requestId: meta?.requestId,
    })
    s.updatedAt = Date.now()
    return id
  }

  finalizeCheckpoint(sessionKey: string, checkpointId: string, args: { parentId: string }): void {
    const s = this.sessions.get(sessionKey)
    if (!s) return
    const c = s.checkpoints.get(checkpointId)
    if (!c) return
    c.parentId = args.parentId
    s.updatedAt = Date.now()
  }

  resolveCheckpointParent(sessionKey: string, checkpointId: string): string | null {
    const s = this.sessions.get(sessionKey)
    if (!s) return null
    return s.checkpoints.get(checkpointId)?.parentId || null
  }
}


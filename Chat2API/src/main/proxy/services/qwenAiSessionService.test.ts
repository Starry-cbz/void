import { describe, expect, test } from 'vitest'
import { QwenAiSessionService } from './qwenAiSessionService'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('QwenAiSessionService', () => {
  test('runExclusive 按同一 sessionKey 串行执行', async () => {
    const service = new QwenAiSessionService()
    const order: string[] = []
    const firstStarted = createDeferred<void>()
    const firstCanFinish = createDeferred<void>()

    const p1 = service.runExclusive('s1', async () => {
      order.push('a-start')
      firstStarted.resolve()
      await firstCanFinish.promise
      order.push('a-end')
    })

    await firstStarted.promise

    const p2 = service.runExclusive('s1', async () => {
      order.push('b')
    })

    await Promise.resolve()
    expect(order).toEqual(['a-start'])

    firstCanFinish.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual(['a-start', 'a-end', 'b'])
  })

  test('checkpointId 能解析回 parentId', () => {
    const service = new QwenAiSessionService({
      checkpointIdGenerator: (() => {
        const ids = ['cp1', 'cp2']
        let i = 0
        return () => ids[i++] ?? 'cpx'
      })(),
    })

    service.ensureSession('s1', { accountId: 'a1', chatId: 'c1', currentParentId: null })
    const checkpointId = service.createCheckpoint('s1', 'p1')

    expect(checkpointId).toBe('cp1')
    expect(service.resolveCheckpoint('s1', 'cp1')).toBe('p1')
    expect(service.resolveCheckpoint('s1', 'missing')).toBeUndefined()

    const pending = service.createPendingCheckpoint('s1')
    expect(pending).toBe('cp2')
    expect(service.resolveCheckpoint('s1', 'cp2')).toBeUndefined()
    service.finalizeCheckpoint('s1', 'cp2', 'p2')
    expect(service.resolveCheckpoint('s1', 'cp2')).toBe('p2')
    expect(service.getSession('s1')?.currentParentId).toBe('p2')
  })
})

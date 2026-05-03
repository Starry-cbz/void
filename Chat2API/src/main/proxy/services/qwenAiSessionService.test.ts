import test from 'node:test'
import assert from 'node:assert/strict'
import { QwenAiSessionService } from './qwenAiSessionService'

test('queues tasks per sessionKey', async () => {
  const svc = new QwenAiSessionService()
  const order: string[] = []

  const run1 = svc.runExclusive('s1', async () => {
    order.push('a1-start')
    await new Promise((r) => setTimeout(r, 50))
    order.push('a1-end')
  })

  const run2 = svc.runExclusive('s1', async () => {
    order.push('a2')
  })

  await Promise.all([run1, run2])
  assert.deepEqual(order, ['a1-start', 'a1-end', 'a2'])
})

test('creates and resolves checkpoints', () => {
  const svc = new QwenAiSessionService()
  svc.bindSession('s1', { providerId: 'qwen-ai', accountId: 'acc1', chatId: 'chat1' })
  svc.updateCurrentParent('s1', 'p2')

  const c1 = svc.createPendingCheckpoint('s1', { requestId: 'r1' })
  svc.finalizeCheckpoint('s1', c1, { parentId: 'p2' })
  assert.ok(typeof c1 === 'string' && c1.length > 0)
  assert.equal(svc.resolveCheckpointParent('s1', c1), 'p2')

  svc.updateCurrentParent('s1', 'p3')
  const c2 = svc.createPendingCheckpoint('s1', { requestId: 'r2' })
  svc.finalizeCheckpoint('s1', c2, { parentId: 'p3' })
  assert.equal(svc.resolveCheckpointParent('s1', c2), 'p3')
})


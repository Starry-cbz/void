import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ForwardChatCompletionArgs = [any, any, any, any, any]

const config = {
  loadBalanceStrategy: 'round-robin',
  retryCount: 0,
  modelMappings: {},
  enableApiKey: false,
  apiKeys: [],
  logRetentionDays: 7,
  sessionConfig: {
    sessionTimeout: 30,
    maxMessagesPerSession: 50,
    deleteAfterTimeout: false,
  },
}

const storeManager = {
  getConfig: vi.fn(() => config as any),
  updateAccount: vi.fn(() => null),
  addLog: vi.fn(() => ({ id: 'log-1' })),
  addRequestLog: vi.fn(() => ({ id: 'reqlog-1' })),
  updateRequestLog: vi.fn(() => true),
  recordRequestInStats: vi.fn(() => ({})),
  getSessionConfig: vi.fn(() => config.sessionConfig as any),
  updateSessionConfig: vi.fn(() => config.sessionConfig as any),
  getSessionsByProviderId: vi.fn(() => []),
  addSession: vi.fn(() => undefined),
  deleteSession: vi.fn(() => true),
  getActiveSessions: vi.fn(() => []),
  getSessions: vi.fn(() => []),
  getSessionById: vi.fn(() => undefined),
  cleanExpiredSessions: vi.fn(() => 0),
  clearAllSessions: vi.fn(() => undefined),
  getSessionsByAccountId: vi.fn(() => []),
}

const provider = {
  id: 'qwen-ai',
  name: 'Qwen AI (International)',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://chat.qwen.ai',
  chatPath: '/api/v2/chat/completions',
  headers: {},
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
} as any

const account = {
  id: 'acc-1',
  name: 'Account 1',
  providerId: 'qwen-ai',
  status: 'active',
  credentials: { token: 't' },
  createdAt: 0,
  updatedAt: 0,
  requestCount: 0,
  todayUsed: 0,
} as any

const loadBalancer = {
  selectAccount: vi.fn(() => ({ account, provider, actualModel: 'qwen3.5-plus' })),
  markAccountFailed: vi.fn(() => undefined),
  clearAccountFailure: vi.fn(() => undefined),
}

let forwardChatCompletionImpl: (...args: ForwardChatCompletionArgs) => Promise<any>
const forwardChatCompletion = vi.fn((...args: ForwardChatCompletionArgs) => forwardChatCompletionImpl(...args))

vi.mock('../../store/store', () => ({ storeManager }))
vi.mock('../loadbalancer', () => ({ loadBalancer }))
vi.mock('../forwarder', () => ({ requestForwarder: { forwardChatCompletion }, default: { forwardChatCompletion } }))

const requestBody = (content: string) => ({
  model: 'Qwen3.5-Plus',
  messages: [{ role: 'user', content }],
  stream: false,
})

const startServer = async () => {
  const { default: chatRouter } = await import('../routes/chat')
  const app = new Koa()
  app.use(bodyParser())
  app.use(chatRouter.routes())
  app.use(chatRouter.allowedMethods())

  const server = http.createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start test server')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('Chat2API session checkpoint protocol (e2e, mocked qwen-ai)', () => {
  let server: Awaited<ReturnType<typeof startServer>> | null = null

  beforeEach(() => {
    let chatSeq = 0
    let parentSeq = 0

    forwardChatCompletionImpl = async (request) => {
      const resolvedChatId = request.chatId || `chat-${++chatSeq}`
      const resolvedParentId = `msg-${++parentSeq}`
      return {
        success: true,
        status: 200,
        latency: 1,
        chatId: resolvedChatId,
        parentId: resolvedParentId,
        body: {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      }
    }

    forwardChatCompletion.mockClear()
    loadBalancer.selectAccount.mockClear()
  })

  afterEach(async () => {
    if (server) {
      await server.close()
      server = null
    }
  })

  it('同 sessionKey 复用同一 chatId', async () => {
    server = await startServer()

    const sessionKey = 'session-reuse'

    const res1 = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn1')),
    })
    expect(res1.status).toBe(200)
    const cp1 = res1.headers.get('X-Chat2API-Checkpoint')
    expect(typeof cp1).toBe('string')
    expect(cp1).toBeTruthy()
    await res1.json()

    const res2 = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn2')),
    })
    expect(res2.status).toBe(200)
    await res2.json()

    expect(forwardChatCompletion).toHaveBeenCalledTimes(2)
    const firstReq = forwardChatCompletion.mock.calls[0]?.[0]
    const secondReq = forwardChatCompletion.mock.calls[1]?.[0]
    expect(firstReq.chatId).toBeUndefined()
    expect(secondReq.chatId).toBe('chat-1')
    expect(secondReq.parentId).toBe('msg-1')
  })

  it('响应返回 checkpointId 且可用于撤销分支（parentId 回溯）', async () => {
    server = await startServer()

    const sessionKey = 'session-branch'

    const res1 = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn1')),
    })
    const cp1 = res1.headers.get('X-Chat2API-Checkpoint')
    expect(cp1).toBeTruthy()
    await res1.json()

    const res2 = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn2')),
    })
    const cp2 = res2.headers.get('X-Chat2API-Checkpoint')
    expect(cp2).toBeTruthy()
    expect(cp2).not.toBe(cp1)
    await res2.json()

    const res3 = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
        'X-Chat2API-Checkpoint': cp1!,
      },
      body: JSON.stringify(requestBody('turn3-branch-from-turn1')),
    })
    expect(res3.headers.get('X-Chat2API-Checkpoint')).toBeTruthy()
    await res3.json()

    expect(forwardChatCompletion).toHaveBeenCalledTimes(3)
    const thirdReq = forwardChatCompletion.mock.calls[2]?.[0]
    expect(thirdReq.chatId).toBe('chat-1')
    expect(thirdReq.parentId).toBe('msg-1')
  })

  it('同 sessionKey 并发请求会被 runExclusive 串行化', async () => {
    server = await startServer()

    const sessionKey = 'session-serial'

    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    let callIndex = 0
    forwardChatCompletionImpl = async (request) => {
      callIndex += 1
      const resolvedChatId = request.chatId || 'chat-serial'
      const resolvedParentId = `msg-serial-${callIndex}`
      if (callIndex === 1) {
        await firstGate
      }
      return {
        success: true,
        status: 200,
        latency: 1,
        chatId: resolvedChatId,
        parentId: resolvedParentId,
        body: {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      }
    }

    const p1 = fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn1')),
    })
    const p2 = fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat2API-Session': sessionKey,
      },
      body: JSON.stringify(requestBody('turn2')),
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(forwardChatCompletion).toHaveBeenCalledTimes(1)

    releaseFirst?.()

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    await r1.json()
    await r2.json()

    expect(forwardChatCompletion).toHaveBeenCalledTimes(2)
    const secondReq = forwardChatCompletion.mock.calls[1]?.[0]
    expect(secondReq.chatId).toBe('chat-serial')
    expect(secondReq.parentId).toBe('msg-serial-1')
  })
})


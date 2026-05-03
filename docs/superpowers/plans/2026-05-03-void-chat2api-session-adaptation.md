# Void × Chat2API（qwen-ai）SessionKey + Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Void 的每个对话线程在 Chat2API 的 `qwen-ai` 渠道中稳定复用同一个上游会话（同 `chatId`），并支持“跳回到历史节点继续”（通过 checkpoint 分支）。

**Architecture:** Void 每个 threadId 作为 `X-Chat2API-Session`；Chat2API 维护 `sessionKey -> {accountId, chatId, currentParentId, checkpoints}`，并在每轮结束后生成 `X-Chat2API-Checkpoint`；撤销时 Void 传回 checkpoint 让 Chat2API 用对应 parentId 继续。

**Tech Stack:** Void（VSCode/Electron/TypeScript + openai-node）；Chat2API（Electron + Koa/Proxy + TypeScript）。

---

## File Map（将被创建/修改的文件）

### Chat2API

**Create**
- `Chat2API/src/main/proxy/services/qwenAiSessionService.ts`
- `Chat2API/src/main/proxy/services/qwenAiSessionService.test.ts`（基于 node:test，依赖 `tsx` 执行 TS 测试）
- `Chat2API/src/main/proxy/adapters/qwen-ai.test.ts`

**Modify**
- `Chat2API/package.json`（加入单测脚本/依赖）
- `Chat2API/src/main/proxy/types.ts`（ProxyContext 增加 sessionKey/checkpoint 字段）
- `Chat2API/src/main/proxy/routes/chat.ts`（读取 Header、串行队列、设置响应头、回写 session state）
- `Chat2API/src/main/proxy/forwarder.ts`（qwen-ai 分支将 checkpointParentId 传入 adapter）
- `Chat2API/src/main/proxy/adapters/qwen-ai.ts`（支持显式 `chatId`/`parentId` 覆盖，优先于 hash 推断）

### Void

**Modify**
- `src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts`（CheckpointEntry 增加可选 `chat2apiCheckpointId` 字段）
- `src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts`（主进程参数增加 `chat2apiSessionKey`/`chat2apiCheckpointId`；final event 回传 checkpoint）
- `src/vs/workbench/contrib/void/browser/chatThreadService.ts`（发送请求时带 session+checkpoint；收到 final 时把 checkpoint 写进“新插入的 checkpoint 消息”）
- `src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`（OpenAI-Compatible 调用时附加请求头；用自定义 fetch 捕获响应头 checkpoint 并回传）
- `src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts`（IPC 参数类型同步）

---

## Task 1: 为 Chat2API 引入最小单测跑法（node:test + tsx）

**Files:**
- Modify: `Chat2API/package.json`

- [ ] **Step 1: 写一个会失败的“测试脚本不存在”检查（人工）**

Run: `cd Chat2API && npm run test:unit`

Expected: 命令不存在（exit != 0）。

- [ ] **Step 2: 加入 tsx 依赖与测试脚本**

编辑 `Chat2API/package.json`，加入：

```json
{
  "devDependencies": {
    "tsx": "^4.0.0"
  },
  "scripts": {
    "test:unit": "node --test --import tsx src/**/*.test.ts"
  }
}
```

- [ ] **Step 3: 再次运行以验证脚本可执行（此时尚无测试文件，会 0 tests 或 fail 取决于 Node 版本）**

Run: `cd Chat2API && npm run test:unit`

Expected: 能启动 node:test（可先无测试）。

- [ ] **Step 4: Commit**

```bash
git add Chat2API/package.json
git commit -m "test(chat2api): add node:test runner for ts unit tests"
```

---

## Task 2: qwenAiSessionService（sessionKey → chatId/parentId/checkpoints + 串行队列）

**Files:**
- Create: `Chat2API/src/main/proxy/services/qwenAiSessionService.ts`
- Test: `Chat2API/src/main/proxy/services/qwenAiSessionService.test.ts`

- [ ] **Step 1: 写 failing test：同一 sessionKey 串行化**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Chat2API && npm run test:unit`

Expected: FAIL（`QwenAiSessionService` 不存在）。

- [ ] **Step 3: 写 failing test：checkpoint 解析与回滚 parentId**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { QwenAiSessionService } from './qwenAiSessionService'

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
```

- [ ] **Step 4: 实现最小 QwenAiSessionService（让测试转绿）**

```ts
import crypto from 'node:crypto'

type SessionBinding = { providerId: string; accountId: string; chatId: string }
type CheckpointInfo = { parentId: string; createdAt: number; requestId?: string }

type SessionState = {
  binding: SessionBinding
  currentParentId: string | null
  checkpoints: Map<string, CheckpointInfo>
  updatedAt: number
}

export class QwenAiSessionService {
  private readonly sessions = new Map<string, SessionState>()
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

  getSession(sessionKey: string): SessionState | undefined {
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
```

- [ ] **Step 5: Run tests**

Run: `cd Chat2API && npm run test:unit`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add Chat2API/src/main/proxy/services/qwenAiSessionService.ts Chat2API/src/main/proxy/services/qwenAiSessionService.test.ts
git commit -m "feat(chat2api): add qwen-ai session service with checkpoints and queue"
```

---

## Task 3: Chat2API 路由接入 Header（Session + Checkpoint）并驱动 qwen-ai adapter

**Files:**
- Modify: `Chat2API/src/main/proxy/types.ts`
- Modify: `Chat2API/src/main/proxy/routes/chat.ts`
- Modify: `Chat2API/src/main/proxy/forwarder.ts`
- Modify: `Chat2API/src/main/proxy/adapters/qwen-ai.ts`

### 3.1 types：ProxyContext 增字段（TDD）

- [ ] **Step 1: 写 failing test：类型编译检查（人工）**

Run: `cd Chat2API && npm run build`

Expected: 先失败（尚未实现时可忽略）；本步用于后续回归。

- [ ] **Step 2: 修改 ProxyContext**

在 `Chat2API/src/main/proxy/types.ts` 的 `ProxyContext` 增加：

```ts
export interface ProxyContext {
  requestId: string
  sessionKey?: string
  checkpointId?: string
}
```

### 3.2 qwen-ai adapter：支持显式 parentId 覆盖（优先于 hash 推断）

- [ ] **Step 3: 写 failing test（最小）：显式 parentId 时应优先使用**

在 `qwen-ai.ts` 附近为 `chatCompletion` 抽出一个纯函数（便于测试）：

```ts
export function resolveParentIdForQwenAi(args: {
  requestedParentId?: string | null
  derivedParentId?: string | null
}): string | null {
  return args.requestedParentId ?? args.derivedParentId ?? null
}
```

对应测试（放 `qwen-ai.test.ts`，与前述 test runner 一致）：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveParentIdForQwenAi } from './qwen-ai'

test('requested parentId overrides derived parentId', () => {
  assert.equal(resolveParentIdForQwenAi({ requestedParentId: 'p1', derivedParentId: 'p2' }), 'p1')
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd Chat2API && npm run test:unit`

Expected: FAIL（函数未导出/不存在）。

- [ ] **Step 5: 实现并改造 chatCompletion 入参**

在 `QwenAiAdapter.chatCompletion` 的参数里允许传入：

```ts
parentId?: string | null
chatId?: string
```

并在构造 payload 前：

```ts
const parentId = resolveParentIdForQwenAi({
  requestedParentId: request.parentId ?? null,
  derivedParentId: derivedFromContextMap ?? null,
})
```

确保 `payload.parent_id = parentId`（若为 null 则不传或传 null，按现有逻辑保持一致）。

- [ ] **Step 6: Run tests**

Run: `cd Chat2API && npm run test:unit`

Expected: PASS。

### 3.3 路由：读取 Header，强制复用 chatId/accountId，并生成 checkpoint 响应头

- [ ] **Step 7: 在 `chat.ts` 读取 Header 并注入到 context**

读取：

```ts
const sessionKey = typeof ctx.headers['x-chat2api-session'] === 'string' ? ctx.headers['x-chat2api-session'].trim() : ''
const requestedCheckpoint = typeof ctx.headers['x-chat2api-checkpoint'] === 'string' ? ctx.headers['x-chat2api-checkpoint'].trim() : ''
```

并传入 `ProxyContext`：

```ts
const context: ProxyContext = { requestId, sessionKey: sessionKey || undefined, checkpointId: requestedCheckpoint || undefined }
```

- [ ] **Step 8: 在选择 provider/account 前，若 sessionKey 已绑定则锁定 account**

在 load balancer 选择之前：

```ts
if (context.sessionKey) {
  const s = qwenAiSessionService.getSession(context.sessionKey)
  if (s?.binding?.providerId === 'qwen-ai') {
    preferredProviderId = 'qwen-ai'
    preferredAccountId = s.binding.accountId
  }
}
```

- [ ] **Step 9: 为同 sessionKey 请求加锁（串行）**

把整个“发起一次上游请求 + 等待其结束（stream end）+ 更新 session state”包裹在：

```ts
await qwenAiSessionService.runExclusive(context.sessionKey, async () => { ... })
```

对 stream：在 stream 的 `end` 事件里更新 parentId 并释放（通过 runExclusive 的 await 等待 end）。

- [ ] **Step 10: 生成并写回响应头 checkpoint（stream 前必须 setHeader）**

当确定 provider 为 `qwen-ai` 且 `context.sessionKey` 存在时：

```ts
const outgoingCheckpoint = qwenAiSessionService.createPendingCheckpoint(context.sessionKey, { requestId })
ctx.set('X-Chat2API-Checkpoint', outgoingCheckpoint)
```

并在 request 完成后将该 checkpoint 绑定到最终 parentId：

```ts
qwenAiSessionService.finalizeCheckpoint(context.sessionKey, outgoingCheckpoint, { parentId })
```

- [ ] **Step 11: 应用请求侧 checkpoint（撤销）**

当 `requestedCheckpoint` 存在时：

```ts
const parentIdOverride = qwenAiSessionService.resolveCheckpointParent(context.sessionKey, requestedCheckpoint)
```

把 `parentIdOverride` 传到 forwarder（通过 `context` 或 `request` 扩展字段），最终传入 `QwenAiAdapter.chatCompletion({ parentId: parentIdOverride })`。

- [ ] **Step 12: 每轮完成后更新 currentParentId**

non-stream：使用 `result.parentId`；
stream：使用 `(result.stream as any).qwenAiHandler.getResponseId()`（你们现有逻辑已在 `chat.ts` 里能拿到）。

完成后：

```ts
qwenAiSessionService.updateCurrentParent(context.sessionKey, parentId)
qwenAiSessionService.bindSession(context.sessionKey, { providerId: 'qwen-ai', accountId: account.id, chatId })
```

- [ ] **Step 13: Commit**

```bash
git add Chat2API/src/main/proxy/types.ts Chat2API/src/main/proxy/routes/chat.ts Chat2API/src/main/proxy/forwarder.ts Chat2API/src/main/proxy/adapters/qwen-ai.ts
git commit -m "feat(chat2api): sessionKey + checkpoint headers for qwen-ai conversations"
```

---

## Task 4: Void 侧：threadId → SessionKey；checkpoint 写入“checkpoint 消息”；请求头注入；捕获响应头 checkpoint

**Files:**
- Modify: `src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts`
- Modify: `src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts`
- Modify: `src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- Modify: `src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`
- Modify: `src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts`

### 4.1 CheckpointEntry 增加 chat2apiCheckpointId（兼容旧数据）

- [ ] **Step 1: 修改类型（可选字段）**

在 `CheckpointEntry` 增加：

```ts
chat2apiCheckpointId?: string
```

### 4.2 IPC 参数：从 browser 传到 electron-main，再回传到 onFinalMessage

- [ ] **Step 2: 扩展 sendLLMMessageTypes**

在 `MainSendLLMMessageParams` 增加：

```ts
chat2apiSessionKey?: string
chat2apiCheckpointId?: string
```

并在 `OnFinalMessage` 的参数增加：

```ts
chat2apiCheckpointId?: string
```

### 4.3 chatThreadService：发送时带 header；完成时把 checkpoint 写入“新插入的 checkpoint 消息”

- [ ] **Step 3: 发送时计算 checkpointId（撤销/跳回）**

在 `_runChatAgent` 调用 `sendLLMMessage` 前：

```ts
const sessionKey = threadId
let checkpointToUse: string | undefined
const currIdx = this.state.allThreads[threadId]?.state.currCheckpointIdx
if (currIdx !== null && currIdx !== undefined) {
  const msg = this.state.allThreads[threadId]?.messages?.[currIdx]
  if (msg?.role === 'checkpoint') checkpointToUse = msg.chat2apiCheckpointId
}
```

并传入：

```ts
chat2apiSessionKey: sessionKey,
chat2apiCheckpointId: checkpointToUse,
```

- [ ] **Step 4: 完成时把 checkpoint 写入新插入的 checkpoint**

当前逻辑是 LLM 完成后 `if (!isRunningWhenEnd) this._addUserCheckpoint({ threadId })`。

改为：

1) 在 `onFinalMessage` 里把 `chat2apiCheckpointId` 暂存到局部变量 `pendingCheckpointId`；
2) 在 `this._addUserCheckpoint` 的参数里新增 `chat2apiCheckpointId?: string`，并写入生成的 `CheckpointEntry`；
3) 调用处传入 `pendingCheckpointId`。

### 4.4 electron-main：OpenAI-Compatible 请求注入 Header + 捕获响应头 checkpoint

- [ ] **Step 5: 为 OpenAI SDK 注入 request-specific headers**

在 `_sendOpenAICompatibleChat` 发起请求时，给 `openai.chat.completions.create` 传入 request options（第二参数）：

```ts
const extraHeaders: Record<string, string> = {}
if (params.chat2apiSessionKey) extraHeaders['X-Chat2API-Session'] = params.chat2apiSessionKey
if (params.chat2apiCheckpointId) extraHeaders['X-Chat2API-Checkpoint'] = params.chat2apiCheckpointId
```

并在 create 调用中：

```ts
openai.chat.completions.create(payload, { headers: extraHeaders })
```

- [ ] **Step 6: 用自定义 fetch 捕获 `X-Chat2API-Checkpoint` 响应头**

构造 OpenAI client 时提供 `fetch`：

```ts
let checkpointFromResponse: string | undefined
const fetchWithCheckpoint: typeof fetch = async (input, init) => {
  const res = await fetch(input as any, init as any)
  const v = res.headers.get('x-chat2api-checkpoint')
  if (v) checkpointFromResponse = v
  return res
}
```

在 `newOpenAICompatibleSDK` 的 `commonPayloadOpts` 注入 `fetch: fetchWithCheckpoint`（只对本次请求有效；可在 `_sendOpenAICompatibleChat` 内直接 new client）。

当流式结束调用 `onFinalMessage` 时，把 `checkpointFromResponse` 透传：

```ts
onFinalMessage({ fullText, fullReasoning, anthropicReasoning: null, chat2apiCheckpointId: checkpointFromResponse })
```

- [ ] **Step 7: Commit**

```bash
git add src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts src/vs/workbench/contrib/void/browser/chatThreadService.ts src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts
git commit -m "feat(void): propagate chat2api session+checkpoint headers for stable qwen-ai conversations"
```

---

## Task 5: 手工验收（Void × Chat2API × qwen-ai）

**Prereq:**
- Chat2API 配置一个 `qwen-ai` 账号可用
- Void 的 OpenAI-Compatible endpoint 指向 Chat2API（例如 `http://127.0.0.1:<port>/v1`）

- [ ] **Step 1: 连续对话复用**
  - 在 Void 新建一个对话线程（threadId 固定）
  - 连续发 3 轮用户消息
  - 观察 qwen 网页：仅一个会话窗口持续追加（chatId 不变）

- [ ] **Step 2: 撤销到历史 checkpoint 后继续**
  - 在 Void 使用现有“跳到 checkpoint”能力回到更早节点（会触发截断 messages）
  - 再发送一条新消息
  - 观察 qwen 网页：同 chatId 下从旧 parentId 继续（形成分支效果）

- [ ] **Step 3: 并发保护**
  - 快速连点两次发送（或触发两次并发请求）
  - 预期：第二次请求在 Chat2API 侧等待第一条完成后再发起（不会 parentId 乱序）

- [ ] **Step 4: 导出日志核对**
  - 在 Chat2API “请求日志”导出选中相关请求
  - 确认每条请求都携带 `X-Chat2API-Session`，撤销后的请求携带 `X-Chat2API-Checkpoint`

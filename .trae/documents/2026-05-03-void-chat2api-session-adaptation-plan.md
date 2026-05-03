# Void × Chat2API 深度适配（A：连续对话 + 撤销）执行计划

## 摘要

目标是在 `qwen-ai`（Qwen 国际版网页逆向）渠道下，实现：

1. **每个 Void 对话线程 = 一个稳定的上游 qwen-ai 会话**（同 `chatId`，不再创建多个网页会话窗口）。
2. **支持撤销到历史某轮继续对话**：Void 在回到某个历史 checkpoint 后继续发问，Chat2API 用对应的上游 `parentId` 作为分支起点。

采用协议：`X-Chat2API-Session` + `X-Chat2API-Checkpoint`。

## 当前状态分析（基于仓库实际代码）

### Void 侧

- Void 通过 openai-node SDK 发送 OpenAI-Compatible 请求，入口在 [sendLLMMessage.impl.ts](file:///workspace/src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts#L72-L172) 的 `newOpenAICompatibleSDK()` 与 `_sendOpenAICompatibleChat()`。
- openai-node 版本为 `^4.96.0`（见根 [package.json](file:///workspace/package.json#L120-L140)）。
- Void 的“撤销/回到历史节点继续”是通过 checkpoint 机制实现：当 `currCheckpointIdx` 不为 null 时，会截断该 checkpoint 之后的消息（见 [chatThreadService.ts](file:///workspace/src/vs/workbench/contrib/void/browser/chatThreadService.ts#L1270-L1295)）。
- 现状缺口：Void 当前链路只消费流式 chunk，不读取 HTTP 响应头，因此拿不到 Chat2API 回传的 checkpoint header。

### Chat2API 侧

- Chat2API 在 chat 路由中已经存在“从 Header 读取功能参数”的模式（例如 `X-Web-Search` 等，见 [chat.ts](file:///workspace/Chat2API/src/main/proxy/routes/chat.ts#L169-L195)），因此扩展 `X-Chat2API-Session` / `X-Chat2API-Checkpoint` 属于同一类改动。
- `qwen-ai` 适配器已存在 messages-hash 的 contextMap 继续对话逻辑（见 [qwen-ai.ts](file:///workspace/Chat2API/src/main/proxy/adapters/qwen-ai.ts#L348-L370)）。
- 现状缺口：Chat2API 尚未实现“按 sessionKey 锁定 account + 复用 chatId + checkpoint 回滚 parentId + 串行化”。

## 方案与关键决策

- **会话粒度**：每个 Void 对话线程（threadId）对应一个 `X-Chat2API-Session`。
- **重置方式**：Void 新建对话/清空上下文时生成新的 threadId（或新的 sessionKey）；Chat2API 以 sessionKey 变化视为新会话。
- **撤销方式（推荐）**：Checkpoint 抽象，不暴露上游 parentId；Chat2API 每轮返回 `X-Chat2API-Checkpoint`，Void 保存到“checkpoint 消息节点”，撤销后继续对话时带回该 checkpoint。
- **并发策略**：同 sessionKey 下请求在 Chat2API 侧串行化（队列），避免 parentId 乱序导致分支不可预期。

## 计划分解（子代理分步执行）

> 执行方式：每个 Task 由一个独立子代理实现（按 TDD：先写失败用例，再最小实现），主代理逐步验收合并。

### Task 1（Chat2API）：引入最小单测 runner（node:test + tsx）

**修改文件**
- `Chat2API/package.json`

**步骤**
- [ ] 加入 `tsx` devDependency
- [ ] 增加 `npm run test:unit` 脚本（`node --test --import tsx src/**/*.test.ts`）
- [ ] 运行 `cd Chat2API && npm run test:unit` 确认可启动

**验收**
- 能执行 test runner（即使暂时 0 tests 也可）

### Task 2（Chat2API）：实现 sessionKey → {accountId, chatId, currentParentId, checkpoints} + 队列

**新增文件**
- `Chat2API/src/main/proxy/services/qwenAiSessionService.ts`
- `Chat2API/src/main/proxy/services/qwenAiSessionService.test.ts`

**关键 API（在测试中驱动实现）**
- `runExclusive(sessionKey, fn)`：同 key 串行执行
- `bindSession(sessionKey, { providerId, accountId, chatId })`
- `updateCurrentParent(sessionKey, parentId)`
- `createPendingCheckpoint(sessionKey, meta)` / `finalizeCheckpoint(sessionKey, checkpointId, { parentId })`
- `resolveCheckpointParent(sessionKey, checkpointId)`

**验收**
- 单测覆盖：串行化 + checkpoint 绑定与解析

### Task 3（Chat2API）：路由接入 Header + 强制复用 qwen-ai 会话 + 回传 checkpoint header

**修改文件**
- `Chat2API/src/main/proxy/types.ts`（ProxyContext 增 `sessionKey`/`checkpointId`/`checkpointParentId`）
- `Chat2API/src/main/proxy/routes/chat.ts`
- `Chat2API/src/main/proxy/forwarder.ts`
- `Chat2API/src/main/proxy/adapters/qwen-ai.ts`

**实现要点**
- `chat.ts` 读取 `ctx.headers['x-chat2api-session']` / `ctx.headers['x-chat2api-checkpoint']`
- 若 provider 为 `qwen-ai` 且有 sessionKey：
  - 用 session service 锁定 account（避免负载均衡切换账号）
  - 对同 sessionKey 用 `runExclusive` 串行包裹一次完整请求
  - 在开始响应前 `ctx.set('X-Chat2API-Checkpoint', <checkpointId>)`
  - 请求结束时用上游 responseId 更新 `currentParentId` 并 finalize checkpoint
- `forwarder.ts` 的 qwen-ai 分支将 `chatId`（复用同会话）与 `parentId`（撤销分支）传给 adapter
- `qwen-ai.ts` 的 `chatCompletion` 支持显式传入 `chatId` 与 `parentId`，并让“显式 parentId”优先于 hash 推断

**验收**
- 相同 sessionKey 连续请求不会创建新 chatId
- 传 checkpoint 后会使用对应 parentId 继续

### Task 4（Void）：在 OpenAI-Compatible 请求中注入 Header，并捕获响应头 checkpoint 写入 checkpoint 消息

**修改文件**
- `src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts`：`CheckpointEntry` 增 `chat2apiCheckpointId?: string`（可选字段，兼容旧存储）
- `src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts`：IPC 参数与 final event 增 `chat2apiSessionKey`/`chat2apiCheckpointId`
- `src/vs/workbench/contrib/void/browser/chatThreadService.ts`：
  - 发送时：`chat2apiSessionKey = threadId`
  - 若用户当前处于某 checkpoint（`currCheckpointIdx !== null`），则从该 checkpoint 消息读取 `chat2apiCheckpointId` 并带到请求
  - 完成时：把从主进程回传的 `chat2apiCheckpointId` 写入“新插入的 checkpoint 消息”
- `src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`：
  - 对 openAICompatible provider：为 openai-node client 注入 request-specific headers
  - 通过 `ClientOptions.fetch` 包装 fetch，在第一次响应时读取 `x-chat2api-checkpoint` 并缓存
  - 在 `onFinalMessage` 回传该 checkpointId
- `src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts`：同步参数类型

**验收**
- 同一 threadId 连续对话，Chat2API 收到固定 `X-Chat2API-Session`
- 在 Void “撤销到 checkpoint 后继续对话”，Chat2API 收到 `X-Chat2API-Checkpoint`

### Task 5：端到端手工验收（Void × Chat2API × qwen-ai）

- [ ] 连续 3 轮提问：Qwen 网页侧只出现一个会话窗口持续追加
- [ ] 撤销到历史节点继续：Qwen 网页侧在同 chatId 下形成分支（从旧 parentId 继续）
- [ ] 并发（快速连发）不会导致 parentId 乱序（Chat2API 侧串行）

## 风险与回退

- openai-node SDK 的 fetch 注入能力：本仓库使用的 openai-node 支持通过 `ClientOptions` 传 `fetch`，若遇到类型限制，将在 Void 侧局部 `as any` 处理（不影响运行时）。
- 响应头在流式场景：fetch 返回 Response 时即可读取 headers，因此可在开始消费流前缓存 checkpointId。
- 失败回退：即使 Void 未读到响应头 checkpoint，也不影响基本聊天；只是撤销分支无法精确落在上游 parentId（会退回 hash 兜底）。

## 验证步骤（CI/本地）

**Chat2API**
- `cd Chat2API && npm ci`
- `cd Chat2API && npm run test:unit`
- `cd Chat2API && npm run build`

**Void**
- `npm run compile`（或按仓库既有 build 指南）
- 手工运行 Void + 配置 openAICompatible endpoint 指向 Chat2API


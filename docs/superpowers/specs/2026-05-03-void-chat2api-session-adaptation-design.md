# Void × Chat2API 深度适配：qwen-ai 连续对话与撤销（SessionKey + Checkpoint）设计

## 背景

Void 通过 Chat2API 使用 qwen 国际版（`qwen-ai` provider）时，希望在“同一 Void 对话线程”下始终复用同一个 qwen-ai 网页会话（同一个 `chatId` 对话窗口），并支持用户从历史某一轮“撤销/回到某节点继续对话”（在 qwen-ai 侧形成分支）。

当前仅依赖 messages 内容推断（hash）来做会话复用，容易因上下文裁剪、工具提示注入、系统提示动态变化等导致 hash 不稳定，从而创建多个上游会话窗口。

## 目标

- 在“每个 Void 对话线程”粒度上，稳定复用同一个 qwen-ai `chatId`（除非用户显式新建对话，即生成新的会话键）。
- 支持从历史某一轮继续：Void 能选择某个历史节点作为起点，在 qwen-ai 侧从该节点继续生成，形成分支。
- 兼容不携带会话键的第三方 OpenAI 客户端：仍可使用现有 messages-hash 作为兜底策略。

## 非目标

- 不做跨设备同步（Void/Chat2API 均为本地使用场景）。
- 不为所有 provider 实现分支撤销，仅保证 qwen-ai（可扩展到 qwen chat2.qianwen.com、其它 provider 作为后续）。
- 不尝试在上游网页侧“删除/回滚消息”，只做“选择 parentId 继续”的逻辑分支。

## 总体方案

### 关键抽象

- **SessionKey**：由 Void 为每个对话线程生成的稳定唯一 ID，通过请求头传给 Chat2API。
- **CheckpointId**：由 Chat2API 为每轮请求生成的“可回退点”ID，Void 保存到对应消息节点；撤销时再通过请求头带回。

### 协议（Void ↔ Chat2API）

#### 请求头（Void → Chat2API）

- `X-Chat2API-Session: <sessionKey>`
  - 必填（Void 深度适配场景）
  - 定义：同一 Void 对话线程必须使用同一个 sessionKey；用户新建对话则生成新的 sessionKey
- `X-Chat2API-Checkpoint: <checkpointId>`（可选）
  - 用于撤销/回到历史某一轮继续对话
  - 定义：以该 checkpoint 对应的 parentId 作为本次 qwen-ai 请求的 `parent_id`

可选扩展头（后续）
- `X-Chat2API-Session-Reset: true`（可选）
  - 显式要求 Chat2API 忽略已有映射并新建上游会话；当前版本不要求实现（Void 通过换 sessionKey 达到同效果）

#### 响应头（Chat2API → Void）

- `X-Chat2API-Checkpoint: <newCheckpointId>`
  - Chat2API 为本次成功完成的会话节点生成的新 checkpointId
  - Void 保存到本轮消息节点，用于后续撤销
- 可选（后续）
  - `X-Chat2API-Upstream-ChatId: <qwenChatId>`（仅调试）
  - `X-Chat2API-Upstream-ParentId: <qwenParentId>`（仅调试）

## Chat2API 侧行为设计

### 会话存储结构

对 qwen-ai provider，维护内存映射（可后续持久化）：

- `sessionKey -> SessionState`

其中 `SessionState` 至少包含：

- `providerId`（固定为 `qwen-ai`）
- `accountId`（首次选中后固定；避免同 sessionKey 负载均衡切换账号导致 chatId 不可用）
- `chatId`
- `currentParentId`（下一轮默认使用的 parentId；通常为上一轮返回的 responseId）
- `checkpoints: Map<checkpointId, { parentId: string, createdAt: number, requestId?: string }>`
- `updatedAt` / `createdAt`

### 会话选择规则（优先级）

对每次 `/v1/chat/completions`：

1. 若存在 `X-Chat2API-Session`：
   - 查找 `SessionState`
   - 若不存在：执行首次会话初始化（见下文），并绑定 accountId/chatId
   - 若存在：强制复用其 accountId/chatId（禁止重新 load balance）
2. 若存在 `X-Chat2API-Checkpoint`：
   - 在 `SessionState.checkpoints` 中查找对应 parentId
   - 查到则用该 parentId 覆盖本次请求的 parentId（形成分支）
   - 查不到则回退到 `currentParentId`（同时记录 warn log）
3. 若请求不携带 SessionKey：
   - 使用既有 messages-hash 映射逻辑作为兜底（兼容第三方客户端）

### 首次会话初始化（有 SessionKey，但尚无 SessionState）

- 执行正常 provider/account 选择（load balancer）
- 创建上游 qwen-ai `chatId`
- 初始 `currentParentId = null`（由 qwen-ai API 返回的第一轮 responseId 在完成后写回）
- 写入 `SessionState` 并缓存

### 每轮完成后的状态更新

当一次请求成功完成（stream end 或 non-stream resolve）后：

- 获取本轮最终的上游 parentId（qwen-ai responseId，现有 stream handler 可提供）
- 更新 `SessionState.currentParentId = responseId`
- 生成 `newCheckpointId`（随机短 ID 或 uuid）
- `checkpoints.set(newCheckpointId, { parentId: responseId, createdAt: now, requestId })`
- 将 `X-Chat2API-Checkpoint: newCheckpointId` 写入响应头返回给 Void

### 并发与一致性

同一 `sessionKey` 下若出现并发请求（用户快速连续触发）：

- 推荐策略：串行化（每个 sessionKey 一个队列），保证 parentId 线性推进
- 若不串行：需要以“完成先后”更新 currentParentId，会导致分支不可预期

本设计默认：**Chat2API 对同一 sessionKey 的请求串行化**（实现方式可为内存队列/Promise chain）。

### 过期与清理

内存会话避免无限增长：

- `SessionState.updatedAt` 超过 TTL（例如 24h）可清理
- checkpoints 数量上限（例如 200）超过则按时间淘汰最早的 checkpoint

## Void 侧行为设计

### SessionKey 生命周期

- 每个 Void 对话线程创建时生成 `sessionKey`
- 只要该对话线程未“新建对话”，所有请求必须复用该 `sessionKey`
- 用户点击“新建对话/清空上下文”时：生成新的 `sessionKey`（不复用旧值）

### Checkpoint 生命周期

- 每次请求完成时，从响应头读 `X-Chat2API-Checkpoint` 并绑定到对应消息节点
- 当用户选择撤销到某节点继续时：
  - 从该节点取出 checkpointId
  - 下一次请求带 `X-Chat2API-Checkpoint: <checkpointId>`，并继续沿用 `X-Chat2API-Session`

## 向后兼容

- 不携带 `X-Chat2API-Session` 的客户端保持现有行为（messages-hash 复用或新建）
- Void 深度适配场景强制携带 SessionKey，可显著降低因 messages 变化导致的新窗口问题

## 安全与隐私

- SessionKey/CheckpointId 只在本机回环或用户信任网络环境中使用；不包含敏感信息
- Chat2API 日志中避免记录完整 Header 值（仅记录是否存在，或记录 hash/截断）

## 观测与调试（建议最低限度）

- Chat2API request log 记录：
  - sessionKey 是否存在、是否命中 SessionState、是否命中 checkpoint
  - 当前使用的 chatId（可脱敏/截断）
- Void 可在 debug 模式展示当前 sessionKey 与最近 checkpointId

## 测试计划（最小集合）

- 单元测试（Chat2API）：
  - 同一 sessionKey 连续两轮：第二轮不调用 createChat，复用同 chatId
  - 生成 checkpoint 后撤销：使用旧 checkpoint 的 parentId 发起请求
  - checkpoint 不存在：回退到 currentParentId
  - 并发两请求：按队列串行推进 parentId
- 手工验证：
  - Void 同一对话连续提问：qwen-ai 网页仅一个会话窗口持续追加
  - 撤销到某轮继续：qwen-ai 侧出现分支（同 chatId 下从旧节点继续）

## 里程碑

1. Chat2API：支持从 Header 读取 SessionKey/Checkpoint，建立 sessionKey→chatId/currentParentId/checkpoints 映射，并响应头返回 checkpoint
2. Void：为每个对话线程生成 SessionKey；保存 checkpoint；撤销时带 checkpoint
3. 加入并发串行队列与 TTL 清理策略


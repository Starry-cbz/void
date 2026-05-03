# Void × Chat2API（qwen-ai）连续对话与撤销 Spec

## Why
当前 Void 通过 Chat2API 逆向调用 qwen 国际版时，会话复用依赖 messages 推断，容易因上下文变化导致上游频繁新建对话窗口；同时需要支持“撤销到历史某一轮继续对话”的分支能力。

## What Changes
- 在 Void → Chat2API 的 OpenAI-Compatible 请求中新增会话协议：`X-Chat2API-Session` 与 `X-Chat2API-Checkpoint`
- Chat2API 为 `qwen-ai` 渠道实现基于 `sessionKey` 的会话绑定（稳定复用同一个上游 `chatId`）并提供 checkpoint 分支
- Void 在每个对话线程粒度生成并传递 `sessionKey`，并在每轮完成后保存 Chat2API 返回的 `checkpointId`，撤销时回传历史 checkpoint
- **非 BREAKING**：不带 Header 的第三方客户端保持现有行为（继续使用 messages-hash 兜底）

## Impact
- Affected specs: 会话复用、撤销/回滚分支、稳定连续对话体验
- Affected code:
  - Chat2API：`src/main/proxy/routes/chat.ts`、`src/main/proxy/forwarder.ts`、`src/main/proxy/adapters/qwen-ai.ts`
  - Void：`src/vs/workbench/contrib/void/browser/chatThreadService.ts`、`src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`

## ADDED Requirements

### Requirement: SessionKey 会话绑定
系统 SHALL 支持通过 `X-Chat2API-Session` 将“同一 Void 对话线程”稳定绑定到同一个 qwen-ai 上游会话（同 `chatId`），并在后续请求中复用该会话。

#### Scenario: 连续对话复用（Success）
- **WHEN** Void 在同一 threadId 下连续发送多轮消息，且每次请求携带相同 `X-Chat2API-Session`
- **THEN** Chat2API MUST 复用同一个上游 `chatId`（不创建新的 chat 窗口）
- **AND** Chat2API MUST 将每轮生成的上游 parentId 作为下一轮默认 parentId

### Requirement: Checkpoint 分支撤销
系统 SHALL 支持通过 `X-Chat2API-Checkpoint` 将本次生成挂接到历史节点（parentId），实现撤销后继续对话（分支）。

#### Scenario: 撤销后继续（Success）
- **WHEN** Void 选择历史某一轮继续对话，并在请求中携带对应 `X-Chat2API-Checkpoint`
- **THEN** Chat2API MUST 使用该 checkpoint 映射的 parentId 作为本次请求的 parentId
- **AND** 该请求 MUST 仍在同一个 `chatId` 会话下执行

### Requirement: 响应返回新的 CheckpointId
系统 SHALL 在每轮成功完成后，为该轮生成新的 `checkpointId` 并通过响应头返回，供 Void 保存。

#### Scenario: 响应头回传（Success）
- **WHEN** Chat2API 成功完成一次 qwen-ai 请求（流式或非流式）
- **THEN** 响应 MUST 包含 `X-Chat2API-Checkpoint: <newCheckpointId>`

### Requirement: 并发串行化（同 sessionKey）
系统 SHALL 对同一 `X-Chat2API-Session` 下的请求进行串行化处理，避免 parentId 乱序导致分支不可预期。

#### Scenario: 并发请求（Success）
- **WHEN** 同一 sessionKey 下出现并发的两次请求
- **THEN** Chat2API MUST 保证按顺序执行并更新 parentId（后一个等待前一个完成）

## MODIFIED Requirements

### Requirement: qwen-ai 会话复用策略（增强）
现有 messages-hash 推断会话的逻辑 SHALL 作为兜底保留；但当请求携带 `X-Chat2API-Session` 时，系统 SHALL 优先使用 sessionKey 绑定逻辑。

## REMOVED Requirements
无。


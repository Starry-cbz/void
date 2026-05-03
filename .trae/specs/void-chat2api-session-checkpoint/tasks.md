# Tasks

- [x] Task 1: Chat2API 增加 qwen-ai SessionKey + Checkpoint 的状态管理服务
  - [x] SubTask 1.1: 新增 `qwenAiSessionService`（sessionKey → {accountId, chatId, currentParentId, checkpoints}）
  - [x] SubTask 1.2: 实现同 sessionKey 的串行队列（runExclusive）
  - [x] SubTask 1.3: 增加最小单元测试覆盖（队列顺序、checkpoint resolve）

- [x] Task 2: Chat2API 路由/转发层接入 Header 协议并驱动 qwen-ai adapter
  - [x] SubTask 2.1: 在 `/v1/chat/completions` 读取 `X-Chat2API-Session`/`X-Chat2API-Checkpoint`
  - [x] SubTask 2.2: sessionKey 存在时锁定 accountId/chatId 并串行化请求
  - [x] SubTask 2.3: 请求完成后更新 currentParentId，并写回响应头 `X-Chat2API-Checkpoint`
  - [x] SubTask 2.4: forwarder 将 checkpoint 对应的 parentId 传入 adapter
  - [x] SubTask 2.5: adapter 支持显式 parentId/chatId 覆盖优先级

- [x] Task 3: Void 侧生成并传递 SessionKey；保存并回传 Checkpoint
  - [x] SubTask 3.1: 以 threadId 作为 `X-Chat2API-Session` 的稳定值
  - [x] SubTask 3.2: 将“当前撤销点”的 checkpointId 作为 `X-Chat2API-Checkpoint` 发送到 Chat2API
  - [x] SubTask 3.3: 从 Chat2API 响应头捕获 `X-Chat2API-Checkpoint` 并写入本地 checkpoint 消息节点

- [x] Task 4: 端到端手工验证（Void × Chat2API × qwen-ai）
  - [x] SubTask 4.1: 连续对话多轮复用同一 qwen-ai chat 窗口
  - [x] SubTask 4.2: 撤销到历史节点后继续对话形成分支，且仍在同 chatId 内
  - [x] SubTask 4.3: 同 sessionKey 并发请求被串行化，不出现 parentId 乱序

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2（至少需要 Chat2API 端支持响应头 checkpoint）
- Task 4 depends on Task 2 and Task 3

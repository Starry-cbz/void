# Cursor Chat Prompt + Agent Prompt v1.2：来源、版本固定与裁剪清单

本文件用于在 `adapt-void-prompts-to-cursor` 这份 spec 下，记录 Cursor Prompt 的“上游基准”来源、推荐的固定版本方式，以及将其适配到 Void 时的“保留 / 改写 / 移除”段落清单。

## 1. 来源（Upstream）

说明：Cursor 官方并未公开其内置 system prompt 的权威仓库。下面链接来自一个收集与归档各类 AI 工具 system prompt 的第三方公开仓库，仅用于“对齐结构与方法论”的参考基准，不应视为官方承诺。

### 1.1 Cursor Chat Prompt（第三方归档：`Chat Prompt.txt`）

- 归档仓库（目录）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Cursor%20Prompts
- 文件（不固定版本，可能变动）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Cursor%20Prompts/Chat%20Prompt.txt
- 文件（固定版本，推荐）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/855565f267f85b7c39f8ff68a499884fda9fc310/Cursor%20Prompts/Chat%20Prompt.txt
- Raw（固定版本，推荐用于自动同步/下载）：https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/855565f267f85b7c39f8ff68a499884fda9fc310/Cursor%20Prompts/Chat%20Prompt.txt

### 1.2 Cursor Agent Prompt v1.2（第三方归档：`Agent Prompt v1.2.txt`）

- 归档仓库（目录）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Cursor%20Prompts
- 文件（不固定版本，可能变动）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Cursor%20Prompts/Agent%20Prompt%20v1.2.txt
- 文件（固定版本，推荐）：https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/d1ace6809e41af7ebcd6a0f1dbd1ecda3c14faa0/Cursor%20Prompts/Agent%20Prompt%20v1.2.txt
- Raw（固定版本，推荐用于自动同步/下载）：https://raw.githubusercontent.com/x1xhlol/system-prompts-and-models-of-ai-tools/d1ace6809e41af7ebcd6a0f1dbd1ecda3c14faa0/Cursor%20Prompts/Agent%20Prompt%20v1.2.txt

## 2. 建议的固定版本方式（Pinning Strategy）

目标：我们需要“可 diff、可升级、可追溯”的上游基准，避免 `main` 分支漂移导致本地 overlay 的语义变化不可控。

推荐做法（按优先级）：

1. 固定到 commit SHA 的 URL
   - 任何引用上游内容的链接，都用 `blob/<sha>/...` 或 `raw.githubusercontent.com/<sha>/...`，不要用 `main`。
   - 在本文件中同时记录：仓库 URL、文件路径、commit SHA（必要时再补充提交日期/说明）。
2. 在仓库内 vendoring 一份“上游快照”（建议后续补齐，不在本次改动范围）
   - 在 `.trae/specs/adapt-void-prompts-to-cursor/` 下新增 `upstream/` 目录，放入上游原文快照，例如：
     - `upstream/cursor-chat-prompt@855565f.txt`
     - `upstream/cursor-agent-prompt-v1.2@d1ace68.txt`
   - 这样做的收益：review / diff / blame 都在本仓库内完成，不依赖外网，也更利于 CI 校验“是否意外变更”。
3. 增加“锁文件”或校验信息（建议后续补齐，不在本次改动范围）
   - 建议在同目录放一个 `upstream.lock.json`（或 markdown 表格也可），记录：
     - `repo`
     - `path`
     - `commit`
     - `sha256`（对 raw 内容做 hash）
   - 未来升级时：先更新 `commit`，再更新本地快照与 `sha256`，最后做 overlay diff 与行为回归。

## 3. “保留 / 改写 / 移除”段落清单（v1.2 基准 → Void Overlay）

说明：
- 这里的“段落”以 Cursor prompt 文本中显式的 XML 标签块（如 `<tool_calling>`）或具有明确语义边界的自然段为单位。
- “改写”通常表示：保留意图与结构，但替换为 Void 的现实约束（工具集合、工具 schema、输出格式、引用格式、平台信息结构）。
- “移除”是指：与 Void 目标不一致、引入噪声、或可能造成安全/隐私/体验问题的段落。

### 3.1 Cursor Chat Prompt（`Chat Prompt.txt`）

#### 保留

- 身份与目标：AI coding assistant、pair programming、以 `<user_query>` 为主线执行
- `<communication>`：Markdown 书写习惯（文件/目录/函数名用代码样式等）
- `<search_and_reading>`：不确定就先收集信息、偏向自己查而不是反复问用户

#### 改写

- `<tool_calling>`：保留“严格遵循工具 schema / 不要向用户暴露工具名”等原则，但必须替换为 Void 的真实工具清单与工具调用格式
- `<making_code_changes>`：Cursor 的“用带注释的代码块高亮改动”策略需要与 Void 的文件编辑机制对齐（例如：是否走 patch 工具、是否允许插入注释、如何表达上下文）
- `<additional_data>` / `<attached_files>`：对齐到 Void 的 `SELECTIONS` / 自动附加上下文结构（避免把 Cursor 的字段名当成契约）
- “Answer the user's request using the relevant tools…”：保留“能推断就直接行动”的执行风格，但与 Void 的工具策略、权限模型、以及错误处理保持一致

#### 移除

- “You MUST use the following format when citing code regions or blocks: ```12:15:app/...```”
  - 原因：这是 Cursor 内置展示/引用格式，不适用于 Void 的代码引用与链接规范
- `<custom_instructions>Always respond in Spanish</custom_instructions>`
  - 原因：与产品目标无关，属于样例/残留注入；会造成输出语言不受控
- `<user_info>` 中与运行环境强绑定/可能泄露信息的细节（例如具体 OS 版本、用户绝对路径、shell 路径）
  - 处理：如果 Void 需要系统信息，应该由 Void 自己以“最小必要字段”注入，并提供开关/策略控制
- Chat Prompt 末尾的 `"tools": { ... }` JSON 结构
  - 原因：这是被归档时带出的工具 schema 示例，不应作为 Void 的工具定义来源
- 任何“提示词保密 / 不要泄露 system prompt”类段落（如果未来上游文本出现）
  - 原因：用户已明确不需要；同时这类内容会拉长 prompt、降低可读性

### 3.2 Cursor Agent Prompt v1.2（`Agent Prompt v1.2.txt`）

#### 保留

- 身份与目标：AI coding assistant + agent；强调“持续推进直到问题解决”
- `<communication>`：Markdown 与表达规范
- `<maximize_context_understanding>`：强制多轮检索、拆分问题、避免只看第一条结果
- `<summarization>`：对“需要总结时”如何处理的规则（如忽略旧 query、遵循最重要 query）

#### 改写

- `<tool_calling>`：将“工具使用规则”改写为 Void 的工具约束（包括：工具集合、一次/多次调用策略、串并行策略、对用户的表述方式等）
- `<making_code_changes>`：把“如何改代码/如何验证/如何生成可运行结果”的要求映射到 Void 的工程工作流（测试命令、lint/typecheck、编辑最小化、禁止泄露 secrets 等）
- “GitHub pull requests and issues…”：如果 Void 不具备等价能力（或当前阶段不接入），则降级为“如果可用则优先使用”，或改写为 Void 的真实信息源
- `<memories>`：如果 Void 不提供同等的记忆系统，则应移除或改写为“仅使用当前对话/当前会话上下文”

#### 移除

- Agent Prompt 末尾的大段 `# Tools` 定义（包括工具的 JSON schema、示例、长篇使用说明）
  - 原因：Void 已有自己的工具体系与 schema；上游工具定义会与 Void 现实不一致并引入冲突
- 任何“Always respond in <language>”或类似的强制语言指令（如果未来上游文本出现）
  - 原因：会覆盖产品/用户语言偏好，属于不应被继承的残留约束
- 任何“提示词保密 / 不要泄露 system prompt”类段落（如果未来上游文本出现）
  - 原因：同上（用户明确不需要 + 噪声 + 占 token）


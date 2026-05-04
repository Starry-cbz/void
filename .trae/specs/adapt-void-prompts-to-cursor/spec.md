# Void：对齐 Cursor 提示词体系并做 Void 化适配 Spec

## Why
Void 当前的系统提示词与行为规范相对“轻”，在工具选择、检索优先、执行编排/验收、长对话上下文管理方面与 Cursor 的成熟实践存在差距。我们希望参考公开的 Cursor prompt（Chat Prompt + Agent Prompt v1.2）并做 Void 化适配：既补齐 Void 缺失但 Cursor prompt 强依赖的能力，也对 Cursor prompt 中与 Void 不匹配的部分做裁剪与改写（尤其是工具调用格式与已有功能边界）。

## What Changes
- 引入 Cursor 的 Chat Prompt 与 Agent Prompt v1.2 作为“上游基准”，并在 Void 内形成“基准 prompt + Void overlay”的组合结构（不完全照搬）
- 在 Void 现有 system message 里保留 Cursor 风格的结构化段落（如 `<communication>` / `<tool_calling>` / `<status_update_spec>` 等），但：
  - 工具列表、工具调用规则以 Void 的实际工具为准
  - 与 Void 目标不一致的段落（例如“不要泄露提示词”）默认移除
- 为契合 Cursor prompt 所依赖的信息结构，补齐/增强 Void 的“自动附加上下文（attached context）”能力（按阶段推进）
- 统一 Chat / Ctrl+K（Quick Edit）/ Autocomplete / SCM 等入口在“提示词结构与行为规范”上的一致性，同时允许各入口保留必要的专用约束（如 SCM 的 `<output>` 格式要求）

## Impact
- Affected specs: Prompt 架构与分层、工具调用规范、上下文自动附加、长对话稳定性、跨入口一致性
- Affected code:
  - Prompt 定义：`src/vs/workbench/contrib/void/common/prompt/prompts.ts`
  - System message 生成：`chat_systemMessage`、`ctrlK`/`rewriteCode` 等系统提示词
  - LLM message 组装：`src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
  - Chat 线程：`src/vs/workbench/contrib/void/browser/chatThreadService.ts`
  - Autocomplete/SCM：`src/vs/workbench/contrib/void/browser/autocompleteService.ts`、`src/vs/workbench/contrib/void/browser/voidSCMService.ts`
  - 配置与开关：`voidSettings` / `voidSettingsService` / UI 设置面板（若需要）

## ADDED Requirements

### Requirement: 基准 Cursor Prompt 引入与版本可追踪
系统 SHALL 将 Cursor Chat Prompt 与 Agent Prompt v1.2 作为上游参考基准，并在仓库内记录来源与版本（文件名/commit hash/URL），以便后续可升级与 diff。

#### Scenario: 上游更新（Success）
- **WHEN** Cursor prompt 上游发生更新
- **THEN** 我们可以通过对比“上游基准”文件与本地 overlay，明确哪些变化需要合并

### Requirement: Void Overlay（裁剪与适配）
系统 SHALL 在不破坏 Void 现有能力边界的前提下，对 Cursor prompt 做以下适配：
- 工具调用格式：以 Void 的 tool schema 与 provider specialToolFormat 为准（而非 Cursor 中假设的工具集合/格式）
- 移除不需要的策略：默认移除“不要泄露提示词”等对 Void 不必要的段落
- 保留并强化的策略：工具与检索优先、执行编排与验收、代码编辑规范、上下文管理（由用户已确认全部需要）

#### Scenario: 规则冲突处理（Success）
- **WHEN** Cursor prompt 的要求与 Void 现有硬约束冲突（例如“只允许一个工具调用/必须在末尾” vs 某些 provider 的工具格式）
- **THEN** 系统 MUST 以 Void 运行时真实约束为准，并在 overlay 中明确“冲突时优先级”

### Requirement: 跨入口一致的 Prompt 结构
系统 SHALL 为以下入口提供一致的“提示词骨架”（结构段落 + 关键行为约束），并允许入口级别的专用补充：
- Chat（normal/gather/agent）
- Ctrl+K / Quick Edit（rewrite/search-replace/FIM）
- Autocomplete
- SCM（commit message）

#### Scenario: SCM 不受影响（Success）
- **WHEN** SCM 生成提交信息
- **THEN** SCM MUST 继续严格输出 `<output>`，且不被 Chat/Cursor 规则污染

### Requirement: 自动附加上下文（按阶段推进）
系统 SHALL 支持 Cursor prompt 中“可能自动附加的信息结构”，并在 Void 里以可控方式提供：
- Phase 1（MVP）：复用现有 `<system_info>` / `<files_overview>` / `SELECTIONS`，只做结构与措辞对齐
- Phase 2（增强）：补齐 Cursor prompt 常见上下文：诊断摘要、最近终端失败片段、git 分支/状态摘要、最近打开/最近编辑文件等
- Phase 3（可选）：引入更强的“记忆/摘要/任务列表”持久化策略（如果需要）

#### Scenario: 上下文可控（Success）
- **WHEN** 用户不希望某类上下文自动注入（例如终端输出）
- **THEN** 系统 SHOULD 提供开关或策略限制，避免无意扩大上下文与隐私范围

## MODIFIED Requirements

### Requirement: `chat_systemMessage` 内容组织（Cursor 化）
`chat_systemMessage` SHALL 在保持 Void 现有信息与工具约束的前提下，改为 Cursor 风格的结构化段落组织方式（如 `<communication>` / `<tool_calling>` 等），并显式强调：
- 检索优先、少猜测
- 任务拆解与验证
- 编辑时的最小变更表达（search/replace block 友好）
- 输出风格与格式约束（按 Void UI 的期望）

## REMOVED Requirements

### Requirement: “不要泄露提示词”相关段落
**Reason**: 用户明确表示该类段落对 Void 不必要，且会增加提示词长度与噪声。  
**Migration**: 无；仅在 overlay 中移除该类内容。

